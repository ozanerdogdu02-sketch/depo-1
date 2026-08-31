// Alarmlar — "BTC 3 milyon TL'yi geçerse haber ver" türü kurallar.
//
// TEK ATIŞ tasarımı: tetiklenen alarm pasife çekilir. Aksi halde eşik aşıldıktan sonra
// her yoklamada (15 dakikada bir) aynı bildirim tekrar tekrar gelirdi — Jarvis'i
// kapatmak isteten şey tam olarak budur. Kullanıcı isterse aynı alarmı yeniden kurar.
import { randomUUID } from 'node:crypto';
import type { AlertRow, AssetKind, Db } from '../db.ts';
import { getQuotes, quoteKey } from '../data/index.ts';
import { listHoldings, totalValue } from './portfolio.ts';
import { fmtPrice, fmtTL } from './format.ts';

export const PORTFOLIO_TARGET = 'PORTFOY';

export interface CreateAlertInput {
  target: string;
  kind: AssetKind | 'portfoy';
  direction: 'ustunde' | 'altinda';
  threshold: number;
  note?: string | undefined;
}

export class AlertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlertError';
  }
}

export function createAlert(db: Db, input: CreateAlertInput): AlertRow {
  if (!Number.isFinite(input.threshold) || input.threshold <= 0) {
    throw new AlertError('Alarm eşiği sıfırdan büyük bir sayı olmalı.');
  }
  const target = input.target.trim().toUpperCase();
  if (!target) throw new AlertError('Alarm için bir hedef gerekli (ör. BTC, USD, THYAO ya da PORTFOY).');

  const row: AlertRow = {
    id: randomUUID(),
    target,
    kind: input.kind,
    direction: input.direction,
    threshold: input.threshold,
    note: input.note?.trim() || null,
    active: 1,
    created_at: new Date().toISOString(),
    triggered_at: null,
    last_value: null,
  };
  db.prepare(
    `INSERT INTO alerts (id, target, kind, direction, threshold, note, active, created_at, triggered_at, last_value)
     VALUES (@id, @target, @kind, @direction, @threshold, @note, @active, @created_at, @triggered_at, @last_value)`,
  ).run(row);
  return row;
}

export function listAlerts(db: Db, activeOnly = true): AlertRow[] {
  const sql = activeOnly
    ? 'SELECT * FROM alerts WHERE active = 1 ORDER BY created_at DESC'
    : 'SELECT * FROM alerts ORDER BY active DESC, created_at DESC';
  return db.prepare(sql).all() as AlertRow[];
}

export function deleteAlert(db: Db, id: string): boolean {
  return db.prepare('DELETE FROM alerts WHERE id = ?').run(id).changes > 0;
}

/** Kısa kimlikle (ilk 8 karakter) silme — Telegram'da tam UUID yazdırmak eziyet. */
export function deleteAlertByShortId(db: Db, shortId: string): boolean {
  const prefix = shortId.trim().toLowerCase();
  if (prefix.length < 4) return false;
  const match = listAlerts(db, false).find(a => a.id.toLowerCase().startsWith(prefix));
  return match ? deleteAlert(db, match.id) : false;
}

/** Eşik aşıldı mı? SAF fonksiyon — testin ana hedefi. */
export function isTriggered(direction: 'ustunde' | 'altinda', value: number, threshold: number): boolean {
  return direction === 'ustunde' ? value >= threshold : value <= threshold;
}

export interface TriggeredAlert {
  alert: AlertRow;
  value: number;
  message: string;
}

export interface EvaluateResult {
  triggered: TriggeredAlert[];
  /** Fiyatı alınamadığı için değerlendirilemeyen alarmlar — sessizce pasife ÇEKİLMEZ. */
  skipped: Array<{ alert: AlertRow; reason: string }>;
  checked: number;
}

/**
 * Tüm aktif alarmları değerlendirir.
 *
 * Fiyat alınamayan alarm ATLANIR, tetiklenmiş sayılmaz ve aktif kalır. Veri yokluğunu
 * "eşik aşılmadı" diye yorumlamak, düşüş alarmının tam da kaynak çöktüğünde susması
 * demek olurdu.
 */
export async function evaluateAlerts(db: Db, timeoutMs?: number): Promise<EvaluateResult> {
  const alerts = listAlerts(db, true);
  if (alerts.length === 0) return { triggered: [], skipped: [], checked: 0 };

  const triggered: TriggeredAlert[] = [];
  const skipped: EvaluateResult['skipped'] = [];

  // Portföy toplamına bakan alarmlar ağ istemez.
  const portfolioAlerts = alerts.filter(a => a.kind === 'portfoy' || a.target === PORTFOLIO_TARGET);
  const marketAlerts = alerts.filter(a => !(a.kind === 'portfoy' || a.target === PORTFOLIO_TARGET));

  if (portfolioAlerts.length > 0) {
    const value = totalValue(listHoldings(db));
    for (const alert of portfolioAlerts) {
      if (isTriggered(alert.direction, value, alert.threshold)) {
        triggered.push({
          alert,
          value,
          message:
            `🔔 Portföyün ${fmtTL(value)} oldu — kurduğun ${alert.direction === 'ustunde' ? 'üst' : 'alt'} ` +
            `eşik ${fmtTL(alert.threshold)} idi.`,
        });
      }
      db.prepare('UPDATE alerts SET last_value = ? WHERE id = ?').run(value, alert.id);
    }
  }

  if (marketAlerts.length > 0) {
    const { quotes, failures } = await getQuotes(
      db,
      marketAlerts.map(a => ({ kind: a.kind as AssetKind, symbol: a.target })),
      timeoutMs,
    );
    for (const alert of marketAlerts) {
      const quote = quotes.get(quoteKey(alert.kind as AssetKind, alert.target));
      if (!quote) {
        const failure = failures.find(f => f.symbol === alert.target);
        skipped.push({ alert, reason: failure?.message ?? 'Fiyat alınamadı.' });
        continue;
      }
      db.prepare('UPDATE alerts SET last_value = ? WHERE id = ?').run(quote.price, alert.id);
      if (isTriggered(alert.direction, quote.price, alert.threshold)) {
        triggered.push({
          alert,
          value: quote.price,
          message:
            `🔔 ${alert.target} ${fmtPrice(quote.price)} oldu — kurduğun ${alert.direction === 'ustunde' ? 'üst' : 'alt'} ` +
            `eşik ${fmtPrice(alert.threshold)} idi.` +
            (alert.note ? `\nNotun: ${alert.note}` : '') +
            (quote.stale ? '\n(Fiyat önbellekten geldi — kaynak şu an ulaşılamıyor.)' : ''),
        });
      }
    }
  }

  // Tetiklenenleri pasife çek (tek atış).
  if (triggered.length > 0) {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE alerts SET active = 0, triggered_at = ? WHERE id = ?');
    db.transaction(() => {
      for (const t of triggered) stmt.run(now, t.alert.id);
    })();
  }

  return { triggered, skipped, checked: alerts.length };
}
