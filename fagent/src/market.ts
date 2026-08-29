// Canlı fiyat kaynakları — yalnızca döviz ve kripto için, resmi/ücretsiz/anahtarsız
// ve tarayıcıdan doğrudan (CORS açık) çağrılabilen servisler kullanılır.
// Hisse (BIST) ve fon (TEFAS) için böyle bir kaynak yok, bu yüzden eklenmedi.

export interface CurrencyOption {
  code: string;
  label: string;
}

export interface CoinOption {
  id: string; // CoinGecko coin id
  label: string;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'USD', label: 'ABD Doları (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'GBP', label: 'İngiliz Sterlini (GBP)' },
  { code: 'CHF', label: 'İsviçre Frangı (CHF)' },
];

export const COINS: CoinOption[] = [
  { id: 'bitcoin', label: 'Bitcoin (BTC)' },
  { id: 'ethereum', label: 'Ethereum (ETH)' },
  { id: 'tether', label: 'Tether (USDT)' },
  { id: 'binancecoin', label: 'BNB' },
  { id: 'solana', label: 'Solana (SOL)' },
  { id: 'ripple', label: 'XRP' },
];

export class MarketFetchError extends Error {}

// Kaynak: Frankfurter (Avrupa Merkez Bankası referans kurları) — anahtarsız, CORS açık.
// Not: ECB kurları günde bir güncellenir, anlık piyasa kuru değildir.
export async function fetchTryRate(currencyCode: string): Promise<number> {
  let res: Response;
  try {
    res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(currencyCode)}&symbols=TRY`);
  } catch {
    throw new MarketFetchError('Kur servisine ulaşılamadı — internet bağlantını kontrol et.');
  }
  if (!res.ok) throw new MarketFetchError('Kur servisi şu an yanıt vermiyor.');
  const data = await res.json().catch(() => null);
  const rate = data?.rates?.TRY;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) throw new MarketFetchError('Kur verisi okunamadı.');
  return rate;
}

// Kaynak: CoinGecko genel (public) fiyat ucu — anahtarsız. Birkaç dakika gecikmeli olabilir.
export async function fetchCryptoTryPrice(coinId: string): Promise<number> {
  let res: Response;
  try {
    res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=try`);
  } catch {
    // CoinGecko rate limit (429) yanıtı CORS başlığı taşımadığından tarayıcı onu bloke eder ve
    // fetch buraya düşer — bu dal çoğu zaman "internet yok" değil "istek sınırı doldu"dur.
    throw new MarketFetchError(
      'Fiyat alınamadı. CoinGecko ücretsiz servisinin istek sınırına takılmış olabilir — birkaç dakika sonra tekrar dene.',
    );
  }
  if (!res.ok) {
    throw new MarketFetchError(
      res.status === 429
        ? 'CoinGecko ücretsiz servisinin istek sınırına takıldık — birkaç dakika sonra tekrar dene.'
        : 'Fiyat servisi şu an yanıt vermiyor.',
    );
  }
  const data = await res.json().catch(() => null);
  const price = data?.[coinId]?.try;
  if (typeof price !== 'number' || !Number.isFinite(price)) throw new MarketFetchError('Fiyat verisi okunamadı.');
  return price;
}
