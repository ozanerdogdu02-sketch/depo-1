import { useSyncExternalStore } from 'react';

export type AssetType = 'hisse' | 'fon' | 'doviz' | 'altin' | 'kripto' | 'mevduat';

export interface Holding {
  id: string;
  name: string;
  type: AssetType;
  amount: number; // TL — güncel değer (kullanıcı girer/günceller ya da canlı fiyattan hesaplanır)
  costBasis: number; // TL — net yatırılan tutar (alış/satış işlemlerinden otomatik hesaplanır)
  // Yalnızca döviz/kripto: canlı fiyata bağlıysa dolu olur (bkz. market.ts).
  quantity?: number; // elde tutulan birim miktarı (örn. 500 USD, 0.01 BTC)
  symbol?: string; // ISO kur kodu (USD) ya da CoinGecko id (bitcoin)
  lastFetchedAt?: string; // ISO zaman damgası — en son canlı fiyat ne zaman çekildi
}

export interface Txn {
  id: string;
  date: string; // YYYY-MM-DD, yerel tarih
  holdingId: string; // hangi varlığa ait olduğunu KESİN belirler (isim çakışmasına karşı)
  holdingName: string; // işlem anındaki varlık adı — görüntüleme/CSV için; varlık sonradan silinse/adı
                        // değişse de bu kayıt sabit kalır (muhasebe defteri mantığı)
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

// UTC değil, kullanıcının kendi yerel takvim günü — new Date().toISOString().slice(0,10)
// gece yarısına yakın saatlerde (TR UTC+3) yanlış günü verebilirdi.
function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocalDate(): string {
  return localDateString(new Date());
}

function sameDayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

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
    { id: 't1', date: sameDayOffset(-21), holdingId: 'h1', holdingName: 'BIST 30 Fonu', kind: 'alis', amount: 15000 },
    { id: 't2', date: sameDayOffset(-14), holdingId: 'h2', holdingName: 'THYAO', kind: 'alis', amount: 8000 },
    { id: 't3', date: sameDayOffset(-7), holdingId: 'h3', holdingName: 'Gram Altın', kind: 'alis', amount: 6000 },
    { id: 't4', date: sameDayOffset(-2), holdingId: 'h4', holdingName: 'USD', kind: 'satis', amount: 3000 },
  ],
};

// Kripto ağırlıklı örnek portföy — kripto borsası/kripto yatırımcısı senaryosu için.
// Tüm varlıklar CANLI FİYATA BAĞLI (quantity + symbol dolu): kullanıcı satırdaki yenile
// ikonuyla CoinGecko'dan gerçek fiyatı çekebilir. Buradaki `amount` değerleri yalnızca
// başlangıç yer tutucusudur — ilk yenilemede gerçek piyasa değeriyle değişir.
// Bilinçli kurgu: biri kârda, biri zararda, biri stabil — analiz ve kâr/zarar grafiği anlamlı çıksın.
const CRYPTO_SAMPLE: PortfolioState = {
  onboarded: true,
  holdings: [
    { id: 'c1', name: 'Bitcoin', type: 'kripto', amount: 42500, costBasis: 35000, quantity: 0.01, symbol: 'bitcoin' },
    { id: 'c2', name: 'Ethereum', type: 'kripto', amount: 42000, costBasis: 48000, quantity: 0.3, symbol: 'ethereum' },
    { id: 'c3', name: 'Solana', type: 'kripto', amount: 50000, costBasis: 40000, quantity: 25, symbol: 'solana' },
    { id: 'c4', name: 'Tether', type: 'kripto', amount: 42000, costBasis: 42000, quantity: 1000, symbol: 'tether' },
  ],
  txns: [
    { id: 'ct1', date: sameDayOffset(-30), holdingId: 'c1', holdingName: 'Bitcoin', kind: 'alis', amount: 35000 },
    { id: 'ct2', date: sameDayOffset(-21), holdingId: 'c2', holdingName: 'Ethereum', kind: 'alis', amount: 48000 },
    { id: 'ct3', date: sameDayOffset(-14), holdingId: 'c4', holdingName: 'Tether', kind: 'alis', amount: 42000 },
    { id: 'ct4', date: sameDayOffset(-7), holdingId: 'c3', holdingName: 'Solana', kind: 'alis', amount: 40000 },
  ],
};

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
    // Eski sürümden gelen işlemlerde holdingId yoksa, isimle en iyi çabayla eşleştirilir
    // (yalnızca görüntüleme için kullanılır, gelecekteki işlemler zaten ID ile çalışır).
    const txns = parsed.txns.map(t => ({
      ...t,
      holdingId: typeof t.holdingId === 'string' && t.holdingId
        ? t.holdingId
        : (holdings.find(h => h.name === t.holdingName)?.id ?? ''),
    }));
    return { ...parsed, holdings, txns };
  } catch {
    return EMPTY;
  }
}

function commit(next: PortfolioState): void {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach(fn => fn());
}

// Ad çakışması kontrolü için: büyük/küçük harf ve baş/son boşluk duyarsız karşılaştırma.
const normalizeName = (name: string) => name.trim().toLocaleLowerCase('tr-TR');

