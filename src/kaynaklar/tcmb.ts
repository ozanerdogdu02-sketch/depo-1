// TCMB (EVDS üzerinden) bağdaştırıcısı: yıllık TÜFE ve döviz kuru. Hata FIRLATMAZ.
// Anahtar burada YOK: istek aynı köken `/api/evds` sunucu ucuna gider (api/evds.mjs -> netlify/functions/evds.mjs).
// İstek yalnız seri kodu + tarih aralığı taşır; portföy, tutar ya da sembol listesi GİTMEZ.
// TCMB ana sitesinin today.xml dosyası KULLANILMAZ (kullanıcı kararı); Frankfurter otomatik yedek OLMAZ.
//
// TODO(hukuk): EVDS şartları kaynak göstererek kullanıma izin veriyor (ikincil okuma); ticari/abonelikli üründe
//   gösterim ve kaynak gösterme biçimi birincil metinle doğrulanmadı.
// TODO(muhasebe): TÜFE seri kodu TP.FG.J0 gerçek veriyle doğrulanmadı (anahtar gelince denenecek).
import { createLocalStore } from '../storage/local.ts';
import type { KvStore } from '../storage/types.ts';
import {
  KUR_GUNLUK_SAPMA_PCT, TCMB_KUR_TTL_MS, TCMB_TUFE_TTL_MS, TUFE_DONEM_MAX_YAS_AY, TUFE_MANTIK_ARALIK_PCT,
} from '../config/varsayilanlar.ts';
import { createCalistirici } from './kayit.ts';
import type { Calistirici, GetirSonucu, KaynakTanimi } from './kayit.ts';
import { ONBELLEK_ANAHTARLARI } from './onbellek.ts';
import type { KaynakHata, KaynakSonucu } from './tip.ts';

const FN_URL = '/api/evds'; // Vercel: api/evds.mjs; Netlify: netlify.toml yönlendirmesi

// TÜFE genel endeksi. DOĞRULANMADI — anahtar gelince gerçek yanıtla denenecek. Yıllık değişimi endeksin
// kendisinden hesapladığımız için baz yılı sonucu etkilemez.
export const TUFE_SERIES = 'TP.FG.J0';

/* ───────────── Kur alan tablosu ─────────────
   TODO: DOĞRULANMADI — anahtar gelince denenecek. Kur seri kodları EVDS yanıtıyla doğrulanmadığı için bu tablo
   BOŞ; sunucudaki KUR_SERILERI da boş (netlify/functions/evds.mjs). İkisi birlikte, doğrulanmış kodlarla doldurulur.
   Anahtar: EVDS yanıt satırındaki alan adı (seri kodunda '.' yerine '_'). */
export interface KurAlani { para: string; tur: 'alis' | 'satis' }
export const KUR_ALANLARI: Record<string, KurAlani> = {};

export interface TufeVeri { annualPct: number }
export interface KurSatiri { alis?: number; satis?: number }
export type KurVeri = Record<string, KurSatiri>; // para kodu -> son gözlem
type EvdsSatir = Record<string, unknown>;
type Ayristir<T> = { ok: true; veri: T; donem: string } | { ok: false; hata: KaynakHata };

/* ───────────── Saf ayrıştırma ───────────── */

// EVDS satırında tarih alanı `Tarih`, değer alanı seri koduna göre adlandırılır (TP.FG.J0 -> TP_FG_J0).
// Alan adını VARSAYMAK yerine tarih/zaman damgası dışındaki ilk sayısal alan okunur.
function ilkSayi(item: EvdsSatir): number | undefined {
  for (const [k, v] of Object.entries(item)) {
    if (k === 'Tarih' || k === 'UNIXTIME' || k === 'YEARWEEK') continue;
    const n = sayiOku(v);
    if (n !== undefined && n !== 0) return n;
  }
  return undefined;
}

