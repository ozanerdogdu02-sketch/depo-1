// Finansal matematik katmanı — SAF (I/O yok, tüm veri parametreyle gelir).
// agent.ts bu modülü kullanarak grafikleri YORUMLAR: sadece "işte grafiğin" demez,
// grafiğin ne söylediğini gerçek sayılarla okur.
//
// DÜRÜSTLÜK SINIRI (önemli): Fagent'ta FİYAT ZAMAN SERİSİ YOKTUR — yalnızca kullanıcının
// kendi işlem akışı ve güncel değerleri vardır. Bu yüzden volatilite, standart sapma,
// Sharpe oranı, beta ve maksimum düşüş (drawdown) HESAPLANAMAZ. Bunları uydurmak yerine
// hesaplanamadıklarını söylüyoruz (bkz. agent.ts'teki "ölçemiyorum" kuralı).
//
// Hesaplanabilenler gerçek ve standart finans matematiğidir:
//   • XIRR — düzensiz nakit akışlarında para-ağırlıklı yıllık getiri (IRR)
//   • Fisher denklemi — enflasyondan arındırılmış REEL getiri
//   • Herfindahl-Hirschman Endeksi (HHI) + etkin varlık sayısı — konsantrasyon riski
//   • Katkı ayrıştırma — güncel değerin ne kadarı yatırılan para, ne kadarı getiri
//   • Varlık bazlı kâr/zarar katkı payları

import { PortfolioState, totalValue, totalCost } from './store';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

/* ─────────────────────────  Reel getiri — Fisher denklemi  ───────────────────────── */

// Yaygın "nominal − enflasyon" kestirmesi YANLIŞTIR; yüksek enflasyonda ciddi sapar.
// Doğrusu: (1 + nominal) / (1 + enflasyon) − 1
// Örn. nominal %60, enflasyon %40 → kestirme %20 der; doğrusu %14,3'tür.
export function realReturnPct(nominalPct: number, inflationPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflationPct / 100) - 1) * 100;
}

/* ─────────────────────────  XIRR — para-ağırlıklı yıllık getiri  ─────────────────────────
   Portföye zaman içinde para eklenip çıkarıldığında, "son değer / ilk değer" türü basit
   hesaplar yanıltır. Doğru ölçüt, nakit akışlarının iç verim oranıdır (IRR):
     Σ  CF_i / (1 + r)^(gün_i / 365)  =  0
   Türev gerektirmeyen ikiye bölme (bisection) ile çözülür — sağlam ve yakınsaması garantidir. */

export interface CashFlow { date: string; amount: number } // amount: (−) para girişi, (+) para çıkışı/son değer

export interface XirrResult {
  annualPct: number;  // yıllık para-ağırlıklı getiri (%)
  years: number;      // ilk işlemden bugüne geçen süre (yıl)
  reliable: boolean;  // süre çok kısaysa yıllıklandırma yanıltıcıdır
}

function npv(rate: number, flows: CashFlow[], t0: number): number {
  return flows.reduce((sum, f) => {
    const years = (new Date(f.date).getTime() - t0) / MS_PER_DAY / DAYS_PER_YEAR;
    return sum + f.amount / Math.pow(1 + rate, years);
  }, 0);
}

// Nakit akışlarından yıllık iç verim oranını çözer. Çözülemezse undefined döner (uydurmaz).
export function xirr(flows: CashFlow[]): number | undefined {
  if (flows.length < 2) return undefined;
  const hasNegative = flows.some(f => f.amount < 0);
  const hasPositive = flows.some(f => f.amount > 0);
  if (!hasNegative || !hasPositive) return undefined; // işaret değişimi yoksa kök yok

  const t0 = Math.min(...flows.map(f => new Date(f.date).getTime()));

  // Arama aralığı: −%99,9 ile +%1000. Uçlarda işaret değişimi yoksa çözüm bu aralıkta değildir.
  let lo = -0.999, hi = 10;
  let fLo = npv(lo, flows, t0), fHi = npv(hi, flows, t0);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return undefined;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows, t0);
    if (!Number.isFinite(fMid)) return undefined;
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

