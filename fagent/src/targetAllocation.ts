// Kullanıcının girdiği HEDEF varlık dağılımı — KALICI katman (localStorage).
//
// Neden ayrı modül: `analytics.ts` ve `agent.ts` saf kalmalı (I/O yok). Hedefler burada
// saklanır, App.tsx hem arayüze hem `chatReply`'ye geçirir. Desen `taxRates.ts` ile birebir
// aynı — oradaki savunmacı okuma mantığı bilerek kopyalandı.
//
// SINIR — bilinçli: FAGENT hedef ÖNERMEZ, varsayılan bir dağılım da koymaz. Boş başlar,
// yalnızca kullanıcının girdiğini saklar. "Şu dağılımı hedefle" demek yatırım tavsiyesidir;
// "kendi koyduğun hedeften şu kadar saptın" ölçümdür. Bu dosyanın hiç varsayılanı olmaması
// o ayrımın kod tarafındaki karşılığıdır.
import { AssetType, ASSET_LABELS } from './store';

const KEY = 'fagent.target.v1';

export type TargetAllocation = Record<AssetType, number>;

function emptyTargets(): TargetAllocation {
  const out = {} as TargetAllocation;
  for (const k of Object.keys(ASSET_LABELS) as AssetType[]) out[k] = 0;
  return out;
}

// Kaydedilmiş hedefleri döner; hiç kaydedilmemişse hepsi 0 (özellik kapalı demektir).
// Bozuk/eksik alanlar 0'a tamamlanır — tek bozuk anahtar tüm tabloyu düşürmesin.
export function getTargets(): TargetAllocation {
  const base = emptyTargets();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<AssetType, unknown>>;
    for (const k of Object.keys(base) as AssetType[]) {
      const v = parsed[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) base[k] = v;
    }
  } catch { /* bozuk kayıt — boş hedeflerle devam */ }
  return base;
}

// Tek bir sınıfın hedefini yazar. 0–100 dışına taşan girdi clamp edilir.
// Toplamın 100 olması ZORLANMAZ — kullanıcının girdiği sayı sessizce değiştirilmez;
// arayüz toplamı gösterip uyarır, düzeltmeyi kullanıcı yapar.
export function setTarget(type: AssetType, pct: number): TargetAllocation {
  const next = getTargets();
  next[type] = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* kota — bellekte kalır */ }
  return next;
}

// Kullanıcı en az bir hedef girmiş mi? Kartın ve proaktif içgörünün görünürlük şartı.
export function hasTargets(targets: TargetAllocation): boolean {
  return (Object.values(targets) as number[]).some(v => v > 0);
}

// SIFIRLA ile birlikte çağrılır (portföy + bellek + öğretilen bilgi + vergi oranları ile aynı anda).
export function resetTargets(): void {
  try { localStorage.removeItem(KEY); } catch { /* yok */ }
}
