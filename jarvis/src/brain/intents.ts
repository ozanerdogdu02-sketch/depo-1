// Niyet modeli + DETERMİNİSTİK yürütücü.
//
// Bu dosya Jarvis'in gerçek işi yaptığı yer. Ollama devrede olsun ya da olmasın, her yol
// buradan geçer: dil katmanı yalnızca "kullanıcı ne demek istedi" sorusunu cevaplar,
// işi bu yürütücü yapar ve rakamları bu yürütücü üretir.
import type { AssetKind, Db } from '../db.ts';
import { ASSET_LABELS } from '../db.ts';
import {
  addHolding, addTxn, findHoldingByName, getHolding, listHoldings, listTxns,
  PortfolioError, rankByPnl, removeHolding, totalValue, updateHoldingValue, pnlOf,
} from '../core/portfolio.ts';
import { buildInsights, allocationLines } from '../core/insights.ts';
import { composeBriefing, quickSummary } from '../core/briefing.ts';
import { refreshPrices, isLinkedToLivePrice } from '../core/valuation.ts';
import {
  AlertError, createAlert, deleteAlertByShortId, listAlerts, PORTFOLIO_TARGET,
} from '../core/alerts.ts';
import { getQuote } from '../data/index.ts';
import {
  escapeHtml, fmtPct, fmtPrice, fmtQty, fmtSignedPct, fmtSignedTL, fmtTL,
} from '../core/format.ts';

export type Intent =
  | { id: 'portfoy' }
  | { id: 'brifing' }
  | { id: 'dagilim' }
  | { id: 'analiz' }
  | { id: 'en_iyi_kotu' }
  | { id: 'gecmis' }
  | { id: 'yardim' }
  | { id: 'selam' }
  | { id: 'tesekkur' }
  | { id: 'fiyat_guncelle' }
  | { id: 'fiyat_sorgu'; symbol: string; kind: AssetKind }
  | { id: 'varlik_sorgu'; name: string }
  | { id: 'varlik_ekle'; name: string; kind: AssetKind; amount?: number; symbol?: string; quantity?: number }
  | { id: 'varlik_sil'; name: string }
  | { id: 'deger_guncelle'; name: string; amount: number }
  | { id: 'islem'; name: string; txnKind: 'alis' | 'satis'; amount: number }
  | { id: 'alarm_kur'; target: string; kind: AssetKind | 'portfoy'; direction: 'ustunde' | 'altinda'; threshold: number }
  | { id: 'alarm_listele' }
  | { id: 'alarm_sil'; shortId: string }
  | { id: 'bilinmiyor'; text: string };

/**
 * Onay bekleyen aksiyon. VERİYİ DEĞİŞTİREN her şey önce buraya düşer; kullanıcı
 * Onayla'ya basmadan `actions` katmanına tek bir yazma çağrısı bile gitmez.
 */
export type PendingAction =
  | { kind: 'islem'; holdingId: string; holdingName: string; txnKind: 'alis' | 'satis'; amount: number }
  | { kind: 'sil'; holdingId: string; holdingName: string }
  | { kind: 'dengeleme'; steps: RebalanceStep[]; hedefText: string };

export interface RebalanceStep {
  holdingId: string;
  holdingName: string;
  txnKind: 'alis' | 'satis';
  amount: number;
}

export interface ExecuteContext {
  db: Db;
  timezone: string;
  inflationPct: number;
  timeoutMs?: number | undefined;
}

export interface ExecuteResult {
  text: string;
  /** Doluysa bot Onayla/Vazgeç butonlarını gösterir ve hiçbir veri henüz değişmemiştir. */
  pending?: PendingAction;
  /** Dil katmanının metni yeniden yazmasına izin verilir mi? Rakam listelerinde hayır. */
  allowRewrite?: boolean;
}

