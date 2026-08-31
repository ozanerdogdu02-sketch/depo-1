// Dengeleme planı — çok adımlı görevin matematiği.
// Buradaki bir hata kullanıcının onayladığı YANLIŞ bir işlem dizisi demek,
// bu yüzden toplam korunumu ve bakiye güvenliği ayrı ayrı sınanıyor.
import { beforeEach, describe, expect, it } from 'vitest';
import { openMemoryDb, type Db, type HoldingRow } from '../src/db.ts';
import { addHolding, listHoldings, totalValue } from '../src/core/portfolio.ts';
import { planRebalance } from '../src/core/rebalance.ts';
import { parseIntent } from '../src/brain/rules.ts';

const TZ = 'Europe/Istanbul';
let db: Db;
let holdings: HoldingRow[];

/** Planı deftere uygulanmış gibi simüle eder — toplam korunuyor mu görmek için. */
function simulate(rows: HoldingRow[], steps: { holdingId: string; txnKind: 'alis' | 'satis'; amount: number }[]) {
  const map = new Map(rows.map(h => [h.id, { ...h }]));
  for (const s of steps) {
    const h = map.get(s.holdingId);
    if (!h) continue;
    h.amount += s.txnKind === 'alis' ? s.amount : -s.amount;
  }
  return [...map.values()];
}

beforeEach(() => {
  db = openMemoryDb();
  addHolding(db, { name: 'Bitcoin', kind: 'kripto', amount: 50_000 }, TZ);
  addHolding(db, { name: 'THYAO', kind: 'hisse', amount: 30_000 }, TZ);
  addHolding(db, { name: 'Gram Altın', kind: 'altin', amount: 20_000 }, TZ);
  holdings = listHoldings(db);
});

describe('dengeleme planı', () => {
  it('aşırı ağırlıktaki sınıfı hedefe düşürür', () => {
    // Kripto %50 → %30 hedefi: 20.000 TL satılmalı
    const plan = planRebalance(holdings, 'kripto', 30);
    expect(plan.problem).toBeUndefined();
    const satis = plan.steps.filter(s => s.txnKind === 'satis');
    expect(satis).toHaveLength(1);
    expect(satis[0]!.holdingName).toBe('Bitcoin');
    expect(satis[0]!.amount).toBeCloseTo(20_000, 2);
  });

  // EN KRİTİK: dengeleme para çıkışı değildir — toplam DEĞİŞMEMELİ.
  it('portföy toplamını KORUR', () => {
    const before = totalValue(holdings);
    const plan = planRebalance(holdings, 'kripto', 30);
    const after = totalValue(simulate(holdings, plan.steps));
    expect(after).toBeCloseTo(before, 2);
  });

  it('hedef ağırlığa gerçekten ulaşır', () => {
    const plan = planRebalance(holdings, 'kripto', 30);
    const result = simulate(holdings, plan.steps);
    const total = totalValue(result);
    const kripto = result.filter(h => h.kind === 'kripto').reduce((s, h) => s + h.amount, 0);
    expect((kripto / total) * 100).toBeCloseTo(30, 2);
  });

  it('eksik ağırlıktaki sınıfı hedefe çıkarır ve toplamı korur', () => {
    // Altın %20 → %40
    const before = totalValue(holdings);
    const plan = planRebalance(holdings, 'altin', 40);
    expect(plan.problem).toBeUndefined();
    const result = simulate(holdings, plan.steps);
    expect(totalValue(result)).toBeCloseTo(before, 2);
    const altin = result.filter(h => h.kind === 'altin').reduce((s, h) => s + h.amount, 0);
    expect((altin / totalValue(result)) * 100).toBeCloseTo(40, 2);
  });

  it('satış tutarı hiçbir varlığın bakiyesini AŞMAZ', () => {
    const plan = planRebalance(holdings, 'kripto', 0);
    for (const step of plan.steps.filter(s => s.txnKind === 'satis')) {
      const holding = holdings.find(h => h.id === step.holdingId)!;
      expect(step.amount).toBeLessThanOrEqual(holding.amount + 0.01);
    }
  });

  it('birden fazla varlığı olan sınıfta satışı ağırlıkça dağıtır', () => {
    addHolding(db, { name: 'Ethereum', kind: 'kripto', amount: 50_000 }, TZ);
    const rows = listHoldings(db);
    // Kripto 100.000 / toplam 150.000 = %66,7 → %30 hedefi
    const plan = planRebalance(rows, 'kripto', 30);
    const satis = plan.steps.filter(s => s.txnKind === 'satis');
    expect(satis).toHaveLength(2);
    // İki kripto eşit büyüklükte → satış da eşit bölünmeli
    expect(satis[0]!.amount).toBeCloseTo(satis[1]!.amount, 2);
  });

  it('zaten hedefteyse işlem önermez', () => {
    const plan = planRebalance(holdings, 'kripto', 50);
    expect(plan.steps).toHaveLength(0);
    expect(plan.summary).toMatch(/zaten/i);
  });

  it('geçersiz hedef yüzdeyi reddeder', () => {
    expect(planRebalance(holdings, 'kripto', 150).problem).toBeDefined();
    expect(planRebalance(holdings, 'kripto', -5).problem).toBeDefined();
  });

  it('boş portföyde plan üretmez', () => {
    expect(planRebalance([], 'kripto', 30).problem).toBeDefined();
  });

  it('portföyde o sınıf hiç yoksa açıklayıcı hata verir', () => {
    const plan = planRebalance(holdings, 'fon', 30);
    expect(plan.problem).toMatch(/hiç fon yok/i);
  });

  it('tek sınıflı portföyde aktaracak yer olmadığını söyler', () => {
    const solo = openMemoryDb();
    addHolding(solo, { name: 'Bitcoin', kind: 'kripto', amount: 10_000 }, TZ);
    const plan = planRebalance(listHoldings(solo), 'kripto', 30);
    expect(plan.problem).toMatch(/başka bir varlık yok|başka varlık yok/i);
  });
});

describe('dengeleme komutunu anlama', () => {
  it('yüzde işaretli komutu tanır', () => {
    expect(parseIntent("kriptoyu %30'a düşür", holdings)).toEqual({ id: 'dengeleme', kind: 'kripto', targetPct: 30 });
  });

  it('"yüzde 40" yazımını tanır', () => {
    expect(parseIntent('hisse ağırlığını yüzde 40 yap', holdings)).toEqual({ id: 'dengeleme', kind: 'hisse', targetPct: 40 });
  });

  it('sonda yüzde işaretli yazımı tanır', () => {
    expect(parseIntent('altını 25% e çıkar', holdings)).toEqual({ id: 'dengeleme', kind: 'altin', targetPct: 25 });
  });

  it('yüzde yoksa dengeleme üretmez', () => {
    expect(parseIntent('kriptoyu düşür', holdings).id).not.toBe('dengeleme');
  });

  it('sınıf belli değilse dengeleme üretmez', () => {
    expect(parseIntent('%30 yap', holdings).id).not.toBe('dengeleme');
  });
});