// Portföyün nakit akışlarını kurar: her alış para girişi (−), her satış çıkış (+),
// bugünkü toplam değer ise nihai çıkış (+) olarak eklenir.
export function xirrOf(s: PortfolioState, today = new Date()): XirrResult | undefined {
  if (s.txns.length === 0) return undefined;
  const value = totalValue(s);
  if (value <= 0) return undefined;

  const flows: CashFlow[] = s.txns.map(t => ({
    date: t.date,
    amount: t.kind === 'alis' ? -(t.amount + (t.commission ?? 0)) : (t.amount - (t.commission ?? 0)),
  }));
  flows.push({ date: today.toISOString().slice(0, 10), amount: value });

  const first = Math.min(...flows.map(f => new Date(f.date).getTime()));
  const years = (today.getTime() - first) / MS_PER_DAY / DAYS_PER_YEAR;
  if (years <= 0) return undefined;

  const r = xirr(flows);
  if (r === undefined || !Number.isFinite(r)) return undefined;

  return {
    annualPct: r * 100,
    years,
    // 1 aydan kısa geçmişte yıllıklandırma absürt sonuç verir (birkaç günlük hareket
    // yıla çevrilince %1000'lere çıkar) — bunu güvenilir saymıyoruz.
    reliable: years >= 30 / DAYS_PER_YEAR,
  };
}

/* ─────────────────────────  Konsantrasyon — Herfindahl-Hirschman  ─────────────────────────
   HHI = Σ wᵢ²  (wᵢ: her varlığın portföydeki ağırlığı, 0–1)
   Tek varlıkta 1, n eşit varlıkta 1/n olur. 1/HHI = "etkin varlık sayısı":
   nominal olarak 6 varlığın olsa da biri %80 ise etkin çeşitlenmen ~1,5 varlıktır. */

export interface Concentration {
  hhi: number;
  effectiveN: number;   // 1 / HHI
  nominalN: number;     // gerçek varlık sayısı
  topName: string;
  topWeightPct: number;
  level: 'dusuk' | 'orta' | 'yuksek';
}

export function concentrationOf(s: PortfolioState): Concentration | undefined {
  const value = totalValue(s);
  if (value <= 0 || s.holdings.length === 0) return undefined;

  let hhi = 0;
  let top = s.holdings[0];
  for (const h of s.holdings) {
    const w = h.amount / value;
    hhi += w * w;
    if (h.amount > top.amount) top = h;
  }
  const level: Concentration['level'] = hhi > 0.25 ? 'yuksek' : hhi > 0.15 ? 'orta' : 'dusuk';
  return {
    hhi,
    effectiveN: hhi > 0 ? 1 / hhi : 0,
    nominalN: s.holdings.length,
    topName: top.name,
    topWeightPct: (top.amount / value) * 100,
    level,
  };
}

/* ─────────────────────────  Katkı ayrıştırma  ─────────────────────────
   Güncel değerin ne kadarı "yatırdığın para", ne kadarı "kazanç"? Net Yatırım grafiğinin
   çizgisi ile güncel değer arasındaki farkın ta kendisidir. */

export interface Attribution {
  invested: number;      // net yatırılan (maliyet)
  gain: number;          // güncel değer − maliyet
  value: number;
  gainSharePct: number;  // kazancın güncel değer içindeki payı
  totalReturnPct: number;// maliyete göre toplam getiri
}

export function attributionOf(s: PortfolioState): Attribution | undefined {
  const value = totalValue(s);
  const invested = totalCost(s);
  if (invested <= 0) return undefined;
  const gain = value - invested;
  return {
    invested, gain, value,
    gainSharePct: value > 0 ? (gain / value) * 100 : 0,
    totalReturnPct: (gain / invested) * 100,
  };
}

/* ─────────────────────────  Varlık bazlı katkı payları  ─────────────────────────
   Toplam kâr/zararı hangi varlık sürükledi? Kâr/zarar çubuk grafiğinin sayısal okuması. */

export interface Contributor { name: string; pnl: number; sharePct: number }

export interface ContributionBreakdown {
  winners: Contributor[];  // kârda olanlar, büyükten küçüğe
  losers: Contributor[];   // zararda olanlar, büyükten küçüğe (mutlak değer)
  totalPnl: number;
  grossGain: number;       // yalnızca kârda olanların toplamı
  grossLoss: number;       // yalnızca zararda olanların toplamı (pozitif sayı)
}

