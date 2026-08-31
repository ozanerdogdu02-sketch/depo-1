// Portföy defteri — TÜM veri yazma işlemleri buradan geçer.
//
// İki muhasebe kuralı sabittir ve her yerde aynı uygulanır:
//
//  1) İŞLEMLER ID İLE EŞLEŞİR, İSİMLE DEĞİL. İki varlık aynı adı taşısa bile karışmaz.
//     İşlem kaydına o anki ad da yazılır (holding_name) — varlık sonradan silinse ya da
//     adı değişse bile defter kaydı okunabilir kalır. Muhasebe defteri mantığı.
//
//  2) MALİYET AĞIRLIKLI ORTALAMADIR. Satışta maliyet, kalan pozisyon oranında azalır.
//     Böylece kısmi satış kâr/zarar YÜZDESİNİ değiştirmez — 100 TL maliyetle alınan,
//     150 TL olmuş bir varlığın yarısını satınca kalan yarı hâlâ %50 kârda görünür.
import { randomUUID } from 'node:crypto';
import type { Db, HoldingRow, TxnRow, AssetKind } from '../db.ts';
import { normalizeName, todayLocalDate } from './format.ts';

export interface AddHoldingInput {
  name: string;
  kind: AssetKind;
  amount: number;
  /** Canlı fiyata bağlanacaksa: kaynak sembolü ve miktar. */
  symbol?: string | undefined;
  quantity?: number | undefined;
}

export class PortfolioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortfolioError';
  }
}

export function listHoldings(db: Db, kind?: AssetKind): HoldingRow[] {
  const rows = kind
    ? db.prepare('SELECT * FROM holdings WHERE kind = ? ORDER BY amount DESC').all(kind)
    : db.prepare('SELECT * FROM holdings ORDER BY amount DESC').all();
  return rows as HoldingRow[];
}

export function getHolding(db: Db, id: string): HoldingRow | undefined {
  return db.prepare('SELECT * FROM holdings WHERE id = ?').get(id) as HoldingRow | undefined;
}

/**
 * Ada göre varlık bulur. SQLite'ın NOCASE'i yalnızca ASCII'de çalışır ("IŞIK" ile "ışık"
 * onun için farklıdır), o yüzden karşılaştırmayı Türkçe locale ile burada yapıyoruz.
 */
export function findHoldingByName(db: Db, name: string): HoldingRow | undefined {
  const target = normalizeName(name);
  if (!target) return undefined;
  return listHoldings(db).find(h => normalizeName(h.name) === target);
}

/** Sembole göre varlık bulur (canlı fiyata bağlı olanlar için). */
export function findHoldingBySymbol(db: Db, kind: AssetKind, symbol: string): HoldingRow | undefined {
  const target = symbol.trim().toUpperCase();
  return listHoldings(db, kind).find(h => (h.symbol ?? '').toUpperCase() === target);
}

/**
 * Yeni varlık ekler ve ÖRTÜK bir "alış" işlem kaydı düşer.
 * Örtük kayıt önemli: yoksa varlık portföyde görünür ama işlem geçmişinde ve
 * "ne kadar yatırdım" hesabında hiç görünmezdi.
 */
export function addHolding(db: Db, input: AddHoldingInput, timezone: string): HoldingRow {
  const name = input.name.trim();
  if (!name) throw new PortfolioError('Varlık adı boş olamaz.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new PortfolioError('Tutar sıfırdan büyük bir sayı olmalı.');
  }
  const existing = findHoldingByName(db, name);
  if (existing) {
    throw new PortfolioError(
      `"${existing.name}" zaten portföyünde. Üzerine eklemek için işlem gir: "${existing.name} 500 TL aldım".`,
    );
  }

  const now = new Date().toISOString();
  const holding: HoldingRow = {
    id: randomUUID(),
    name,
    kind: input.kind,
    symbol: input.symbol?.trim().toUpperCase() || null,
    quantity: Number.isFinite(input.quantity ?? Number.NaN) ? (input.quantity as number) : null,
    amount: input.amount,
    cost_basis: input.amount,
    created_at: now,
    updated_at: now,
    last_priced_at: null,
  };

  const insertHolding = db.prepare(
    `INSERT INTO holdings (id, name, kind, symbol, quantity, amount, cost_basis, created_at, updated_at, last_priced_at)
     VALUES (@id, @name, @kind, @symbol, @quantity, @amount, @cost_basis, @created_at, @updated_at, @last_priced_at)`,
  );
  const insertTxn = db.prepare(
    `INSERT INTO txns (id, holding_id, holding_name, kind, amount, date, created_at)
     VALUES (?, ?, ?, 'alis', ?, ?, ?)`,
  );

  db.transaction(() => {
    insertHolding.run(holding);
    insertTxn.run(randomUUID(), holding.id, holding.name, holding.amount, todayLocalDate(timezone), now);
  })();

  return holding;
}

export function removeHolding(db: Db, id: string): boolean {
  // İşlem kayıtları SİLİNMEZ — defter geçmişi korunur (holding_name sayesinde okunabilir kalır).
  return db.prepare('DELETE FROM holdings WHERE id = ?').run(id).changes > 0;
}

