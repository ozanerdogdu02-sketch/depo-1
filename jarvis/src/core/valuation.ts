// Değerleme: canlı fiyata bağlı varlıkların güncel TL değerini tazeler ve
// günlük portföy anlık görüntüsünü tutar.
//
// Canlı fiyata BAĞLI OLMAYAN varlıklara dokunulmaz — onların değerini kullanıcı
// elle girer (BIST/TEFAS dışı, ör. mevduat ya da fiyatı olmayan bir kalem).
import type { Db, HoldingRow } from '../db.ts';
import { getQuotes, quoteKey, type Quote, type QuoteFailure } from '../data/index.ts';
import { applyLivePrice, listHoldings, totalCost, totalValue } from './portfolio.ts';
import { todayLocalDate } from './format.ts';

export interface RefreshResult {
  /** Fiyatı güncellenen varlıklar ve yeni değerleri. */
  updated: Array<{ holding: HoldingRow; quote: Quote; oldAmount: number; newAmount: number }>;
  /** Fiyatı alınamayanlar — kullanıcıya BELİRTİLİR, sessizce yutulmaz. */
  failures: QuoteFailure[];
  /** Canlı fiyata hiç bağlı olmayan varlık sayısı (bilgi amaçlı). */
  manualCount: number;
}

/** Canlı fiyata bağlı varlık mı? (sembol + miktar ikisi de gerekli) */
export function isLinkedToLivePrice(h: HoldingRow): boolean {
  return !!h.symbol && typeof h.quantity === 'number' && h.quantity > 0;
}

/**
 * Canlı fiyata bağlı tüm varlıkların değerini tazeler.
 * Bir kaynak düşse bile diğerleri güncellenir — kısmi başarı normal kabul edilir.
 */
export async function refreshPrices(db: Db, timeoutMs?: number): Promise<RefreshResult> {
  const holdings = listHoldings(db);
  const linked = holdings.filter(isLinkedToLivePrice);
  const manualCount = holdings.length - linked.length;

  if (linked.length === 0) {
    return { updated: [], failures: [], manualCount };
  }

  const { quotes, failures } = await getQuotes(
    db,
    linked.map(h => ({ kind: h.kind, symbol: h.symbol as string })),
    timeoutMs,
  );

  const updated: RefreshResult['updated'] = [];
  for (const holding of linked) {
    const quote = quotes.get(quoteKey(holding.kind, holding.symbol as string));
    if (!quote) continue;
    const newAmount = (holding.quantity as number) * quote.price;
    if (!Number.isFinite(newAmount) || newAmount < 0) continue;
    applyLivePrice(db, holding.id, newAmount);
    updated.push({ holding, quote, oldAmount: holding.amount, newAmount });
  }

  return { updated, failures, manualCount };
}

export interface PortfolioSnapshot {
  date: string;
  total_value: number;
  total_cost: number;
}

/**
 * Bugünün portföy değerini kaydeder (aynı gün tekrar çağrılırsa üzerine yazar).
 * Brifingdeki "dünden bugüne %2 arttı" karşılaştırması bu tabloya dayanır — bu yüzden
 * anlık görüntü, fiyat tazelemesinden SONRA alınmalıdır.
 */
export function recordSnapshot(db: Db, timezone: string): PortfolioSnapshot {
  const holdings = listHoldings(db);
  const snapshot: PortfolioSnapshot = {
    date: todayLocalDate(timezone),
    total_value: totalValue(holdings),
    total_cost: totalCost(holdings),
  };
  db.prepare(
    `INSERT INTO snapshots (date, total_value, total_cost, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET total_value = excluded.total_value,
                                     total_cost  = excluded.total_cost,
                                     created_at  = excluded.created_at`,
  ).run(snapshot.date, snapshot.total_value, snapshot.total_cost, new Date().toISOString());
  return snapshot;
}

/** Belirtilen günden ÖNCEKİ en yeni anlık görüntü (hafta sonu/tatil boşluklarını atlar). */
export function previousSnapshot(db: Db, beforeDate: string): PortfolioSnapshot | undefined {
  return db
    .prepare('SELECT date, total_value, total_cost FROM snapshots WHERE date < ? ORDER BY date DESC LIMIT 1')
    .get(beforeDate) as PortfolioSnapshot | undefined;
}

export function snapshotOn(db: Db, date: string): PortfolioSnapshot | undefined {
  return db
    .prepare('SELECT date, total_value, total_cost FROM snapshots WHERE date = ?')
    .get(date) as PortfolioSnapshot | undefined;
}

/** Son N günün anlık görüntüleri, eskiden yeniye. */
export function recentSnapshots(db: Db, limit = 30): PortfolioSnapshot[] {
  const rows = db
    .prepare('SELECT date, total_value, total_cost FROM snapshots ORDER BY date DESC LIMIT ?')
    .all(limit) as PortfolioSnapshot[];
  return rows.reverse();
}