function sayiOku(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// Ay etiketini ay sırasına (yıl*12 + ay-1) çevirir. EVDS aylık veride "AA-YYYY" (01-2026) ya da "YYYY-M[M]" (2026-1)
// dönebilir; ikisi de kabul edilir, ay 1-12 olmalı. Başka biçim undefined (satır atlanır).
function ayIndeksi(etiket: string): number | undefined {
  const a = /^(\d{1,2})-(\d{4})$/.exec(etiket);
  const b = /^(\d{4})-(\d{1,2})$/.exec(etiket);
  const ay = a ? Number(a[1]) : b ? Number(b[2]) : 0;
  const yil = a ? Number(a[2]) : b ? Number(b[1]) : 0;
  return ay >= 1 && ay <= 12 ? yil * 12 + (ay - 1) : undefined;
}
// Ekranda tek biçim: AA-YYYY.
function ayEtiketi(idx: number): string {
  return `${String((idx % 12) + 1).padStart(2, '0')}-${Math.floor(idx / 12)}`;
}

// Yıllık TÜFE = son ayın endeksi / TAM 12 ay önceki aynı ayın endeksi. Konum değil TARİH ETİKETİ eşleşir:
// eksik ay varsa 14 ay önceye bölüp resmî dönem etiketiyle göstermek yerine okunamadi döner.
// Son dönem `simdiMs`ten TUFE_DONEM_MAX_YAS_AY aydan eskiyse veri yok sayılır (eski veri hesaba girmez).
export function tufeAyristir(items: EvdsSatir[] | undefined, simdiMs: number = Date.now()): Ayristir<TufeVeri> {
  if (!items || items.length < 13) return { ok: false, hata: 'okunamadi' };
  // Boş/okunamayan/etiketsiz satırları ayıkla — EVDS ileriye dönük boş aylar döndürebilir.
  const ay = new Map<number, { etiket: string; deger: number }>();
  for (const it of items) {
    const etiket = typeof it.Tarih === 'string' ? it.Tarih : '';
    const idx = ayIndeksi(etiket);
    const deger = ilkSayi(it);
    if (idx !== undefined && deger !== undefined) ay.set(idx, { etiket: ayEtiketi(idx), deger });
  }
  if (ay.size < 2) return { ok: false, hata: 'okunamadi' };
  const sonIdx = Math.max(...ay.keys());
  const son = ay.get(sonIdx)!;
  const yilOnce = ay.get(sonIdx - 12);
  if (!yilOnce || !(yilOnce.deger > 0)) return { ok: false, hata: 'okunamadi' };
  const simdi = new Date(simdiMs);
  const yas = simdi.getFullYear() * 12 + simdi.getMonth() - sonIdx;
  if (yas > TUFE_DONEM_MAX_YAS_AY) return { ok: false, hata: 'mantik_disi' };
  const yillik = (son.deger / yilOnce.deger - 1) * 100;
  if (!Number.isFinite(yillik) || yillik < TUFE_MANTIK_ARALIK_PCT.min || yillik > TUFE_MANTIK_ARALIK_PCT.max) {
    return { ok: false, hata: 'mantik_disi' };
  }
  return { ok: true, veri: { annualPct: Math.round(yillik * 10) / 10 }, donem: son.etiket };
}

// Her para için, değeri olan SON gözlem. Önceki gözlemden günlük ±KUR_GUNLUK_SAPMA_PCT dışı değer atılmaz,
// bütün yanıt 'mantik_disi' sayılır (kayan ayrıştırma sessizce yanlış kur üretmesin).
export function kurAyristir(items: EvdsSatir[] | undefined, alanlar: Record<string, KurAlani>): Ayristir<KurVeri> {
  if (!items || items.length === 0 || Object.keys(alanlar).length === 0) return { ok: false, hata: 'okunamadi' };
  const veri: KurVeri = {};
  const onceki: Record<string, number> = {};
  let sonEtiket = '';
  for (const it of items) {
    const etiket = typeof it.Tarih === 'string' ? it.Tarih : '';
    let satirdaVar = false;
    for (const [alan, { para, tur }] of Object.entries(alanlar)) {
      const n = sayiOku(it[alan]);
      if (n === undefined || !(n > 0)) continue;
      const oz = `${para}.${tur}`;
      const o = onceki[oz];
      if (o !== undefined && Math.abs((n / o - 1) * 100) > KUR_GUNLUK_SAPMA_PCT) return { ok: false, hata: 'mantik_disi' };
      onceki[oz] = n;
      (veri[para] ??= {})[tur] = n;
      satirdaVar = true;
    }
    if (satirdaVar) sonEtiket = etiket;
  }
  if (Object.keys(veri).length === 0) return { ok: false, hata: 'okunamadi' };
  return { ok: true, veri, donem: sonEtiket };
}

// Sunucu yanıt kodunu kaynak hatasına çevirir (saf). Yeniden deneme yalnız geçici arızalarda.
export function yanitHatasi(status: number, govde: unknown): { hata: KaynakHata; yenidenDene: boolean } {
  const kod = typeof (govde as { error?: unknown } | null)?.error === 'string' ? (govde as { error: string }).error : '';
  if (status === 503 && kod === 'anahtar_yok') return { hata: 'anahtar_yok', yenidenDene: false };
  if (status === 503 && kod === 'seri_dogrulanmadi') return { hata: 'seri_dogrulanmadi', yenidenDene: false };
  if (status === 429) return { hata: 'sinir_asildi', yenidenDene: false };
  if (status >= 400 && status < 500) return { hata: 'kaynak_hatasi', yenidenDene: false };
  if (kod === 'zaman_asimi') return { hata: 'zaman_asimi', yenidenDene: true };
  if (kod === 'okunamadi') return { hata: 'okunamadi', yenidenDene: false };
  // Yukarı akış isteği reddetti (4xx): bizim istek/anahtar sorunu, geçici arıza değil -> yeniden deneme ve devre kesici yok.
  if (kod === 'kaynak_reddetti') return { hata: 'kaynak_hatasi', yenidenDene: false };
  return { hata: kod === 'kaynak_hatasi' ? 'kaynak_hatasi' : 'ulasilamadi', yenidenDene: true };
}

/* ───────────── Ağ ───────────── */

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

async function evdsSatirlari(url: string, fetchFn: FetchLike, signal: AbortSignal): Promise<GetirSonucu<EvdsSatir[]>> {
  const res = await fetchFn(url, { signal }); // ağ hatası çalıştırıcıda yakalanır (ulasilamadi, yeniden denenir)
  if (!res.ok) {
    const govde = await res.json().catch(() => null);
    const { hata, yenidenDene } = yanitHatasi(res.status, govde);
    return { ok: false, hata, yenidenDene };
  }
  const data = await res.json().catch(() => null) as { items?: unknown } | null;
  if (!data || !Array.isArray(data.items)) return { ok: false, hata: 'okunamadi', yenidenDene: false };
  return { ok: true, veri: data.items as EvdsSatir[] };
}

const tufeAralikta = (x: number) => Number.isFinite(x) && x >= TUFE_MANTIK_ARALIK_PCT.min && x <= TUFE_MANTIK_ARALIK_PCT.max;
const tufeVeriMi = (v: unknown): v is TufeVeri =>
  !!v && typeof (v as TufeVeri).annualPct === 'number' && tufeAralikta((v as TufeVeri).annualPct);
const sonluMu = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const kurVeriMi = (v: unknown): v is KurVeri => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length === 0) return false;
  return Object.values(v as Record<string, unknown>).every(s => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    const { alis, satis } = s as KurSatiri;
    return (alis === undefined || sonluMu(alis)) && (satis === undefined || sonluMu(satis));
  });
};

