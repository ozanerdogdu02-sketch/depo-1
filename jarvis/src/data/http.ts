// Tüm dış istekler buradan geçer: zaman aşımı, yeniden deneme, kalıcı önbellek.
// Kalıcı önbellek iki sorunu birden çözüyor:
//   1) CoinGecko'nun anahtarsız hız sınırı (dakikada birkaç istek),
//   2) yeniden başlatmada her şeyin sıfırdan çekilmesi.
import type { Db } from '../db.ts';
import { DataError, type SourceId } from './types.ts';

export interface FetchOptions {
  db?: Db;
  cacheKey?: string;
  ttlSec?: number;
  timeoutMs?: number;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** Ağ hatasında kaç kez daha denensin (üstel bekleme ile). */
  retries?: number;
}

export interface CachedResult<T> {
  data: T;
  /** Önbellekteki eski veri mi? true ise kullanıcıya "şu saatte alındı" denir. */
  stale: boolean;
  fetchedAt: Date;
}

// Bazı kaynaklar (Yahoo, TEFAS) tarayıcı gibi görünmeyen isteklere kapalı davranabiliyor.
const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function readCache(db: Db | undefined, key: string): { value: string; fetchedAt: number; ttlSec: number } | undefined {
  if (!db) return undefined;
  const row = db
    .prepare('SELECT value, fetched_at AS fetchedAt, ttl_sec AS ttlSec FROM cache WHERE key = ?')
    .get(key) as { value: string; fetchedAt: number; ttlSec: number } | undefined;
  return row;
}

function writeCache(db: Db | undefined, key: string, value: string, ttlSec: number): void {
  if (!db) return;
  db.prepare(
    `INSERT INTO cache (key, value, fetched_at, ttl_sec) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at, ttl_sec = excluded.ttl_sec`,
  ).run(key, value, Math.floor(Date.now() / 1000), ttlSec);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Metin çeker. Önbellek taze ise ağa hiç çıkmaz.
 * Ağ başarısız olur ama önbellekte ESKİ bir kayıt varsa onu `stale: true` ile döner —
 * "hiç veri yok" demektense "şu saatteki veri" demek daha faydalı, ve yalan değil.
 */
export async function fetchText(
  source: SourceId,
  url: string,
  opts: FetchOptions = {},
): Promise<CachedResult<string>> {
  const { db, cacheKey = url, ttlSec = 300, timeoutMs = 12_000, retries = 2 } = opts;

  const cached = readCache(db, cacheKey);
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && nowSec - cached.fetchedAt < cached.ttlSec) {
    return { data: cached.value, stale: false, fetchedAt: new Date(cached.fetchedAt * 1000) };
  }

  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'User-Agent': DEFAULT_UA, 'Accept-Language': 'tr-TR,tr;q=0.9', ...opts.headers },
        body: opts.body,
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        // 429 (hız sınırı) ve 5xx'te yeniden denemek anlamlı; 4xx'te değil.
        if (res.status !== 429 && res.status < 500) break;
      } else {
        const text = await res.text();
        writeCache(db, cacheKey, text, ttlSec);
        return { data: text, stale: false, fetchedAt: new Date() };
      }
    } catch (err) {
      lastError = (err as Error).name === 'AbortError' ? `${timeoutMs} ms içinde yanıt vermedi` : (err as Error).message;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(500 * 2 ** attempt); // 500ms, 1s
  }

  // Ağ düştü — elimizde eski veri varsa onu dürüstçe "eski" etiketiyle ver.
  if (cached) {
    return { data: cached.value, stale: true, fetchedAt: new Date(cached.fetchedAt * 1000) };
  }
  throw new DataError(source, `${url} okunamadı: ${lastError}`);
}

/** JSON çeker. Gövde JSON değilse anlaşılır hata verir (HTML hata sayfası gelmesi tipiktir). */
export async function fetchJson<T = unknown>(
  source: SourceId,
  url: string,
  opts: FetchOptions = {},
): Promise<CachedResult<T>> {
  const res = await fetchText(source, url, opts);
  try {
    return { ...res, data: JSON.parse(res.data) as T };
  } catch {
    throw new DataError(source, `${url} JSON döndürmedi (muhtemelen hata sayfası geldi).`);
  }
}

/** Önbelleği temizler — doctor'ın "taze veri gerçekten geliyor mu" ölçümü için. */
export function clearCache(db: Db, prefix?: string): number {
  const stmt = prefix
    ? db.prepare('DELETE FROM cache WHERE key LIKE ?').run(`${prefix}%`)
    : db.prepare('DELETE FROM cache').run();
  return stmt.changes;
}
