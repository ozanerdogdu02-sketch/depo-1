// analytics.ts birim testleri — hepsi SAF fonksiyon, I/O yok.
// Buradaki uç durumlar e2e ile pratikte test edilemiyordu: XIRR'in yakınsamadığı seri,
// sapma bandının TAM sınırı, sıfır varyanslı fiyat serisi gibi durumlar için tarayıcıda
// o veriyi üretmek zor. Bu dosya onları doğrudan ölçüyor.
import { describe, it, expect } from 'vitest';
import {
  realReturnPct, realGapPct, xirr, allocation, concentrationOf,
  driftBandOf, driftOf, afterTaxOf, DEFAULT_TAX_RATES,
  dailyReturns, stdDev, maxDrawdownPct, sharpeRatio, correlation, portfolioRisk,
  parseInflationPct,
} from './analytics';
import { PortfolioState, Holding, AssetType } from './store';

const h = (name: string, type: AssetType, amount: number, costBasis: number): Holding =>
  ({ id: name, name, type, amount, costBasis });

const state = (holdings: Holding[], txns: PortfolioState['txns'] = []): PortfolioState =>
  ({ holdings, txns, onboarded: true, realizedPnl: 0 });

/* ─────────────────────────── Fisher reel getiri ─────────────────────────── */

describe('realReturnPct', () => {
  it('Fisher denklemi, naif çıkarmadan FARKLI sonuç verir', () => {
    // %60 nominal, %32 enflasyon → naif: 28. Doğrusu: (1,60/1,32)−1 = %21,2
    const real = realReturnPct(60, 32);
    expect(real).toBeCloseTo(21.21, 1);
    expect(real).not.toBeCloseTo(60 - 32, 1);
  });

  it('enflasyon sıfırken nominal ile aynıdır', () => {
    expect(realReturnPct(15, 0)).toBeCloseTo(15, 10);
  });

  it('nominal getiri enflasyonun altındaysa reel getiri negatiftir', () => {
    expect(realReturnPct(2.64, 32)).toBeLessThan(0);
  });

  // NOT: realGapPct adı "fark" ima ediyor ama gövdesi realReturnPct'in birebir takma adı ve
  // üretim kodunda hiç çağrılmıyor. Test bunu olduğu gibi sabitliyor; adı düzeltilirse ya da
  // silinirse bu test kasıtlı olarak kırılsın (sessiz davranış değişikliği olmasın).
  it('realGapPct şu an realReturnPct ile aynı sonucu döndürüyor (takma ad)', () => {
    expect(realGapPct(60, 32)).toBeCloseTo(realReturnPct(60, 32), 10);
  });
});

/* ─────────────────────────────── XIRR ─────────────────────────────── */

describe('xirr', () => {
  it('bir yılda ikiye katlanan tek yatırım ≈ %100 döner', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 2000 },
    ]);
    expect(r).toBeDefined();
    expect(r! * 100).toBeCloseTo(100, 0);
  });

  it('tek nakit akışında tanımsız döner (kök yok)', () => {
    expect(xirr([{ date: '2025-01-01', amount: -1000 }])).toBeUndefined();
  });

  it('işaret değişimi yoksa tanımsız döner', () => {
    expect(xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: -500 },
    ])).toBeUndefined();
  });

  it('zarar eden seride negatif getiri döner', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 500 },
    ]);
    expect(r).toBeDefined();
    expect(r!).toBeLessThan(0);
  });

  it('ara para eklemesi getiriyi tek-akışlı hesaptan AYIRIR', () => {
    // Aynı başlangıç ve bitiş değeri, ama arada para eklenmiş: para-ağırlıklı getiri düşer.
    const simple = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1200 },
    ])!;
    const withAdd = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-11-01', amount: -1000 },
      { date: '2026-01-01', amount: 1200 },
    ])!;
    expect(withAdd).toBeLessThan(simple);
  });
});

/* ────────────────────────── Dağılım ve yoğunlaşma ────────────────────────── */

