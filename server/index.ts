import express from 'express';
import { createFeed } from './feed.ts';
import { DartError } from './dart/client.ts';

const app = express();
app.disable('x-powered-by');
const allowed = new Set((process.env.ALLOWED_ORIGINS || 'https://gongmodu.apps.tossmini.com,https://gongmodu.private-apps.tossmini.com').split(',').map(s => s.trim()));
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (!allowed.has(origin) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return res.status(403).json({ error: '허용되지 않은 요청이에요.' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const getFeed = createFeed();
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/status', (_req, res) => res.json(getFeed.status()));
// Competition adapters are retained for research, but are not exposed in this release.
app.get('/api/schedule', async (_req, res) => {
  try {
    const result = await getFeed();
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch (error) {
    const code = error instanceof DartError ? error.code : 'DART_SYNC_FAILED';
    const preparing = ['DART_SYNCING', 'DART_KEY_MISSING', 'DART_KEY_INVALID'].includes(code);
    res.setHeader('Cache-Control', 'no-store');
    if (code === 'DART_SYNCING') res.setHeader('Retry-After', '5');
    res.status(preparing ? 503 : 502).json({ code, error: code === 'DART_SYNCING' ? 'DART 공시에서 청약 일정을 확인하고 있어요. 잠시만 기다려 주세요.' : 'DART 공시 데이터에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' });
  }
});
app.use(express.static('dist'));
const port = Number(process.env.PORT || 3001);
app.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`공모두 API: http://localhost:${port}`));
