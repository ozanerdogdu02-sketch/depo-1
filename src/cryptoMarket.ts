// Kripto Piyasası veri katmanı — CoinGecko genel (public) API'sinden en büyük coinlerin
// canlı piyasa verisini çeker. Anahtarsız, CORS açık. market.ts'in hata yönetimi desenini
// birebir izler: ağ hatası / res.ok değil / şema bozuk → Türkçe CryptoMarketError, ASLA sahte veri.

export interface CryptoMarketCoin {
  id: string; // CoinGecko id (ör. "bitcoin")
  symbol: string; // "btc"
  name: string; // "Bitcoin"
  priceTry: number; // güncel fiyat (TRY)
  change24hPct: number; // 24s değişim yüzdesi (+/-)
  marketCapTry: number; // piyasa değeri (TRY)
}

export class CryptoMarketError extends Error {}

// En büyük `count` coini piyasa değerine göre döner. Yalnızca CoinGecko genel ucu — anahtar yok.
export async function fetchTopCoins(count = 20): Promise<CryptoMarketCoin[]> {
  const url =
    'https://api.coingecko.com/api/v3/coins/markets' +
    `?vs_currency=try&order=market_cap_desc&per_page=${count}&page=1&sparkline=false&price_change_percentage=24h`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new CryptoMarketError('Piyasa servisine ulaşılamadı — internet bağlantını kontrol et.');
  }
  if (!res.ok) throw new CryptoMarketError('Piyasa servisi şu an yanıt vermiyor (çok sık denenmiş olabilir).');

  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) throw new CryptoMarketError('Piyasa verisi okunamadı — beklenen biçimde değil.');

  const coins: CryptoMarketCoin[] = [];
  for (const item of data) {
    // Zorunlu alanlar: id, symbol, name, current_price, market_cap. 24s değişim null gelebilir → 0 kabul.
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.symbol !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.current_price !== 'number' || !Number.isFinite(item.current_price) ||
      typeof item.market_cap !== 'number' || !Number.isFinite(item.market_cap)
    ) {
      continue; // tek bozuk satır tüm listeyi düşürmesin; ama uydurma değerle de doldurmayız
    }
    const change = item.price_change_percentage_24h;
    coins.push({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      priceTry: item.current_price,
      change24hPct: typeof change === 'number' && Number.isFinite(change) ? change : 0,
      marketCapTry: item.market_cap,
    });
  }

  if (coins.length === 0) throw new CryptoMarketError('Piyasa verisi okunamadı — geçerli coin bulunamadı.');
  return coins;
}

// Piyasa değerini kısa okunur biçime çevirir: Trilyon (T), Milyar (B), Milyon (M).
export function formatMarketCap(v: number): string {
  if (v >= 1e12) return `₺${(v / 1e12).toFixed(2)} T`;
  if (v >= 1e9) return `₺${(v / 1e9).toFixed(2)} B`;
  if (v >= 1e6) return `₺${(v / 1e6).toFixed(1)} M`;
  return `₺${Math.round(v).toLocaleString('tr-TR')}`;
}
