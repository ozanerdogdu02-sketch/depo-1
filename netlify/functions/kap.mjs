// KAP bildirim META listesi — sunucu tarafı geçiş ucu. Vercel: api/kap.mjs bunu bağlar; Netlify: Function (v2).
//
// KAZIMA (kullanıcı kararı 2026-10-27; AGENTS.md §0.4): KAP'ın resmî/belgelenmiş bir API'si yok; sitenin herkese açık
// iç ucu okunur. Bu yüzden:
//   - Varsayılan KAPALI: sunucu ortam değişkeni FAGENT_KAZIMA=on yoksa 503 `kapali`, yukarı akışa HİÇ gidilmez.
//   - Dürüst kimlik: User-Agent "FAGENT/1.0"; tarayıcı taklidi YOK. Güvenlik duvarı reddederse KAP bölümü
//     "ulaşılamadı" der (kaynak_reddetti / okunamadi); engel aşılmaz.
//   - Kullanıcı verisi taşımaz: istek PARAMETRESİZ ve sabittir (her sorgu parametresi 400). Tarih penceresini sunucu
//     kurar, portföye göre süzme TARAYICIDA yapılır (src/kaynaklar/kap.ts). Sembol/portföy sunucuya hiç gitmez.
//   - Yalnız META: şirket kodu, unvan, başlık, tarih, tür, bildirim no. Bildirim özeti/metni/eki alınmaz ve yanıta girmez.
//   - Kibar kullanım: örnek başına aynı anda 1 istek (süren istek paylaşılır), iki yukarı akış isteği arası >= 60 sn
//     (son sonuç paylaşılır), 429'da devre Retry-After kadar açılır, CDN önbelleği (seans içi 15 dk, dışı 1 saat).
//
// DOĞRULAMA SINIRI: bu ortamdan kap.org.tr'ye erişim yok. Uç adresi, gövde alanları ve yanıt alanları üç açık kaynak
// kütüphanenin KAYNAK KODUNDAN çıkarıldı (docs/veri-akisi/kap-bist-erisim.md §2); gerçek yanıtla DOĞRULANMADI.
// Gövdedeki `memberType` değeri dâhil. Şema tutmazsa `okunamadi` döner; sayı uydurulmaz.
//
// TODO(hukuk): KAP kullanım koşulları ve robots.txt birincil metinle okunmadı; ticari/abonelikli üründe gösterim,
//   otomatik okuma izni ve kaynak gösterme biçimi açık madde (satışta alıcıya açıklanır). Hız sınırı IP'si: bkz. sunucu-ortak.mjs.

import {
  json, createIstemciSiniri, createDevreKesici, sinirliOku, yukariAkisaGit,
} from '../ortak/sunucu-ortak.mjs';

/* ───────────── Sabitler (seans saatleri dâhil; tek yerde) ───────────── */

const KAP_URL = 'https://www.kap.org.tr/tr/api/disclosure/members/byCriteria';
const KAP_MEMBER_TYPE = 'IGS'; // DOĞRULANMADI (kap-client uç listesinde geçen tür kodu); U4'te gerçek yanıtla teyit.
const PENCERE_GUN = 2;                         // dün + bugün (yıl başında yalnız bugün: KAP aynı takvim yılı ister)
const MAKS_GOVDE_BAYT = 2 * 1024 * 1024;       // 2 MB (okumadan önce content-length, akışta sayaç)
const MAKS_SATIR = 500;
const YUKARI_AKIS_ARALIGI_MS = 60_000;         // iki yukarı akış isteği arası en az
const RETRY_AFTER_MIN_MS = 60_000;
const RETRY_AFTER_MAX_MS = 15 * 60_000;
const DEVRE_SURE_MS = 15 * 60_000;             // 3 ardışık ağ/zaman aşımı/5xx -> 15 dk
const TSI_FARK_MS = 3 * 3600_000;              // Türkiye UTC+3 (yaz saati yok)
const SEANS_BAS_SAAT = 9;                      // hafta içi 09:00–19:00 TSİ
const SEANS_BIT_SAAT = 19;
const CDN_SEANS_ICI_SN = 900;
const CDN_SEANS_DISI_SN = 3600;
const CDN_ESKI_SUNMA_SN = 300;                 // stale-while-revalidate
const KULLANICI_KIMLIGI = 'FAGENT/1.0';

