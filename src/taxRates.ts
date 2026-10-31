// Kullanıcının düzenlediği stopaj oranları — KALICI katman (localStorage).
//
// Neden ayrı modül: `analytics.ts` saf kalmalı (I/O yok), `agent.ts` de öyle. Oranlar
// varsayılan olarak `DEFAULT_TAX_RATES`'ten gelir; kullanıcı değiştirirse burada saklanır ve
// App.tsx hem arayüze hem `chatReply`'ye geçirir. Desen `agentTraining.ts` ile birebir aynı.
//
// Bu katmanın var olma sebebi bir DÜRÜSTLÜK gereği: ajan kripto/altın/döviz için "oran
// doğrulayamadım, %0 varsaydım, kendi oranını söyle" diyor. Girecek yer olmadan bu söz boş
// kalırdı — burası o sözün karşılığı.
import type { AssetType } from './store.ts';
import { varsayilanVergiOranlari } from './config/varsayilanlar.ts';
import { notifyUserDataChanged } from './backup.ts';
import { preserveCorruptRaw } from './recovery.ts';
import { writeLocal, removeLocal, readLocal } from './yazmaDurumu.ts';

const KEY = 'fagent.tax.v1';

export type TaxRates = Record<AssetType, number>;

type Kayit = Partial<Record<AssetType, number>>;

/* Kayıt biçimi (v1, geriye dönük uyumlu): yalnız kullanıcının DEĞİŞTİRDİĞİ sınıflar saklanır, ör. {"fon":20}.
   Eski sürümler tüm tabloyu yazıyordu ({"fon":17.5,"mevduat":17.5,...}); bu kayıtlar okunurken göç edilir:
   bugünkü varsayılana eşit değer kayıttan çıkarılır (kullanıcının değiştirdiği değerlere dokunulmaz). Böylece
   tarihli yeni bir kural (tax_rules.json) hiç dokunulmamış sınıflara ulaşır; kullanıcı oranı her zaman önceliklidir.
   Bilinen sınır: eski tabloyu yazmış kullanıcı, kural değişmeden önce uygulamayı hiç açmadıysa eski değerler "kullanıcı
   oranı" gibi kalır (o zamanki varsayılandan ayırt edilemez). */
function kayitOku(varsayilan: TaxRates): { kayit: Kayit; bozuk: boolean } {
  const kayit: Kayit = {};
  let raw: string | null = null;
  try {
    raw = readLocal(KEY); // diske yazılamayan son değer (ya da 'silinmeli' = null) önceliklidir
    if (!raw) return { kayit, bozuk: false };
    const parsed = JSON.parse(raw) as Partial<Record<AssetType, unknown>>;
    for (const k of Object.keys(varsayilan) as AssetType[]) {
      const v = parsed[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) kayit[k] = v;
    }
    return { kayit, bozuk: false };
  } catch { if (raw) preserveCorruptRaw(KEY, raw); /* bozuk kayıt — varsayılanlarla devam; ham değer kurtarma anahtarında */ return { kayit: {}, bozuk: true }; }
}

function kayitYaz(kayit: Kayit, bildir: boolean): void {
  if (Object.keys(kayit).length === 0) removeLocal(KEY);
  else writeLocal(KEY, JSON.stringify(kayit)); // kota hatası: kirli işaretlenir, arayüz uyarır (yazmaDurumu.ts)
  if (bildir) notifyUserDataChanged(); // hesaplı kullanıcıda bulut kaydı zamanlansın (cloud.ts)
}

// Kullanıcının değiştirdiği oranlar varsayılanın üstüne yazılmış hâliyle döner. `varsayilan` yalnız testler içindir
// (ileri tarihli kural simülasyonu); verilmezse bugünün kuralı. Eski tam tablo kaydı burada sessizce sadeleşir.
export function getTaxRates(varsayilan: TaxRates = varsayilanVergiOranlari()): TaxRates {
  const { kayit, bozuk } = kayitOku(varsayilan);
  const base = { ...varsayilan };
  if (bozuk) return base;
  let degisti = false;
  for (const k of Object.keys(kayit) as AssetType[]) {
    if (kayit[k] === varsayilan[k]) { delete kayit[k]; degisti = true; } else base[k] = kayit[k] as number;
  }
  if (degisti) kayitYaz(kayit, false); // göç: kullanıcı verisi anlamı değişmiyor, bulut bildirimi gerekmez
  return base;
}

// Tek bir sınıfın oranını yazar. 0–100 dışına taşan girdi clamp edilir (negatif vergi olmaz).
// Varsayılana eşit değer kayıttan SİLİNİR: "senin girdiğin" olmaktan çıkar, ileride kural değişirse izler.
export function setTaxRate(type: AssetType, pct: number, varsayilan: TaxRates = varsayilanVergiOranlari()): TaxRates {
  const { kayit } = kayitOku(varsayilan);
  const v = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  if (v === varsayilan[type]) delete kayit[type]; else kayit[type] = v;
  kayitYaz(kayit, true);
  return getTaxRates(varsayilan);
}

// Kullanıcı bir oranı elle değiştirmiş mi? Arayüz "varsayılan" ile "senin girdiğin"i ayırır.
export function isCustomRate(type: AssetType, rates: TaxRates, varsayilan: TaxRates = varsayilanVergiOranlari()): boolean {
  return rates[type] !== varsayilan[type];
}

// SIFIRLA ile birlikte çağrılır (portföy + bellek + öğretilen bilgi ile aynı anda).
export function resetTaxRates(): void {
  removeLocal(KEY);
  notifyUserDataChanged();
}
