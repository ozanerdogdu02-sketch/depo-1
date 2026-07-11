import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

// KVKK: yalnızca isimlendirilmiş olaylar ve dar bir sayısal/enum özellik kümesi saklanır.
// Serbest metin (durum, düşünce, günlük içeriği) hiçbir zaman loglanmaz.
const EVENT_WHITELIST = new Set([
  'page_view',
  'mood_entry_created',
  'ai_reframe_used',
  'topic_toggled',
  'sport_toggled',
  'plan_changed',
  'paywall_viewed',
]);

const ALLOWED_PROPS = {
  page_view: { page: v => typeof v === 'string' && /^\/[a-z-]{0,30}$/.test(v) },
  mood_entry_created: {
    score: v => Number.isInteger(v) && v >= 1 && v <= 5,
    emotionCount: v => Number.isInteger(v) && v >= 0 && v <= 10,
    usedAi: v => typeof v === 'boolean',
  },
  ai_reframe_used: { demo: v => typeof v === 'boolean' },
  topic_toggled: { completed: v => typeof v === 'boolean' },
  sport_toggled: { completed: v => typeof v === 'boolean' },
  plan_changed: { plan: v => v === 'free' || v === 'premium' },
  paywall_viewed: { source: v => v === 'pricing' || v === 'mood' },
};

let events = [];

export function loadEvents() {
  try {
    const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
    events = raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
  } catch {
    events = [];
  }
}

function persist(event) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
}

export function recordEvent(uid, name, props = {}) {
  if (!EVENT_WHITELIST.has(name)) {
    return { status: 400, payload: { error: 'unknown_event', message: `Bilinmeyen olay: ${String(name).slice(0, 40)}` } };
  }
  const validators = ALLOWED_PROPS[name] ?? {};
  const clean = {};
  for (const [key, check] of Object.entries(validators)) {
    if (props[key] !== undefined && check(props[key])) clean[key] = props[key];
  }
  const event = { uid, name, props: clean, ts: new Date().toISOString() };
  events.push(event);
  try {
    persist(event);
  } catch (err) {
    console.error('[analytics] persist error:', err.message);
  }
  return { status: 202, payload: { ok: true } };
}

const dayOf = ts => ts.slice(0, 10);

// Kullanıcıya gösterilen "değer kanıtı" — yalnızca kendi olaylarından hesaplanır.
export function userMetrics(uid) {
  const mine = events.filter(e => e.uid === uid);
  const days = new Set(mine.map(e => dayOf(e.ts)));
  const moodEvents = mine.filter(e => e.name === 'mood_entry_created');
  const scores = moodEvents.map(e => e.props.score).filter(Number.isInteger);

  // Basit seri hesabı: bugünden geriye kesintisiz aktif gün sayısı.
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const half = Math.floor(scores.length / 2);
  const avg = arr => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null);
  const older = avg(scores.slice(0, half));
  const recent = avg(scores.slice(half));

  return {
    totalEvents: mine.length,
    activeDays: days.size,
    streak,
    moodEntries: moodEvents.length,
    aiAssists: mine.filter(e => e.name === 'ai_reframe_used').length,
    avgMoodScore: avg(scores) !== null ? Number(avg(scores).toFixed(2)) : null,
    moodTrendDelta: older !== null && recent !== null ? Number((recent - older).toFixed(2)) : null,
  };
}

// Admin paneli — toplam kullanım, retention ve özellik dağılımı.
export function adminMetrics() {
  const users = new Map();
  const perDay = new Map();
  const perFeature = new Map();

  for (const e of events) {
    const day = dayOf(e.ts);
    if (!users.has(e.uid)) users.set(e.uid, new Set());
    users.get(e.uid).add(day);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    perFeature.set(e.name, (perFeature.get(e.name) ?? 0) + 1);
  }

  const now = Date.now();
  const daysAgo = n => new Date(now - n * 86400000).toISOString().slice(0, 10);
  const last7 = new Set(Array.from({ length: 7 }, (_, i) => daysAgo(i)));

  let returningUsers = 0;
  let activeLast7 = 0;
  for (const days of users.values()) {
    if (days.size >= 2) returningUsers += 1;
    if ([...days].some(d => last7.has(d))) activeLast7 += 1;
  }

  const totalUsers = users.size;
  const eventsPerDay = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, count]) => ({ day, count }));
  const featureUsage = [...perFeature.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));

  return {
    totalEvents: events.length,
    totalUsers,
    activeLast7,
    returningUsers,
    retentionRate: totalUsers ? Number((returningUsers / totalUsers).toFixed(2)) : null,
    topFeature: featureUsage[0]?.name ?? null,
    featureUsage,
    eventsPerDay,
  };
}

export function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(503).json({ error: 'admin_disabled', message: 'ADMIN_KEY tanımlı değil; admin paneli kapalı.' });
  }
  const provided = req.headers['x-admin-key'];
  if (typeof provided !== 'string' || provided.length !== adminKey.length ||
      !cryptoSafeEqual(provided, adminKey)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Geçersiz admin anahtarı.' });
  }
  next();
}

function cryptoSafeEqual(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
