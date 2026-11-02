// BİST gün sonu kapanış tablosu — sunucu tarafı geçiş ucu İSKELETİ. Vercel: api/bist.mjs bunu bağlar; Netlify: Function (v2).
//
// KAYNAK (kullanıcı kararı K2): Borsa İstanbul resmî "Günlük Bülten". Gün içi/anlık fiyat ÇEKİLMEZ (AGENTS.md §0.4).
//
// DURUM: BÜLTEN DOSYA BİÇİMİ DOĞRULANMADI (PDF mi, zip/CSV mi, adı ne; bu ortamdan borsaistanbul.com'a erişim yok).
//   - Ayrıştırıcı kaydı BOŞTUR (BIST_AYRISTIRICILAR): biçim doğrulanana kadar uç `okunamadi` döner (istemcide veri_yok);
//     hiçbir fiyat uydurulmaz. PDF ya da zip çıkarsa ayrıştırıcı kütüphane gerekir: Üst Kurul talebi
//     (docs/teknoloji-talepleri.md "beklemede"); burada bağımlılık eklenmez, karar verilmez.
//   - KEŞİF MODU (U5): sunucu ortam değişkeni FAGENT_BIST_KESIF=on iken uç, normal veri yerine sabit bülten adresinden YALNIZ
//     durum kodu, content-type, boyut ve ilk 512 baytın güvenli özetini döndürür. İstemci parametresi yoktur.
//   - Kazıma bayrağı FAGENT_KAZIMA=on yoksa 503 `kapali`; yukarı akışa HİÇ gidilmez (canlıda varsayılan).
//   - Kullanıcı verisi taşımaz: istek parametresiz ve sabit (her sorgu parametresi 400); portföye göre süzme TARAYICIDA.
//   - Dürüst kimlik (FAGENT/1.0), yönlendirme izlenmez, aynı anda 1 istek, iki istek arası >= 60 sn, devre kesici, 429'da bekleme.
//
// TODO(hukuk): BİST verisi lisanslı dağıtıcılar üzerinden yayılır; bültenin üçüncü taraf/ücretli üründe gösterimi, otomatik okuma
//   izni ve kullanım koşulları birincil metinle doğrulanmadı. Satışta alıcıya açıklanır. Lisans gerekirse kaynak tek satırla kapatılır.

import {
  json, createIstemciSiniri, createDevreKesici, sinirliOku, yukariAkisaGit, ilkBaytlariOku,
  kazimaAcikMi, kazimaOrtamiUygunMu, kullaniciKimligi, retryAfterMs,
} from '../ortak/sunucu-ortak.mjs';

const BULTEN_ADRES = 'https://www.borsaistanbul.com/veriler/gunluk-bulten'; // DOĞRULANMADI: bülten sayfası; dosya adresi keşifle öğrenilecek
const MAKS_GOVDE_BAYT = 2 * 1024 * 1024;
const MAKS_SATIR = 3000;
const KESIF_BAYT = 512;
const YUKARI_AKIS_ARALIGI_MS = 60_000;
const DEVRE_SURE_MS = 15 * 60_000;
const TSI_FARK_MS = 3 * 3600_000;              // Türkiye UTC+3 (yaz saati yok)
const BULTEN_DK = 19 * 60 + 30;                // hafta içi 19:30 TSİ'den sonra o günün bülteni beklenir
const CDN_EN_AZ_SN = 900;                      // bülten bulunamadı/eski: 15 dk
const CDN_EN_COK_SN = 86_400;                  // en çok 24 saat

export const BIST_SABITLERI = Object.freeze({ BULTEN_ADRES, MAKS_GOVDE_BAYT, MAKS_SATIR, KESIF_BAYT, YUKARI_AKIS_ARALIGI_MS, DEVRE_SURE_MS });

export function kesifAcikMi(env, context) {
  if (!kazimaOrtamiUygunMu(env, context)) return false;
  const v = String(env?.FAGENT_BIST_KESIF ?? '').trim().toLowerCase();
  return v === 'on' || v === 'acik';
}

/* ───────────── Gün sonu penceresi ve önbellek süresi (SUNUCU kurar) ───────────── */

const p2 = (n) => String(n).padStart(2, '0');
const isoGun = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const haftaSonu = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

