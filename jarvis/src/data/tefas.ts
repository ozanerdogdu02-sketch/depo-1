// TEFAS — Türkiye Elektronik Fon Alım Satım Platformu.
// tefas.gov.tr'nin kendi "Tarihsel Veriler" sayfasının kullandığı uç kullanılır.
//
// DÜRÜST NOT: Yayımlanmış/belgelenmiş bir API değil; sitenin arka ucu. Habersiz
// değişebilir. Bu yüzden ayrıştırma savunmacı ve `npm run doctor` bunu tek komutla sınıyor.
//
// İki önemli ayrıntı:
//   1) Uç, tarayıcıdan geliyormuş gibi görünen istek ister (Referer + X-Requested-With).
//   2) Fon fiyatı GÜN SONUNDA açıklanır; gün içinde en son ilan edilen fiyat geçerlidir.
//      O yüzden hep bir tarih ARALIĞI sorulur ve en yeni kayıt alınır.
import type { Db } from '../db.ts';
import { fetchJson } from './http.ts';
import { DataError, type Quote } from './types.ts';

const ENDPOINT = 'https://www.tefas.gov.tr/api/DB/BindHistoryInfo';

export interface TefasRecord {
  code: string;
  name: string;
  price: number;
  /** Fiyatın ait olduğu gün (ISO tarih). */
  date: string;
}

interface TefasRow {
  TARIH?: unknown;
  FONKODU?: unknown;
  FONUNVAN?: unknown;
  FIYAT?: unknown;
}

/** TEFAS'ın TARIH alanı epoch milisaniye (bazen metin, bazen sayı) gelir. */
function parseTefasDate(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === 'string') {
    const trimmed = v.trim();
    // Saf rakamsa epoch ms
    if (/^\d{10,}$/.test(trimmed)) return new Date(Number(trimmed)).toISOString();
    // "/Date(1756...)/" biçimi de görülebiliyor
    const m = trimmed.match(/\/Date\((\d+)\)\//);
    if (m?.[1]) return new Date(Number(m[1])).toISOString();
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function parsePrice(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    // TEFAS bazen "1,234567" (Türkçe ondalık) döndürebiliyor.
    const n = Number(v.trim().replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * TEFAS yanıtındaki satırlardan EN YENİ fiyat kaydını çıkarır. SAF fonksiyon.
 * Fon kodu verilirse yalnızca o fona ait satırlara bakar.
 */
export function parseTefasHistory(json: unknown, fundCode?: string): TefasRecord {
  const doc = json as { data?: unknown };
  const rows = Array.isArray(doc?.data) ? (doc.data as TefasRow[]) : [];
  if (rows.length === 0) {
    throw new DataError('tefas', `TEFAS ${fundCode ?? 'sorgusu'} için kayıt döndürmedi. Fon kodu doğru mu?`);
  }

  const wanted = fundCode?.trim().toUpperCase();
  let best: TefasRecord | undefined;
  for (const row of rows) {
    const code = String(row.FONKODU ?? '').trim().toUpperCase();
    if (!code) continue;
    if (wanted && code !== wanted) continue;
    const price = parsePrice(row.FIYAT);
    const date = parseTefasDate(row.TARIH);
    if (price === undefined || price <= 0 || !date) continue;
    if (!best || date > best.date) {
      best = { code, name: String(row.FONUNVAN ?? code).trim(), price, date };
    }
  }
  if (!best) {
    throw new DataError('tefas', `TEFAS yanıtından ${wanted ?? 'fon'} için okunabilir fiyat çıkmadı.`);
  }
  return best;
}

/** TEFAS gün-ay-yıl bekler: 31.08.2026 */
function tefasDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

export async function getFundQuote(db: Db, code: string, timeoutMs?: number): Promise<Quote> {
  const fundCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(fundCode)) {
    throw new DataError('tefas', `"${code}" geçerli bir TEFAS fon koduna benzemiyor (ör. AFT, TTE).`);
  }

  // 10 günlük pencere: hafta sonu + resmî tatil üst üste gelse bile içinde en az bir
  // işlem günü kalsın diye. (3 gün seçilseydi bayram tatillerinde boş dönerdi.)
  const bittarih = tefasDate(new Date());
  const bastarih = tefasDate(new Date(Date.now() - 10 * 86_400_000));

  const body = new URLSearchParams({
    fontip: 'YAT',
    sfontur: '',
    fonkod: fundCode,
    fongrup: '',
    bastarih,
    bittarih,
    fonturkod: '',
    fonunvantip: '',
  }).toString();

  const res = await fetchJson('tefas', ENDPOINT, {
    db,
    cacheKey: `tefas:${fundCode}`,
    // Fon fiyatı günde bir kez açıklanır — 1 saatlik önbellek fazlasıyla yeterli.
    ttlSec: 3600,
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://www.tefas.gov.tr/TarihselVeriler.aspx',
      Origin: 'https://www.tefas.gov.tr',
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });

  const record = parseTefasHistory(res.data, fundCode);
  const quote: Quote = {
    symbol: record.code,
    kind: 'fon',
    price: record.price,
    asOf: record.date,
    source: 'tefas',
  };
  if (res.stale) quote.stale = true;
  return quote;
}
