// Brifing metinleri — sabah özeti ve kapanış özeti.
//
// TAMAMEN DETERMİNİSTİK: buradaki her rakam koddan gelir. Dil katmanı (Ollama) bu metni
// yeniden yazabilir ama RAKAMLARA dokunamaz — küçük yerel modeller sayı uydurur ve
// "portföyün 2,4 milyon TL" cümlesindeki yanlış bir hane Jarvis'i işe yaramaz yapardı.
import type { Db } from '../db.ts';
import { getQuotes, quoteKey, type Quote } from '../data/index.ts';
import { listHoldings, totalValue } from './portfolio.ts';
import { buildInsights, allocationLines } from './insights.ts';
import { previousSnapshot, recordSnapshot, refreshPrices, isLinkedToLivePrice } from './valuation.ts';
import {
  escapeHtml, fmtPct, fmtPrice, fmtSignedPct, fmtSignedTL, fmtTL, fmtTime, todayLocalDate,
} from './format.ts';

export type BriefingKind = 'sabah' | 'kapanis' | 'manuel';

/** Her Türk yatırımcının günlük referansı — portföyde olmasa da gösterilir. */
const MARKET_PULSE: Array<{ label: string; kind: 'doviz' | 'altin' | 'kripto'; symbol: string }> = [
  { label: 'Dolar', kind: 'doviz', symbol: 'USD' },
  { label: 'Euro', kind: 'doviz', symbol: 'EUR' },
  { label: 'Gram altın', kind: 'altin', symbol: 'GRAM' },
  { label: 'Bitcoin', kind: 'kripto', symbol: 'BTC' },
];

export interface BriefingResult {
  text: string;
  /** Portföy boşsa bot farklı davranır (yönlendirici mesaj gösterir). */
  empty: boolean;
}

function headline(kind: BriefingKind, timezone: string): string {
  const clock = fmtTime(new Date(), timezone);
  if (kind === 'sabah') return `☀️ <b>Günaydın — ${clock} brifingi</b>`;
  if (kind === 'kapanis') return `🌆 <b>Kapanış özeti — ${clock}</b>`;
  return `📋 <b>Portföy özeti — ${clock}</b>`;
}

/** Fiyat satırı: "Dolar 41,29 ₺ (+%0,4)" */
function pulseLine(label: string, quote: Quote | undefined): string | undefined {
  if (!quote) return undefined;
  const change = quote.changePct !== undefined ? ` (${fmtSignedPct(quote.changePct)})` : '';
  const stale = quote.stale ? ' <i>· eski veri</i>' : '';
  return `${escapeHtml(label)}: <b>${fmtPrice(quote.price)}</b>${change}${stale}`;
}

/**
 * Brifingi hazırlar: fiyatları tazeler, anlık görüntü alır, metni kurar.
 *
 * SIRA ÖNEMLİ — önce fiyatlar tazelenir, SONRA anlık görüntü alınır. Tersi olsaydı
 * "dünden bugüne" karşılaştırması dünkü fiyatlarla yapılırdı ve her gün "değişim yok" derdi.
 */
