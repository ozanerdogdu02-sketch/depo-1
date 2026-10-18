// Kullanıcının düzenlediği stopaj oranları — KALICI katman (localStorage).
//
// Neden ayrı modül: `analytics.ts` saf kalmalı (I/O yok), `agent.ts` de öyle. Oranlar
// varsayılan olarak `DEFAULT_TAX_RATES`'ten gelir; kullanıcı değiştirirse burada saklanır ve
// App.tsx hem arayüze hem `chatReply`'ye geçirir. Desen `agentTraining.ts` ile birebir aynı.
//
// Bu katmanın var olma sebebi bir DÜRÜSTLÜK gereği: ajan kripto/altın/döviz için "oran
// doğrulayamadım, %0 varsaydım, kendi oranını söyle" diyor. Girecek yer olmadan bu söz boş
// kalırdı — burası o sözün karşılığı.
import { AssetType } from './store';
import { DEFAULT_TAX_RATES } from './analytics';

const KEY = 'fagent.tax.v1';

export type TaxRates = Record<AssetType, number>;

// Kaydedilmiş oranları döner; hiç kaydedilmemişse varsayılanların kopyası.
// Bozuk/eksik alanlar varsayılandan tamamlanır — tek bozuk anahtar tüm tabloyu düşürmesin.
export function getTaxRates(): TaxRates {
  const base = { ...DEFAULT_TAX_RATES };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<AssetType, unknown>>;
    for (const k of Object.keys(base) as AssetType[]) {
      const v = parsed[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) base[k] = v;
    }
  } catch { /* bozuk kayıt — varsayılanlarla devam */ }
  return base;
}

// Tek bir sınıfın oranını yazar. 0–100 dışına taşan girdi clamp edilir (negatif vergi olmaz).
export function setTaxRate(type: AssetType, pct: number): TaxRates {
  const next = getTaxRates();
  next[type] = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kota — bellekte kalır */ }
  return next;
}

// Kullanıcı bir oranı elle değiştirmiş mi? Arayüz "varsayılan" ile "senin girdiğin"i ayırır.
export function isCustomRate(type: AssetType, rates: TaxRates): boolean {
  return rates[type] !== DEFAULT_TAX_RATES[type];
}

// SIFIRLA ile birlikte çağrılır (portföy + bellek + öğretilen bilgi ile aynı anda).
export function resetTaxRates(): void {
  try { localStorage.removeItem(KEY); } catch { /* yok */ }
}
