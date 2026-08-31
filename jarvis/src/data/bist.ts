// BIST hisseleri ve endeksleri — Yahoo Finance üzerinden (semboller .IS son ekli).
//
// FAGENT bunu YAPAMIYORDU: tarayıcıdan Yahoo'ya istek CORS'a takılıyor ve anahtarsız,
// CORS-açık bir BIST kaynağı yok. Jarvis sunucuda çalıştığı için CORS diye bir engel yok —
// bu, iki proje arasındaki en somut mimari fark.
import type { Db } from '../db.ts';
import { fetchYahooQuote } from './yahoo.ts';
import { DataError, type Quote } from './types.ts';

/** "thyao" → "THYAO.IS" · "THYAO.IS" → "THYAO.IS" · "XU100" → "XU100.IS" */
export function toYahooSymbol(code: string): string {
  const clean = code.trim().toUpperCase().replace(/\s+/g, '');
  if (!clean) throw new DataError('yahoo', 'Boş hisse kodu.');
  return clean.endsWith('.IS') ? clean : `${clean}.IS`;
}

/** "THYAO.IS" → "THYAO" (kullanıcıya gösterirken .IS ekini taşımayalım). */
export function fromYahooSymbol(symbol: string): string {
  return symbol.replace(/\.IS$/i, '').toUpperCase();
}

export async function getBistQuote(db: Db, code: string, timeoutMs?: number): Promise<Quote> {
  const symbol = toYahooSymbol(code);
  const { quote, stale } = await fetchYahooQuote(db, symbol, {
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });

  // BIST fiyatları TL olmalı. Başka bir para birimi geldiyse sembol yanlış demektir
  // (ör. kullanıcı "AAPL" yazdı, Yahoo USD döndü) — sessizce TL sanıp portföye yazmayalım.
  if (quote.currency && quote.currency !== 'TRY') {
    throw new DataError(
      'yahoo',
      `${fromYahooSymbol(symbol)} ${quote.currency} cinsinden geldi, TL değil. BIST kodu olduğundan emin misin?`,
    );
  }

  const out: Quote = {
    symbol: fromYahooSymbol(quote.symbol),
    kind: 'hisse',
    price: quote.price,
    asOf: quote.asOf,
    source: 'yahoo',
  };
  if (quote.changePct !== undefined) out.changePct = quote.changePct;
  if (stale) out.stale = true;
  return out;
}
