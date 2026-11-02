// BİST gün sonu kapanış bağdaştırıcısı (Borsa İstanbul Günlük Bülten, sunucu tarafı). Hata FIRLATMAZ.
// İstek PARAMETRESİZ ve gövdesizdir: GET /api/bist. Portföy/sembol listesi sunucuya GİTMEZ; sunucu bugünün tüm kapanış tablosunu
// döner, portföy sembollerine göre süzme TARAYICIDA yapılır (bistSuz). Gün içi/anlık fiyat yoktur (AGENTS.md §0.4).
// Sunucu: api/bist.mjs -> netlify/functions/bist.mjs; varsayılan KAPALI (FAGENT_KAZIMA=on yoksa 503 kapali -> durum 'kapali').
//
// DURUM: bülten dosya biçimi DOĞRULANMADI; sunucuda gerçek ayrıştırıcı yok, uç `okunamadi` döner -> durum 'veri_yok'.
//   Ekranda hiçbir sayı uydurulmaz. Elle girilen fiyat HER ZAMAN geçerlidir ve onaysız ezilmez (fiyatSec).
// TODO(hukuk): BİST veri lisansı / bülten kullanım koşulu / otomatik okuma izni doğrulanmadı.
import { createLocalStore } from '../storage/local.ts';
import type { KvStore } from '../storage/types.ts';
import { BIST_GUNLUK_SAPMA_PCT, BIST_TTL_MS } from '../config/varsayilanlar.ts';
import { createCalistirici } from './kayit.ts';
import type { Calistirici, GetirSonucu, KaynakTanimi } from './kayit.ts';
import { kapYanitHatasi as sunucuYanitHatasi } from './kap.ts';
import { ONBELLEK_ANAHTARLARI, onbellekOku } from './onbellek.ts';
import type { KaynakSonucu } from './tip.ts';

const FN_URL = '/api/bist';
const KOD_RE = /^[A-Z0-9]{3,6}$/;
const TARIH_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAKS_KOD = 3000;

export interface BistVeri {
  tarih: string;                       // bültenin KENDİ tarihi (YYYY-AA-GG)
  beklenen: string;                    // sunucunun o an beklediği en son bülten tarihi
  kapanislar: Record<string, number>;  // kod -> kapanış (makullük kontrolünü geçenler)
  mantikDisi?: string[];               // önceki kapanışa göre ±%20 dışı olduğu için gösterilmeyen kodlar
}

// Bülten, beklenen tarihten eskiyse (o günün bülteni yok / gecikme / tatil) GÜNCEL sayılmaz, eski diye etiketlenir.
// Güncellik ŞU ANKİ zamana göre hesaplanır (indirme anındaki `beklenen` değil): günler önce indirilmiş önbellek kaydı güncel sayılmaz.
const TSI_FARK_MS = 3 * 3600_000;
const p2 = (n: number) => String(n).padStart(2, '0');
// Sunucudaki beklenenBultenTarihi ile aynı kural (netlify/functions/bist.mjs; test ikisinin eşitliğini korur).
export function beklenenBultenTarihi(simdiMs: number): string {
  const t = new Date(simdiMs + TSI_FARK_MS);
  let gun = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const dk = t.getUTCHours() * 60 + t.getUTCMinutes();
  const haftaSonu = (ms: number) => { const d = new Date(ms).getUTCDay(); return d === 0 || d === 6; };
  if (haftaSonu(gun) || dk < 19 * 60 + 30) gun -= 86_400_000;
  while (haftaSonu(gun)) gun -= 86_400_000;
  const d = new Date(gun);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
// Cihaz saati geride olsa bile sunucunun indirme anında beklediği tarih (v.beklenen) altına düşülmez: ikisinin büyüğü esas alınır.
export const bistGuncelMi = (v: BistVeri, simdiMs: number = Date.now()): boolean => {
  const beklenen = beklenenBultenTarihi(simdiMs);
  return v.tarih >= (beklenen > v.beklenen ? beklenen : v.beklenen);
};

export const bistVeriMi = (v: unknown): v is BistVeri => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const b = v as BistVeri;
  if (typeof b.tarih !== 'string' || !TARIH_RE.test(b.tarih) || typeof b.beklenen !== 'string' || !TARIH_RE.test(b.beklenen)) return false;
  if (!b.kapanislar || typeof b.kapanislar !== 'object' || Array.isArray(b.kapanislar)) return false;
  const girdiler = Object.entries(b.kapanislar);
  if (girdiler.length > MAKS_KOD || !girdiler.every(([k, x]) => KOD_RE.test(k) && typeof x === 'number' && Number.isFinite(x) && x > 0)) return false;
  return b.mantikDisi === undefined || (Array.isArray(b.mantikDisi) && b.mantikDisi.length <= MAKS_KOD && b.mantikDisi.every(k => typeof k === 'string' && KOD_RE.test(k)));
};

/* ───────────── Makullük (±%20) — SAF ───────────── */

