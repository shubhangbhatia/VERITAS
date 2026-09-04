import express from 'express';
import { Case } from '../models/Case.js';
import { Identity } from '../models/Identity.js';
import { AuditLog } from '../models/AuditLog.js';

export const casesRouter = express.Router();

// ── GET /api/cases — list cases ───────────────────────────────────────────
casesRouter.get('/', async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    const filter = {};
    if (status && ['open', 'escalated', 'dismissed', 'seized'].includes(status)) {
      filter.status = status;
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const parsedSkip = Math.max(parseInt(skip) || 0, 0);

    const cases = await Case.find(filter)
      .sort({ updated_at: -1 })
      .limit(parsedLimit)
      .skip(parsedSkip)
      .lean();

    const total = await Case.countDocuments(filter);

    res.json({
      total,
      cases
    });
  } catch (err) {
    console.error('[cases GET]', err);
    res.status(500).json({ error: 'Failed to retrieve cases' });
  }
});

// ── POST /api/cases — create or upsert case ────────────────────────────────
casesRouter.post('/', async (req, res) => {
  try {
    const { identity_id, status = 'open', notes = '', analyst_id = 'OP-8842' } = req.body;
    if (!identity_id) {
      return res.status(400).json({ error: 'identity_id is required' });
    }

    // Look up identity data
    const identity = await Identity.findOne({ id: identity_id }).lean();

    const updateDoc = {
      identity_id,
      identity_name: identity?.name || 'Unknown Subject',
      risk_score: identity?.fused_score || 0,
      risk_label: identity?.risk_label || 'HIGH',
      cluster_id: identity?.cluster_id ?? -1,
      status: ['open', 'escalated', 'dismissed', 'seized'].includes(status) ? status : 'open',
      analyst_id,
      notes,
    };

    const caseItem = await Case.findOneAndUpdate(
      { identity_id },
      { $set: updateDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Also record an audit log entry
    await AuditLog.create({
      analyst_id,
      action: status === 'dismissed' ? 'dismiss' : status === 'seized' ? 'seize' : status === 'escalated' ? 'escalate' : 'inspect',
      target_id: identity_id,
      target_name: caseItem.identity_name,
      meta: { case_id: caseItem._id, status }
    }).catch(() => {});

    res.json({ success: true, case: caseItem });
  } catch (err) {
    console.error('[cases POST]', err);
    res.status(500).json({ error: 'Failed to create or update case' });
  }
});

// ── PATCH /api/cases/:id — update status / notes ─────────────────────────
casesRouter.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, analyst_id = 'OP-8842' } = req.body;

    const updates = {};
    if (status && ['open', 'escalated', 'dismissed', 'seized'].includes(status)) {
      updates.status = status;
    }
    if (notes !== undefined) {
      updates.notes = String(notes);
    }

    // Can query by Mongo _id or identity_id
    const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { identity_id: id };

    const updatedCase = await Case.findOneAndUpdate(
      query,
      { $set: updates },
      { new: true }
    );

    if (!updatedCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Audit log
    if (status) {
      const actionMap = {
        dismissed: 'dismiss',
        seized: 'seize',
        escalated: 'escalate',
        open: 'inspect'
      };
      await AuditLog.create({
        analyst_id,
        action: actionMap[status] || 'inspect',
        target_id: updatedCase.identity_id,
        target_name: updatedCase.identity_name,
        meta: { case_id: updatedCase._id, new_status: status }
      }).catch(() => {});
    }

    res.json({ success: true, case: updatedCase });
  } catch (err) {
    console.error('[cases PATCH]', err);
    res.status(500).json({ error: 'Failed to update case' });
  }
});
