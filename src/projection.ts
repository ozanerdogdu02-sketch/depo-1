/* Projeksiyon hesabı — SAF modül (YH-2, Aşama A). React, DOM, localStorage, ağ YOK.
   Veri parametreyle girer; sabitler src/config/varsayilanlar.ts'ten gelir.

   Bu modül "tahmin" üretmez: "şu varsayımla şu çıkar" senaryosu hesaplar. Her yüksek seviye
   çıktı sayısı bir kaynak etiketi taşır (`EtiketliSayi`):
     'resmi'    — resmî kaynaktan gelen girdiye dayanır (ör. EVDS'den gelen TÜFE)
     'varsayim' — ürünün varsayılanı ya da kaynaksız örnek değer
     'kullanici'— kullanıcının kendi girdisi / kendi portföy verisi
   Türetilmiş bir sayının etiketi, girdilerinin en zayıfıdır (bkz. birlestirKaynak).

   İlkel fonksiyonlar (aylikOran, sonDeger, enflasyonCarpani, reelDeger, projeksiyonYollari) etiketsiz
   düz sayı döndürür: Projeksiyon ekranının mevcut hesabıyla BİREBİR aynı işlemleri yapar.
   Diğerleri (stopajSonrasiDeger, hedefeUlasmaSuresi, getiriEnflasyonTablosu, siraRiski) şimdilik
   arayüze bağlı değildir; bağlama kararı tasarım oturumundadır. */
import type { AssetType } from './store.ts';
import { DEFAULT_TAX_RATES, UNVERIFIED_TAX, SIRA_RISKI_SAPMA_PP } from './config/varsayilanlar.ts';

/* ───────────── Kaynak etiketi ───────────── */
export type KaynakEtiketi = 'resmi' | 'varsayim' | 'kullanici';

export interface EtiketliSayi {
  deger: number;
  kaynak: KaynakEtiketi;
}

export interface GirdiKaynaklari {
  baslangic: KaynakEtiketi; // portföyün bugünkü değeri: kullanıcının kendi verisi
  aylikKatki: KaynakEtiketi;
  getiri: KaynakEtiketi;
  enflasyon: KaynakEtiketi;
}

const VARSAYILAN_KAYNAKLAR: GirdiKaynaklari = {
  baslangic: 'kullanici',
  aylikKatki: 'kullanici',
  getiri: 'varsayim', // senaryo getirileri kaynaksız varsayımdır; kullanıcı değiştirirse 'kullanici' verilir
  enflasyon: 'varsayim',
};

/** Enflasyon kaynağı (inflation.ts InflationSource) → etiket. evds → resmi. */
export function enflasyonEtiketi(kaynak: 'varsayim' | 'evds' | 'kullanici'): KaynakEtiketi {
  return kaynak === 'evds' ? 'resmi' : kaynak;
}

/** Türetilmiş sayının etiketi: herhangi biri 'varsayim' ise 'varsayim'; yoksa herhangi biri
    'kullanici' ise 'kullanici'; hepsi 'resmi' ise 'resmi'. Boş listede 'varsayim' (temkinli). */
export function birlestirKaynak(...kaynaklar: KaynakEtiketi[]): KaynakEtiketi {
  if (kaynaklar.length === 0) return 'varsayim';
  if (kaynaklar.includes('varsayim')) return 'varsayim';
  if (kaynaklar.includes('kullanici')) return 'kullanici';
  return 'resmi';
}

function kaynaklariBirlestir(k?: Partial<GirdiKaynaklari>): GirdiKaynaklari {
  return { ...VARSAYILAN_KAYNAKLAR, ...(k ?? {}) };
}