export function contributionOf(s: PortfolioState): ContributionBreakdown | undefined {
  if (s.holdings.length === 0) return undefined;

  const rows = s.holdings.map(h => ({ name: h.name, pnl: h.amount - h.costBasis }));
  const grossGain = rows.filter(r => r.pnl > 0).reduce((a, r) => a + r.pnl, 0);
  const grossLoss = Math.abs(rows.filter(r => r.pnl < 0).reduce((a, r) => a + r.pnl, 0));
  const totalPnl = grossGain - grossLoss;
  const denom = grossGain + grossLoss; // payları brüt hareket üzerinden veriyoruz (net sıfıra yakınsa da anlamlı kalsın)

  const withShare = (r: { name: string; pnl: number }): Contributor => ({
    ...r,
    sharePct: denom > 0 ? (Math.abs(r.pnl) / denom) * 100 : 0,
  });

  return {
    winners: rows.filter(r => r.pnl > 0).sort((a, b) => b.pnl - a.pnl).map(withShare),
    losers: rows.filter(r => r.pnl < 0).sort((a, b) => a.pnl - b.pnl).map(withShare),
    totalPnl, grossGain, grossLoss,
  };
}

/* ─────────────────────────  Yatırım temposu  ─────────────────────────
   Net Yatırım grafiğinin okuması: ne kadar sürede ne kadar yatırdın, aylık ortalama tempo. */

export interface InvestmentPace {
  days: number;
  months: number;
  totalInvested: number;
  monthlyAverage: number;
  buyCount: number;
  sellCount: number;
}

export function investmentPaceOf(s: PortfolioState, today = new Date()): InvestmentPace | undefined {
  if (s.txns.length === 0) return undefined;
  const times = s.txns.map(t => new Date(t.date).getTime());
  const first = Math.min(...times);
  const days = Math.max(1, (today.getTime() - first) / MS_PER_DAY);
  const months = days / 30.44;
  const buys = s.txns.filter(t => t.kind === 'alis');
  const sells = s.txns.filter(t => t.kind === 'satis');
  const totalInvested = buys.reduce((a, t) => a + t.amount, 0) - sells.reduce((a, t) => a + t.amount, 0);
  return {
    days, months, totalInvested,
    monthlyAverage: months >= 1 ? totalInvested / months : totalInvested,
    buyCount: buys.length,
    sellCount: sells.length,
  };
}

/* ─────────────────────────  Enflasyona karşı başabaş  ───────────────────────── */

// Alım gücünü korumak için gereken nominal getiri = enflasyon oranının kendisi.
// Bunun üstü reel kazanç, altı reel kayıptır.
export function realGapPct(nominalPct: number, inflationPct: number): number {
  return realReturnPct(nominalPct, inflationPct);
}

/* ═════════════════════════  RİSK MATEMATİĞİ  ═════════════════════════
   Bunlar GERÇEK tarihsel fiyat serisi gerektirir (bkz. priceHistory.ts). Seri olmayan
   varlıklar (BIST hissesi, TEFAS fonu, altın, mevduat) hesaba KATILMAZ ve rapor hangi
   oranı kapsadığını açıkça bildirir — kapsanmayanı varmış gibi göstermek yanıltıcı olurdu. */

// Günlük logaritmik olmayan (basit) getiriler: r_t = P_t / P_{t-1} − 1
export function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev > 0) out.push(prices[i] / prev - 1);
  }
  return out;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

// Örneklem standart sapması (n−1) — getiri serisi bir örneklemdir, anakütle değil.
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const varr = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(varr);
}

// Yıllıklandırılmış volatilite (%): günlük std sapma × √(yıldaki periyot sayısı)
export function annualizedVolatilityPct(returns: number[], periodsPerYear: number): number {
  return stdDev(returns) * Math.sqrt(periodsPerYear) * 100;
}

// Maksimum düşüş (%): zirveden dibe en büyük kayıp — "en kötü ne yaşadım" ölçüsü.
export function maxDrawdownPct(prices: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    if (peak > 0) {
      const dd = (peak - p) / peak;
      if (dd > worst) worst = dd;
    }
  }
  return worst * 100;
}

