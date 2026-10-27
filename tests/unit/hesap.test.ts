// Birim testler: saf hesap fonksiyonları. Koşucu: Node yerleşik `node --test` (yeni bağımlılık yok).
// Örnek tutarlar ve oranlar fixture'dır; gerçek piyasa verisi değildir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtPct, fmtPctPlain, fmtDec, totalValue, totalCost } from '../../src/store.ts';
import type { PortfolioState, Holding } from '../../src/store.ts';
import { realReturnPct, xirr, afterTaxOf, driftBandOf } from '../../src/analytics.ts';
import { DEFAULT_TAX_RATES, UNVERIFIED_TAX, VARSAYILAN_ENFLASYON_PCT } from '../../src/config/varsayilanlar.ts';

const h = (p: Partial<Holding>): Holding => ({ id: 'x', name: 'x', type: 'fon', amount: 0, costBasis: 0, ...p }) as Holding;
const state = (holdings: Holding[]): PortfolioState =>
  ({ holdings, txns: [], realizedPnl: 0 }) as unknown as PortfolioState;

test('fmtPct: işaret yüzdenin önünde, "%-" üretilmez', () => {
  assert.equal(fmtPct(17.5), '+%17,5');
  assert.equal(fmtPct(-22.7), '-%22,7');
  assert.equal(fmtPct(0), '+%0,0');
  assert.equal(fmtPct(0.012), '+%0,01');
});

test('fmtPctPlain: işaretsiz pozitif, negatifte -%', () => {
  assert.equal(fmtPctPlain(17.5), '%17,5');
  assert.equal(fmtPctPlain(-22.7), '-%22,7');
  assert.equal(fmtPctPlain(30, 0), '%30');
  assert.ok(!fmtPctPlain(-5).includes('%-'));
});

test('fmtDec: Türkçe ondalık ayracı', () => {
  assert.equal(fmtDec(1.5, 1), '1,5');
});

test('realReturnPct: Fisher denklemi (kestirme değil)', () => {
  assert.ok(Math.abs(realReturnPct(60, 40) - 14.2857) < 1e-3);
  assert.equal(realReturnPct(0, 0), 0);
});

test('xirr: bilinen akış ve çözülemeyen durumlar', () => {
  const r = xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1100 }]);
  assert.ok(r !== undefined && Math.abs(r - 0.1) < 1e-3);
  assert.equal(xirr([{ date: '2025-01-01', amount: -1000 }]), undefined);
  assert.equal(xirr([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: -5 }]), undefined);
});

test('afterTaxOf: fon kazancı %17,5 stopajla net; zararda stopaj 0; maliyet 0 ise undefined', () => {
  const res = afterTaxOf(state([h({ type: 'fon', amount: 48500, costBasis: 45000 })]), 30);
  assert.ok(res);
  assert.equal(res.grossGain, 3500);
  assert.equal(res.tax, 612.5);
  assert.equal(res.netGain, 2887.5);
  const loss = afterTaxOf(state([h({ type: 'fon', amount: 900, costBasis: 1000 })]), 30);
  assert.equal(loss?.tax, 0);
  assert.equal(afterTaxOf(state([]), 30), undefined);
});

test('totalValue / totalCost: boş portföy 0', () => {
  assert.equal(totalValue(state([])), 0);
  assert.equal(totalCost(state([h({ costBasis: 10 }), h({ costBasis: 5 })])), 15);
});

test('driftBandOf: min(5, hedef x 0,25)', () => {
  assert.equal(driftBandOf(10), 2.5);
  assert.equal(driftBandOf(60), 5);
});

test('varsayılanlar: değerler taşıma öncesiyle aynı', () => {
  assert.equal(DEFAULT_TAX_RATES.fon, 17.5);
  assert.equal(DEFAULT_TAX_RATES.mevduat, 17.5);
  assert.equal(DEFAULT_TAX_RATES.hisse, 0);
  assert.equal(VARSAYILAN_ENFLASYON_PCT, 30);
  for (const t of UNVERIFIED_TAX) assert.equal(DEFAULT_TAX_RATES[t], 0);
});
