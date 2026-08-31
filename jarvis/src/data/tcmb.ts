// TCMB — Türkiye Cumhuriyet Merkez Bankası günlük döviz kurları.
// Projedeki EN SAĞLAM kaynak: resmî, anahtarsız, kararlı XML şeması.
// https://www.tcmb.gov.tr/kurlar/today.xml
import { XMLParser } from 'fast-xml-parser';
import type { Db } from '../db.ts';
import { fetchText } from './http.ts';
import { DataError, type Quote } from './types.ts';

export interface TcmbRate {
  code: string;
  name: string;
  /** 1 birim döviz kaç TL (Unit'e bölünmüş — bkz. aşağıdaki JPY notu). */
  forexBuying: number;
  forexSelling: number;
}

export interface TcmbBulletin {
  /** Bültenin tarihi (GG.AA.YYYY biçiminde geldiği gibi). */
  date: string;
  rates: Map<string, TcmbRate>;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const trimmed = v.trim();
  if (!trimmed) return NaN;
  return Number(trimmed);
}

/**
 * TCMB XML'ini ayrıştırır. SAF fonksiyon — ağ yok, fixture ile test edilir.
 *
 * DİKKAT: `<Unit>` her zaman 1 değildir. JPY için 100'dür (yani XML'deki fiyat
 * 100 yen'in TL karşılığıdır). Buna bölmezsek Japon yeni 100 kat pahalı görünür.
 */
export function parseTcmbXml(xml: string): TcmbBulletin {
  const doc = parser.parse(xml) as {
    Tarih_Date?: { '@_Tarih'?: string; Currency?: unknown };
  };
  const root = doc.Tarih_Date;
  if (!root) throw new DataError('tcmb', 'TCMB XML beklenen <Tarih_Date> kökünü içermiyor.');

  const raw = root.Currency;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (list.length === 0) throw new DataError('tcmb', 'TCMB bülteninde hiç kur satırı yok.');

  const rates = new Map<string, TcmbRate>();
  for (const item of list as Record<string, unknown>[]) {
    const code = String(item['@_CurrencyCode'] ?? item['@_Kod'] ?? '').trim().toUpperCase();
    if (!code) continue;
    const unit = toNumber(item['Unit']) || 1;
    const buying = toNumber(item['ForexBuying']) / unit;
    const selling = toNumber(item['ForexSelling']) / unit;
    // Kapalı piyasa günlerinde bazı satırlar boş gelebilir — sessizce atla, uydurma.
    if (!Number.isFinite(selling) || selling <= 0) continue;
    rates.set(code, {
      code,
      name: String(item['Isim'] ?? code).trim(),
      forexBuying: Number.isFinite(buying) && buying > 0 ? buying : selling,
      forexSelling: selling,
    });
  }
  if (rates.size === 0) throw new DataError('tcmb', 'TCMB bülteninden okunabilir kur çıkmadı.');

  return { date: String(root['@_Tarih'] ?? '').trim(), rates };
}

/** Arşiv yolu: .../kurlar/202608/31082026.xml */
function archiveUrl(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`;
}

/**
 * Güncel bülteni getirir.
 * TCMB yalnızca iş günlerinde ~15:30'da bülten yayımlar; hafta sonu/tatilde `today.xml`
 * bulunmayabilir. O yüzden bulunamazsa 7 güne kadar geriye giderek son bülteni arar —
 * "veri yok" demek yerine "cuma kapanışı" demek hem doğru hem faydalı.
 */
export async function getTcmbBulletin(db: Db, timeoutMs = 12_000): Promise<TcmbBulletin> {
  const candidates = ['https://www.tcmb.gov.tr/kurlar/today.xml'];
  for (let i = 0; i <= 7; i++) {
    candidates.push(archiveUrl(new Date(Date.now() - i * 86_400_000)));
  }

  let lastError = '';
  for (const url of candidates) {
    try {
      // Bülten günde bir kez değişir — 1 saatlik önbellek fazlasıyla yeterli.
      const res = await fetchText('tcmb', url, { db, ttlSec: 3600, timeoutMs, retries: 1 });
      return parseTcmbXml(res.data);
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  throw new DataError('tcmb', `TCMB bülteni alınamadı. Son hata: ${lastError}`);
}

/** İzlenen döviz kodları için TL cinsinden birim fiyatlar. */
export async function getFxQuotes(db: Db, codes: string[], timeoutMs?: number): Promise<Quote[]> {
  const bulletin = await getTcmbBulletin(db, timeoutMs);
  const asOf = new Date().toISOString();
  const out: Quote[] = [];
  for (const code of codes) {
    const rate = bulletin.rates.get(code.toUpperCase());
    if (!rate) continue;
    out.push({
      symbol: code.toUpperCase(),
      kind: 'doviz',
      // Döviz SATIŞ kuru — Türkiye'de "dolar kaç oldu" sorusunun karşılığı budur.
      price: rate.forexSelling,
      asOf,
      source: 'tcmb',
    });
  }
  return out;
}

/** Altın hesabı ve kripto TL çevrimi için gereken USD/TRY. */
export async function getUsdTry(db: Db, timeoutMs?: number): Promise<number> {
  const bulletin = await getTcmbBulletin(db, timeoutMs);
  const usd = bulletin.rates.get('USD');
  if (!usd) throw new DataError('tcmb', 'TCMB bülteninde USD satırı yok.');
  return usd.forexSelling;
}
