// Dengeleme planı — "kriptonun ağırlığını %30'a düşür" gibi çok adımlı görevler.
//
// TAMAMEN DETERMİNİSTİK ve SAF: girdi portföy + hedef, çıktı adım listesi. Modelin
// bu hesaba karışması yasak — bir dengeleme planındaki yanlış rakam doğrudan yanlış
// işlem demek.
//
// MANTIK: aşırı ağırlıktaki sınıftan fazlalık satılır, çıkan tutar diğer varlıklara
// mevcut ağırlıkları oranında dağıtılır. Böylece PORTFÖY TOPLAMI DEĞİŞMEZ — bu bir
// dengeleme işlemidir, para çıkışı değil.
import type { AssetKind, HoldingRow } from '../db.ts';
import { ASSET_LABELS } from '../db.ts';
import { totalValue } from './portfolio.ts';
import { fmtPct, fmtTL } from './format.ts';
import type { RebalanceStep } from '../brain/intents.ts';

/** Bu tutarın altındaki adımlar gürültü — planı okunaksız yapar, atlanır. */
const MIN_ADIM_TL = 1;

export interface RebalancePlan {
  steps: RebalanceStep[];
  summary: string;
  /** Plan üretilemediyse sebebi. */
  problem?: string;
}

/** Kuruş hassasiyetine yuvarlar — kayan nokta artığı işlem tutarlarına sızmasın. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bir tutarı, verilen varlıklara mevcut değerleri oranında dağıtır.
 * SON adım artığı üstlenir: parça parça yuvarlama toplamı hedeften kaydırır ve
 * "toplam 10.000 dağıtacaktım, 9.999,98 dağıttım" gibi bir sapma bırakırdı.
 */
function distribute(amount: number, targets: HoldingRow[]): Array<{ holding: HoldingRow; amount: number }> {
  const base = totalValue(targets);
  if (base <= 0 || targets.length === 0) return [];

  const out: Array<{ holding: HoldingRow; amount: number }> = [];
  let assigned = 0;
  targets.forEach((holding, index) => {
    const isLast = index === targets.length - 1;
    const share = isLast ? round2(amount - assigned) : round2((holding.amount / base) * amount);
    assigned = round2(assigned + share);
    out.push({ holding, amount: share });
  });
  return out.filter(s => s.amount >= MIN_ADIM_TL);
}

/**
 * Bir varlık sınıfını hedef yüzdeye getirecek adım listesini üretir.
 *
 * @param targetPct 0-100 arası hedef ağırlık.
 */
export function planRebalance(
  holdings: HoldingRow[],
  kind: AssetKind,
  targetPct: number,
): RebalancePlan {
  const label = ASSET_LABELS[kind];

  if (!Number.isFinite(targetPct) || targetPct < 0 || targetPct > 100) {
    return { steps: [], summary: '', problem: 'Hedef ağırlık %0 ile %100 arasında olmalı.' };
  }

  const total = totalValue(holdings);
  if (total <= 0) {
    return { steps: [], summary: '', problem: 'Portföyün boş — dengelenecek bir şey yok.' };
  }

  const inKind = holdings.filter(h => h.kind === kind && h.amount > 0);
  const others = holdings.filter(h => h.kind !== kind && h.amount > 0);
  const current = totalValue(inKind);
  const currentPct = (current / total) * 100;
  const target = (targetPct / 100) * total;
  const delta = round2(target - current);

  if (Math.abs(delta) < MIN_ADIM_TL) {
    return {
      steps: [],
      summary: `${label} ağırlığın zaten ${fmtPct(currentPct)} — hedefe (${fmtPct(targetPct)}) çok yakın, işlem gerekmiyor.`,
    };
  }

  // ── Fazlalığı sat, diğerlerine dağıt ──────────────────────────────────────
  if (delta < 0) {
    const toSell = -delta;
    if (inKind.length === 0) {
      return { steps: [], summary: '', problem: `Portföyünde hiç ${label.toLocaleLowerCase('tr-TR')} yok.` };
    }
    if (others.length === 0) {
      return {
        steps: [],
        summary: '',
        problem:
          `Portföyünün tamamı ${label.toLocaleLowerCase('tr-TR')} — satılan tutarı aktaracak başka bir varlık yok. ` +
          'Önce hedeflediğin sınıftan bir varlık ekle.',
      };
    }

    const steps: RebalanceStep[] = [];
    for (const s of distribute(toSell, inKind)) {
      // Güvenlik: bir varlıktan sahip olduğundan fazlasını satmayı ASLA önerme.
      const amount = round2(Math.min(s.amount, s.holding.amount));
      if (amount < MIN_ADIM_TL) continue;
      steps.push({ holdingId: s.holding.id, holdingName: s.holding.name, txnKind: 'satis', amount });
    }
    const sold = round2(steps.reduce((sum, s) => sum + s.amount, 0));
    for (const s of distribute(sold, others)) {
      steps.push({ holdingId: s.holding.id, holdingName: s.holding.name, txnKind: 'alis', amount: s.amount });
    }

    return {
      steps,
      summary:
        `${label} ağırlığın şu an ${fmtPct(currentPct)} (${fmtTL(current)}). ` +
        `Hedef ${fmtPct(targetPct)} için ${fmtTL(sold)} satılıp diğer varlıklara ağırlıkları oranında aktarılacak.`,
    };
  }

  // ── Eksiği tamamla: diğerlerinden sat, bu sınıfa aktar ────────────────────
  const toBuy = delta;
  if (inKind.length === 0) {
    return {
      steps: [],
      summary: '',
      problem:
        `Portföyünde hiç ${label.toLocaleLowerCase('tr-TR')} yok, ağırlığını artıramam. ` +
        `Önce bir tane ekle: "ekle <ad> ${kind} <tutar>".`,
    };
  }
  if (others.length === 0) {
    return { steps: [], summary: '', problem: 'Aktarılacak tutarı çıkaracak başka varlık yok.' };
  }

  const steps: RebalanceStep[] = [];
  for (const s of distribute(toBuy, others)) {
    const amount = round2(Math.min(s.amount, s.holding.amount));
    if (amount < MIN_ADIM_TL) continue;
    steps.push({ holdingId: s.holding.id, holdingName: s.holding.name, txnKind: 'satis', amount });
  }
  const raised = round2(steps.reduce((sum, s) => sum + s.amount, 0));
  for (const s of distribute(raised, inKind)) {
    steps.push({ holdingId: s.holding.id, holdingName: s.holding.name, txnKind: 'alis', amount: s.amount });
  }

  return {
    steps,
    summary:
      `${label} ağırlığın şu an ${fmtPct(currentPct)} (${fmtTL(current)}). ` +
      `Hedef ${fmtPct(targetPct)} için diğer varlıklardan ${fmtTL(raised)} çıkarılıp ` +
      `${label.toLocaleLowerCase('tr-TR')} tarafına aktarılacak.`,
  };
}
