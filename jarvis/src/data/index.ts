// Veri kaynağı kayıt defteri: "şu varlıkların fiyatını getir" isteğini doğru adaptörlere
// dağıtır ve TOPLU çalışır.
//
// Toplu çalışmak şart: 20 kripto varlığı olan bir portföyde tek tek istek atmak
// CoinGecko'nun hız sınırını ilk brifingde patlatırdı. Aynı sınıftan varlıklar
// mümkün olduğunca TEK istekte çekilir.
import type { Db, AssetKind } from '../db.ts';
import { getBistQuote } from './bist.ts';
import { getFundQuote } from './tefas.ts';
import { getFxQuotes, getTcmbBulletin } from './tcmb.ts';
import { getCryptoQuotes } from './crypto.ts';
import { getGoldQuotes } from './gold.ts';
import { fetchYahooQuote } from './yahoo.ts';
import { DataError, type ProbeResult, type Quote, type SourceId } from './types.ts';

export type { Quote, ProbeResult, SourceId } from './types.ts';
export { DataError } from './types.ts';

export interface QuoteRequest {
  kind: AssetKind;
  symbol: string;
}

export interface QuoteFailure {
  kind: AssetKind;
  symbol: string;
  message: string;
}

export interface QuoteBatch {
  /** Anahtar: `${kind}:${SEMBOL}` */
  quotes: Map<string, Quote>;
  /** Alınamayanlar. Brifing bunları "veri yok" diye BELİRTİR, atlamaz. */
  failures: QuoteFailure[];
}

export function quoteKey(kind: AssetKind, symbol: string): string {
  return `${kind}:${symbol.trim().toUpperCase()}`;
}

/** Aynı anda en fazla N iş — Yahoo/TEFAS'ı istek yağmuruna tutmamak için. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) continue;
      out[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Bir grup varlığın güncel fiyatını getirir.
 * ASLA topluca patlamaz: bir kaynak düşerse yalnızca ona ait semboller `failures`a düşer,
 * diğerleri normal döner. Brifingin "borsa verisi gelmedi ama kriptolar burada" diyebilmesi
 * bu tasarıma bağlı.
 */
export async function getQuotes(
  db: Db,
  requests: QuoteRequest[],
  timeoutMs?: number,
): Promise<QuoteBatch> {
  const quotes = new Map<string, Quote>();
  const failures: QuoteFailure[] = [];

  const byKind = new Map<AssetKind, string[]>();
  for (const req of requests) {
    const symbol = req.symbol.trim().toUpperCase();
    if (!symbol) continue;
    const list = byKind.get(req.kind) ?? [];
    if (!list.includes(symbol)) list.push(symbol);
    byKind.set(req.kind, list);
  }

  const fail = (kind: AssetKind, symbols: string[], err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    for (const symbol of symbols) failures.push({ kind, symbol, message });
  };

  const jobs: Promise<void>[] = [];

  // ── Kripto: TEK istek ──────────────────────────────────────────────────────
  const cryptoSymbols = byKind.get('kripto');
  if (cryptoSymbols?.length) {
    jobs.push(
      (async () => {
        try {
          const result = await getCryptoQuotes(db, cryptoSymbols, timeoutMs);
          const seen = new Set<string>();
          for (const q of result) {
            quotes.set(quoteKey('kripto', q.symbol), q);
            seen.add(q.symbol);
          }
          const missing = cryptoSymbols.filter(s => !seen.has(s));
          if (missing.length) fail('kripto', missing, new Error('CoinGecko bu sembolü tanımadı ya da fiyat döndürmedi.'));
        } catch (err) {
          fail('kripto', cryptoSymbols, err);
        }
      })(),
    );
  }

  // ── Döviz: TEK bülten isteği ───────────────────────────────────────────────
  const fxSymbols = byKind.get('doviz');
  if (fxSymbols?.length) {
    jobs.push(
      (async () => {
        try {
          const result = await getFxQuotes(db, fxSymbols, timeoutMs);
          const seen = new Set<string>();
          for (const q of result) {
            quotes.set(quoteKey('doviz', q.symbol), q);
            seen.add(q.symbol);
          }
          const missing = fxSymbols.filter(s => !seen.has(s));
          if (missing.length) fail('doviz', missing, new Error('TCMB bülteninde bu para birimi yok.'));
        } catch (err) {
          fail('doviz', fxSymbols, err);
        }
      })(),
    );
  }

  // ── Altın: TEK türetme (ons + USD/TRY) ─────────────────────────────────────
  const goldSymbols = byKind.get('altin');
  if (goldSymbols?.length) {
    jobs.push(
      (async () => {
        try {
          const result = await getGoldQuotes(db, timeoutMs);
          for (const q of result) quotes.set(quoteKey('altin', q.symbol), q);
          const available = new Set(result.map(q => q.symbol));
          const missing = goldSymbols.filter(s => !available.has(s));
          if (missing.length) {
            fail('altin', missing, new Error('Yalnızca GRAM ve ONS altın hesaplanabiliyor (çeyrek/tam altın primi uydurulamaz).'));
          }
        } catch (err) {
          fail('altin', goldSymbols, err);
        }
      })(),
    );
  }

  // ── Hisse: sembol başına istek (Yahoo'da anahtarsız toplu uç yok) ──────────
  const stockSymbols = byKind.get('hisse');
  if (stockSymbols?.length) {
    jobs.push(
      (async () => {
        await mapLimit(stockSymbols, 4, async symbol => {
          try {
            const q = await getBistQuote(db, symbol, timeoutMs);
            quotes.set(quoteKey('hisse', q.symbol), q);
          } catch (err) {
            fail('hisse', [symbol], err);
          }
        });
      })(),
    );
  }

  // ── Fon: fon başına istek ──────────────────────────────────────────────────
  const fundSymbols = byKind.get('fon');
  if (fundSymbols?.length) {
    jobs.push(
      (async () => {
        await mapLimit(fundSymbols, 3, async symbol => {
          try {
            const q = await getFundQuote(db, symbol, timeoutMs);
            quotes.set(quoteKey('fon', q.symbol), q);
          } catch (err) {
            fail('fon', [symbol], err);
          }
        });
      })(),
    );
  }

  // Mevduatın piyasa fiyatı yoktur — tutarı kullanıcı girer, burada işi yok.

  await Promise.all(jobs);
  return { quotes, failures };
}