// Yeni değer önceki kapanışa göre ± pct dışındaysa false. Önceki yoksa karşılaştırılamaz -> true (kabul).
export function makulMu(yeni: number, onceki: number | undefined, pct: number = BIST_GUNLUK_SAPMA_PCT): boolean {
  if (onceki === undefined) return true;
  if (!(onceki > 0) || !(yeni > 0)) return false;
  return Math.abs((yeni / onceki - 1) * 100) <= pct;
}

// Sunucu tablosuna makullüğü uygular. Önceki kapanış YALNIZ daha eski bir bültenden alınır (aynı bülten tekrar çekilince
// önceki kararlar sürer: bir kez reddedilen kod aynı bültende sonradan kabul edilmez). Reddedilen kod `mantikDisi`ya girer, gösterilmez.
// Sınır: reddedilen kodun önceki referansı kalmaz; ertesi bültende karşılaştırılamaz -> kabul edilir (bir günlük boşluk; bedelsiz/bölünme günü).
export function bistMakullukUygula(
  yeni: { tarih: string; beklenen: string; kapanislar: Record<string, number> },
  onceki: BistVeri | undefined,
  pct: number = BIST_GUNLUK_SAPMA_PCT,
): BistVeri {
  const mantikDisi = new Set<string>();
  const ayniBulten = !!onceki && onceki.tarih === yeni.tarih;
  if (ayniBulten) for (const k of onceki!.mantikDisi ?? []) mantikDisi.add(k);
  const eskiBulten = !!onceki && onceki.tarih < yeni.tarih ? onceki : undefined;
  const kapanislar: Record<string, number> = {};
  for (const [kod, k] of Object.entries(yeni.kapanislar)) {
    if (mantikDisi.has(kod)) continue;
    if (!makulMu(k, eskiBulten?.kapanislar[kod], pct)) { mantikDisi.add(kod); continue; }
    kapanislar[kod] = k;
  }
  const dis = [...mantikDisi].filter(k => k in yeni.kapanislar).sort();
  return { tarih: yeni.tarih, beklenen: yeni.beklenen, kapanislar, ...(dis.length ? { mantikDisi: dis } : {}) };
}

/* ───────────── Süzme (TARAYICIDA) ve fiyat önceliği — SAF ───────────── */

export interface BistSatir {
  kod: string;
  durum: 'var' | 'veri_yok';
  kapanis?: number;
  tarih?: string;      // bülten tarihi
  guncelMi?: boolean;  // bülten beklenen tarihte mi
  not?: string;
}

// Portföydeki sembollerin her biri için bir satır döner; bulunamayan/makul olmayan 'veri_yok' + not taşır (sayı uydurulmaz).
// `eski`: çalıştırıcı sonucu durum:'eski' ise (kaynağa ulaşılamıyor, önbellekteki kayıt) true verilir; satır güncel SAYILMAZ.
export function bistSuz(veri: BistVeri, semboller: readonly string[], sec: { eski?: boolean; simdi?: number } = {}): BistSatir[] {
  const guncel = !sec.eski && bistGuncelMi(veri, sec.simdi);
  const kodlar = [...new Set(semboller.map(s => s.trim().toUpperCase()).filter(Boolean))];
  return kodlar.map((kod): BistSatir => {
    const k = veri.kapanislar[kod];
    if (k !== undefined) return { kod, durum: 'var', kapanis: k, tarih: veri.tarih, guncelMi: guncel };
    if (veri.mantikDisi?.includes(kod)) return { kod, durum: 'veri_yok', not: `Önceki kapanışa göre ±%${BIST_GUNLUK_SAPMA_PCT} dışında; gösterilmiyor.` };
    return { kod, durum: 'veri_yok', not: 'Bültende bulunamadı.' };
  });
}

export interface FiyatSecimi {
  kaynak: 'elle' | 'bist' | 'yok';
  fiyat?: number;
  donem?: string;       // BİST seçildiyse bülten tarihi
  eski?: boolean;       // BİST seçildi ama bülten beklenen tarihten eski
  bistAday?: number;    // kullanıcıya SUNULABİLECEK BİST kapanışı (otomatik uygulanmaz; hesaba girmez)
  bistAdayEski?: true;  // bistAday eski bülten/eski önbellek kaydından: "eski" etiketiyle anılır
  not?: string;
}

