// Kripto Piyasası veri katmanı — CoinGecko genel (public) API'sinden en büyük coinlerin
// canlı piyasa verisini çeker. Anahtarsız, CORS açık. market.ts'in hata yönetimi desenini
// birebir izler: ağ hatası / res.ok değil / şema bozuk → Türkçe CryptoMarketError, ASLA sahte veri.
import { fmtDec } from './store';

export interface CryptoMarketCoin {
  id: string; // CoinGecko id (ör. "bitcoin")
  symbol: string; // "btc"
  name: string; // "Bitcoin"
  priceTry: number; // güncel fiyat (TRY)
  change24hPct: number; // 24s değişim yüzdesi (+/-)
  marketCapTry: number; // piyasa değeri (TRY)
  rank?: number; // piyasa değeri sıralaması
  sparkline?: number[]; // son 7 günün fiyat serisi — satır içi mini grafik için
}

export class CryptoMarketError extends Error {}

/* ─────────────────────────  Önbellek  ─────────────────────────
   CoinGecko'nun ANAHTARSIZ genel ucu ağır rate-limitli. Limite takılınca 429 dönüyor ve o
   yanıtta CORS başlığı olmadığı için tarayıcı fetch'i hata fırlatıyor — yani rate limit,
   koda "ağ hatası" gibi görünüyor. Çözüm anahtar eklemek DEĞİL (anahtarsızlık ürünün
   çekirdek ilkesi); çağrı sayısını düşürmek ve son BAŞARILI yanıtı saklamak.

   Dürüstlük: önbellekten gelen veri SAHTE DEĞİL — gerçekten çekilmiş fiyatlardır. Ama
   güncel olmayabilir, bu yüzden `stale` bayrağı ve zaman damgasıyla birlikte döner;
   arayüz bunu kullanıcıya açıkça yazar. */

const CACHE_KEY = 'fagent.cryptomarket.cache.v2'; // v2: sparkline + rank alanları eklendi
const FRESH_MS = 90_000; // 90 sn içinde tekrar istek atma (sekmeye her girişte çağrıyı önler)

// CoinGecko tek istekte en fazla 250 coin döner ve rate limit açısından 20 ile 250 arasında
// fark yoktur. ANCAK sparkline=true ile her coin ~168 fiyat noktası taşır: 250 coin birkaç MB
// yanıt demektir ve mobilde ilk açılış belirgin yavaşlar. 100 hem geniş bir evren sunar hem
// yükü ~2,5 kat azaltır — kullanıcının gerçekten göz gezdirdiği aralık zaten ilk 100.
export const DEFAULT_COIN_COUNT = 100;

export interface MarketSnapshot {
  coins: CryptoMarketCoin[];
  fetchedAt: string; // ISO — bu veri ne zaman ÇEKİLDİ
  stale: boolean;    // true ise: ağdan alınamadı, önbellekten sunuluyor
}

interface CachedPayload { coins: CryptoMarketCoin[]; fetchedAt: string }

function readCache(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!Array.isArray(parsed.coins) || parsed.coins.length === 0 || typeof parsed.fetchedAt !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(coins: CryptoMarketCoin[]): string {
  const fetchedAt = new Date().toISOString();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ coins, fetchedAt }));
  } catch { /* kota dolu olabilir — önbelleksiz de çalışır */ }
  return fetchedAt;
}

export function clearMarketCache(): void {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* yok */ }
}

// Önbellekteki son veriyi AĞI BEKLEMEDEN, senkron döner. Arayüz bunu ilk çizimde kullanır:
// kullanıcı boş ekran yerine anında (bayat olabilecek) gerçek fiyatları görür, taze veri
// arka planda gelince sessizce güncellenir. Algılanan hız üzerindeki en büyük etki budur.
export function cachedSnapshot(): MarketSnapshot | undefined {
  const c = readCache();
  if (!c) return undefined;
  return {
    coins: c.coins,
    fetchedAt: c.fetchedAt,
    stale: Date.now() - new Date(c.fetchedAt).getTime() >= FRESH_MS,
  };
}

