// Tarihsel fiyat serisi — volatilite, drawdown ve korelasyon hesapları için GERÇEK veri.
//
// Daha önce "fiyat geçmişi yok, bu metrikler hesaplanamaz" deniyordu; doğrusu şuydu:
// Fagent fiyat geçmişini SAKLAMIYORDU. Kullandığımız iki kaynağın da anahtarsız tarihsel
// ucu var, dolayısıyla veri ALINABİLİR:
//   • Kripto  → CoinGecko /coins/{id}/market_chart  (anahtarsız, günlük seri)
//   • Döviz   → Frankfurter /v1/{baslangic}..{bitis} (ECB, anahtarsız, iş günü serisi)
//
// KAPSAM SINIRI değişmedi: BIST hissesi, TEFAS fonu ve altın için anahtarsız/CORS-açık bir
// tarihsel kaynak YOK. Bu yüzden risk metrikleri portföyün YALNIZCA bir bölümünü kapsar ve
// arayüz bu oranı açıkça yazar (bkz. RiskReport.coveragePct).

export interface PricePoint { date: string; price: number }

export class PriceHistoryError extends Error {}

const CACHE_PREFIX = 'fagent.pricehistory.v1.';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 saat — günlük seri gün içinde değişmez

interface Cached { points: PricePoint[]; fetchedAt: number }

function readCache(key: string): PricePoint[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const c = JSON.parse(raw) as Cached;
    if (!Array.isArray(c.points) || Date.now() - c.fetchedAt > CACHE_TTL_MS) return undefined;
    return c.points;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, points: PricePoint[]): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ points, fetchedAt: Date.now() } satisfies Cached));
  } catch { /* kota dolabilir — önbelleksiz de çalışır */ }
}

export function clearPriceHistoryCache(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* yok */ }
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* ─────────────────────────  Kripto — CoinGecko  ───────────────────────── */

// market_chart: { prices: [[timestampMs, fiyat], ...] } döner. days>=90 için granülerlik günlüktür.
export async function fetchCryptoHistory(coinId: string, days = 90): Promise<PricePoint[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=try&days=${days}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    // 429 yanıtı CORS başlığı taşımaz; tarayıcı bloke edince fetch buraya düşer.
    throw new PriceHistoryError('Geçmiş fiyat alınamadı — CoinGecko ücretsiz servisinin istek sınırına takılmış olabilir.');
  }
  if (!res.ok) throw new PriceHistoryError('Geçmiş fiyat servisi şu an yanıt vermiyor.');

  const data = await res.json().catch(() => null);
  const rows = data?.prices;
  if (!Array.isArray(rows)) throw new PriceHistoryError('Geçmiş fiyat verisi okunamadı.');

  // Günde bir nokta kalacak biçimde indirger (aynı güne düşen birden fazla kaydın sonuncusu).
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const [ts, price] = row;
    if (typeof ts !== 'number' || typeof price !== 'number' || !Number.isFinite(price)) continue;
    byDay.set(isoDay(ts), price);
  }
  const points = [...byDay.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 3) throw new PriceHistoryError('Geçmiş fiyat serisi çok kısa.');
  return points;
}

/* ─────────────────────────  Döviz — Frankfurter (ECB)  ───────────────────────── */

// { rates: { "2026-01-02": { TRY: 41.2 }, ... } } döner. ECB yalnızca iş günü yayımlar.
export async function fetchFxHistory(code: string, days = 90): Promise<PricePoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const url = `https://api.frankfurter.dev/v1/${isoDay(start.getTime())}..${isoDay(end.getTime())}` +
    `?base=${encodeURIComponent(code)}&symbols=TRY`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new PriceHistoryError('Geçmiş kur alınamadı — kur servisine ulaşılamadı.');
  }
  if (!res.ok) throw new PriceHistoryError('Geçmiş kur servisi şu an yanıt vermiyor.');

  const data = await res.json().catch(() => null);
  const rates = data?.rates;
  if (!rates || typeof rates !== 'object') throw new PriceHistoryError('Geçmiş kur verisi okunamadı.');

  const points: PricePoint[] = [];
  for (const [date, v] of Object.entries(rates as Record<string, { TRY?: number }>)) {
    const price = v?.TRY;
    if (typeof price === 'number' && Number.isFinite(price)) points.push({ date, price });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 3) throw new PriceHistoryError('Geçmiş kur serisi çok kısa.');
  return points;
}

