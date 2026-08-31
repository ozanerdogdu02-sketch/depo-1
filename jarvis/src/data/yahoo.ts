// Yahoo Finance chart ucu — hem BIST hisseleri (THYAO.IS) hem ons altın (XAUUSD=X) için
// ortak, düşük seviyeli istemci.
//
// DÜRÜST NOT: Bu RESMÎ bir API değil, Yahoo'nun kendi sitesinin kullandığı uç.
// Habersiz değişebilir ya da hız sınırına takılabilir. Bu yüzden:
//   - ayrıştırma savunmacı (her alan tek tek kontrol edilir),
//   - başarısızlıkta uydurma fiyat ÜRETİLMEZ, DataError fırlatılır,
//   - `npm run doctor` bu ucun hâlâ çalışıp çalışmadığını tek komutla söyler.
import type { Db } from '../db.ts';
import { fetchJson } from './http.ts';
import { DataError } from './types.ts';

export interface YahooQuote {
  symbol: string;
  price: number;
  currency: string;
  previousClose?: number;
  changePct?: number;
  asOf: string;
}

interface ChartResponse {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: { description?: string; code?: string } | null;
  };
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Yahoo chart yanıtını ayrıştırır. SAF fonksiyon — fixture ile çevrimdışı test edilir. */
export function parseYahooChart(json: unknown, requestedSymbol: string): YahooQuote {
  const doc = json as ChartResponse;

  const apiError = doc?.chart?.error;
  if (apiError) {
    throw new DataError('yahoo', `Yahoo hata döndü (${requestedSymbol}): ${apiError.description ?? apiError.code ?? 'bilinmeyen'}`);
  }

  const result = doc?.chart?.result?.[0];
  if (!result) throw new DataError('yahoo', `Yahoo yanıtında sonuç yok (${requestedSymbol}). Sembol yanlış olabilir.`);

  const meta = result.meta ?? {};
  const symbol = String(meta['symbol'] ?? requestedSymbol);
  const currency = String(meta['currency'] ?? '').toUpperCase();

  // Fiyat: önce meta'daki anlık fiyat; yoksa mum verisindeki SON DOLU kapanış.
  let price = num(meta['regularMarketPrice']);
  if (price === undefined) {
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    for (let i = closes.length - 1; i >= 0; i--) {
      const c = num(closes[i]);
      if (c !== undefined) { price = c; break; }
    }
  }
  if (price === undefined || price <= 0) {
    throw new DataError('yahoo', `${requestedSymbol} için Yahoo'dan geçerli bir fiyat okunamadı.`);
  }

  const previousClose = num(meta['chartPreviousClose']) ?? num(meta['previousClose']);
  // Değişim yüzdesi ancak önceki kapanış varsa HESAPLANIR; yoksa undefined kalır (uydurulmaz).
  const changePct =
    previousClose !== undefined && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : undefined;

  const epochSec = num(meta['regularMarketTime']);
  const asOf = epochSec ? new Date(epochSec * 1000).toISOString() : new Date().toISOString();

  const out: YahooQuote = { symbol, price, currency, asOf };
  if (previousClose !== undefined) out.previousClose = previousClose;
  if (changePct !== undefined) out.changePct = changePct;
  return out;
}

export async function fetchYahooQuote(
  db: Db,
  symbol: string,
  opts: { ttlSec?: number; timeoutMs?: number } = {},
): Promise<{ quote: YahooQuote; stale: boolean; fetchedAt: Date }> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=5d&interval=1d`;
  const res = await fetchJson('yahoo', url, {
    db,
    cacheKey: `yahoo:${symbol}`,
    ttlSec: opts.ttlSec ?? 300,
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
  });
  return { quote: parseYahooChart(res.data, symbol), stale: res.stale, fetchedAt: res.fetchedAt };
}
