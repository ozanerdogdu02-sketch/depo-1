import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { issueSession, requireAuth } from './auth.js';
import { reframe, demoMode } from './ai.js';
import { loadEvents, recordEvent, userMetrics, adminMetrics, requireAdmin } from './analytics.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);

app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '32kb' }));

const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });
const eventLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, demoMode });
});

// Anonim oturum: istemci anahtar girmez, kişisel veri göndermez.
app.post('/api/auth/session', authLimiter, (_req, res) => {
  res.json(issueSession());
});

// AI proxy: Anthropic anahtarı yalnızca sunucuda (.env) yaşar.
app.post('/api/ai/chat', aiLimiter, requireAuth, async (req, res) => {
  const { status, payload } = await reframe(req.body);
  if (status === 200 && !payload.demo) {
    recordEvent(req.uid, 'ai_reframe_used', { demo: false });
  } else if (status === 200) {
    recordEvent(req.uid, 'ai_reframe_used', { demo: true });
  }
  res.status(status).json(payload);
});

// Analitik: beyaz listedeki olaylar, serbest metin yok.
app.post('/api/events', eventLimiter, requireAuth, (req, res) => {
  const { name, props } = req.body ?? {};
  const { status, payload } = recordEvent(req.uid, name, props);
  res.status(status).json(payload);
});

app.get('/api/metrics/me', requireAuth, (req, res) => {
  res.json(userMetrics(req.uid));
});

app.get('/api/admin/metrics', authLimiter, requireAdmin, (_req, res) => {
  res.json(adminMetrics());
});

// Beklenmedik hataları temiz bir gövdeyle döndür; detayları yalnızca logla.
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large', message: 'İstek gövdesi çok büyük.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_json', message: 'Geçersiz JSON gövdesi.' });
  }
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'internal_error', message: 'Beklenmedik bir hata oluştu.' });
});

loadEvents();

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT} — AI modu: ${demoMode ? 'DEMO (ANTHROPIC_API_KEY yok)' : 'canlı'}`);
});
