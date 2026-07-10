import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET tanımlı değil — geçici anahtar üretildi (sunucu yeniden başlayınca oturumlar geçersiz olur).');
}

const TOKEN_TTL = '30d';

// Anonim oturum: kişisel veri istemeden cihaz başına rastgele bir kimlik (uid) üretir.
export function issueSession() {
  const uid = crypto.randomUUID();
  const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { token, uid };
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Oturum jetonu gerekli.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.uid = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token', message: 'Oturum jetonu geçersiz veya süresi dolmuş.' });
  }
}