describe('allocation', () => {
  it('boş portföyde boş dizi döner', () => {
    expect(allocation(state([]))).toEqual([]);
  });

  it('yüzdeler toplamı 100 eder', () => {
    const a = allocation(state([
      h('A', 'hisse', 250, 250), h('B', 'fon', 250, 250), h('C', 'altin', 500, 500),
    ]));
    expect(a.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 6);
  });
});

describe('concentrationOf', () => {
  it('tek varlıkta HHI 1 olur ve seviye yüksektir', () => {
    const c = concentrationOf(state([h('Tek', 'hisse', 1000, 1000)]))!;
    expect(c.hhi).toBeCloseTo(1, 6);
    expect(c.level).toBe('yuksek');
  });

  it('eşit dağılmış 10 varlıkta HHI 0,1 olur', () => {
    const hs = Array.from({ length: 10 }, (_, i) => h(`V${i}`, 'hisse', 100, 100));
    expect(concentrationOf(state(hs))!.hhi).toBeCloseTo(0.1, 6);
  });

  it('boş portföyde tanımsız döner', () => {
    expect(concentrationOf(state([]))).toBeUndefined();
  });
});

/* ──────────────────── Hedef sapma — %5/%25 bandı ──────────────────── */

describe('driftBandOf', () => {
  it('büyük hedeflerde mutlak 5 puan kolu bağlar', () => {
    expect(driftBandOf(60)).toBe(5);   // 60×0,25 = 15 → min(5, 15) = 5
  });

  it('küçük hedeflerde göreli %25 kolu bağlar', () => {
    expect(driftBandOf(8)).toBeCloseTo(2, 6); // 8×0,25 = 2 → min(5, 2) = 2
  });

  it('tam 20 hedefte iki kol da 5 verir', () => {
    expect(driftBandOf(20)).toBe(5);
  });
});

describe('driftOf', () => {
  const targets = (o: Partial<Record<AssetType, number>>): Record<AssetType, number> =>
    ({ hisse: 0, fon: 0, doviz: 0, altin: 0, kripto: 0, mevduat: 0, ...o });

  it('TAM sınırdaki sapma "bandın dışında" SAYILMAZ (kesin eşitsizlik)', () => {
    // Hedef %50 → bant 5 puan. Gerçekleşen %55 → sapma tam 5. Dışında sayılmamalı.
    const d = driftOf(state([h('A', 'hisse', 55, 55), h('B', 'fon', 45, 45)]), targets({ hisse: 50, fon: 50 }))!;
    const row = d.rows.find(r => r.type === 'hisse')!;
    expect(Math.abs(row.driftPp)).toBeCloseTo(5, 6);
    expect(row.breached).toBe(false);
  });

  it('sınırın bir tık ötesi bandın dışında sayılır', () => {
    const d = driftOf(state([h('A', 'hisse', 56, 56), h('B', 'fon', 44, 44)]), targets({ hisse: 50, fon: 50 }))!;
    expect(d.rows.find(r => r.type === 'hisse')!.breached).toBe(true);
  });

  it('hedef girilmemişse tanımsız döner', () => {
    expect(driftOf(state([h('A', 'hisse', 100, 100)]), targets({}))).toBeUndefined();
  });
});

/* ─────────────────────── Vergi sonrası (stopaj) ─────────────────────── */