/** Kullanıcının elle girdiği güncel değer. Maliyeti DEĞİŞTİRMEZ. */
export function updateHoldingValue(db: Db, id: string, newAmount: number): HoldingRow {
  const holding = getHolding(db, id);
  if (!holding) throw new PortfolioError('Varlık bulunamadı.');
  const amount = Number.isFinite(newAmount) ? Math.max(0, newAmount) : 0;
  db.prepare('UPDATE holdings SET amount = ?, updated_at = ? WHERE id = ?').run(amount, new Date().toISOString(), id);
  return { ...holding, amount };
}

/** Canlı kaynaktan gelen değer — elle güncellemeden farklı olarak last_priced_at'i işaretler. */
export function applyLivePrice(db: Db, id: string, newAmount: number): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE holdings SET amount = ?, updated_at = ?, last_priced_at = ? WHERE id = ?')
    .run(Math.max(0, newAmount), now, now, id);
}

export interface AddTxnResult {
  txn: TxnRow;
  holding: HoldingRow;
}

/**
 * Alış/satış işler ve maliyeti ağırlıklı ortalama yöntemiyle günceller.
 *
 * Satışta tutar mevcut değeri AŞAMAZ. Burada sessizce kırpmak yerine hata fırlatıyoruz:
 * "5000 TL sat" diyen birine sessizce 1200 TL satıp "tamam" demek, kullanıcının defterini
 * gerçeklikten koparır. Çağıran katman bu hatayı kullanıcıya aynen gösterir.
 */
export function addTxn(
  db: Db,
  holdingId: string,
  kind: 'alis' | 'satis',
  amount: number,
  timezone: string,
): AddTxnResult {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PortfolioError('İşlem tutarı sıfırdan büyük bir sayı olmalı.');
  }
  const holding = getHolding(db, holdingId);
  if (!holding) throw new PortfolioError('Varlık bulunamadı — silinmiş olabilir.');

  let nextAmount: number;
  let nextCost: number;

  if (kind === 'alis') {
    nextAmount = holding.amount + amount;
    nextCost = holding.cost_basis + amount;
  } else {
    if (amount > holding.amount + 1e-9) {
      throw new PortfolioError(
        `Bakiyeyi aşamaz: "${holding.name}" için elindeki değer ${holding.amount.toFixed(2)} TL, ` +
        `sen ${amount.toFixed(2)} TL satmak istedin.`,
      );
    }
    const remainingRatio = holding.amount > 0 ? (holding.amount - amount) / holding.amount : 0;
    nextAmount = holding.amount - amount;
    // Ağırlıklı ortalama: maliyet kalan pozisyon oranında azalır → K/Z yüzdesi korunur.
    nextCost = holding.cost_basis * remainingRatio;
  }

  const now = new Date().toISOString();
  const txn: TxnRow = {
    id: randomUUID(),
    holding_id: holding.id,
    holding_name: holding.name,
    kind,
    amount,
    date: todayLocalDate(timezone),
    created_at: now,
  };

  db.transaction(() => {
    db.prepare(
      `INSERT INTO txns (id, holding_id, holding_name, kind, amount, date, created_at)
       VALUES (@id, @holding_id, @holding_name, @kind, @amount, @date, @created_at)`,
    ).run(txn);
    db.prepare('UPDATE holdings SET amount = ?, cost_basis = ?, updated_at = ? WHERE id = ?')
      .run(nextAmount, nextCost, now, holding.id);
  })();

  return { txn, holding: { ...holding, amount: nextAmount, cost_basis: nextCost, updated_at: now } };
}

export function listTxns(db: Db, limit = 20): TxnRow[] {
  return db
    .prepare('SELECT * FROM txns ORDER BY date DESC, created_at DESC LIMIT ?')
    .all(limit) as TxnRow[];
}

// ── Saf hesaplar (veritabanına dokunmaz, doğrudan test edilir) ────────────────

export function totalValue(holdings: HoldingRow[]): number {
  return holdings.reduce((sum, h) => sum + h.amount, 0);
}

export function totalCost(holdings: HoldingRow[]): number {
  return holdings.reduce((sum, h) => sum + h.cost_basis, 0);
}

export interface Pnl {
  abs: number;
  pct: number;
}

/** Kâr/zarar. Maliyet sıfırsa yüzde tanımsızdır — 0 döneriz, sonsuz değil. */
export function pnlOf(value: number, cost: number): Pnl {
  const abs = value - cost;
  const pct = cost > 0 ? (abs / cost) * 100 : 0;
  return { abs, pct };
}

export interface AllocationSlice {
  kind: AssetKind;
  amount: number;
  pct: number;
}

/** Varlık sınıfı dağılımı, büyükten küçüğe. */
export function allocation(holdings: HoldingRow[]): AllocationSlice[] {
  const total = totalValue(holdings);
  if (total <= 0) return [];
  const byKind = new Map<AssetKind, number>();
  for (const h of holdings) {
    byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + h.amount);
  }
  return [...byKind.entries()]
    .map(([kind, amount]) => ({ kind, amount, pct: (amount / total) * 100 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Kâr/zarar yüzdesine göre sıralı varlıklar (maliyeti olmayanlar hariç). */
export function rankByPnl(holdings: HoldingRow[]): Array<HoldingRow & { pnl: Pnl }> {
  return holdings
    .filter(h => h.cost_basis > 0)
    .map(h => ({ ...h, pnl: pnlOf(h.amount, h.cost_basis) }))
    .sort((a, b) => b.pnl.pct - a.pnl.pct);
}