// Arayüzün kullandığı giriş noktası: taze önbellek varsa ağa hiç çıkmaz; ağ başarısız olursa
// (rate limit dahil) elindeki son gerçek veriyi `stale: true` ile döner. İkisi de yoksa hata fırlatır.
export async function loadTopCoins(count = DEFAULT_COIN_COUNT, opts: { force?: boolean } = {}): Promise<MarketSnapshot> {
  const cached = readCache();

  if (!opts.force && cached && Date.now() - new Date(cached.fetchedAt).getTime() < FRESH_MS) {
    return { coins: cached.coins, fetchedAt: cached.fetchedAt, stale: false };
  }

  try {
    const coins = await fetchTopCoins(count);
    return { coins, fetchedAt: writeCache(coins), stale: false };
  } catch (err) {
    if (cached) return { coins: cached.coins, fetchedAt: cached.fetchedAt, stale: true };
    throw err;
  }
}

// En büyük `count` coini piyasa değerine göre döner. Yalnızca CoinGecko genel ucu — anahtar yok.
export async function fetchTopCoins(count = DEFAULT_COIN_COUNT): Promise<CryptoMarketCoin[]> {
  // sparkline=true: son 7 günün fiyat serisini de getirir — EK İSTEK MALİYETİ YOK,
  // satır içi mini grafikler bu veriden çizilir.
  const url =
    'https://api.coingecko.com/api/v3/coins/markets' +
    `?vs_currency=try&order=market_cap_desc&per_page=${Math.min(250, count)}&page=1&sparkline=true&price_change_percentage=24h`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // NOT: CoinGecko rate limit (429) yanıtında CORS başlığı göndermediği için tarayıcı yanıtı
    // bloke eder ve fetch buraya düşer — yani bu dal çoğu zaman "ağ yok" değil "limit doldu"dur.
    throw new CryptoMarketError(
      'Piyasa verisi alınamadı. CoinGecko ücretsiz servisinin kısa süreli istek sınırına takılmış olabilir — birkaç dakika sonra tekrar dene.',
    );
  }
  if (!res.ok) {
    throw new CryptoMarketError(
      res.status === 429
        ? 'CoinGecko ücretsiz servisinin istek sınırına takıldık — birkaç dakika sonra tekrar dene.'
        : 'Piyasa servisi şu an yanıt vermiyor.',
    );
  }

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
    // sparkline_in_7d.price: 7 günlük saatlik seri (~168 nokta). Mini grafik için yeterli;
    // bozuk/eksik gelirse alan boş bırakılır (grafik çizilmez, uydurma veri üretilmez).
    const spark = item.sparkline_in_7d?.price;
    coins.push({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      priceTry: item.current_price,
      change24hPct: typeof change === 'number' && Number.isFinite(change) ? change : 0,
      marketCapTry: item.market_cap,
      rank: typeof item.market_cap_rank === 'number' ? item.market_cap_rank : undefined,
      sparkline: Array.isArray(spark) && spark.length > 2 && spark.every((p: unknown) => typeof p === 'number' && Number.isFinite(p))
        ? spark
        : undefined,
    });
  }

  if (coins.length === 0) throw new CryptoMarketError('Piyasa verisi okunamadı — geçerli coin bulunamadı.');
  return coins;
}

// Piyasa değerini kısa okunur biçime çevirir: Trilyon (T), Milyar (B), Milyon (M).
// Ondalık ayraç Türkçe (virgül) — son satırdaki toLocaleString ile tutarlı olsun diye.
export function formatMarketCap(v: number): string {
  if (v >= 1e12) return `₺${fmtDec(v / 1e12, 2)} T`;
  if (v >= 1e9) return `₺${fmtDec(v / 1e9, 2)} B`;
  if (v >= 1e6) return `₺${fmtDec(v / 1e6, 1)} M`;
  return `₺${Math.round(v).toLocaleString('tr-TR')}`;
}