/* ─────────────────────────  Önbellekli giriş noktası  ───────────────────────── */

export type HistoryKind = 'kripto' | 'doviz';

// Bir varlık için tarihsel seri. Hata yutulur (undefined döner) — çağıran taraf o varlığı
// "kapsam dışı" sayar; böylece tek bir başarısız istek tüm raporu düşürmez.
export async function loadHistory(kind: HistoryKind, symbol: string, days = 90): Promise<PricePoint[] | undefined> {
  const key = `${kind}.${symbol}.${days}`;
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const points = kind === 'kripto' ? await fetchCryptoHistory(symbol, days) : await fetchFxHistory(symbol, days);
    writeCache(key, points);
    return points;
  } catch {
    return undefined;
  }
}

// Kripto için piyasa ölçütü (beta benzeri kıyaslar ve "piyasa ne yaptı" bağlamı için).
export const CRYPTO_BENCHMARK_ID = 'bitcoin';

// ECB kurları yalnızca iş günü yayımlanır (~252 gün/yıl); kripto 7/24 işlem görür (365 gün/yıl).
// Volatilite yıllıklandırmasında kullanılan periyot sayısı buna göre değişir.
export const PERIODS_PER_YEAR: Record<HistoryKind, number> = { kripto: 365, doviz: 252 };

/* ═════════════════════════  RİSK RAPORU  ═════════════════════════
   Portföydeki her varlık için tarihsel seri toplar, sonra GERÇEK portföy serisini kurar:
   ağırlıklarla normalize edilmiş bir endeks. Volatilite/drawdown bu endeks üzerinden
   hesaplanır — korelasyon etkisi doğal olarak içine girer, ayrıca varsayım gerekmez.

   Kapsam dürüstlüğü: fiyat geçmişi olmayan varlıklar (hisse, fon, altın, mevduat) rapora
   GİRMEZ ve `coveragePct` ile hangi oranı kapsadığımız açıkça bildirilir. */

import { PortfolioState, Holding, totalValue, ASSET_LABELS } from './store';
import {
  AssetRisk, PortfolioRisk, dailyReturns, annualizedVolatilityPct, maxDrawdownPct,
  annualizedReturnFromPrices, portfolioRisk, sharpeRatio,
} from './analytics';

export interface UncoveredAsset { name: string; reason: string }

export interface RiskReport {
  days: number;
  assets: AssetRisk[];
  decomposition?: PortfolioRisk;   // kovaryans ayrıştırması (çeşitlendirme faydası)
  portfolioVolPct: number;         // gerçek portföy endeksinden
  portfolioDrawdownPct: number;
  portfolioAnnualReturnPct: number;
  sharpe?: number;
  coveredValue: number;
  totalValue: number;
  coveragePct: number;
  uncovered: UncoveredAsset[];
}

// Bir varlık için tarihsel seri çekilebilir mi? (canlı fiyata bağlı kripto/döviz)
function historyKindOf(h: Holding): HistoryKind | undefined {
  if (!h.symbol) return undefined;
  if (h.type === 'kripto') return 'kripto';
  if (h.type === 'doviz') return 'doviz';
  return undefined;
}

function uncoveredReason(h: Holding): string {
  if (h.type === 'hisse') return 'BIST hissesi için anahtarsız tarihsel fiyat kaynağı yok';
  if (h.type === 'fon') return 'TEFAS fonu için anahtarsız tarihsel fiyat kaynağı yok';
  if (h.type === 'altin') return 'altın için doğrulanmış anahtarsız fiyat kaynağı yok';
  if (h.type === 'mevduat') return 'mevduat piyasa fiyatıyla dalgalanmaz';
  return 'canlı fiyata bağlı değil (elle girilmiş değer)';
}

