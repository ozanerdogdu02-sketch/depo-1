/* Tarih aralıklı piyasa varsayımları: SAF okuyucu ve doğrulayıcı (veri yolculuğu A10).
   Veri: src/config/varsayimlar.json. Aralık doğrulaması vergi kurallarıyla ortak (vergiKurallari.ts aralikHatalari).
   Şema: { surum: 1, aciklama?, varsayimlar: Varsayim[] }
     Varsayim = { id, anahtar, deger (sonlu sayı), birim, baslangic|null, bitis|null, kaynak|null, dogrulandi, not } */
import { aralikHatalari, gecerliTarihMi, yerelBugun } from './vergiKurallari.ts';

export interface Varsayim {
  id: string; anahtar: string; deger: number; birim: string;
  baslangic: string | null; bitis: string | null; kaynak: string | null; dogrulandi: boolean; not: string;
}
export interface VarsayimDosyasi { surum: number; aciklama?: string; varsayimlar: Varsayim[] }

/* Anahtar başına makul sınır (kapsayıcı değil: alt sınır hariç, üst sınır dahil): yüzde ve puan cinsinden değerler
   (-100, 1000]. Kaynaklı bir yazım hatası (örn. 4500 ya da -300) sessizce hesaba girmesin diye. Anahtar bilinmiyorsa
   birim 'yillik_yuzde'/'yuzde_puan' ise aynı sınır uygulanır. */
export const DEGER_SINIRI = { alt: -100, ust: 1000 } as const;
const YUZDE_BIRIMLERI = new Set(['yillik_yuzde', 'yuzde_puan']);

export function dogrulaVarsayim(dosya: unknown, gerekliAnahtarlar: readonly string[] = []): string[] {
  const h: string[] = [];
  if (!dosya || typeof dosya !== 'object' || Array.isArray(dosya)) return ['kök nesne değil'];
  const o = dosya as Record<string, unknown>;
  if (o.surum !== 1) h.push(`desteklenmeyen sürüm: ${String(o.surum)}`);
  if (!Array.isArray(o.varsayimlar)) return [...h, 'varsayimlar dizi değil'];
  const ids = new Set<string>();
  const gruplar = new Map<string, Varsayim[]>();
  o.varsayimlar.forEach((v, i) => {
    const ad = `varsayimlar[${i}]`;
    if (!v || typeof v !== 'object' || Array.isArray(v)) { h.push(`${ad}: nesne değil`); return; }
    const r = v as Record<string, unknown>;
    let ok = true;
    const kotu = (m: string) => { h.push(`${ad}: ${m}`); ok = false; };
    if (typeof r.id !== 'string' || !r.id) kotu('id yok'); else if (ids.has(r.id)) kotu(`yinelenen id ${r.id}`); else ids.add(r.id);
    if (typeof r.anahtar !== 'string' || !r.anahtar) kotu('anahtar yok');
    if (typeof r.deger !== 'number' || !Number.isFinite(r.deger)) kotu('deger sonlu sayı değil');
    if (typeof r.birim !== 'string' || !r.birim) kotu('birim yok');
    else if (typeof r.deger === 'number' && Number.isFinite(r.deger) && YUZDE_BIRIMLERI.has(r.birim) && !(r.deger > DEGER_SINIRI.alt && r.deger <= DEGER_SINIRI.ust)) kotu(`deger (${DEGER_SINIRI.alt}, ${DEGER_SINIRI.ust}] aralığı dışında`);
    if (r.baslangic !== null && !gecerliTarihMi(r.baslangic)) kotu('baslangic tarih ya da null değil');
    if (r.bitis !== null && !gecerliTarihMi(r.bitis)) kotu('bitis tarih ya da null değil');
    if (r.kaynak !== null && typeof r.kaynak !== 'string') kotu('kaynak metin ya da null değil');
    if (typeof r.dogrulandi !== 'boolean') kotu('dogrulandi boolean değil');
    if (typeof r.not !== 'string') kotu('not metin değil');
    if (ok) {
      const x = r as unknown as Varsayim;
      if (x.baslangic && x.bitis && x.baslangic > x.bitis) { h.push(`${ad}: baslangic > bitis`); return; }
      (gruplar.get(x.anahtar) ?? gruplar.set(x.anahtar, []).get(x.anahtar)!).push(x);
    }
  });
  for (const a of gerekliAnahtarlar) if (!gruplar.has(a)) h.push(`${a}: varsayım yok`);
  for (const [a, liste] of gruplar) h.push(...aralikHatalari(liste, a));
  return h;
}

export function yukleVarsayim(dosya: unknown, gerekliAnahtarlar: readonly string[] = []): VarsayimDosyasi {
  const hatalar = dogrulaVarsayim(dosya, gerekliAnahtarlar);
  if (hatalar.length) throw new Error(`varsayimlar.json geçersiz: ${hatalar.join('; ')}`);
  return dosya as VarsayimDosyasi;
}

/** Tarihte geçerli varsayım; yoksa undefined. */
export function gecerliVarsayim(d: VarsayimDosyasi, anahtar: string, tarih: string): Varsayim | undefined {
  if (!gecerliTarihMi(tarih)) return undefined;
  return d.varsayimlar.find(v => v.anahtar === anahtar && (v.baslangic === null || v.baslangic <= tarih) && (v.bitis === null || tarih <= v.bitis));
}

/** Çağrı anındaki değer (gece yarısını aşan sekmede de doğru). Tarih için kayıt yoksa undefined: çağıran "veri yok" der. */
export function varsayimDegeri(d: VarsayimDosyasi, anahtar: string, tarih: string = yerelBugun()): number | undefined {
  return gecerliVarsayim(d, anahtar, tarih)?.deger;
}
