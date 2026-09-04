import express from 'express';
import { Identity } from '../models/Identity.js';

export const resultsRouter = express.Router();

// ── GET /api/results — all identities ─────────────────────────────────────
resultsRouter.get('/', async (req, res) => {
  try {
    const { risk_label, ring_flag, limit = 50, skip = 0 } = req.query;
    const filter = {};
    
    if (risk_label) {
      const normalizedLabel = String(risk_label).toUpperCase();
      if (!['LOW', 'MEDIUM', 'HIGH'].includes(normalizedLabel)) {
        return res.status(400).json({ error: 'Invalid risk_label. Must be LOW, MEDIUM, or HIGH.' });
      }
      filter.risk_label = normalizedLabel;
    }

    if (ring_flag === 'true') filter.ring_flag = true;

    // Cap limit to avoid full database dump
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 500);
    const parsedSkip = Math.max(parseInt(skip) || 0, 0);

    const identities = await Identity.find(filter)
      .sort({ fused_score: -1, created_at: -1 })
      .limit(parsedLimit)
      .skip(parsedSkip)
      .lean();

    const total = await Identity.countDocuments(filter);
    const highRisk = await Identity.countDocuments({ risk_label: 'HIGH' });
    const rings = await Identity.distinct('cluster_id', { ring_flag: true });
    const avgScore = await Identity.aggregate([
      { $match: { fused_score: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$fused_score' } } },
    ]);

    res.json({
      total,
      high_risk_count: highRisk,
      fraud_rings_count: rings.filter(r => r >= 0).length,
      avg_fused_score: avgScore[0]?.avg?.toFixed(3) ?? 0,
      identities: identities.map(maskPII),
    });
  } catch (err) {
    console.error('[results]', err);
    res.status(500).json({ error: 'Processing failed. Please try again.' });
  }
});

// ── GET /api/results/rings/summary — ring summary ─────────────────────────
resultsRouter.get('/rings/summary', async (req, res) => {
  try {
    const rings = await Identity.aggregate([
      { $match: { ring_flag: true, cluster_id: { $gte: 0 } } },
      {
        $group: {
          _id: '$cluster_id',
          member_count: { $sum: 1 },
          avg_fused_score: { $avg: '$fused_score' },
          max_fused_score: { $max: '$fused_score' },
          members: { $push: { id: '$id', name: '$name', fused_score: '$fused_score' } },
        },
      },
      { $sort: { avg_fused_score: -1 } },
    ]);
    res.json({ rings });
  } catch (err) {
    console.error('[rings/summary]', err);
    res.status(500).json({ error: 'Processing failed. Please try again.' });
  }
});

// ── GET /api/results/:id — single identity detail ─────────────────────────
resultsRouter.get('/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    // Basic sanitization: alphanumeric, hyphens, underscores only
    if (typeof rawId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(rawId)) {
      return res.status(400).json({ error: 'Invalid identity ID format' });
    }

    const identity = await Identity.findOne({ id: rawId }).lean();
    if (!identity) return res.status(404).json({ error: 'Identity not found' });

    // Find ring members if in a ring
    let ringMembers = [];
    if (identity.ring_flag && identity.cluster_id >= 0) {
      ringMembers = await Identity.find({
        cluster_id: identity.cluster_id,
        id: { $ne: identity.id },
      }).select('id name fused_score risk_label').lean();
    }

    res.json({ ...maskPII(identity), ring_members: ringMembers });
  } catch (err) {
    console.error('[results/:id]', err);
    res.status(500).json({ error: 'Processing failed. Please try again.' });
  }
});

// ── PII masking ─────────────────────────────────────────────────────────────
function maskPII(identity) {
  const masked = { ...identity };
  if (masked.phone) masked.phone = '******' + String(masked.phone).slice(-4);
  if (masked.email) {
    const [, domain] = String(masked.email).split('@');
    masked.email = `****@${domain || 'unknown'}`;
  }
  if (masked.address) {
    const parts = String(masked.address).split(',');
    masked.address = parts.length > 1 ? parts.slice(-2).join(',').trim() : masked.address;
  }
  return masked;
}