const YARDIM = `🤖 <b>Ne yapabilirim?</b>

<b>Portföy</b>
• <code>portföyüm</code> — özet
• <code>brifing</code> — tam rapor (fiyatları tazeler)
• <code>dağılımım</code> · <code>analiz et</code>
• <code>en çok kazandıran ne</code>

<b>Varlık ekleme</b>
• <code>ekle Gram Altın altin 25000</code> — elle değerli
• <code>ekle Bitcoin kripto BTC 0.05</code> — canlı fiyata bağlı
• <code>ekle THYAO hisse THYAO 100</code> — 100 adet

<b>İşlem (onay isterim)</b>
• <code>Bitcoin 5000 TL aldım</code>
• <code>THYAO'dan 2000 TL sattım</code>
• <code>guncelle Mevduat 45000</code>
• <code>sil Eski Fon</code>

<b>Fiyat</b>
• <code>dolar kaç</code> · <code>BTC ne durumda</code> · <code>THYAO</code>
• <code>fiyatları güncelle</code>

<b>Alarm</b>
• <code>BTC 4 milyon üstüne çıkarsa haber ver</code>
• <code>dolar 45 altına düşerse haber ver</code>
• <code>alarmlarım</code> · <code>alarm sil a1b2c3d4</code>

<b>Diğer</b>
• <code>geçmiş</code> — son işlemler

Her sabah 09:00 ve kapanışta 18:30 brifing gönderirim; alarmları 15 dakikada bir yoklarım.
<i>Yatırım tavsiyesi vermem — kendi defterini tutar, rakamları hesaplarım.</i>`;

/** Varlığı ada göre bulur; bulamazsa kullanıcıya YARDIMCI bir hata metni üretir. */
function requireHolding(db: Db, name: string): { holding: NonNullable<ReturnType<typeof findHoldingByName>> } | { error: string } {
  const holding = findHoldingByName(db, name);
  if (holding) return { holding };
  const all = listHoldings(db);
  if (all.length === 0) {
    return { error: 'Portföyün henüz boş — önce bir varlık ekle.' };
  }
  return {
    error:
      `"${escapeHtml(name)}" diye bir varlık bulamadım.\nPortföyündekiler: ` +
      all.map(h => escapeHtml(h.name)).join(', '),
  };
}

