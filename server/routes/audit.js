import express from 'express';
import { AuditLog } from '../models/AuditLog.js';

export const auditRouter = express.Router();

// ── GET /api/audit — get recent audit history ─────────────────────────────
auditRouter.get('/', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);

    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .limit(parsedLimit)
      .lean();

    res.json({ logs });
  } catch (err) {
    console.error('[audit GET]', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// ── POST /api/audit — record audit entry ──────────────────────────────────
auditRouter.post('/', async (req, res) => {
  try {
    const { action, target_id = '', target_name = '', analyst_id = 'OP-8842', meta = {} } = req.body;

    const allowedActions = ['upload', 'inspect', 'escalate', 'dismiss', 'seize', 'quarantine', 'search', 'export', 'login', 'signup', 'logout'];
    if (!action || !allowedActions.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${allowedActions.join(', ')}` });
    }

    const logEntry = await AuditLog.create({
      action,
      target_id: String(target_id),
      target_name: String(target_name),
      analyst_id: String(analyst_id),
      meta,
      timestamp: new Date()
    });

    res.json({ success: true, log: logEntry });
  } catch (err) {
    console.error('[audit POST]', err);
    res.status(500).json({ error: 'Failed to record audit entry' });
  }
});
