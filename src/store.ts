import { useSyncExternalStore } from 'react';

export type AssetType = 'hisse' | 'fon' | 'doviz' | 'altin' | 'kripto' | 'mevduat';

export interface Holding {
  id: string;
  name: string;
  type: AssetType;
  amount: number; // TL
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

const SAMPLE: PortfolioState = {
  onboarded: true,
  holdings: [
    { id: 'h1', name: 'BIST 30 Fonu', type: 'fon', amount: 45000 },
    { id: 'h2', name: 'THYAO', type: 'hisse', amount: 28000 },
    { id: 'h3', name: 'Gram Altın', type: 'altin', amount: 22000 },
    { id: 'h4', name: 'USD', type: 'doviz', amount: 15000 },
    { id: 'h5', name: 'Vadeli Mevduat', type: 'mevduat', amount: 30000 },
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
    return parsed;
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
    const holding: Holding = { id: `h${Date.now()}`, name: name.trim(), type, amount };
    commit({ ...state, holdings: [...state.holdings, holding] });
  },
  removeHolding(id: string): void {
    commit({ ...state, holdings: state.holdings.filter(h => h.id !== id) });
  },
  addTxn(holdingName: string, kind: Txn['kind'], amount: number): void {
    const txn: Txn = { id: `t${Date.now()}`, date: new Date().toISOString().slice(0, 10), holdingName, kind, amount };
    const holdings = state.holdings.map(h => {
      if (h.name !== holdingName) return h;
      const next = kind === 'alis' ? h.amount + amount : Math.max(0, h.amount - amount);
      return { ...h, amount: next };
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

export const fmtTL = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
