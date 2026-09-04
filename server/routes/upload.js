import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { Identity } from '../models/Identity.js';
import { v4 as uuidv4 } from 'uuid';

export const uploadRouter = express.Router();

// Multer — memory storage, CSV only, 5MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCsvMime = [
      'text/csv',
      'text/plain',
      'application/csv',
      'text/x-csv',
      'application/x-csv',
      'text/comma-separated-values',
      'text/x-comma-separated-values',
      'application/vnd.ms-excel'
    ].includes(file.mimetype);

    const hasCsvExt = file.originalname && file.originalname.toLowerCase().endsWith('.csv');

    if (isCsvMime || hasCsvExt) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ── GET /api/upload/template ───────────────────────────────────────────────
uploadRouter.get('/template', (req, res) => {
  const headers = [
    'name',
    'age',
    'address',
    'zip_code',
    'phone',
    'email',
    'pan_prefix',
    'account_age_months',
    'address_history_count',
    'shared_phone_count',
    'shared_email_count',
    'payment_smoothness',
    'age_address_mismatch'
  ];

  const sampleRows = [
    'Elena Vance,32,"124 Market St, San Francisco, CA",94103,9876543210,elena.v@example.com,AAAPF,4,2,3,2,0.042,0.78',
    'Marcus Reed,45,"450 Broadway, New York, NY",10013,8765432109,m.reed@corp.net,BBBKQ,36,1,1,1,1.240,0.12'
  ];

  const csvContent = `${headers.join(',')}\n${sampleRows.join('\n')}\n`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="veritas_identity_template.csv"');
  res.status(200).send(csvContent);
});

// ── POST /api/upload ───────────────────────────────────────────────────────
uploadRouter.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No CSV file provided' });

    // Parse CSV
    const csvText = req.file.buffer.toString('utf-8');
    
    // Content sniff: check header line
    const firstLine = csvText.split(/\r?\n/)[0] || '';
    if (!firstLine.includes(',')) {
      return res.status(400).json({ error: 'Uploaded file does not appear to be a valid comma-delimited CSV' });
    }

    let rows;
    try {
      rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    } catch (e) {
      return res.status(400).json({ error: 'Invalid CSV format: unable to parse columns' });
    }

    if (rows.length === 0) return res.status(400).json({ error: 'CSV is empty' });
    if (rows.length > 5000) return res.status(400).json({ error: 'Max 5000 rows per upload' });

    // Coerce numeric fields
    const identities = rows.map(row => ({
      id: row.id || uuidv4(),
      name: row.name || 'Anonymous Subject',
      age: parseFloat(row.age) || 0,
      address: row.address || '',
      zip_code: row.zip_code || '',
      phone: row.phone || '',
      email: row.email || '',
      pan_prefix: row.pan_prefix || '',
      account_age_months: parseFloat(row.account_age_months) || 0,
      address_history_count: parseFloat(row.address_history_count) || 0,
      shared_phone_count: parseFloat(row.shared_phone_count) || 0,
      shared_email_count: parseFloat(row.shared_email_count) || 0,
      payment_smoothness: parseFloat(row.payment_smoothness) || 0,
      age_address_mismatch: parseFloat(row.age_address_mismatch) || 0,
      ring_id: parseFloat(row.ring_id) || 0,
      is_fraud: parseFloat(row.is_fraud) || 0,
    }));

    // Call FastAPI scoring service (30s timeout)
    let scoredIdentities = identities.map(i => ({ ...i, model_a_score: null, fused_score: null, risk_label: 'LOW' }));
    try {
      const mlResponse = await fetch(`${ML_SERVICE_URL}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identities }),
        signal: AbortSignal.timeout(30000),
      });
      if (mlResponse.ok) {
        scoredIdentities = await mlResponse.json();
      } else {
        console.warn('⚠️  ML service returned error status:', mlResponse.status);
      }
    } catch (mlErr) {
      console.warn('⚠️  ML service error or timeout — saving unscored:', mlErr.message);
    }

    // Persist to MongoDB (upsert by id)
    const batchId = uuidv4();
    const ops = scoredIdentities.map(identity => ({
      updateOne: {
        filter: { id: identity.id },
        update: { $set: { ...identity, batch_id: batchId, scored_at: new Date() } },
        upsert: true,
      },
    }));

    let dbSaved = false;
    try {
      await Identity.bulkWrite(ops);
      dbSaved = true;
    } catch (dbErr) {
      console.warn('⚠️  MongoDB unavailable — returning in-memory results');
    }

    res.json({
      success: true,
      batch_id: batchId,
      count: scoredIdentities.length,
      db_saved: dbSaved,
      results: scoredIdentities.map(maskPII),
    });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ error: 'Processing failed. Please try again.' });
  }
});

// ── PII masking ────────────────────────────────────────────────────────────
function maskPII(identity) {
  const masked = { ...identity };
  if (masked.phone) {
    masked.phone = '******' + String(masked.phone).slice(-4);
  }
  if (masked.email) {
    const [, domain] = String(masked.email).split('@');
    masked.email = `****@${domain}`;
  }
  if (masked.address) {
    const parts = String(masked.address).split(',');
    masked.address = parts.length > 1 ? parts.slice(-2).join(',').trim() : masked.address;
  }
  return masked;
}