export const KAP_SABITLERI = Object.freeze({
  KAP_URL, PENCERE_GUN, MAKS_GOVDE_BAYT, MAKS_SATIR, YUKARI_AKIS_ARALIGI_MS, DEVRE_SURE_MS,
  CDN_SEANS_ICI_SN, CDN_SEANS_DISI_SN, KULLANICI_KIMLIGI,
});

/* ───────────── Kazıma bayrağı ───────────── */

export function kazimaAcikMi(env) {
  const v = String(env?.FAGENT_KAZIMA ?? '').trim().toLowerCase();
  return v === 'on' || v === 'acik';
}

/* ───────────── Tarih penceresi ve önbellek süresi (SUNUCU kurar) ───────────── */

const p2 = (n) => String(n).padStart(2, '0');
const isoGun = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;

// [başlangıç, bitiş] "YYYY-AA-GG", Türkiye takvimi. Yıl başında başlangıç = bugün (aynı takvim yılı kısıtı).
export function kapPenceresi(simdiMs) {
  const t = new Date(simdiMs + TSI_FARK_MS);
  const bugun = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const bas = new Date(bugun.getTime() - (PENCERE_GUN - 1) * 86_400_000);
  return [bas.getUTCFullYear() === bugun.getUTCFullYear() ? isoGun(bas) : isoGun(bugun), isoGun(bugun)];
}

export function seansIciMi(simdiMs) {
  const t = new Date(simdiMs + TSI_FARK_MS);
  const gun = t.getUTCDay();
  const saat = t.getUTCHours();
  return gun >= 1 && gun <= 5 && saat >= SEANS_BAS_SAAT && saat < SEANS_BIT_SAAT;
}

export function cdnSaniye(simdiMs) {
  return seansIciMi(simdiMs) ? CDN_SEANS_ICI_SN : CDN_SEANS_DISI_SN;
}

/* ───────────── Ayrıştırıcı (SAF; alan adı farklılıklarına toleranslı) ───────────── */

const KOD_RE = /^[A-Z0-9]{3,6}$/;

// Kontrol karakterlerini boşluğa çevirir, boşlukları sıkıştırır, uzunluğu keser. Metin değilse undefined.
function metin(v, maks) {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maks);
  return s || undefined;
}

function bildirimNo(v) {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) return v;
  if (typeof v === 'string' && /^\d{1,12}$/.test(v.trim())) { const n = Number(v.trim()); return n > 0 ? n : undefined; }
  return undefined;
}

