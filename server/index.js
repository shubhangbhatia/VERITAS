import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import { uploadRouter } from './routes/upload.js';
import { resultsRouter } from './routes/results.js';
import { demoRouter } from './routes/demo.js';
import { searchRouter } from './routes/search.js';
import { casesRouter } from './routes/cases.js';
import { auditRouter } from './routes/audit.js';
import { authRouter } from './routes/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// ── Security & Middleware ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ── Rate Limiters ─────────────────────────────────────────────────────────
const demoLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many demo requests, please wait a minute.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload rate limit exceeded, please wait a minute.' },
});

// ── Health check (hello-world round-trip) ─────────────────────────────────
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  try {
    const mlRes = await fetch(`${ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(4000) });
    const mlData = await mlRes.json();
    const latency = Date.now() - start;
    res.json({
      status: 'ok',
      service: 'veritas-api',
      latency_ms: latency,
      ml: mlData,
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
  } catch (err) {
    const latency = Date.now() - start;
    res.json({ 
      status: 'ok', 
      service: 'veritas-api', 
      latency_ms: latency,
      ml: 'unreachable', 
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' 
    });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/upload', uploadLimiter, uploadRouter);
app.use('/api/results', resultsRouter);
app.use('/api/demo', demoLimiter, demoRouter);
app.use('/api/search', searchRouter);
app.use('/api/cases', casesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/auth', authRouter);

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Processing failed. Please try again.' 
  });
});

// ── MongoDB + Start ───────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veritas';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.warn('⚠️  MongoDB not available — results will not persist:', err.message));

app.listen(PORT, () => {
  console.log(`🚀 Veritas API running on http://localhost:${PORT}`);
  console.log(`🤖 ML Service: ${ML_SERVICE_URL}`);
});