// Şu an beklenen en son bülten tarihi (Türkiye takvimi): hafta içi 19:30'dan sonra bugün, yoksa önceki iş günü.
// Resmî tatil takvimi TUTULMAZ (doğrulanamadı); kod bültenin kendi tarihine güvenir.
export function beklenenBultenTarihi(simdiMs) {
  const t = new Date(simdiMs + TSI_FARK_MS);
  let gun = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const dk = t.getUTCHours() * 60 + t.getUTCMinutes();
  if (haftaSonu(gun) || dk < BULTEN_DK) gun = new Date(gun.getTime() - 86_400_000);
  while (haftaSonu(gun)) gun = new Date(gun.getTime() - 86_400_000);
  return isoGun(gun);
}

// Bülten güncelse sonraki iş günü 19:30'a kadar (en çok 24 sa); eski/yoksa 15 dk.
export function bistCdnSaniye(simdiMs, bultenTarihi, beklenen) {
  if (!bultenTarihi || bultenTarihi < beklenen) return CDN_EN_AZ_SN;
  const t = new Date(simdiMs + TSI_FARK_MS);
  let aday = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 19, 30) - TSI_FARK_MS;
  if (aday <= simdiMs) aday += 86_400_000;
  while (haftaSonu(new Date(aday + TSI_FARK_MS))) aday += 86_400_000;
  return Math.min(CDN_EN_COK_SN, Math.max(CDN_EN_AZ_SN, Math.floor((aday - simdiMs) / 1000)));
}

/* ───────────── Biçim tanıma ve keşif özeti (SAF) ───────────── */

// İlk baytlardan biçim etiketi: 'pdf' | 'zip' | 'html' | 'metin' | 'bilinmiyor'. Yalnız sabit etiketler döner.
export function bicimTaniBayt(b) {
  const ascii = (i, s) => s.split('').every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 4 && ascii(0, '%PDF')) return 'pdf';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  const bas = Array.from(b.subarray(0, 64), (x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : ' ')).join('').trim().toLowerCase();
  if (bas.startsWith('<!doctype') || bas.startsWith('<html') || bas.startsWith('<?xml')) return 'html';
  if (b.length > 0 && Array.from(b.subarray(0, 256)).every((x) => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127) || x >= 128)) return 'metin';
  return 'bilinmiyor';
}

export function bicimTani(metin) {
  return bicimTaniBayt(new TextEncoder().encode(String(metin).slice(0, 512)));
}