export async function composeBriefing(
  db: Db,
  opts: { kind: BriefingKind; timezone: string; inflationPct: number; timeoutMs?: number },
): Promise<BriefingResult> {
  const { kind, timezone, inflationPct, timeoutMs } = opts;
  const lines: string[] = [headline(kind, timezone)];

  const holdingsBefore = listHoldings(db);
  if (holdingsBefore.length === 0) {
    lines.push(
      '',
      'Portföyün henüz boş. Bir varlık eklemek için şöyle yazabilirsin:',
      '<code>ekle Gram Altın altin 25000</code>',
      've canlı fiyata bağlamak için:',
      '<code>ekle Bitcoin kripto BTC 0.05</code>',
    );
    return { text: lines.join('\n'), empty: true };
  }

  // 1) Canlı fiyatları tazele
  const refresh = await refreshPrices(db, timeoutMs);

  // 2) Önceki ölçümü AL (anlık görüntüyü kaydetmeden önce — yoksa bugünkü kaydı
  //    kendisiyle karşılaştırırdık).
  const today = todayLocalDate(timezone);
  const previous = previousSnapshot(db, today);

  // 3) Yeni anlık görüntüyü kaydet
  const snapshot = recordSnapshot(db, timezone);
  const holdings = listHoldings(db);
  const total = totalValue(holdings);

  // ── Portföy başlığı ────────────────────────────────────────────────────────
  lines.push('', `💼 <b>Portföy:</b> ${fmtTL(total)}`);
  if (previous && previous.total_value > 0) {
    const diff = total - previous.total_value;
    const pct = (diff / previous.total_value) * 100;
    lines.push(`${previous.date} ölçümüne göre ${fmtSignedTL(diff)} (${fmtSignedPct(pct)})`);
  } else {
    lines.push('<i>İlk ölçüm kaydedildi — karşılaştırma yarınki brifingden itibaren gelecek.</i>');
  }
  if (snapshot.total_cost > 0) {
    const pnlAbs = total - snapshot.total_cost;
    const pnlPct = (pnlAbs / snapshot.total_cost) * 100;
    lines.push(`Maliyetine göre: ${fmtSignedTL(pnlAbs)} (${fmtSignedPct(pnlPct)})`);
  }

  // ── Günün hareketleri ──────────────────────────────────────────────────────
  const movers = refresh.updated
    .filter(u => u.quote.changePct !== undefined && Math.abs(u.quote.changePct) >= 0.5)
    .sort((a, b) => Math.abs(b.quote.changePct as number) - Math.abs(a.quote.changePct as number))
    .slice(0, 5);
  if (movers.length > 0) {
    lines.push('', '📈 <b>Bugün en çok hareket edenler</b>');
    for (const m of movers) {
      lines.push(
        `${escapeHtml(m.holding.name)}: ${fmtSignedPct(m.quote.changePct as number)} → ${fmtTL(m.newAmount)}`,
      );
    }
  }

  // ── Piyasa nabzı ───────────────────────────────────────────────────────────
  const pulse = await getQuotes(
    db,
    MARKET_PULSE.map(p => ({ kind: p.kind, symbol: p.symbol })),
    timeoutMs,
  );
  const pulseLines = MARKET_PULSE
    .map(p => pulseLine(p.label, pulse.quotes.get(quoteKey(p.kind, p.symbol))))
    .filter((l): l is string => !!l);
  if (pulseLines.length > 0) {
    lines.push('', '🌍 <b>Piyasa</b>', ...pulseLines);
  }

  // ── Dağılım ────────────────────────────────────────────────────────────────
  const alloc = allocationLines(holdings);
  if (alloc.length > 0) {
    lines.push('', '🥧 <b>Dağılım</b>', ...alloc.map(escapeHtml));
  }

  // ── İçgörüler ──────────────────────────────────────────────────────────────
  const insights = buildInsights({
    holdings,
    inflationPct,
    // Değişim satırını yukarıda zaten yazdık; içgörülerde tekrarlamayalım.
    previousValue: undefined,
    previousDateLabel: undefined,
  });
  if (insights.length > 0) {
    lines.push('', '🧠 <b>Dikkatini çekenler</b>');
    const icon = { uyari: '⚠️', iyi: '✅', bilgi: 'ℹ️' } as const;
    for (const insight of insights.slice(0, 4)) {
      lines.push(`${icon[insight.level]} ${escapeHtml(insight.text)}`);
    }
  }

  // ── Veri sorunları — SESSİZCE YUTULMAZ ─────────────────────────────────────
  if (refresh.failures.length > 0) {
    const names = [...new Set(refresh.failures.map(f => f.symbol))].slice(0, 6);
    lines.push(
      '',
      `⚠️ <b>Veri alınamayanlar:</b> ${escapeHtml(names.join(', '))}`,
      '<i>Bu varlıklar için tahmini fiyat göstermiyorum; son bilinen değerleriyle sayıldılar.</i>',
    );
  }
  const manualLinked = holdings.filter(h => !isLinkedToLivePrice(h)).length;
  if (manualLinked > 0) {
    lines.push(
      '',
      `<i>${manualLinked} varlığın değeri elle giriliyor (canlı fiyata bağlı değil) — güncellemek için ` +
      '"guncelle &lt;ad&gt; &lt;tutar&gt;" yazabilirsin.</i>',
    );
  }

  lines.push('', '<i>Bu bir yatırım tavsiyesi değildir; kendi defterinin özetidir.</i>');
  return { text: lines.join('\n'), empty: false };
}

/** Kısa portföy özeti — /portfoy komutu için (ağa çıkmaz, deftere bakar). */
export function quickSummary(db: Db, inflationPct: number): string {
  const holdings = listHoldings(db);
  if (holdings.length === 0) {
    return 'Portföyün boş. <code>ekle Gram Altın altin 25000</code> gibi bir komutla başlayabilirsin.';
  }
  const total = totalValue(holdings);
  const lines = [`💼 <b>Portföy:</b> ${fmtTL(total)}`, ''];

  for (const h of [...holdings].sort((a, b) => b.amount - a.amount)) {
    const pnl = h.cost_basis > 0 ? (h.amount - h.cost_basis) / h.cost_basis * 100 : undefined;
    const share = total > 0 ? ` · ${fmtPct((h.amount / total) * 100, 0)}` : '';
    const pnlText = pnl !== undefined ? ` · ${fmtSignedPct(pnl)}` : '';
    lines.push(`${escapeHtml(h.name)} — ${fmtTL(h.amount)}${share}${pnlText}`);
  }

  const insights = buildInsights({ holdings, inflationPct });
  const warning = insights.find(i => i.level === 'uyari');
  if (warning) lines.push('', `⚠️ ${escapeHtml(warning.text)}`);

  return lines.join('\n');
}
