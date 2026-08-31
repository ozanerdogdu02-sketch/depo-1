// Proaktif içgörüler — kullanıcı SORMADAN yüzeye çıkan uyarılar.
// Tamamı SAF fonksiyon: veri parametre olarak geçer, I/O yok, doğrudan test edilir.
//
// Buradaki hesaplar "tahmin" değil, aritmetik gerçekler: enflasyonun nakit üzerindeki
// aşındırması, tek sınıfta yoğunlaşma oranı, maliyete göre kâr/zarar. Piyasa yönü
// hakkında ÖNGÖRÜ ÜRETİLMEZ — Jarvis falcı değil.
import type { HoldingRow, AssetKind } from '../db.ts';
import { ASSET_LABELS } from '../db.ts';
import { allocation, pnlOf, rankByPnl, totalCost, totalValue } from './portfolio.ts';
import { isStablecoinSymbol } from '../data/crypto.ts';
import { fmtPct, fmtSignedPct, fmtSignedTL, fmtTL } from './format.ts';

export type InsightLevel = 'uyari' | 'iyi' | 'bilgi';

export interface Insight {
  level: InsightLevel;
  text: string;
  /** Sıralama önceliği — küçük olan önce gösterilir. */
  priority: number;
}

/** Enflasyon karşısında getiri üretmeyen, "nakit benzeri" varlıklar. */
export function isCashLike(h: HoldingRow): boolean {
  if (h.kind === 'mevduat' || h.kind === 'doviz') return true;
  if (h.kind === 'kripto' && h.symbol && isStablecoinSymbol(h.symbol)) return true;
  return false;
}

export interface InsightInput {
  holdings: HoldingRow[];
  inflationPct: number;
  /** Bir önceki anlık görüntüdeki toplam değer — varsa günlük değişim eklenir. */
  previousValue?: number | undefined;
  previousDateLabel?: string | undefined;
}

