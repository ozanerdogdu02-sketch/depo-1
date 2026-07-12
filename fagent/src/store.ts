import { useSyncExternalStore } from 'react';

export type AssetType = 'hisse' | 'fon' | 'doviz' | 'altin' | 'kripto' | 'mevduat';

export interface Holding {
  id: string;
  name: string;
  type: AssetType;
  amount: number; // TL — güncel değer (kullanıcı girer/günceller, otomatik piyasa verisi çekilmez)
  costBasis: number; // TL — net yatırılan tutar (alış/satış işlemlerinden otomatik hesaplanır)
}

export interface Txn {
  id: string;
  date: string; // YYYY-MM-DD
  holdingName: string;
  kind: 'alis' | 'satis';
  amount: number; // TL
}

export interface PortfolioState {
  onboarded: boolean;
  holdings: Holding[];
  txns: Txn[];
}

export const ASSET_LABELS: Record<AssetType, string> = {
  hisse: 'Hisse',
  fon: 'Fon',
  doviz: 'Döviz',
  altin: 'Altın',
  kripto: 'Kripto',
  mevduat: 'Mevduat',
};

const KEY = 'fagent.portfolio.v1';

const EMPTY: PortfolioState = { onboarded: false, holdings: [], txns: [] };

// Örnek veri, kâr/zarar özelliğini gösterebilmek için maliyet ≠ güncel değer içerir.
const SAMPLE: PortfolioState = {
  onboarded: true,
  holdings: [
    { id: 'h1', name: 'BIST 30 Fonu', type: 'fon', amount: 48500, costBasis: 45000 },
    { id: 'h2', name: 'THYAO', type: 'hisse', amount: 25200, costBasis: 28000 },
    { id: 'h3', name: 'Gram Altın', type: 'altin', amount: 23800, costBasis: 22000 },
    { id: 'h4', name: 'USD', type: 'doviz', amount: 15000, costBasis: 15000 },
    { id: 'h5', name: 'Vadeli Mevduat', type: 'mevduat', amount: 31200, costBasis: 30000 },
  ],
  txns: [
    { id: 't1', date: sameDayOffset(-21), holdingName: 'BIST 30 Fonu', kind: 'alis', amount: 15000 },
    { id: 't2', date: sameDayOffset(-14), holdingName: 'THYAO', kind: 'alis', amount: 8000 },
    { id: 't3', date: sameDayOffset(-7), holdingName: 'Gram Altın', kind: 'alis', amount: 6000 },
    { id: 't4', date: sameDayOffset(-2), holdingName: 'USD', kind: 'satis', amount: 3000 },
  ],
};

function sameDayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

let state: PortfolioState = load();
const listeners = new Set<() => void>();

function load(): PortfolioState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as PortfolioState;
    if (!Array.isArray(parsed.holdings) || !Array.isArray(parsed.txns)) return EMPTY;
    // Eski sürümden gelen veride costBasis yoksa, kâr/zarar sıfır kabul edilir (amount'a eşitlenir).
    const holdings = parsed.holdings.map(h => ({
      ...h,
      costBasis: typeof h.costBasis === 'number' ? h.costBasis : h.amount,
    }));
    return { ...parsed, holdings };
  } catch {
    return EMPTY;
  }
}

function commit(next: PortfolioState): void {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach(fn => fn());
}

export const actions = {
  startWithSample(): void {
    commit(structuredClone(SAMPLE));
  },
  startEmpty(): void {
    commit({ ...EMPTY, onboarded: true });
  },
  reset(): void {
    localStorage.removeItem(KEY);
    commit(EMPTY);
  },
  addHolding(name: string, type: AssetType, amount: number): void {
    const holding: Holding = { id: `h${Date.now()}`, name: name.trim(), type, amount, costBasis: amount };
    commit({ ...state, holdings: [...state.holdings, holding] });
  },
  removeHolding(id: string): void {
    commit({ ...state, holdings: state.holdings.filter(h => h.id !== id) });
  },
  // Kullanıcının kendi girdiği güncel değer — otomatik piyasa verisi çekilmez, maliyeti değiştirmez.
  updateHoldingValue(id: string, newAmount: number): void {
    const holdings = state.holdings.map(h => h.id === id ? { ...h, amount: Math.max(0, newAmount) } : h);
    commit({ ...state, holdings });
  },
  addTxn(holdingName: string, kind: Txn['kind'], amount: number): void {
    const txn: Txn = { id: `t${Date.now()}`, date: new Date().toISOString().slice(0, 10), holdingName, kind, amount };
    const holdings = state.holdings.map(h => {
      if (h.name !== holdingName) return h;
      if (kind === 'alis') {
        // Alış: hem güncel değer hem maliyet aynı miktarda artar.
        return { ...h, amount: h.amount + amount, costBasis: h.costBasis + amount };
      }
      // Satış: güncel değer düşer; maliyet, kalan pozisyonun oranına göre orantılı azaltılır
      // (ağırlıklı ortalama maliyet yöntemi — kâr/zarar yüzdesi satıştan etkilenmez).
      const nextAmount = Math.max(0, h.amount - amount);
      const ratio = h.amount > 0 ? nextAmount / h.amount : 0;
      return { ...h, amount: nextAmount, costBasis: h.costBasis * ratio };
    });
    commit({ ...state, holdings, txns: [txn, ...state.txns] });
  },
};

export function usePortfolio(): PortfolioState {
  return useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}

export const totalValue = (s: PortfolioState) => s.holdings.reduce((sum, h) => sum + h.amount, 0);
export const totalCost = (s: PortfolioState) => s.holdings.reduce((sum, h) => sum + h.costBasis, 0);

export interface Pnl {
  abs: number; // TL — kâr(+)/zarar(-)
  pct: number; // % — maliyete göre
}

export function pnlOf(amount: number, costBasis: number): Pnl {
  const abs = amount - costBasis;
  const pct = costBasis > 0 ? (abs / costBasis) * 100 : 0;
  return { abs, pct };
}

export const fmtTL = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

export const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
export const fmtSigned = (n: number) => `${n >= 0 ? '+' : ''}${fmtTL(n)}`;
