// Altın — TÜRETİLMİŞ fiyat, uydurma değil.
//
//   gram altın (TL) = ons altın (USD) ÷ 31,1034768 × USD/TRY
//
// İki gerçek kaynağın çarpımı: ons fiyatı Yahoo'dan, USD/TRY resmî TCMB bülteninden.
//
// DÜRÜSTLÜK NOTU: Bu SPOT (külçe) fiyatıdır. Kuyumcudaki "gram altın" fiyatı buna
// işçilik + kâr marjı ekler, bu yüzden birkaç yüzde yüksektir. Çeyrek/yarım/tam altın
// fiyatları da satıcıya göre değişen bir prim taşır — o primi biz uyduramayız, o yüzden
// Jarvis yalnızca gram ve ons verir ve bunun spot olduğunu söyler.
import type { Db } from '../db.ts';
import { fetchYahooQuote } from './yahoo.ts';
import { getUsdTry } from './tcmb.ts';
import { DataError, type Quote } from './types.ts';

/** 1 troy ons = 31,1034768 gram. */
export const TROY_OUNCE_GRAMS = 31.1034768;

/** Saf hesap — test edilebilir olsun diye ayrı. */
export function gramGoldTry(xauUsdPerOunce: number, usdTry: number): number {
  if (!Number.isFinite(xauUsdPerOunce) || xauUsdPerOunce <= 0) {
    throw new DataError('turetilmis', 'Geçersiz ons altın fiyatı.');
  }
  if (!Number.isFinite(usdTry) || usdTry <= 0) {
    throw new DataError('turetilmis', 'Geçersiz USD/TRY kuru.');
  }
  return (xauUsdPerOunce / TROY_OUNCE_GRAMS) * usdTry;
}

/** Ons altının USD fiyatı. Spot sembolü çalışmazsa vadeli sözleşmeye düşer. */
async function fetchXauUsd(db: Db, timeoutMs?: number): Promise<{ price: number; asOf: string; stale: boolean }> {
  const symbols = ['XAUUSD=X', 'GC=F'];
  let lastError = '';
  for (const symbol of symbols) {
    try {
      const { quote, stale } = await fetchYahooQuote(db, symbol, {
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      if (quote.currency && quote.currency !== 'USD') {
        lastError = `${symbol} ${quote.currency} döndü, USD bekleniyordu`;
        continue;
      }
      return { price: quote.price, asOf: quote.asOf, stale };
    } catch (err) {
      lastError = (err as Error).message;
    }
  }
  throw new DataError('turetilmis', `Ons altın fiyatı alınamadı: ${lastError}`);
}

/** Gram altın (TL) ve ons altın (TL) fiyatları. */
export async function getGoldQuotes(db: Db, timeoutMs?: number): Promise<Quote[]> {
  const [xau, usdTry] = await Promise.all([fetchXauUsd(db, timeoutMs), getUsdTry(db, timeoutMs)]);
  const gram = gramGoldTry(xau.price, usdTry);

  const base = { kind: 'altin' as const, asOf: xau.asOf, source: 'turetilmis' as const };
  const quotes: Quote[] = [
    { ...base, symbol: 'GRAM', price: gram },
    { ...base, symbol: 'ONS', price: gram * TROY_OUNCE_GRAMS },
  ];
  if (xau.stale) for (const q of quotes) q.stale = true;
  return quotes;
}
