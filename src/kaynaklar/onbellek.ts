// Kaynak önbelleği: KvStore arayüzü üzerinden (bugün localStorage, YH-1 sonrası IndexedDB'ye taşınabilir).
// SAF DEĞİL ama window/ağ yok: depo parametreyle girer. Önbellek KULLANICI VERİSİ DEĞİLDİR: yeniden üretilebilir,
// BACKED_UP_KEYS'e girmez, buluta gitmez. Süresi geçen kayıt SİLİNMEZ ("son bilinen değer" olarak kalır).
import type { KvStore } from '../storage/types.ts';
import type { KaynakAdi } from './tip.ts';

export interface OnbellekKaydi<T> {
  surum: 1;
  kaynak: KaynakAdi;
  donem?: string;
  alindi: string; // ISO
  veri: T;
}

export const ONBELLEK_ANAHTARLARI = {
  tcmbTufe: 'fagent.kaynak.tcmb.tufe.v1',
  tcmbKur: 'fagent.kaynak.tcmb.kur.v1',
  kapBildirimler: 'fagent.kaynak.kap.v1',
} as const;

// Biçimi tanınmayan kayıt yok sayılır (silinmez, üzerine yeni başarılı okuma yazar).
export async function onbellekOku<T>(
  depo: KvStore | undefined,
  anahtar: string,
  kaynak: KaynakAdi,
  dogrula: (v: unknown) => v is T,
): Promise<OnbellekKaydi<T> | undefined> {
  if (!depo) return undefined;
  const r = await depo.get(anahtar);
  if (!r.ok || r.value === undefined) return undefined;
  try {
    const k = JSON.parse(r.value) as Partial<OnbellekKaydi<unknown>> | null;
    if (!k || k.surum !== 1 || k.kaynak !== kaynak) return undefined;
    if (typeof k.alindi !== 'string' || !Number.isFinite(Date.parse(k.alindi))) return undefined;
    if (k.donem !== undefined && typeof k.donem !== 'string') return undefined;
    if (!dogrula(k.veri)) return undefined;
    return { surum: 1, kaynak, donem: k.donem, alindi: k.alindi, veri: k.veri };
  } catch { return undefined; }
}

// Yazma hatası (kota vb.) yutulur: önbellek bir bonustur, veriyi kaybettirmez.
export async function onbellekYaz<T>(depo: KvStore | undefined, anahtar: string, kayit: OnbellekKaydi<T>): Promise<boolean> {
  if (!depo) return false;
  const r = await depo.set(anahtar, JSON.stringify(kayit));
  return r.ok;
}