// ÖNCELİK: elle girilen fiyat > BİST. Elle fiyat geçerliyse (sonlu, > 0) BİST onunla ezmez; fark varsa yalnız `bistAday` olarak
// bildirilir (uygulama için kullanıcı onayı ayrı bir eylemdir; bu fonksiyon yazmaz). Elle fiyat yoksa makul BİST kapanışı kullanılır.
export function fiyatSec(girdi: { elle?: number; bist?: BistSatir }): FiyatSecimi {
  const elle = girdi.elle;
  const bist = girdi.bist;
  const bistVar0 = !!bist && bist.durum === 'var' && typeof bist.kapanis === 'number' && Number.isFinite(bist.kapanis) && bist.kapanis > 0;
  // ESKİ VERİ HESABA GİRMEZ: bülten beklenen tarihten eskiyse ya da çalıştırıcı 'eski' dediyse (guncelMi false) kapanış yalnız
  // `bistAday` + `bistAdayEski` olarak bildirilir.
  const bistVar = bistVar0 && bist!.guncelMi === true; // bilinmiyorsa (alan yok) güncel SAYILMAZ
  const eskiAday = bistVar0 && !bistVar ? { bistAday: bist!.kapanis!, bistAdayEski: true as const } : {};
  if (typeof elle === 'number' && Number.isFinite(elle) && elle > 0) {
    return { kaynak: 'elle', fiyat: elle, ...(bistVar && bist!.kapanis !== elle ? { bistAday: bist!.kapanis } : {}), ...(bistVar0 && !bistVar && bist!.kapanis !== elle ? eskiAday : {}) };
  }
  if (bistVar) return { kaynak: 'bist', fiyat: bist!.kapanis, donem: bist!.tarih, eski: false };
  if (bistVar0) return { kaynak: 'yok', ...eskiAday, donem: bist!.tarih, not: 'Borsa İstanbul kapanışı eski; hesaba alınmadı.' };
  return { kaynak: 'yok', not: bist?.not ?? 'Elle girilmiş fiyat yok; Borsa İstanbul kapanışı alınamadı.' };
}

/* ───────────── Ağ ───────────── */

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface BistSecenek {
  calistirici?: Calistirici;
  depo?: KvStore;      // önceki kapanış için önbellek okuması (varsayılan localStorage)
  fetchFn?: FetchLike;
  signal?: AbortSignal;
  zorla?: boolean;
}

const yerelDepo = (): KvStore | undefined => createLocalStore(typeof localStorage === 'undefined' ? undefined : localStorage);

let varsayilanCalistirici: Calistirici | undefined;
function paylasilanCalistirici(): Calistirici {
  if (!varsayilanCalistirici) varsayilanCalistirici = createCalistirici({ depo: yerelDepo() });
  return varsayilanCalistirici;
}

const varsayilanFetch: FetchLike = (url, init) => fetch(url, init);

// Tüm (süzülmemiş) tablo döner; çağıran bistSuz ile portföye göre süzer. donem = bültenin tarihi.
export async function bistOku(s: BistSecenek = {}): Promise<KaynakSonucu<BistVeri>> {
  const c = s.calistirici ?? paylasilanCalistirici();
  const fetchFn = s.fetchFn ?? varsayilanFetch;
  const depo = s.depo ?? yerelDepo();
  const onceki = (await onbellekOku(depo, ONBELLEK_ANAHTARLARI.bistKapanis, 'bist', bistVeriMi))?.veri;
  const tanim: KaynakTanimi<BistVeri> = {
    kaynak: 'bist', anahtar: ONBELLEK_ANAHTARLARI.bistKapanis, ttlMs: BIST_TTL_MS, dogrula: bistVeriMi,
    async getir(signal): Promise<GetirSonucu<BistVeri>> {
      const res = await fetchFn(FN_URL, { signal }); // sorgu dizgisi yok, gövde yok
      if (!res.ok) {
        const govde = await res.json().catch(() => null);
        const { hata, yenidenDene } = sunucuYanitHatasi(res.status, govde);
        return { ok: false, hata, yenidenDene };
      }
      const d = await res.json().catch(() => null) as { tarih?: unknown; beklenen?: unknown; satirlar?: unknown } | null;
      if (!d || typeof d.tarih !== 'string' || !TARIH_RE.test(d.tarih) || typeof d.beklenen !== 'string' || !TARIH_RE.test(d.beklenen)
        || !Array.isArray(d.satirlar) || d.satirlar.length > MAKS_KOD) return { ok: false, hata: 'okunamadi', yenidenDene: false };
      const kapanislar: Record<string, number> = {};
      for (const r of d.satirlar as Array<{ kod?: unknown; kapanis?: unknown }>) {
        if (!r || typeof r.kod !== 'string' || !KOD_RE.test(r.kod) || typeof r.kapanis !== 'number' || !Number.isFinite(r.kapanis) || !(r.kapanis > 0)) {
          return { ok: false, hata: 'okunamadi', yenidenDene: false }; // sunucu süzdü; burada bozuk satır = şema değişti
        }
        kapanislar[r.kod] = r.kapanis;
      }
      const veri = bistMakullukUygula({ tarih: d.tarih, beklenen: d.beklenen, kapanislar }, onceki);
      if (Object.keys(veri.kapanislar).length === 0) {
        return { ok: false, hata: Object.keys(kapanislar).length > 0 ? 'mantik_disi' : 'okunamadi', yenidenDene: false };
      }
      return { ok: true, veri, donem: veri.tarih.split('-').reverse().join('.') };
    },
  };
  return c.calistir(tanim, { signal: s.signal, zorla: s.zorla });
}