export interface TcmbSecenek {
  calistirici?: Calistirici;
  fetchFn?: FetchLike;
  signal?: AbortSignal;
  zorla?: boolean;
  simdiMs?: number;                       // test: TÜFE dönem tazeliği için saat (varsayılan Date.now())
  kurAlanlari?: Record<string, KurAlani>; // test/yapılandırma; varsayılan KUR_ALANLARI
}

let varsayilanCalistirici: Calistirici | undefined;
function paylasilanCalistirici(): Calistirici {
  if (!varsayilanCalistirici) {
    const ls = typeof localStorage === 'undefined' ? undefined : localStorage;
    varsayilanCalistirici = createCalistirici({ depo: createLocalStore(ls) });
  }
  return varsayilanCalistirici;
}

// Üretim yolunda (calistirici verilmediğinde) eski önbellek bir kez yeni biçime taşınır.
let gocSozu: Promise<unknown> | undefined;
function gocBirKez(): Promise<unknown> {
  if (!gocSozu) {
    const ls = typeof localStorage === 'undefined' ? undefined : localStorage;
    gocSozu = eskiTufeOnbelleginiTasi(createLocalStore(ls)).catch(() => undefined);
  }
  return gocSozu;
}

const varsayilanFetch: FetchLike = (url, init) => fetch(url, init);