export async function buildRiskReport(
  s: PortfolioState,
  opts: { days?: number; riskFreePct?: number } = {},
): Promise<RiskReport> {
  const days = opts.days ?? 90;
  const total = totalValue(s);

  const covered: { h: Holding; points: PricePoint[]; kind: HistoryKind }[] = [];
  const uncovered: UncoveredAsset[] = [];

  for (const h of s.holdings) {
    const kind = historyKindOf(h);
    if (!kind) { uncovered.push({ name: h.name, reason: uncoveredReason(h) }); continue; }
    const points = await loadHistory(kind, h.symbol!, days);
    if (!points) { uncovered.push({ name: h.name, reason: 'geçmiş fiyat şu an alınamadı' }); continue; }
    covered.push({ h, points, kind });
  }

  const coveredValue = covered.reduce((a, c) => a + c.h.amount, 0);
  const coveragePct = total > 0 ? (coveredValue / total) * 100 : 0;

  if (covered.length === 0 || coveredValue <= 0) {
    return {
      days, assets: [], portfolioVolPct: 0, portfolioDrawdownPct: 0, portfolioAnnualReturnPct: 0,
      coveredValue, totalValue: total, coveragePct, uncovered,
    };
  }

  // Varlık bazlı metrikler
  const assets: AssetRisk[] = covered.map(c => {
    const prices = c.points.map(p => p.price);
    const rets = dailyReturns(prices);
    return {
      name: c.h.name,
      weight: c.h.amount / coveredValue,
      volPct: annualizedVolatilityPct(rets, PERIODS_PER_YEAR[c.kind]),
      drawdownPct: maxDrawdownPct(prices),
      annualReturnPct: annualizedReturnFromPrices(prices, PERIODS_PER_YEAR[c.kind]),
      returns: rets,
    };
  });

  // GERÇEK portföy serisi: ortak tarihlerde, ağırlıklı normalize endeks.
  // (Her varlığın kendi ilk fiyatına oranı × ağırlık → toplam)
  const dateSets = covered.map(c => new Set(c.points.map(p => p.date)));
  const commonDates = covered[0].points
    .map(p => p.date)
    .filter(d => dateSets.every(set => set.has(d)))
    .sort();

  let portfolioVolPct = 0, portfolioDrawdownPct = 0, portfolioAnnualReturnPct = 0;
  if (commonDates.length >= 3) {
    const priceAt = covered.map(c => {
      const m = new Map(c.points.map(p => [p.date, p.price]));
      return (d: string) => m.get(d)!;
    });
    const base = covered.map((_, i) => priceAt[i](commonDates[0]));
    const index = commonDates.map(d =>
      covered.reduce((sum, c, i) => sum + (c.h.amount / coveredValue) * (priceAt[i](d) / base[i]), 0),
    );
    // Ortak tarihler iş günü kesişimi olabileceği için periyot sayısını gözlenen sıklıktan türetiriz.
    const spanDays = (new Date(commonDates[commonDates.length - 1]).getTime() - new Date(commonDates[0]).getTime()) / 86_400_000;
    const perYear = spanDays > 0 ? ((commonDates.length - 1) / spanDays) * 365 : 365;

    portfolioVolPct = annualizedVolatilityPct(dailyReturns(index), perYear);
    portfolioDrawdownPct = maxDrawdownPct(index);
    portfolioAnnualReturnPct = annualizedReturnFromPrices(index, perYear);
  }

  const decomposition = portfolioRisk(assets);
  const sharpe = opts.riskFreePct !== undefined
    ? sharpeRatio(portfolioAnnualReturnPct, portfolioVolPct, opts.riskFreePct)
    : undefined;

  return {
    days, assets, decomposition, portfolioVolPct, portfolioDrawdownPct, portfolioAnnualReturnPct,
    sharpe, coveredValue, totalValue: total, coveragePct, uncovered,
  };
}

// Kapsam dışı varlıkları sınıfa göre özetler (arayüzde tek tek listelemek yerine).
export function summarizeUncovered(s: PortfolioState): string {
  const types = new Set(s.holdings.filter(h => !historyKindOf(h)).map(h => ASSET_LABELS[h.type]));
  return [...types].join(', ');
}