// İki biçim: "GG.AA.YYYY SS:DD:ss" ve "YYYY-AA-GG SS:DD:ss" (ayırıcı boşluk ya da T; saniye/saat isteğe bağlı).
// Türkiye saati varsayılır -> "YYYY-AA-GGTSS:DD:ss+03:00". Gerçek olmayan tarih/saat undefined.
export function kapZamanCoz(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  let y, mo, d, h = 0, mi = 0, sn = 0, m;
  if ((m = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s))) {
    d = +m[1]; mo = +m[2]; y = +m[3]; h = +(m[4] ?? 0); mi = +(m[5] ?? 0); sn = +(m[6] ?? 0);
  } else if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,3})?)?$/.exec(s))) {
    y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] ?? 0); mi = +(m[5] ?? 0); sn = +(m[6] ?? 0);
  } else return undefined;
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || sn > 59) return undefined;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(sn)}+03:00`;
}

function kodlariCoz(v) {
  const ham = Array.isArray(v) ? v.filter((x) => typeof x === 'string') : typeof v === 'string' ? v.split(/[,;\s]+/) : [];
  const cikis = [];
  for (const k of ham) {
    const kod = k.trim().toUpperCase();
    if (KOD_RE.test(kod) && !cikis.includes(kod)) cikis.push(kod);
    if (cikis.length >= 20) break;
  }
  return cikis;
}

function satirlariBul(govde) {
  if (Array.isArray(govde)) return govde;
  if (govde && typeof govde === 'object') {
    for (const ad of ['data', 'items', 'disclosures', 'result']) if (Array.isArray(govde[ad])) return govde[ad];
  }
  return undefined;
}

// Dönüş: { ok: true, items, kesildi } | { ok: false }. SADECE meta alanlar taşınır; `summary` vb. asla.
// Boş dizi geçerli (o pencerede bildirim yok). Satır sayılıp hiçbiri tanınmazsa şema tutmadı -> ok:false.
export function kapAyristir(govde) {
  const satirlar = satirlariBul(govde);
  if (!satirlar) return { ok: false };
  const gorulen = new Set();
  const items = [];
  for (const r of satirlar) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const no = bildirimNo(r.disclosureIndex);
    const zaman = kapZamanCoz(r.publishDate);
    const baslik = metin(r.subject, 300);
    if (no === undefined || zaman === undefined || baslik === undefined || gorulen.has(no)) continue;
    gorulen.add(no);
    const unvan = metin(r.memberTitle, 200) ?? metin(r.kapTitle, 200) ?? '';
    const sinifHam = typeof r.disclosureClass === 'string' ? r.disclosureClass.trim().toUpperCase() : '';
    const satir = { no, zaman, kodlar: kodlariCoz(r.stockCodes), unvan, baslik };
    if (/^[A-Z]{1,6}$/.test(sinifHam)) satir.sinif = sinifHam;
    if (r.isLate === true) satir.gec = true;
    if (r.isCorrective === true) satir.duzeltme = true;
    items.push(satir);
  }
  if (satirlar.length > 0 && items.length === 0) return { ok: false };
  items.sort((a, b) => (a.zaman < b.zaman ? 1 : a.zaman > b.zaman ? -1 : b.no - a.no));
  const kesildi = items.length > MAKS_SATIR;
  return { ok: true, items: kesildi ? items.slice(0, MAKS_SATIR) : items, kesildi };
}

/* ───────────── İşleyici ───────────── */

function kullaniciKimligi(env) {
  // İletişim yeri verilmişse eklenir (sunucu ortam değişkeni); yoksa yalnız ürün adı/sürüm. Güvenli karakterlerle sınırlı.
  const il = String(env?.FAGENT_ILETISIM ?? '').trim();
  return /^[\w@.:/+\- ]{3,100}$/.test(il) ? `${KULLANICI_KIMLIGI} (+${il})` : KULLANICI_KIMLIGI;
}

function retryAfterMs(res, govdeMetni) {
  let sn = Number(res.headers.get('retry-after'));
  if (!Number.isFinite(sn) || sn <= 0) {
    try { sn = Number(JSON.parse(govdeMetni ?? '')?.retryAfter); } catch { sn = NaN; }
  }
  const ms = Number.isFinite(sn) && sn > 0 ? sn * 1000 : RETRY_AFTER_MIN_MS;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, ms));
}

export function createKapHandler({
  fetchFn = (...a) => globalThis.fetch(...a),
  env = process.env,
  simdi = () => Date.now(),
  platform = 'netlify',
} = {}) {
  const istemciSiniriAsildi = createIstemciSiniri({ simdi, platform });
  const devre = createDevreKesici({ simdi, sureMs: DEVRE_SURE_MS });
  let sonSonuc;   // { t, status, body, headers }: iki yukarı akış isteği arası >= 60 sn; bu sürede aynı sonuç paylaşılır
  let suren;      // süren yukarı akış isteği (aynı anda en çok 1)

  const yanit = (r) => json(r.body, r.status, r.headers);

  async function yukariAkistanGetir() {
    const [fromDate, toDate] = kapPenceresi(simdi());
    // Sabit gövde: portföy/sembol/kullanıcı girdisi YOK. Alan listesi kütüphane kodundan; doğrulanmadı.
    const govde = JSON.stringify({ fromDate, toDate, memberType: KAP_MEMBER_TYPE, mkkMemberOidList: [], subjectList: [], disclosureClass: '' });
    const g = await yukariAkisaGit(fetchFn, KAP_URL, {
      method: 'POST',
      headers: { 'user-agent': kullaniciKimligi(env), accept: 'application/json', 'content-type': 'application/json' },
      body: govde,
    });
    if (g.hata) {
      devre.hata();
      return g.hata === 'zaman_asimi'
        ? { status: 502, body: { error: 'zaman_asimi', message: 'KAP zamanında yanıt vermedi.' }, headers: {} }
        : { status: 502, body: { error: 'ulasilamadi', message: 'KAP servisine ulaşılamadı.' }, headers: {} };
    }
    const res = g.res;
    if (res.status === 429) {
      // KAP'ın açık isteğine uyulur: Retry-After kadar hiç gidilmez, yeniden deneme yok.
      const kucuk = await sinirliOku(res, 4096).catch(() => undefined);
      const ms = retryAfterMs(res, kucuk);
      devre.ac(ms);
      return { status: 429, body: { error: 'sinir_asildi', message: 'KAP şu an istek kabul etmiyor.' }, headers: { 'retry-after': String(Math.ceil(ms / 1000)) } };
    }
    if (!res.ok) {
      // Ham hata gövdesi/durum kodu istemciye aktarılmaz (WAF sayfası olabilir).
      if (res.status >= 500) {
        devre.hata();
        return { status: 502, body: { error: 'kaynak_hatasi', message: 'KAP şu an yanıt vermiyor.' }, headers: {} };
      }
      return { status: 502, body: { error: 'kaynak_reddetti', message: 'KAP isteği kabul etmedi.' }, headers: {} };
    }
    let veri = null;
    try {
      const m = await sinirliOku(res, MAKS_GOVDE_BAYT);
      if (m !== undefined) veri = JSON.parse(m); // HTML (güvenlik duvarı sayfası) burada patlar -> okunamadi
    } catch { veri = null; }
    const a = veri === null ? { ok: false } : kapAyristir(veri);
    if (!a.ok) return { status: 502, body: { error: 'okunamadi', message: 'KAP yanıtı okunamadı.' }, headers: {} };

    devre.basari();
    const sn = cdnSaniye(simdi());
    return {
      status: 200,
      body: { items: a.items, ...(a.kesildi ? { kesildi: true } : {}), pencere: [fromDate, toDate] },
      headers: { 'cache-control': `public, max-age=0, s-maxage=${sn}, stale-while-revalidate=${CDN_ESKI_SUNMA_SN}` },
    };
  }

  return async (req) => {
    // Bayrak ÖNCE: kapalıyken hiçbir şey yapılmaz (yukarı akışa gidilmez, sayaç tutulmaz). Beklenen durum, arıza değil.
    if (!kazimaAcikMi(env)) {
      return json({ error: 'kapali', message: 'KAP okuma bu sunucuda etkin değil.' }, 503);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json({ error: 'yontem_yok', message: 'Yalnızca GET kabul edilir.' }, 405, { allow: 'GET, HEAD' });
    }
    if ([...new URL(req.url).searchParams.keys()].length > 0) {
      return json({ error: 'gecersiz_parametre', message: 'Bu uç parametre kabul etmez.' }, 400);
    }
    if (istemciSiniriAsildi(req)) {
      return json({ error: 'sinir_asildi', message: 'Çok sık istek; biraz sonra tekrar denenecek.' }, 429, { 'retry-after': '60' });
    }

    if (sonSonuc && simdi() - sonSonuc.t < YUKARI_AKIS_ARALIGI_MS) return yanit(sonSonuc);
    if (suren) return yanit(await suren);
    if (devre.acikMi()) {
      return json({ error: 'ulasilamadi', message: 'KAP servisine ulaşılamadı.' }, 502, { 'retry-after': '60' });
    }

    suren = yukariAkistanGetir()
      .catch(() => ({ status: 502, body: { error: 'ulasilamadi', message: 'KAP servisine ulaşılamadı.' }, headers: {} }))
      .then((r) => ({ ...r, t: simdi() }));
    try {
      sonSonuc = await suren;
      return yanit(sonSonuc);
    } finally {
      suren = undefined;
    }
  };
}

export default createKapHandler();

export const config = { path: '/.netlify/functions/kap' };
