// Txn isteğe bağlı alanları (quantity, unitPrice, currency) için doğrulayıcı. SAF.
// HENÜZ store/backup/cloud'a BAĞLI DEĞİL: dışarıdan gelen veri (CSV, form, yedek) bu yardımcıdan
// geçirilmeden Txn'e yazılmamalı. Alanlar yoksa geçerlidir (eski kayıtlar).
export interface TxnExtras { quantity?: number; unitPrice?: number; currency?: string }
export type TxnExtrasResult = { ok: true; value: TxnExtras } | { ok: false; errors: string[] };

const MAX_ABS = 1e15; // makul üst sınır: taşma/Infinity benzeri girdiyi eler
const CURRENCY_RE = /^[A-Z]{3}$/;

export function validateTxnExtras(input: unknown): TxnExtrasResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, errors: ['nesne bekleniyor'] };
  const o = input as Record<string, unknown>;
  const errors: string[] = [];
  const value: TxnExtras = {};

  const num = (name: 'quantity' | 'unitPrice') => {
    const v = o[name];
    if (v === undefined) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_ABS) errors.push(`${name}: sonlu sayı olmalı`);
    else if (v < 0) errors.push(`${name}: negatif olamaz`);
    else value[name] = v;
  };
  num('quantity');
  num('unitPrice');

  const c = o.currency;
  if (c !== undefined) {
    if (typeof c !== 'string' || c.length !== 3 || !CURRENCY_RE.test(c)) errors.push('currency: 3 büyük harfli ISO kodu olmalı');
    else value.currency = c;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