export async function executeIntent(intent: Intent, ctx: ExecuteContext): Promise<ExecuteResult> {
  const { db, timezone, inflationPct, timeoutMs } = ctx;

  switch (intent.id) {
    case 'yardim':
      return { text: YARDIM };

    case 'selam': {
      const holdings = listHoldings(db);
      if (holdings.length === 0) {
        return { text: 'Merhaba! Portföyün henüz boş. <code>yardım</code> yazarsan ne yapabileceğimi anlatırım.', allowRewrite: true };
      }
      return {
        text: `Merhaba! Portföyün şu an ${fmtTL(totalValue(holdings))}. Ne bakmak istersin?`,
        allowRewrite: true,
      };
    }

    case 'tesekkur':
      return { text: 'Rica ederim. Başka bir şey lazım olursa buradayım.', allowRewrite: true };

    case 'portfoy':
      return { text: quickSummary(db, inflationPct) };

    case 'brifing': {
      const briefing = await composeBriefing(db, { kind: 'manuel', timezone, inflationPct, timeoutMs });
      return { text: briefing.text };
    }

    case 'dagilim': {
      const holdings = listHoldings(db);
      if (holdings.length === 0) return { text: 'Portföyün boş — dağılım gösterecek bir şey yok.' };
      const lines = allocationLines(holdings);
      return { text: ['🥧 <b>Varlık dağılımın</b>', '', ...lines.map(escapeHtml)].join('\n') };
    }

    case 'analiz': {
      const holdings = listHoldings(db);
      if (holdings.length === 0) return { text: 'Analiz için önce birkaç varlık eklemen lazım.' };
      const insights = buildInsights({ holdings, inflationPct });
      if (insights.length === 0) return { text: 'Şu an dikkat çeken bir şey görmüyorum — portföyün dengeli görünüyor.' };
      const icon = { uyari: '⚠️', iyi: '✅', bilgi: 'ℹ️' } as const;
      return {
        text: ['🧠 <b>Analiz</b>', '', ...insights.map(i => `${icon[i.level]} ${escapeHtml(i.text)}`)].join('\n'),
      };
    }

    case 'en_iyi_kotu': {
      const ranked = rankByPnl(listHoldings(db));
      if (ranked.length === 0) {
        return { text: 'Kâr/zarar hesaplayabileceğim bir varlık yok (maliyet bilgisi gerekli).' };
      }
      const best = ranked[0]!;
      const worst = ranked[ranked.length - 1]!;
      if (best.id === worst.id) {
        return { text: `Tek varlığın var: ${escapeHtml(best.name)} — ${fmtSignedPct(best.pnl.pct)} (${fmtSignedTL(best.pnl.abs)}).` };
      }
      return {
        text: [
          '🏆 <b>En çok kazandıran</b>',
          `${escapeHtml(best.name)} — ${fmtSignedPct(best.pnl.pct)} (${fmtSignedTL(best.pnl.abs)})`,
          '',
          '📉 <b>En çok kaybettiren</b>',
          `${escapeHtml(worst.name)} — ${fmtSignedPct(worst.pnl.pct)} (${fmtSignedTL(worst.pnl.abs)})`,
        ].join('\n'),
      };
    }

    case 'gecmis': {
      const txns = listTxns(db, 15);
      if (txns.length === 0) return { text: 'Henüz işlem kaydın yok.' };
      const lines = txns.map(t =>
        `${t.date} · ${t.kind === 'alis' ? '🟢 Alış' : '🔴 Satış'} · ${escapeHtml(t.holding_name)} · ${fmtTL(t.amount)}`,
      );
      return { text: ['📜 <b>Son işlemler</b>', '', ...lines].join('\n') };
    }

    case 'fiyat_guncelle': {
      const result = await refreshPrices(db, timeoutMs);
      if (result.updated.length === 0 && result.failures.length === 0) {
        return {
          text:
            'Canlı fiyata bağlı varlığın yok. Bağlamak için sembol ve miktar vermelisin:\n' +
            '<code>ekle Bitcoin kripto BTC 0.05</code>',
        };
      }
      const lines = ['🔄 <b>Fiyatlar güncellendi</b>', ''];
      for (const u of result.updated) {
        const diff = u.newAmount - u.oldAmount;
        lines.push(
          `${escapeHtml(u.holding.name)}: ${fmtPrice(u.quote.price)} × ${fmtQty(u.holding.quantity as number)} ` +
          `= ${fmtTL(u.newAmount)} (${fmtSignedTL(diff)})${u.quote.stale ? ' <i>· eski veri</i>' : ''}`,
        );
      }
      if (result.failures.length > 0) {
        lines.push('', '⚠️ <b>Alınamayanlar</b>');
        for (const f of result.failures.slice(0, 5)) {
          lines.push(`${escapeHtml(f.symbol)}: ${escapeHtml(f.message)}`);
        }
        lines.push('<i>Bu varlıklar son bilinen değerleriyle duruyor — tahmini fiyat yazmadım.</i>');
      }
      return { text: lines.join('\n') };
    }

    case 'fiyat_sorgu': {
      try {
        const quote = await getQuote(db, intent.kind, intent.symbol, timeoutMs);
        const change = quote.changePct !== undefined ? ` (${fmtSignedPct(quote.changePct)})` : '';
        const stale = quote.stale ? '\n<i>Kaynak şu an ulaşılamıyor; bu değer önbellekten.</i>' : '';
        const note = intent.kind === 'altin' ? '\n<i>Spot fiyat — kuyumcu işçiliği/marjı hariç.</i>' : '';
        return {
          text: `<b>${escapeHtml(quote.symbol)}</b> — ${fmtPrice(quote.price)}${change}${note}${stale}`,
        };
      } catch (err) {
        return { text: `${escapeHtml(intent.symbol)} fiyatını alamadım: ${escapeHtml((err as Error).message)}` };
      }
    }

    case 'varlik_sorgu': {
      const found = requireHolding(db, intent.name);
      if ('error' in found) return { text: found.error };
      const h = found.holding;
      const total = totalValue(listHoldings(db));
      const pnl = pnlOf(h.amount, h.cost_basis);
      const lines = [
        `<b>${escapeHtml(h.name)}</b> · ${ASSET_LABELS[h.kind]}`,
        `Güncel değer: ${fmtTL(h.amount)}`,
        `Maliyet: ${fmtTL(h.cost_basis)}`,
        h.cost_basis > 0 ? `Kâr/zarar: ${fmtSignedTL(pnl.abs)} (${fmtSignedPct(pnl.pct)})` : 'Kâr/zarar: maliyet bilgisi yok',
        total > 0 ? `Portföy payı: ${fmtPct((h.amount / total) * 100, 1)}` : '',
      ].filter(Boolean);
      if (isLinkedToLivePrice(h)) {
        lines.push(`Canlı fiyata bağlı: ${escapeHtml(h.symbol as string)} × ${fmtQty(h.quantity as number)}`);
      } else {
        lines.push('<i>Değeri elle giriliyor (canlı fiyata bağlı değil).</i>');
      }
      return { text: lines.join('\n') };
    }

    case 'varlik_ekle': {
      try {
        // Canlı fiyata bağlanacaksa tutarı biz HESAPLARIZ — kullanıcı adet verir.
        let amount = intent.amount;
        if (intent.symbol && intent.quantity !== undefined) {
          try {
            const quote = await getQuote(db, intent.kind, intent.symbol, timeoutMs);
            amount = quote.price * intent.quantity;
          } catch (err) {
            return {
              text:
                `${escapeHtml(intent.symbol)} fiyatını alamadığım için canlı bağlantı kuramadım: ` +
                `${escapeHtml((err as Error).message)}\n\nİstersen tutarı elle vererek ekleyebilirsin: ` +
                `<code>ekle ${escapeHtml(intent.name)} ${intent.kind} 10000</code>`,
            };
          }
        }
        if (amount === undefined) {
          return { text: 'Tutarı ya da (canlı fiyat için) sembol + miktarı belirtmelisin.' };
        }
        const holding = addHolding(
          db,
          {
            name: intent.name,
            kind: intent.kind,
            amount,
            symbol: intent.symbol,
            quantity: intent.quantity,
          },
          timezone,
        );
        const extra = intent.symbol && intent.quantity !== undefined
          ? `\n${fmtQty(intent.quantity)} ${escapeHtml(intent.symbol)} × güncel fiyat = ${fmtTL(amount)}`
          : '';
        return {
          text:
            `✅ <b>${escapeHtml(holding.name)}</b> eklendi (${ASSET_LABELS[holding.kind]}, ${fmtTL(holding.amount)}).${extra}\n` +
            `Portföy toplamın: ${fmtTL(totalValue(listHoldings(db)))}`,
        };
      } catch (err) {
        if (err instanceof PortfolioError) return { text: `⚠️ ${escapeHtml(err.message)}` };
        throw err;
      }
    }

    case 'varlik_sil': {
      const found = requireHolding(db, intent.name);
      if ('error' in found) return { text: found.error };
      // Silme geri alınamaz → onay iste.
      return {
        text:
          `<b>${escapeHtml(found.holding.name)}</b> varlığını silmek istediğini anladım ` +
          `(${fmtTL(found.holding.amount)}).\nİşlem geçmişi silinmez, sadece varlık kaldırılır. Onaylıyor musun?`,
        pending: { kind: 'sil', holdingId: found.holding.id, holdingName: found.holding.name },
      };
    }

    case 'deger_guncelle': {
      const found = requireHolding(db, intent.name);
      if ('error' in found) return { text: found.error };
      const before = found.holding.amount;
      const updated = updateHoldingValue(db, found.holding.id, intent.amount);
      return {
        text:
          `✅ <b>${escapeHtml(updated.name)}</b> güncel değeri ${fmtTL(updated.amount)} olarak kaydedildi ` +
          `(önceki ${fmtTL(before)}).\n<i>Maliyet değişmedi — kâr/zarar buna göre hesaplanır.</i>`,
      };
    }

    case 'islem': {
      const found = requireHolding(db, intent.name);
      if ('error' in found) return { text: found.error };
      const h = found.holding;
      // Bakiye kontrolü ONAYDAN ÖNCE — kullanıcıya olmayacak bir işlemi onaylatmayalım.
      if (intent.txnKind === 'satis' && intent.amount > h.amount + 1e-9) {
        return {
          text:
            `⚠️ Bakiyeyi aşıyor: <b>${escapeHtml(h.name)}</b> için elindeki değer ${fmtTL(h.amount)}, ` +
            `sen ${fmtTL(intent.amount)} satmak istedin.`,
        };
      }
      const verb = intent.txnKind === 'alis' ? 'almak' : 'satmak';
      return {
        text:
          `<b>${escapeHtml(h.name)}</b> için ${fmtTL(intent.amount)} ${verb} istediğini anladım.\n` +
          `Şu anki değeri ${fmtTL(h.amount)}. Onaylıyor musun?`,
        pending: {
          kind: 'islem',
          holdingId: h.id,
          holdingName: h.name,
          txnKind: intent.txnKind,
          amount: intent.amount,
        },
      };
    }

    case 'alarm_kur': {
      try {
        const alert = createAlert(db, {
          target: intent.target,
          kind: intent.kind,
          direction: intent.direction,
          threshold: intent.threshold,
        });
        const yon = intent.direction === 'ustunde' ? 'üstüne çıkarsa' : 'altına düşerse';
        const value = intent.kind === 'portfoy' ? fmtTL(intent.threshold) : fmtPrice(intent.threshold);
        return {
          text:
            `🔔 Alarm kuruldu: <b>${escapeHtml(alert.target)}</b> ${value} ${yon} haber vereceğim.\n` +
            `15 dakikada bir kontrol ediyorum. Tetiklendiğinde alarm kapanır (tekrar tekrar bildirim gelmesin diye).\n` +
            `<i>Silmek için: alarm sil ${alert.id.slice(0, 8)}</i>`,
        };
      } catch (err) {
        if (err instanceof AlertError) return { text: `⚠️ ${escapeHtml(err.message)}` };
        throw err;
      }
    }

    case 'alarm_listele': {
      const alerts = listAlerts(db, true);
      if (alerts.length === 0) {
        return {
          text: 'Aktif alarmın yok.\nÖrnek: <code>BTC 4 milyon üstüne çıkarsa haber ver</code>',
        };
      }
      const lines = alerts.map(a => {
        const yon = a.direction === 'ustunde' ? '▲ üstüne' : '▼ altına';
        const value = a.kind === 'portfoy' ? fmtTL(a.threshold) : fmtPrice(a.threshold);
        const last = a.last_value !== null ? ` · şu an ${a.kind === 'portfoy' ? fmtTL(a.last_value) : fmtPrice(a.last_value)}` : '';
        return `<code>${a.id.slice(0, 8)}</code> ${escapeHtml(a.target)} ${yon} ${value}${last}`;
      });
      return { text: ['🔔 <b>Aktif alarmların</b>', '', ...lines, '', '<i>Silmek için: alarm sil &lt;kod&gt;</i>'].join('\n') };
    }

    case 'alarm_sil': {
      const ok = deleteAlertByShortId(db, intent.shortId);
      return {
        text: ok
          ? '✅ Alarm silindi.'
          : `Bu kodla bir alarm bulamadım: <code>${escapeHtml(intent.shortId)}</code>. <code>alarmlarım</code> yazarak listeyi görebilirsin.`,
      };
    }

    case 'bilinmiyor':
      return {
        text:
          'Bunu tam anlayamadım. Şunları deneyebilirsin:\n' +
          '• <code>portföyüm</code> · <code>brifing</code> · <code>analiz et</code>\n' +
          '• <code>dolar kaç</code> · <code>BTC ne durumda</code>\n' +
          '• <code>Bitcoin 5000 TL aldım</code>\n\n' +
          '<code>yardım</code> yazarsan hepsini listelerim.',
        allowRewrite: true,
      };
  }
}

