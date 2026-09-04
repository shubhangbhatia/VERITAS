import express from 'express';
import { Identity } from '../models/Identity.js';
import { v4 as uuidv4 } from 'uuid';

export const demoRouter = express.Router();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ── POST /api/demo/inject — inject a live fraud ring for demo ──────────────
demoRouter.post('/inject', async (req, res) => {
  try {
    // Call FastAPI to generate a fresh fraud ring
    const mlResponse = await fetch(`${ML_SERVICE_URL}/demo/inject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ring_size: 18 }),
      signal: AbortSignal.timeout(30000),
    });

    if (!mlResponse.ok) {
      return res.status(502).json({ error: 'Processing failed. Please try again.' });
    }

    const { identities } = await mlResponse.json();

    // Persist
    const batchId = `demo-${uuidv4()}`;
    const ops = identities.map(identity => ({
      updateOne: {
        filter: { id: identity.id },
        update: { $set: { ...identity, batch_id: batchId, scored_at: new Date() } },
        upsert: true,
      },
    }));

    try {
      await Identity.bulkWrite(ops);
    } catch (dbErr) {
      console.warn('⚠️  MongoDB unavailable for demo inject');
    }

    res.json({
      success: true,
      injected: identities.length,
      batch_id: batchId,
      ring_cluster_id: identities[0]?.cluster_id ?? -1,
    });
  } catch (err) {
    console.error('[demo/inject]', err);
    res.status(500).json({ error: 'Processing failed. Please try again.' });
  }
});