export async function tufeOku(s: TcmbSecenek = {}): Promise<KaynakSonucu<TufeVeri>> {
  if (!s.calistirici) await gocBirKez();
  const c = s.calistirici ?? paylasilanCalistirici();
  const fetchFn = s.fetchFn ?? varsayilanFetch;
  // Tarih aralığını SUNUCU kurar (son ~14 ay: yıllık değişim için en az 13 gözlem gerekir). İstemci yalnız seriyi söyler.
  const qs = `series=${encodeURIComponent(TUFE_SERIES)}`;
  const tanim: KaynakTanimi<TufeVeri> = {
    kaynak: 'tcmb', anahtar: ONBELLEK_ANAHTARLARI.tcmbTufe, ttlMs: TCMB_TUFE_TTL_MS, dogrula: tufeVeriMi,
    async getir(signal) {
      const r = await evdsSatirlari(`${FN_URL}?${qs}`, fetchFn, signal);
      if (!r.ok) return r;
      const a = tufeAyristir(r.veri, s.simdiMs ?? Date.now());
      return a.ok ? { ok: true, veri: a.veri, donem: a.donem } : { ok: false, hata: a.hata, yenidenDene: false };
    },
  };
  return c.calistir(tanim, { signal: s.signal, zorla: s.zorla });
}

// Kur: sunucu tüm kurları tek sabit tablo olarak döner, süzme istemcide yapılır. İstekte sembol listesi yok.
// Seri kodları doğrulanana kadar sunucu 503 seri_dogrulanmadi döner -> durum 'kapali' (uydurma kur yok).
export async function kurOku(s: TcmbSecenek = {}): Promise<KaynakSonucu<KurVeri>> {
  const c = s.calistirici ?? paylasilanCalistirici();
  const fetchFn = s.fetchFn ?? varsayilanFetch;
  const alanlar = s.kurAlanlari ?? KUR_ALANLARI;
  const qs = 'tablo=kur'; // aralığı (son 14 gün) sunucu kurar
  const tanim: KaynakTanimi<KurVeri> = {
    kaynak: 'tcmb', anahtar: ONBELLEK_ANAHTARLARI.tcmbKur, ttlMs: TCMB_KUR_TTL_MS, dogrula: kurVeriMi,
    async getir(signal) {
      const r = await evdsSatirlari(`${FN_URL}?${qs}`, fetchFn, signal);
      if (!r.ok) return r;
      const a = kurAyristir(r.veri, alanlar);
      return a.ok ? { ok: true, veri: a.veri, donem: a.donem } : { ok: false, hata: a.hata, yenidenDene: false };
    },
  };
  return c.calistir(tanim, { signal: s.signal, zorla: s.zorla });
}

/* ───────────── Eski önbellekten göç ─────────────
   Eski biçim: localStorage 'fagent.evds.v1' = { reading: { annualPct, periodLabel, fetchedAt }, storedAt }.
   Yeni anahtar yoksa içerik yeni biçime kopyalanır; eski anahtar yalnızca başarılı kopyadan sonra silinir.
   Biçimi tanınmayan eski kayıt dokunulmadan bırakılır. */
export const ESKI_TUFE_ANAHTARI = 'fagent.evds.v1';
export async function eskiTufeOnbelleginiTasi(depo: KvStore | undefined): Promise<'tasindi' | 'yok' | 'taninmadi' | 'mevcut'> {
  if (!depo) return 'yok';
  const e = await depo.get(ESKI_TUFE_ANAHTARI);
  if (!e.ok || e.value === undefined) return 'yok';
  try {
    const eski = JSON.parse(e.value) as { reading?: { annualPct?: unknown; periodLabel?: unknown }; storedAt?: unknown } | null;
    const pct = eski?.reading?.annualPct;
    if (typeof pct !== 'number' || !tufeAralikta(pct) || typeof eski?.storedAt !== 'number' || !Number.isFinite(eski.storedAt)) return 'taninmadi';
    const donem = typeof eski.reading?.periodLabel === 'string' && eski.reading.periodLabel ? eski.reading.periodLabel : undefined;
    const yeni = JSON.stringify({ surum: 1, kaynak: 'tcmb', donem, alindi: new Date(eski.storedAt).toISOString(), veri: { annualPct: pct } });
    const yazildi = await depo.addIfAbsent(ONBELLEK_ANAHTARLARI.tcmbTufe, yeni);
    if (!yazildi.ok) return 'taninmadi';
    if (!yazildi.value) return 'mevcut'; // yeni kayıt zaten var: ezilmez, eski kayıt da silinmez
    await depo.deleteIfEquals(ESKI_TUFE_ANAHTARI, e.value);
    return 'tasindi';
  } catch { return 'taninmadi'; }
}