/** Tek varlık için kısayol. */
export async function getQuote(db: Db, kind: AssetKind, symbol: string, timeoutMs?: number): Promise<Quote> {
  const { quotes, failures } = await getQuotes(db, [{ kind, symbol }], timeoutMs);
  const found = quotes.get(quoteKey(kind, symbol));
  if (found) return found;
  const reason = failures[0]?.message ?? 'Bilinmeyen hata.';
  throw new DataError('yahoo', reason);
}

// ── Sağlık kontrolü (doctor komutu bunu kullanır) ────────────────────────────

async function timed(fn: () => Promise<{ sample: string }>): Promise<{ ok: boolean; sample?: string; detail?: string; ms: number }> {
  const started = Date.now();
  try {
    const { sample } = await fn();
    return { ok: true, sample, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, detail: (err as Error).message, ms: Date.now() - started };
  }
}

/**
 * Her veri kaynağını tek tek sınar. Bu, projenin GERÇEK doğrulama adımıdır:
 * bu uçların hiçbiri geliştirme ortamından test edilemedi (ağ politikası engelliyor),
 * bu yüzden "çalışıyor mu" sorusunun cevabı kullanıcının kendi makinesinde burada verilir.
 */
export async function probeAll(db: Db, timeoutMs = 12_000): Promise<ProbeResult[]> {
  const probes: Array<{ source: SourceId; label: string; run: () => Promise<{ sample: string }> }> = [
    {
      source: 'tcmb',
      label: 'TCMB döviz kurları (resmî)',
      run: async () => {
        const bulletin = await getTcmbBulletin(db, timeoutMs);
        const usd = bulletin.rates.get('USD');
        if (!usd) throw new Error('Bültende USD yok.');
        return { sample: `${bulletin.date} · USD/TRY ${usd.forexSelling.toFixed(4)} · ${bulletin.rates.size} para birimi` };
      },
    },
    {
      source: 'yahoo',
      label: 'BIST hisse (Yahoo Finance)',
      run: async () => {
        const q = await getBistQuote(db, 'THYAO', timeoutMs);
        return { sample: `THYAO ${q.price.toFixed(2)} ₺${q.changePct !== undefined ? ` (${q.changePct.toFixed(2)}%)` : ''}` };
      },
    },
    {
      source: 'tefas',
      label: 'TEFAS fon fiyatı',
      run: async () => {
        const q = await getFundQuote(db, 'AFT', timeoutMs);
        return { sample: `AFT ${q.price.toFixed(6)} ₺ (${q.asOf.slice(0, 10)})` };
      },
    },
    {
      source: 'coingecko',
      label: 'Kripto (CoinGecko)',
      run: async () => {
        const [btc] = await getCryptoQuotes(db, ['BTC'], timeoutMs);
        if (!btc) throw new Error('BTC fiyatı dönmedi (hız sınırına takılmış olabilir).');
        return { sample: `BTC ${Math.round(btc.price).toLocaleString('tr-TR')} ₺` };
      },
    },
    {
      source: 'turetilmis',
      label: 'Altın (ons × USD/TRY ile türetilmiş)',
      run: async () => {
        const quotes = await getGoldQuotes(db, timeoutMs);
        const gram = quotes.find(q => q.symbol === 'GRAM');
        if (!gram) throw new Error('Gram altın hesaplanamadı.');
        return { sample: `Gram altın ${gram.price.toFixed(2)} ₺ (spot, işçilik hariç)` };
      },
    },
  ];

  return Promise.all(
    probes.map(async p => {
      const r = await timed(p.run);
      const out: ProbeResult = { source: p.source, label: p.label, ok: r.ok, ms: r.ms };
      if (r.sample !== undefined) out.sample = r.sample;
      if (r.detail !== undefined) out.detail = r.detail;
      return out;
    }),
  );
}

/** Yahoo ham sorgusu — doctor'ın "sembol çalışıyor mu" testleri için dışa açık. */
export { fetchYahooQuote };