/** Onaylanan aksiyonu UYGULAR. Buraya gelmeden hiçbir veri değişmez. */
export function applyPendingAction(action: PendingAction, ctx: ExecuteContext): string {
  const { db, timezone } = ctx;

  if (action.kind === 'sil') {
    const holding = getHolding(db, action.holdingId);
    if (!holding) return '⚠️ Varlık zaten yok — bu arada silinmiş olabilir.';
    removeHolding(db, action.holdingId);
    return `🗑 <b>${escapeHtml(holding.name)}</b> silindi. İşlem geçmişi duruyor.\nPortföy toplamın: ${fmtTL(totalValue(listHoldings(db)))}`;
  }

  if (action.kind === 'islem') {
    try {
      const { holding } = addTxn(db, action.holdingId, action.txnKind, action.amount, timezone);
      const verb = action.txnKind === 'alis' ? 'Alış' : 'Satış';
      return (
        `✅ <b>${verb} kaydedildi</b> — ${escapeHtml(holding.name)} ${fmtTL(action.amount)}\n` +
        `Yeni değeri: ${fmtTL(holding.amount)} · maliyet ${fmtTL(holding.cost_basis)}\n` +
        `Portföy toplamın: ${fmtTL(totalValue(listHoldings(db)))}`
      );
    } catch (err) {
      if (err instanceof PortfolioError) return `⚠️ ${escapeHtml(err.message)}`;
      throw err;
    }
  }

  // Çok adımlı dengeleme planı — her adım tek tek uygulanır, biri patlarsa raporlanır.
  const applied: string[] = [];
  const failed: string[] = [];
  for (const step of action.steps) {
    try {
      addTxn(db, step.holdingId, step.txnKind, step.amount, timezone);
      applied.push(`${step.txnKind === 'alis' ? '🟢' : '🔴'} ${escapeHtml(step.holdingName)} ${fmtTL(step.amount)}`);
    } catch (err) {
      failed.push(`${escapeHtml(step.holdingName)}: ${escapeHtml((err as Error).message)}`);
    }
  }
  const lines = [`✅ <b>Plan uygulandı</b> — ${escapeHtml(action.hedefText)}`, '', ...applied];
  if (failed.length > 0) lines.push('', '⚠️ <b>Uygulanamayanlar</b>', ...failed);
  lines.push('', `Portföy toplamın: ${fmtTL(totalValue(listHoldings(db)))}`);
  return lines.join('\n');
}

export { PORTFOLIO_TARGET };