// Baytları yalnız yazdırılabilir ASCII'ye indirger (diğerleri '.'), satır sonları boşluk olur.
export function guvenliOzet(b) {
  return Array.from(b, (x) => (x === 9 || x === 10 || x === 13 ? ' ' : x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('');
}

const contentTypeTemiz = (v) => {
  const s = String(v ?? '').trim().slice(0, 100);
  return /^[\w/;=.+\- ,"]*$/.test(s) ? s : '?';
};

/* ───────────── Ayrıştırıcı arayüzü ───────────── */

// Bir ayrıştırıcı: { ad, taniyabilir(metin): boolean, ayristir(metin): { tarih: 'YYYY-AA-GG', satirlar: [{ kod, kapanis }] } | undefined }.
// KAYIT BOŞ: bülten biçimi doğrulanmadığı için hiçbir gerçek ayrıştırıcı yok. Doğrulanınca buraya eklenir (gerçek yanıtlı fikstürle).
export const BIST_AYRISTIRICILAR = Object.freeze([]);

const KOD_RE = /^[A-Z0-9]{3,6}$/;

// Dönüş: { ok: true, tarih, satirlar } | { ok: false, neden }. Ayrıştırıcı çıktısı DOĞRULANIR (kod biçimi, pozitif sonlu kapanış,
// gerçek ve gelecek olmayan tarih, satır sınırı); bozuksa ok:false.
export function bistAyristir(metin, ayristiricilar = BIST_AYRISTIRICILAR, simdiMs) {
  const a = ayristiricilar.find((x) => { try { return x.taniyabilir(metin); } catch { return false; } });
  if (!a) return { ok: false, neden: 'bicim_dogrulanmadi' };
  let r;
  try { r = a.ayristir(metin); } catch { r = undefined; }
  if (!r || typeof r.tarih !== 'string' || !Array.isArray(r.satirlar)) return { ok: false, neden: 'sema' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.tarih);
  if (!m) return { ok: false, neden: 'tarih' };
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (dt.getUTCFullYear() !== +m[1] || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) return { ok: false, neden: 'tarih' };
  // Gelecek tarihli bülten gerçek olamaz: Türkiye takvimine göre bugünden ilerisi reddedilir.
  if (simdiMs !== undefined && r.tarih > isoGun(new Date(simdiMs + TSI_FARK_MS))) return { ok: false, neden: 'tarih' };
  if (r.satirlar.length > MAKS_SATIR) return { ok: false, neden: 'cok_satir' };
  const goruldu = new Set();
  const satirlar = [];
  for (const s of r.satirlar) {
    if (!s || typeof s.kod !== 'string' || !KOD_RE.test(s.kod) || goruldu.has(s.kod)) continue;
    if (typeof s.kapanis !== 'number' || !Number.isFinite(s.kapanis) || !(s.kapanis > 0) || s.kapanis >= 1e6) continue;
    goruldu.add(s.kod);
    satirlar.push({ kod: s.kod, kapanis: s.kapanis });
  }
  if (r.satirlar.length > 0 && satirlar.length === 0) return { ok: false, neden: 'sema' };
  return { ok: true, tarih: r.tarih, satirlar };
}

/* ───────────── İşleyici ───────────── */

export function createBistHandler({
  fetchFn = (...a) => globalThis.fetch(...a),
  env = process.env,
  simdi = () => Date.now(),
  platform = 'netlify',
  ayristiricilar = BIST_AYRISTIRICILAR, // test enjeksiyonu; üretimde boş kayıt
} = {}) {
  const istemciSiniriAsildi = createIstemciSiniri({ simdi, platform });
  const devre = createDevreKesici({ simdi, sureMs: DEVRE_SURE_MS });
  const son = {};   // mod -> { t, status, body, headers }: iki yukarı akış isteği arası >= 60 sn, sonuç paylaşılır
  const suren = {}; // mod -> süren istek (aynı anda en çok 1)
  const yanit = (r) => json(r.body, r.status, r.headers);
  const hatali = (status, error, message, headers = {}, ek = {}) => ({ status, body: { error, ...ek, message }, headers });

  // Ortak: ağ hatası / 429 / 5xx / 4xx eşlemesi. Hata değilse undefined döner.
  async function hataYaniti(g) {
    if (g.hata) {
      devre.hata();
      return g.hata === 'zaman_asimi'
        ? hatali(502, 'zaman_asimi', 'Borsa İstanbul zamanında yanıt vermedi.')
        : hatali(502, 'ulasilamadi', 'Borsa İstanbul servisine ulaşılamadı.');
    }
    const res = g.res;
    if (res.status === 429) {
      const kucuk = await sinirliOku(res, 4096).catch(() => undefined);
      const ms = retryAfterMs(res, kucuk, simdi());
      devre.ac(ms);
      return hatali(429, 'sinir_asildi', 'Borsa İstanbul şu an istek kabul etmiyor.', { 'retry-after': String(Math.ceil(ms / 1000)) });
    }
    if (!res.ok) {
      if (res.status >= 500) { devre.hata(); return hatali(502, 'kaynak_hatasi', 'Borsa İstanbul şu an yanıt vermiyor.'); }
      return hatali(502, 'kaynak_reddetti', 'Borsa İstanbul isteği kabul etmedi.');
    }
    return undefined;
  }

  const istekBasliklari = () => ({ 'user-agent': kullaniciKimligi(env), accept: 'text/csv, text/plain, */*' });

  async function kesifYap() {
    const g = await yukariAkisaGit(fetchFn, BULTEN_ADRES, { method: 'GET', headers: istekBasliklari() });
    if (g.hata) {
      devre.hata();
      return hatali(502, g.hata, 'Borsa İstanbul servisine ulaşılamadı.');
    }
    const res = g.res;
    if (res.status === 429) { const h = await hataYaniti(g); return h; }
    const bayt = await ilkBaytlariOku(res, KESIF_BAYT).catch(() => new Uint8Array(0));
    const uzunluk = Number(res.headers.get('content-length'));
    // 4xx/5xx başarı sayılmaz (devre kesici hata sayar); keşif özeti yine de döner (durum kodu keşfin konusu).
    if (res.ok) devre.basari(); else devre.hata();
    return {
      status: 200,
      body: {
        kesif: true,
        adres: BULTEN_ADRES,
        durum: res.status,
        contentType: contentTypeTemiz(res.headers.get('content-type')),
        boyut: Number.isSafeInteger(uzunluk) && uzunluk >= 0 && res.headers.get('content-length') !== null ? uzunluk : null,
        imza: bicimTaniBayt(bayt),
        ilkBayt: bayt.length,
        hex16: Array.from(bayt.subarray(0, 16), (x) => x.toString(16).padStart(2, '0')).join(' '),
        ozet: guvenliOzet(bayt),
      },
      headers: { 'cache-control': 'no-store' },
    };
  }

  async function bultenGetir() {
    // Ayrıştırıcı kaydı boşsa (biçim doğrulanmadı) sonuç baştan bellidir: Borsa İstanbul'a GİDİLMEZ (gereksiz indirme yok).
    if (ayristiricilar.length === 0) return hatali(502, 'okunamadi', 'Borsa İstanbul bülteni okunamadı.', {}, { bicim: 'bilinmiyor', neden: 'bicim_dogrulanmadi' });
    const g = await yukariAkisaGit(fetchFn, BULTEN_ADRES, { method: 'GET', headers: istekBasliklari() });
    const h = await hataYaniti(g);
    if (h) return h;
    let metin;
    try { metin = await sinirliOku(g.res, MAKS_GOVDE_BAYT); } catch { metin = undefined; }
    if (metin === undefined) return hatali(502, 'okunamadi', 'Borsa İstanbul yanıtı okunamadı.', {}, { bicim: 'bilinmiyor' });
    const bicim = bicimTani(metin);
    const a = bistAyristir(metin, ayristiricilar, simdi());
    if (!a.ok) {
      // Biçim etiketi sabit bir listeden; ham içerik yanıta GİRMEZ. Beklenen durum (biçim doğrulanmadı) arıza sayılmaz.
      return hatali(502, 'okunamadi', 'Borsa İstanbul bülteni okunamadı.', {}, { bicim, neden: a.neden });
    }
    devre.basari();
    const beklenen = beklenenBultenTarihi(simdi());
    return {
      status: 200,
      body: { tarih: a.tarih, beklenen, satirlar: a.satirlar },
      headers: { 'cache-control': `public, max-age=0, s-maxage=${bistCdnSaniye(simdi(), a.tarih, beklenen)}, stale-while-revalidate=300` },
    };
  }

  return async (req, context) => {
    if (!kazimaAcikMi(env, context)) return json({ error: 'kapali', message: 'BİST okuma bu sunucuda etkin değil.' }, 503);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json({ error: 'yontem_yok', message: 'Yalnızca GET kabul edilir.' }, 405, { allow: 'GET, HEAD' });
    }
    if ([...new URL(req.url).searchParams.keys()].length > 0) {
      return json({ error: 'gecersiz_parametre', message: 'Bu uç parametre kabul etmez.' }, 400);
    }
    if (istemciSiniriAsildi(req)) {
      return json({ error: 'sinir_asildi', message: 'Çok sık istek; biraz sonra tekrar denenecek.' }, 429, { 'retry-after': '60' });
    }

    const mod = kesifAcikMi(env, context) ? 'kesif' : 'veri';
    if (son[mod] && simdi() - son[mod].t < YUKARI_AKIS_ARALIGI_MS) return yanit(son[mod]);
    if (suren[mod]) return yanit(await suren[mod]);
    if (devre.acikMi()) return json({ error: 'ulasilamadi', message: 'Borsa İstanbul servisine ulaşılamadı.' }, 502, { 'retry-after': '60' });

    suren[mod] = (mod === 'kesif' ? kesifYap() : bultenGetir())
      .catch(() => hatali(502, 'ulasilamadi', 'Borsa İstanbul servisine ulaşılamadı.'))
      .then((r) => ({ ...r, t: simdi() }));
    try {
      son[mod] = await suren[mod];
      return yanit(son[mod]);
    } finally {
      suren[mod] = undefined;
    }
  };
}

export default createBistHandler();

export const config = { path: '/.netlify/functions/bist' };
