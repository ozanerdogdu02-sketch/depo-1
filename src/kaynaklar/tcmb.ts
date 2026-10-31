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
  KUR_GUNLUK_SAPMA_PCT, TCMB_KUR_TTL_MS, TCMB_TUFE_TTL_MS, TUFE_MANTIK_ARALIK_PCT,
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

export function tufeAyristir(items: EvdsSatir[] | undefined): Ayristir<TufeVeri> {
  if (!items || items.length < 13) return { ok: false, hata: 'okunamadi' };
  // Boş/okunamayan satırları ayıkla — EVDS ileriye dönük boş aylar döndürebilir.
  const seri = items
    .map(it => ({ etiket: typeof it.Tarih === 'string' ? it.Tarih : '', deger: ilkSayi(it) }))
    .filter((r): r is { etiket: string; deger: number } => r.deger !== undefined);
  if (seri.length < 13) return { ok: false, hata: 'okunamadi' };
  const son = seri[seri.length - 1];
  const yilOnce = seri[seri.length - 13];
  if (!(yilOnce.deger > 0)) return { ok: false, hata: 'okunamadi' };
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

const tufeVeriMi = (v: unknown): v is TufeVeri =>
  !!v && typeof (v as TufeVeri).annualPct === 'number' && Number.isFinite((v as TufeVeri).annualPct);
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
      const a = tufeAyristir(r.veri);
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
    if (typeof pct !== 'number' || !Number.isFinite(pct) || typeof eski?.storedAt !== 'number' || !Number.isFinite(eski.storedAt)) return 'taninmadi';
    const donem = typeof eski.reading?.periodLabel === 'string' && eski.reading.periodLabel ? eski.reading.periodLabel : undefined;
    const yeni = JSON.stringify({ surum: 1, kaynak: 'tcmb', donem, alindi: new Date(eski.storedAt).toISOString(), veri: { annualPct: pct } });
    const yazildi = await depo.addIfAbsent(ONBELLEK_ANAHTARLARI.tcmbTufe, yeni);
    if (!yazildi.ok) return 'taninmadi';
    if (!yazildi.value) return 'mevcut'; // yeni kayıt zaten var: ezilmez, eski kayıt da silinmez
    await depo.deleteIfEquals(ESKI_TUFE_ANAHTARI, e.value);
    return 'tasindi';
  } catch { return 'taninmadi'; }
}