export const actions = {
  startWithSample(): void {
    commit(structuredClone(SAMPLE));
  },
  startWithCryptoSample(): void {
    commit(structuredClone(CRYPTO_SAMPLE));
  },
  startEmpty(): void {
    commit({ ...EMPTY, onboarded: true });
  },
  reset(): void {
    localStorage.removeItem(KEY);
    commit(EMPTY);
  },
  addHolding(name: string, type: AssetType, amount: number, quantity?: number, symbol?: string): void {
    const trimmedName = name.trim();
    const id = `h${Date.now()}`;
    const holding: Holding = { id, name: trimmedName, type, amount, costBasis: amount };
    if (quantity !== undefined && symbol) {
      holding.quantity = quantity;
      holding.symbol = symbol;
      holding.lastFetchedAt = new Date().toISOString();
    }
    // Yeni varlığın ilk tutarı da bir yatırım hareketidir — işlem geçmişine (ve
    // dolayısıyla net yatırım grafiğine) yansısın diye örtük bir 'alış' kaydı düşülür.
    const txn: Txn = { id: `t${Date.now()}`, date: todayLocalDate(), holdingId: id, holdingName: trimmedName, kind: 'alis', amount };
    commit({ ...state, holdings: [...state.holdings, holding], txns: [txn, ...state.txns] });
  },
  // Bu isimde (büyük/küçük harf duyarsız) bir varlık zaten var mı? UI, ekleme öncesi bunu kontrol eder.
  holdingNameExists(name: string): boolean {
    const key = normalizeName(name);
    return state.holdings.some(h => normalizeName(h.name) === key);
  },
  // CSV içe aktarma — mevcut varlıklara EKLENİR, üzerine yazmaz (geri alınabilir: tek tek silinebilir).
  // Aynı isimde (mevcutlarla ya da dosya içinde tekrar eden) satırlar atlanır ve sayılır.
  importHoldings(rows: { name: string; type: AssetType; costBasis: number; amount: number }[]): { imported: number; duplicates: number } {
    const seenNames = new Set(state.holdings.map(h => normalizeName(h.name)));
    const toImport: Holding[] = [];
    let duplicates = 0;
    rows.forEach((r, i) => {
      const key = normalizeName(r.name);
      if (seenNames.has(key)) { duplicates++; return; }
      seenNames.add(key);
      toImport.push({ id: `h${Date.now()}-${i}`, name: r.name.trim(), type: r.type, amount: r.amount, costBasis: r.costBasis });
    });
    if (toImport.length > 0) commit({ ...state, holdings: [...state.holdings, ...toImport] });
    return { imported: toImport.length, duplicates };
  },
  removeHolding(id: string): void {
    commit({ ...state, holdings: state.holdings.filter(h => h.id !== id) });
  },
  // Kullanıcının kendi elle girdiği güncel değer — maliyeti değiştirmez, "canlı güncelleme" damgasına dokunmaz.
  updateHoldingValue(id: string, newAmount: number): void {
    const holdings = state.holdings.map(h => h.id === id ? { ...h, amount: Math.max(0, newAmount) } : h);
    commit({ ...state, holdings });
  },
  // Canlı fiyat kaynağından (market.ts) çekilen değer — yalnızca quantity/symbol'ü olan varlıklarda kullanılır.
  applyLivePrice(id: string, newAmount: number): void {
    const holdings = state.holdings.map(h =>
      h.id === id ? { ...h, amount: Math.max(0, newAmount), lastFetchedAt: new Date().toISOString() } : h,
    );
    commit({ ...state, holdings });
  },
  // holdingId ile eşleşir (isimle değil) — iki varlık aynı adı taşısa bile karışmaz.
  addTxn(holdingId: string, kind: Txn['kind'], amount: number): void {
    const holding = state.holdings.find(h => h.id === holdingId);
    if (!holding) return; // savunma: varlık bu sırada silinmiş olabilir
    const txn: Txn = { id: `t${Date.now()}`, date: todayLocalDate(), holdingId, holdingName: holding.name, kind, amount };
    const holdings = state.holdings.map(h => {
      if (h.id !== holdingId) return h;
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

export interface InvestmentPoint { tarih: string; tutar: number; }

// Net yatırım tutarı geçmişi — YALNIZCA kendi işlem kayıtlarından türetilir, piyasa
// fiyatı içermez. Panel grafiği ve Ajan'ın grafik-çizme yeteneği bu tek kaynağı paylaşır.
export function investmentHistoryOf(s: PortfolioState): InvestmentPoint[] {
  const sorted = [...s.txns].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map<string, number>();
  let running = 0;
  for (const t of sorted) {
    running += t.kind === 'alis' ? t.amount : -t.amount;
    byDate.set(t.date, Math.max(0, running));
  }
  return [...byDate.entries()].map(([tarih, tutar]) => ({ tarih, tutar }));
}

export const fmtTL = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });

export const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
export const fmtSigned = (n: number) => `${n >= 0 ? '+' : ''}${fmtTL(n)}`;