describe('afterTaxOf', () => {
  it('ZARARDAKİ kalemden kesinti yapılmaz', () => {
    const r = afterTaxOf(state([h('Zarar', 'fon', 800, 1000)]), 32)!;
    expect(r.tax).toBe(0);
    expect(r.grossGain).toBeLessThan(0);
  });

  it('kârdaki fon kaleminden oran kadar kesinti yapılır', () => {
    const rates = { ...DEFAULT_TAX_RATES, fon: 20 };
    const r = afterTaxOf(state([h('Fon', 'fon', 1200, 1000)]), 0, rates)!;
    expect(r.grossGain).toBeCloseTo(200, 6);
    expect(r.tax).toBeCloseTo(40, 6);   // 200 × %20
    expect(r.netGain).toBeCloseTo(160, 6);
  });

  it('zarar ve kâr AYRI hesaplanır — zarar mahsubu YAPILMAZ', () => {
    const rates = { ...DEFAULT_TAX_RATES, fon: 20, hisse: 20 };
    const r = afterTaxOf(state([
      h('Kar', 'fon', 1200, 1000),      // +200 → 40 vergi
      h('Zarar', 'hisse', 800, 1000),   // −200 → 0 vergi
    ]), 0, rates)!;
    expect(r.grossGain).toBeCloseTo(0, 6);
    expect(r.tax).toBeCloseTo(40, 6); // mahsup olsaydı 0 olurdu
  });

  it('doğrulanmamış sınıf (kripto) varsayılan %0 ile kesintisiz kalır', () => {
    const r = afterTaxOf(state([h('BTC', 'kripto', 2000, 1000)]), 0)!;
    expect(r.tax).toBe(0);
  });

  it('maliyeti sıfır portföyde tanımsız döner', () => {
    expect(afterTaxOf(state([]), 32)).toBeUndefined();
  });
});

/* ───────────────────────────── Risk metrikleri ───────────────────────────── */

describe('risk fonksiyonları', () => {
  it('sabit fiyat serisinde günlük getiriler sıfır, oynaklık sıfırdır', () => {
    const rs = dailyReturns([100, 100, 100, 100]);
    expect(rs.every(r => r === 0)).toBe(true);
    expect(stdDev(rs)).toBeCloseTo(0, 10);
  });

  it('maxDrawdownPct tepe-dip düşüşünü bulur', () => {
    // Fonksiyon düşüşü POZİTİF yüzde olarak döndürür (worst × 100), işaretli değil.
    expect(maxDrawdownPct([100, 120, 60, 90])).toBeCloseTo(50, 6); // 120 → 60
  });

  it('sürekli yükselen seride düşüş yoktur', () => {
    expect(maxDrawdownPct([100, 110, 120])).toBeCloseTo(0, 6);
  });

  it('oynaklık sıfırken Sharpe tanımsız döner (sıfıra bölme korunuyor)', () => {
    expect(sharpeRatio(20, 0, 5)).toBeUndefined();
  });

  it('birebir aynı iki seride korelasyon 1, ters seride −1 olur', () => {
    expect(correlation([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1, 6);
    expect(correlation([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });

  it('portföy oynaklığı, kalemlerin ağırlıklı ORTALAMASI DEĞİLDİR', () => {
    // Ters hareket eden iki eşit ağırlıklı varlık: ortalama %20 der, kovaryans çok daha azını.
    const r = portfolioRisk([
      { name: 'A', weight: 0.5, volPct: 20, drawdownPct: 0, annualReturnPct: 0, returns: [0.01, -0.01, 0.01, -0.01] },
      { name: 'B', weight: 0.5, volPct: 20, drawdownPct: 0, annualReturnPct: 0, returns: [-0.01, 0.01, -0.01, 0.01] },
    ])!;
    expect(r.portfolioVolPct).toBeLessThan(20);
    expect(r.diversificationBenefitPct).toBeGreaterThan(0);
  });

  it('tek kalemde çeşitlendirme faydası yoktur', () => {
    const r = portfolioRisk([
      { name: 'A', weight: 1, volPct: 20, drawdownPct: 0, annualReturnPct: 0, returns: [0.01, -0.01, 0.02] },
    ])!;
    expect(r.portfolioVolPct).toBeCloseTo(20, 4);
    expect(r.diversificationBenefitPct).toBeCloseTo(0, 4);
  });
});

/* ───────────────────── Kullanıcı metninden enflasyon oranı ───────────────────── */

describe('parseInflationPct', () => {
  it('"%55 enflasyona göre" ifadesinden oranı çıkarır', () => {
    expect(parseInflationPct('%55 enflasyona göre reel getirim ne')).toBe(55);
  });

  it('oran geçmeyen metinde tanımsız döner', () => {
    expect(parseInflationPct('reel getirim ne')).toBeUndefined();
  });
});