// Serinin kapsadığı dönemin yıllıklandırılmış getirisi (%).
export function annualizedReturnFromPrices(prices: number[], periodsPerYear: number): number {
  if (prices.length < 2) return 0;
  const first = prices[0], last = prices[prices.length - 1];
  if (first <= 0) return 0;
  const periods = prices.length - 1;
  return (Math.pow(last / first, periodsPerYear / periods) - 1) * 100;
}

// Sharpe oranı = (yıllık getiri − risksiz faiz) / yıllık volatilite.
// Risksiz faiz Türkiye için anahtarsız bir API'den alınamaz; kullanıcı VARSAYIM olarak girer
// (enflasyon varsayımıyla aynı yaklaşım) ve arayüzde "senin varsayımın" diye etiketlenir.
export function sharpeRatio(annualReturnPct: number, annualVolPct: number, riskFreePct: number): number | undefined {
  if (annualVolPct <= 0) return undefined;
  return (annualReturnPct - riskFreePct) / annualVolPct;
}

// Pearson korelasyonu — iki getiri serisi arasında.
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const x = a.slice(a.length - n), y = b.slice(b.length - n);
  const mx = mean(x), my = mean(y);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = x[i] - mx, by = y[i] - my;
    num += ax * by; dx += ax * ax; dy += by * by;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

/* Portföy volatilitesi — DOĞRU yöntem: kovaryans matrisi.
     σ_p² = Σᵢ Σⱼ wᵢ wⱼ σᵢ σⱼ ρᵢⱼ
   Varlıkların volatilitelerinin ağırlıklı ORTALAMASI portföy volatilitesi DEĞİLDİR; varlıklar
   tam korele olmadığı sürece portföy volatilitesi daha düşük çıkar. Aradaki fark, çeşitlendirmenin
   sağladığı somut faydadır — bunu ayrıca raporluyoruz. */

export interface AssetRisk {
  name: string;
  weight: number;        // kapsanan portföy içindeki ağırlık (0–1)
  volPct: number;        // yıllıklandırılmış volatilite
  drawdownPct: number;
  annualReturnPct: number;
  returns: number[];     // korelasyon için günlük getiriler
}

export interface PortfolioRisk {
  portfolioVolPct: number;        // kovaryans matrisiyle
  weightedAvgVolPct: number;      // çeşitlendirme yokmuş gibi (tam korelasyon varsayımı)
  diversificationBenefitPct: number; // aradaki fark — çeşitlendirmenin kazandırdığı
}

export function portfolioRisk(assets: AssetRisk[]): PortfolioRisk | undefined {
  if (assets.length === 0) return undefined;

  const weightedAvgVolPct = assets.reduce((a, x) => a + x.weight * x.volPct, 0);

  let variance = 0;
  for (let i = 0; i < assets.length; i++) {
    for (let j = 0; j < assets.length; j++) {
      const rho = i === j ? 1 : correlation(assets[i].returns, assets[j].returns);
      variance += assets[i].weight * assets[j].weight * assets[i].volPct * assets[j].volPct * rho;
    }
  }
  const portfolioVolPct = Math.sqrt(Math.max(0, variance));

  return {
    portfolioVolPct,
    weightedAvgVolPct,
    diversificationBenefitPct: weightedAvgVolPct - portfolioVolPct,
  };
}

// Volatilite seviyesini yorumlamak için kaba ama dürüst eşikler (yıllık, TL bazlı).
export function volatilityLevel(annualVolPct: number): 'dusuk' | 'orta' | 'yuksek' | 'cok-yuksek' {
  if (annualVolPct < 15) return 'dusuk';
  if (annualVolPct < 35) return 'orta';
  if (annualVolPct < 70) return 'yuksek';
  return 'cok-yuksek';
}

// Kullanıcı metninde geçen enflasyon oranını yakalar ("%55 enflasyona göre...", "enflasyon 55").
export function parseInflationPct(text: string): number | undefined {
  const m = text.match(/%\s*(\d{1,3}(?:[.,]\d+)?)|(\d{1,3}(?:[.,]\d+)?)\s*%/);
  if (m) {
    const raw = (m[1] ?? m[2]).replace(',', '.');
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 0 && v <= 200) return v;
  }
  return undefined;
}
