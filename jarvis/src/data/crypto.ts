// Kripto — CoinGecko genel (anahtarsız) ucu.
//
// HIZ SINIRI GERÇEK BİR SORUN: anahtarsız uç dakikada birkaç isteğe izin verir ve
// aşınca 429 döner. Bu yüzden:
//   - TÜM coinler TEK istekte çekilir (döngü içinde tek tek istek ATILMAZ),
//   - sonuç kalıcı önbelleğe yazılır (yeniden başlatmada da yaşar),
//   - 429'da önbellekteki son değer "eski" etiketiyle döner, yeni istek atılmaz.
import type { Db } from '../db.ts';
import { fetchJson } from './http.ts';
import { DataError, type Quote } from './types.ts';

/** Sık kullanılanlar için gömülü eşleme — tek istek bile atmadan çözülür. */
const KNOWN_IDS: Record<string, string> = {
  BTC: 'bitcoin', XBT: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', FDUSD: 'first-digital-usd',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  TRX: 'tron',
  DOT: 'polkadot',
  MATIC: 'matic-network', POL: 'polygon-ecosystem-token',
  LINK: 'chainlink',
  LTC: 'litecoin',
  SHIB: 'shiba-inu',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ETC: 'ethereum-classic',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  FIL: 'filecoin',
  INJ: 'injective-protocol',
  SUI: 'sui',
  TON: 'the-open-network',
  PEPE: 'pepe',
  RENDER: 'render-token',
  HBAR: 'hedera-hashgraph',
  ALGO: 'algorand',
  VET: 'vechain',
  AAVE: 'aave',
  UNI: 'uniswap',
  MKR: 'maker',
  GRT: 'the-graph',
  SAND: 'the-sandbox', MANA: 'decentraland', AXS: 'axie-infinity',
  CHZ: 'chiliz',
  FTM: 'fantom',
  RUNE: 'thorchain',
  IMX: 'immutable-x',
  LDO: 'lido-dao',
  CRV: 'curve-dao-token',
};

/** Değeri enflasyona karşı sabit sayılan coinler — reel getiri uyarısında nakit gibi ele alınır. */
export const STABLECOIN_IDS = new Set(['tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'first-digital-usd']);

interface CoinListItem { id?: unknown; symbol?: unknown; name?: unknown }

/** CoinGecko coins/list yanıtını sembol→id eşlemesine çevirir. SAF fonksiyon. */
export function parseCoinList(json: unknown): Map<string, string> {
  const list = Array.isArray(json) ? (json as CoinListItem[]) : [];
  const map = new Map<string, string>();
  for (const item of list) {
    const symbol = typeof item.symbol === 'string' ? item.symbol.toUpperCase() : '';
    const id = typeof item.id === 'string' ? item.id : '';
    if (!symbol || !id) continue;
    // Aynı sembolü paylaşan onlarca token var (ör. sahte "BTC"). İlk gelen kazanır ve
    // gömülü KNOWN_IDS tablosu bunu zaten ezdiği için popüler coinlerde risk yok.
    if (!map.has(symbol)) map.set(symbol, id);
  }
  return map;
}

/** Sembolü ("BTC") CoinGecko id'sine ("bitcoin") çevirir. */
export async function resolveCoinId(db: Db, symbol: string, timeoutMs?: number): Promise<string> {
  const key = symbol.trim().toUpperCase();
  if (!key) throw new DataError('coingecko', 'Boş kripto sembolü.');
  const known = KNOWN_IDS[key];
  if (known) return known;

  // Bilinmeyen sembol — tam listeyi bir kez çekip 24 saat önbellekte tut.
  const res = await fetchJson('coingecko', 'https://api.coingecko.com/api/v3/coins/list', {
    db,
    cacheKey: 'coingecko:list',
    ttlSec: 86_400,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
  const id = parseCoinList(res.data).get(key);
  if (!id) throw new DataError('coingecko', `"${symbol}" diye bir kripto varlık bulunamadı.`);
  return id;
}

interface SimplePriceResponse {
  [coinId: string]: { try?: number; try_24h_change?: number } | undefined;
}

/** simple/price yanıtını Quote listesine çevirir. SAF fonksiyon. */
export function parseSimplePrice(json: unknown, idToSymbol: Map<string, string>, asOf: string): Quote[] {
  const doc = (json ?? {}) as SimplePriceResponse;
  const out: Quote[] = [];
  for (const [id, symbol] of idToSymbol) {
    const entry = doc[id];
    const price = entry?.try;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;
    const quote: Quote = { symbol, kind: 'kripto', price, asOf, source: 'coingecko' };
    const change = entry?.try_24h_change;
    if (typeof change === 'number' && Number.isFinite(change)) quote.changePct = change;
    out.push(quote);
  }
  return out;
}

/**
 * Birden çok kripto sembolünün TL fiyatı — TEK ağ isteğiyle.
 * Çözülemeyen semboller sessizce atlanır (çağıran hangilerinin döndüğünü karşılaştırabilir).
 */
export async function getCryptoQuotes(db: Db, symbols: string[], timeoutMs?: number): Promise<Quote[]> {
  const unique = [...new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return [];

  const idToSymbol = new Map<string, string>();
  for (const symbol of unique) {
    try {
      idToSymbol.set(await resolveCoinId(db, symbol, timeoutMs), symbol);
    } catch {
      // Bilinmeyen sembol — atla, uydurma fiyat üretme.
    }
  }
  if (idToSymbol.size === 0) return [];

  const ids = [...idToSymbol.keys()].sort().join(',');
  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}` +
    `&vs_currencies=try&include_24hr_change=true`;
  const res = await fetchJson('coingecko', url, {
    db,
    cacheKey: `coingecko:price:${ids}`,
    ttlSec: 300,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });

  const quotes = parseSimplePrice(res.data, idToSymbol, res.fetchedAt.toISOString());
  if (res.stale) for (const q of quotes) q.stale = true;
  return quotes;
}

export function isStablecoinSymbol(symbol: string): boolean {
  const id = KNOWN_IDS[symbol.trim().toUpperCase()];
  return id ? STABLECOIN_IDS.has(id) : false;
}
