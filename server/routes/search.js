import express from 'express';
import { Identity } from '../models/Identity.js';

export const searchRouter = express.Router();

// ── GET /api/search?q=<query> ──────────────────────────────────────────────
searchRouter.get('/', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.json({ results: [] });
    }

    const term = q.trim();
    // Escape regex special characters to prevent regex injection attacks
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const matches = await Identity.find({
      $or: [
        { name: regex },
        { id: regex },
        { email: regex },
        { phone: regex },
        { pan_prefix: regex },
        { zip_code: regex }
      ]
    })
    .sort({ fused_score: -1 })
    .limit(20)
    .select('id name fused_score risk_label cluster_id ring_flag email phone')
    .lean();

    const results = matches.map(m => ({
      id: m.id,
      name: m.name || 'Anonymous',
      fused_score: m.fused_score,
      risk_label: m.risk_label,
      cluster_id: m.cluster_id,
      ring_flag: m.ring_flag,
      email: m.email ? `****@${String(m.email).split('@')[1] || 'domain'}` : undefined,
      phone: m.phone ? `******${String(m.phone).slice(-4)}` : undefined,
    }));

    res.json({ results });
  } catch (err) {
    console.error('[search]', err);
    res.status(500).json({ error: 'Search failed' });
  }
});