export function buildInsights(input: InsightInput): Insight[] {
  const { holdings, inflationPct } = input;
  const out: Insight[] = [];
  const total = totalValue(holdings);
  if (total <= 0) return out;

  const alloc = allocation(holdings);
  const top = alloc[0];

  // 1) Bir önceki ölçüme göre değişim. Bu, FAGENT'ın YAPAMADIĞI şey: tarayıcı uygulaması
  //    kapalıyken ölçüm alamaz. Jarvis sunucuda yaşadığı için her gün kayıt tutabiliyor.
  if (input.previousValue !== undefined && input.previousValue > 0) {
    const diff = total - input.previousValue;
    const pct = (diff / input.previousValue) * 100;
    // %0,05'in altındaki oynamayı "değişim" diye sunmak gürültü.
    if (Math.abs(pct) >= 0.05) {
      out.push({
        level: diff >= 0 ? 'iyi' : 'uyari',
        priority: 0,
        text:
          `${input.previousDateLabel ?? 'Son ölçüme'} göre portföyün ${fmtSignedTL(diff)} ` +
          `(${fmtSignedPct(pct)}) değişti — şu an ${fmtTL(total)}.`,
      });
    } else {
      out.push({
        level: 'bilgi',
        priority: 0,
        text: `${input.previousDateLabel ?? 'Son ölçüme'} göre kayda değer bir değişim yok — portföyün ${fmtTL(total)}.`,
      });
    }
  }

  // 2) Tek SINIFTA yoğunlaşma
  if (top && top.pct > 50) {
    out.push({
      level: 'uyari',
      priority: 1,
      text:
        `Portföyünün ${fmtPct(top.pct, 0)}'ı tek sınıfta: ${ASSET_LABELS[top.kind]}. ` +
        'Bu sınıf sert düşerse tüm portföyün doğrudan etkilenir.',
    });
  }

  // 3) Tek VARLIKTA yoğunlaşma — sınıf dağılımı dengeli görünse bile tek hisse
  //    portföyün üçte birini tutuyor olabilir; sınıf bazlı bakış bunu gizler.
  const biggest = [...holdings].sort((a, b) => b.amount - a.amount)[0];
  if (biggest) {
    const pct = (biggest.amount / total) * 100;
    if (pct > 35) {
      out.push({
        level: 'uyari',
        priority: 2,
        text:
          `Tek bir varlık portföyünün ${fmtPct(pct, 0)}'ını oluşturuyor: ${biggest.name} (${fmtTL(biggest.amount)}). ` +
          'Şirkete/varlığa özel bir kötü haber seni orantısız etkiler.',
      });
    }
  }

  // 4) Reel getiri — nakit benzeri varlıkların enflasyon karşısında yıllık erimesi.
  //    Savunulabilir olmasının sebebi: getiri üretmeyen nakit her yıl enflasyon kadar
  //    alım gücü kaybeder. Bu vade/faiz karışıklığı içermeyen matematiksel bir gerçek.
  const cashLike = holdings.filter(isCashLike);
  const cashValue = totalValue(cashLike);
  const cashPct = (cashValue / total) * 100;
  if (cashValue > 0 && inflationPct > 0 && cashPct >= 12) {
    const erosion = cashValue * (inflationPct / 100);
    out.push({
      level: 'uyari',
      priority: 3,
      text:
        `Nakit benzeri varlıkların ${fmtTL(cashValue)} (portföyün ${fmtPct(cashPct, 0)}'ı). ` +
        `${fmtPct(inflationPct, 0)} enflasyon varsayımıyla bu kısım yılda yaklaşık ${fmtTL(erosion)} ` +
        'reel değer kaybediyor — getiri üreten bir sınıfa kaydırmayı değerlendirebilirsin.',
    });
  }

  // 5) Çeşitlendirme olumlu geri bildirimi
  if ((!top || top.pct <= 50) && alloc.length >= 4) {
    out.push({
      level: 'iyi',
      priority: 6,
      text: `${alloc.length} varlık sınıfına yayılmışsın — tek bir şoka bağımlılığın düşük, sağlam bir denge.`,
    });
  }

  // 6) Genel kâr/zarar (nominal) + reel getiri farkı
  const cost = totalCost(holdings);
  if (cost > 0) {
    const { abs, pct } = pnlOf(total, cost);
    out.push({
      level: abs >= 0 ? 'iyi' : 'uyari',
      priority: 4,
      text:
        `Toplam nominal getirin ${fmtSignedTL(abs)} (${fmtSignedPct(pct)}). ` +
        'Bu maliyetine göre — enflasyondan arındırılmış reel getiri için nakit uyarısına bak.',
    });
  }

  // 7) En çok kazandıran / kaybettiren
  const ranked = rankByPnl(holdings);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (best && worst && best.id !== worst.id) {
    out.push({
      level: 'bilgi',
      priority: 5,
      text:
        `En iyi: ${best.name} (${fmtSignedPct(best.pnl.pct)}) · ` +
        `En kötü: ${worst.name} (${fmtSignedPct(worst.pnl.pct)}).`,
    });
  }

  // 8) Bayat fiyat uyarısı — canlı fiyata bağlı ama uzun süredir güncellenmemiş varlıklar.
  //    "Portföyün X TL" derken aslında haftalık eski fiyat gösteriyorsak bu yanıltıcıdır.
  const staleCutoff = Date.now() - 3 * 86_400_000;
  const stale = holdings.filter(
    h => h.symbol && h.quantity && (!h.last_priced_at || new Date(h.last_priced_at).getTime() < staleCutoff),
  );
  if (stale.length > 0) {
    out.push({
      level: 'bilgi',
      priority: 7,
      text:
        `${stale.length} varlığın fiyatı 3 günden eski (${stale.slice(0, 3).map(h => h.name).join(', ')}` +
        `${stale.length > 3 ? '…' : ''}). Kaynak geçici olarak ulaşılamamış olabilir — "fiyatları güncelle" yazabilirsin.`,
    });
  }

  return out.sort((a, b) => a.priority - b.priority);
}

/** Yalnızca sınıf dağılımını okunur satırlar halinde döner. */
export function allocationLines(holdings: HoldingRow[]): string[] {
  return allocation(holdings).map(
    slice => `${ASSET_LABELS[slice.kind as AssetKind]}: ${fmtTL(slice.amount)} (${fmtPct(slice.pct, 0)})`,
  );
}