/* ───────────── Girdi sınırları (güvenli varsayılanlar) ─────────────
   Modül girişinde uygulanır; NaN/Infinity ve sonsuz döngü üretmesin diye. Ekranın aralığında
   (1–30 yıl, 0–200 oran, sonlu tutar) hiçbir değer değişmez.
   - yıl / azamiYil: sonlu değilse 0; aksi halde 0..YIL_UST arası TAM sayıya (kesir atılır) kısılır.
   - yüzde oran (getiri, enflasyon): sonlu değilse 0; aksi halde [ORAN_ALT_PCT, ORAN_UST_PCT] aralığına
     kısılır. −99 altı (−100 = tüm değer kaybı, 1+oran=0 → bölme sıfır) güvenli değil; −99'a çıkarılır.
   - tutar (başlangıç, katkı, ağırlık): sonlu değilse 0. */
export const YIL_UST = 100;
export const ORAN_ALT_PCT = -99;
export const ORAN_UST_PCT = 1000;

export function yilSinirla(yil: number): number {
  if (!Number.isFinite(yil)) return 0;
  return Math.min(YIL_UST, Math.max(0, Math.trunc(yil)));
}
export function oranSinirla(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(ORAN_UST_PCT, Math.max(ORAN_ALT_PCT, pct));
}
function sonluTutar(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

/* ───────────── İlkeller (etiketsiz; eski App.tsx hesabıyla aynı işlemler) ───────────── */

/** Yıllık yüzde getiri → aylık bileşik oran (kesir). */
export function aylikOran(yillikPct: number): number {
  return Math.pow(1 + oranSinirla(yillikPct) / 100, 1 / 12) - 1;
}

/** Ay ay bileşik büyüme: her ay `değer × (1 + aylık oran) + katkı`. 0 yıl → başlangıç. */
export function sonDeger(baslangic: number, aylikKatki: number, yillikPct: number, yil: number): number {
  const r = aylikOran(yillikPct);
  const n = yilSinirla(yil);
  let deger = sonluTutar(baslangic);
  const katki = sonluTutar(aylikKatki);
  for (let m = 1; m <= n * 12; m++) deger = deger * (1 + r) + katki;
  return deger;
}

/** Süre sonu fiyat seviyesi çarpanı (bugüne indirgeme böleni). */
export function enflasyonCarpani(enflasyonPct: number, yil: number): number {
  return Math.pow(1 + oranSinirla(enflasyonPct) / 100, yilSinirla(yil));
}

/** Reel (bugünkü alım gücüyle) değer = nominal / (1 + enflasyon)^yıl. */
export function reelDeger(nominal: number, enflasyonPct: number, yil: number): number {
  return nominal / enflasyonCarpani(enflasyonPct, yil);
}

export interface SenaryoGetirileri { dusuk: number; orta: number; yuksek: number }
export interface YolNoktasi { yil: number; dusuk: number; orta: number; yuksek: number }

/** Üç senaryonun yıl yıl değeri (0. yıl dahil); değerler tam sayıya yuvarlanır (grafik verisi). */
export function projeksiyonYollari(g: {
  baslangic: number; aylikKatki: number; getiriPct: SenaryoGetirileri; yil: number;
}): YolNoktasi[] {
  const r = {
    dusuk: aylikOran(g.getiriPct.dusuk),
    orta: aylikOran(g.getiriPct.orta),
    yuksek: aylikOran(g.getiriPct.yuksek),
  };
  const noktalar: YolNoktasi[] = [];
  const b = sonluTutar(g.baslangic), katki = sonluTutar(g.aylikKatki), n = yilSinirla(g.yil);
  let vD = b, vO = b, vY = b;
  for (let m = 0; m <= n * 12; m++) {
    if (m > 0) {
      vD = vD * (1 + r.dusuk) + katki;
      vO = vO * (1 + r.orta) + katki;
      vY = vY * (1 + r.yuksek) + katki;
    }
    if (m % 12 === 0) noktalar.push({ yil: m / 12, dusuk: Math.round(vD), orta: Math.round(vO), yuksek: Math.round(vY) });
  }
  return noktalar;
}

/* ───────────── Etiketli senaryo ───────────── */

export interface ProjeksiyonGirdisi {
  baslangic: number;
  aylikKatki: number;
  yil: number;
  getiriPct: number;
  enflasyonPct: number;
  kaynaklar?: Partial<GirdiKaynaklari>;
}

export interface SenaryoSonucu {
  yatirilan: EtiketliSayi; // başlangıç + katkılar (getirisiz)
  nominal: EtiketliSayi;
  reel: EtiketliSayi;      // bugünkü alım gücü
}

export function senaryoSonucu(g: ProjeksiyonGirdisi): SenaryoSonucu {
  const k = kaynaklariBirlestir(g.kaynaklar);
  const yil = yilSinirla(g.yil);
  const nominal = sonDeger(g.baslangic, g.aylikKatki, g.getiriPct, yil);
  const yatirilanKaynak = birlestirKaynak(k.baslangic, k.aylikKatki);
  const nominalKaynak = birlestirKaynak(k.baslangic, k.aylikKatki, k.getiri);
  return {
    yatirilan: { deger: sonluTutar(g.baslangic) + sonluTutar(g.aylikKatki) * 12 * yil, kaynak: yatirilanKaynak },
    nominal: { deger: nominal, kaynak: nominalKaynak },
    reel: { deger: reelDeger(nominal, g.enflasyonPct, yil), kaynak: birlestirKaynak(nominalKaynak, k.enflasyon) },
  };
}

/* ───────────── Stopaj sonrası net değer ───────────── */

export type TurAgirliklari = Partial<Record<AssetType, number>>;

/** Varlık listesinden tür ağırlıkları (tutar toplamı). Negatif/sonsuz tutarlar yok sayılır. */
export function turAgirliklari(varliklar: { type: AssetType; amount: number }[]): TurAgirliklari {
  const a: TurAgirliklari = {};
  for (const v of varliklar) {
    if (!Number.isFinite(v.amount) || v.amount <= 0) continue;
    a[v.type] = (a[v.type] ?? 0) + v.amount;
  }
  return a;
}

export interface StopajGirdisi extends ProjeksiyonGirdisi {
  /** Portföyün tür dağılımı (göreli ağırlık; toplamı 1 olmak zorunda değil). */
  agirliklar: TurAgirliklari;
  /** Varsayılan: DEFAULT_TAX_RATES. Kullanıcının kendi oranları verilirse oranKaynagi='kullanici'. */
  oranlar?: Record<AssetType, number>;
  oranKaynagi?: KaynakEtiketi;
}

export interface StopajSonucu {
  brut: EtiketliSayi;        // süre sonu nominal değer
  kazanc: EtiketliSayi;      // brüt − yatırılan (negatif olabilir)
  vergi: EtiketliSayi;       // yalnız pozitif kazanç üzerinden
  net: EtiketliSayi;         // brüt − vergi
  agirlikliOranPct: EtiketliSayi;
  /** true: dağılımda doğrulanmamış oranlı tür var (ya da ağırlık yok) → 0 "vergi yok" demek değildir. */
  dogrulanmadi: boolean;
}

/** Stopaj kazancın tamamına, tür ağırlıklı ortalama oranla uygulanır. Zarar/sıfır kazançta vergi 0
    (analytics.ts afterTaxOf ile aynı kural: kazanç üzerinden, zarar mahsubu yok).
    TODO(muhasebe): oranlar doğrulanmadı (varsayilanlar.ts); sonuç 'varsayim' etiketli kalır. */
export function stopajSonrasiDeger(g: StopajGirdisi): StopajSonucu {
  const oranlar = g.oranlar ?? DEFAULT_TAX_RATES;
  const oranKaynagi = g.oranKaynagi ?? 'varsayim';

  // Ağırlıklar turAgirliklari gibi süzülür: sonlu ve pozitif olmayanlar yok sayılır.
  const agirlik = (t: AssetType): number => {
    const w = g.agirliklar[t];
    return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0;
  };
  const turler = Object.keys(g.agirliklar) as AssetType[];
  let toplam = 0;
  for (const t of turler) toplam += agirlik(t);
  let oran = 0;
  let dogrulanmadi = toplam <= 0 || !Number.isFinite(toplam);
  if (toplam > 0 && Number.isFinite(toplam)) {
    for (const t of turler) {
      const w = agirlik(t);
      if (w === 0) continue;
      oran += (w / toplam) * (oranlar[t] ?? 0);
      if (UNVERIFIED_TAX.includes(t)) dogrulanmadi = true;
    }
  }

  const sonuc = senaryoSonucu(g);
  const brut = sonuc.nominal.deger;
  const kazanc = brut - sonuc.yatirilan.deger;
  const vergi = kazanc > 0 ? kazanc * (oran / 100) : 0;
  const kaynak = birlestirKaynak(sonuc.nominal.kaynak, oranKaynagi);
  return {
    brut: { deger: brut, kaynak: sonuc.nominal.kaynak },
    kazanc: { deger: kazanc, kaynak: sonuc.nominal.kaynak },
    vergi: { deger: vergi, kaynak },
    net: { deger: brut - vergi, kaynak },
    agirlikliOranPct: { deger: oran, kaynak: oranKaynagi },
    dogrulanmadi,
  };
}

/* ───────────── Hedef tutara ulaşma süresi ───────────── */

export interface HedefSuresi {
  /** Hedefe ilk ulaşılan ay (0 = başlangıçta ulaşılmış). Azami süre içinde ulaşılamazsa null. */
  ay: EtiketliSayi | null;
  ulasilabilir: boolean;
}

export const HEDEF_AZAMI_YIL = 100;

/** Hedef boş (undefined/null/NaN/≤0) ise null. `enflasyonPct` verilirse karşılaştırma reel değerle yapılır.
    "Bu varsayımla … ayda ulaşılır" biçiminde betimleyici senaryodur; ulaşma sözü değildir. */
export function hedefeUlasmaSuresi(g: {
  baslangic: number; aylikKatki: number; getiriPct: number;
  hedef?: number | null; enflasyonPct?: number; azamiYil?: number;
  kaynaklar?: Partial<GirdiKaynaklari>;
}): HedefSuresi | null {
  if (g.hedef == null || !Number.isFinite(g.hedef) || g.hedef <= 0) return null;
  const k = kaynaklariBirlestir(g.kaynaklar);
  const kaynak = birlestirKaynak(k.baslangic, k.aylikKatki, k.getiri, ...(g.enflasyonPct != null ? [k.enflasyon] : []));
  const r = aylikOran(g.getiriPct);
  const azamiAy = yilSinirla(g.azamiYil ?? HEDEF_AZAMI_YIL) * 12;
  const katki = sonluTutar(g.aylikKatki);
  const enf = g.enflasyonPct != null ? oranSinirla(g.enflasyonPct) : null;
  let deger = sonluTutar(g.baslangic);
  for (let m = 0; m <= azamiAy; m++) {
    if (m > 0) deger = deger * (1 + r) + katki;
    const karsilastirilan = enf != null ? deger / Math.pow(1 + enf / 100, m / 12) : deger;
    if (karsilastirilan >= g.hedef) return { ay: { deger: m, kaynak }, ulasilabilir: true };
  }
  return { ay: null, ulasilabilir: false };
}

/* ───────────── Getiri × enflasyon tablosu ───────────── */

export interface TabloHucresi { enflasyonPct: number; reel: EtiketliSayi }
export interface TabloSatiri { anahtar: keyof SenaryoGetirileri; getiriPct: number; hucreler: TabloHucresi[] }

export const TABLO_ENFLASYON_ADIMI_PP = 10;

/** 3×3: satır = düşük/orta/yüksek getiri, sütun = enflasyon (girdi −10 / girdi / +10 puan; alt sınır 0). */
export function getiriEnflasyonTablosu(g: {
  baslangic: number; aylikKatki: number; yil: number;
  getiriPct: SenaryoGetirileri; enflasyonPct: number;
  getiriKaynagi?: KaynakEtiketi; kaynaklar?: Partial<GirdiKaynaklari>;
}): TabloSatiri[] {
  const k = kaynaklariBirlestir({ ...g.kaynaklar, ...(g.getiriKaynagi ? { getiri: g.getiriKaynagi } : {}) });
  const kaynak = birlestirKaynak(k.baslangic, k.aylikKatki, k.getiri, k.enflasyon);
  const e0 = oranSinirla(g.enflasyonPct);
  const enflasyonlar = [
    Math.max(0, e0 - TABLO_ENFLASYON_ADIMI_PP),
    e0,
    e0 + TABLO_ENFLASYON_ADIMI_PP,
  ];
  return (['dusuk', 'orta', 'yuksek'] as const).map(anahtar => {
    const yil = yilSinirla(g.yil);
    const nominal = sonDeger(g.baslangic, g.aylikKatki, g.getiriPct[anahtar], yil);
    return {
      anahtar,
      getiriPct: g.getiriPct[anahtar],
      hucreler: enflasyonlar.map(e => ({ enflasyonPct: e, reel: { deger: reelDeger(nominal, e, yil), kaynak } })),
    };
  });
}

/* ───────────── Sıra riski (deterministik) ───────────── */

export interface SiraRiskiSonucu {
  /** Yıllık getiri dizileri; aritmetik ortalamaları aynıdır. */
  kotuYillarBasta: number[];
  kotuYillarSonda: number[];
  sapmaPP: number; // gerçekten uygulanan sapma (r−sapma ≥ −99 olacak biçimde kısılabilir)
  basta: EtiketliSayi;
  sonda: EtiketliSayi;
  fark: EtiketliSayi; // sonda − basta. Katkı varken genelde < 0: bakiye büyüdükçe yüksek getirili yıllar daha çok ağırlık alır. Katkısızken 0.
}

/** Yıl yıl sabit aylık oranla, verilen yıllık getiri dizisiyle ay ay bileşik büyüme. */
function diziyleBuyut(baslangic: number, aylikKatki: number, yillikGetiriler: number[]): number {
  let deger = sonluTutar(baslangic);
  const katki = sonluTutar(aylikKatki);
  for (const pct of yillikGetiriler) {
    const r = aylikOran(pct);
    for (let m = 0; m < 12; m++) deger = deger * (1 + r) + katki;
  }
  return deger;
}

/** Aynı ortalama yıllık getiri (`ortalamaPct`), ilk yarı ortalama−sapma, ikinci yarı ortalama+sapma
    ("kötü yıllar başta"); ters sırası "kötü yıllar sonda". Tek sayıda yılda ortadaki yıl = ortalama.
    Rastgelelik yok; aynı girdi aynı sonucu verir. Sapma varsayılanı kaynaksız varsayımdır. */
export function siraRiski(g: {
  baslangic: number; aylikKatki: number; yil: number; ortalamaPct: number;
  sapmaPP?: number; kaynaklar?: Partial<GirdiKaynaklari>;
}): SiraRiskiSonucu {
  const k = kaynaklariBirlestir(g.kaynaklar);
  const n = yilSinirla(g.yil);
  const ort = oranSinirla(g.ortalamaPct);
  const istenenHam = g.sapmaPP ?? SIRA_RISKI_SAPMA_PP;
  const istenen = Number.isFinite(istenenHam) ? Math.max(0, istenenHam) : 0;
  const sapma = Math.min(istenen, Math.max(0, ort + 99));
  const yarim = Math.floor(n / 2);
  const basta: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < yarim) basta.push(ort - sapma);
    else if (i >= n - yarim) basta.push(ort + sapma);
    else basta.push(ort);
  }
  const sonda = [...basta].reverse();
  const kaynak = birlestirKaynak(k.baslangic, k.aylikKatki, k.getiri,
    g.sapmaPP == null ? 'varsayim' : 'kullanici');
  const dBasta = diziyleBuyut(g.baslangic, g.aylikKatki, basta);
  const dSonda = diziyleBuyut(g.baslangic, g.aylikKatki, sonda);
  return {
    kotuYillarBasta: basta,
    kotuYillarSonda: sonda,
    sapmaPP: sapma,
    basta: { deger: dBasta, kaynak },
    sonda: { deger: dSonda, kaynak },
    fark: { deger: dSonda - dBasta, kaynak },
  };
}
