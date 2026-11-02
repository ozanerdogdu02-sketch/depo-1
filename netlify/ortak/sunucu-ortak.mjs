// Sunucu ucu ortak parçaları (EVDS, KAP ve ileride BİST için). TEK KAYNAK: davranış netlify/functions/evds.mjs'ten
// AYNEN taşındı (tests/unit/evds-sunucu.test.ts değişmeden yeşil kalır).
//
// Konum: netlify/ortak/ — bilerek netlify/functions/ DIŞINDA. Netlify functions klasöründeki alt klasörleri
// fonksiyon adayı sayabilir, Vercel ise api/ altındaki dosyaları fonksiyon yapar; ikisi de buradan içe aktarım
// yoluyla paketler, ayrı bir uç oluşmaz. Yalnızca saf JS: ağ, ortam okuma ve kullanıcı verisi YOK.

/* ───────────── JSON yanıtı ───────────── */

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...(status === 200 ? {} : { 'cache-control': 'no-store' }),
      ...extraHeaders,
    },
  });
}

/* ───────────── İstemci kimliği ───────────── */

// İstemci kimliği YALNIZ çalışılan platformun kendi koyduğu başlıklardan alınır; x-forwarded-for ASLA kullanılmaz
// (istemci sahteleyebilir). Öbür platformun başlığı YOK SAYILIR: Vercel'de istemci sahte x-nf-client-connection-ip
// gönderip kovasını değiştiremez, Netlify'da sahte x-real-ip işe yaramaz.
// Başlık yoksa tek ortak 'bilinmeyen' kovası: bu yalnız Vercel/Netlify dışı ya da yerel ortamda olur; üretimde başlık her zaman vardır.
// Yalnızca bellekte, 1 dk; kaydedilmez/loglanmaz.
// TODO(hukuk): hız sınırı için IP adresi kısa süreli bellekte tutulur; aydınlatma metninde belirtildi, avukat teyidi gerekir.
export function istemciKimligi(headers, platform = 'netlify') {
  const aday = platform === 'vercel'
    ? (headers.get('x-real-ip') ?? headers.get('x-vercel-forwarded-for'))
    : headers.get('x-nf-client-connection-ip');
  const k = (aday ?? '').split(',')[0].trim().slice(0, 64);
  return k || 'bilinmeyen';
}

/* ───────────── İstemci başına hız sınırı ───────────── */

export const ISTEMCI_PENCERE_MS = 60_000;
export const ISTEMCI_MAKS_ISTEK = 30;       // pencere başına istemci
export const ISTEMCI_MAKS_KAYIT = 1000;     // bellek sınırı

// Örnek başına bellekte (sunucusuz ortamda örnekler arası paylaşılmaz = en iyi çaba).
// Dönen işlev: istek sınırı AŞTIYSA true.
export function createIstemciSiniri({
  simdi, platform = 'netlify',
  pencereMs = ISTEMCI_PENCERE_MS, maksIstek = ISTEMCI_MAKS_ISTEK, maksKayit = ISTEMCI_MAKS_KAYIT,
}) {
  const istemciler = new Map(); // anahtar -> { bas, sayi }; Map ekleme sırası = en eski önce
  return (req) => {
    const anahtar = istemciKimligi(req.headers, platform);
    const t = simdi();
    const k = istemciler.get(anahtar);
    if (!k || t - k.bas >= pencereMs) {
      istemciler.delete(anahtar); // yeniden eklenince sona (en yeni) geçer
      // Tablo doluysa en eski kaydı at (tümünü silmek saldırganın başkalarının sayaçlarını sıfırlamasına yol açardı).
      while (istemciler.size >= maksKayit) istemciler.delete(istemciler.keys().next().value);
      istemciler.set(anahtar, { bas: t, sayi: 1 });
      return false;
    }
    k.sayi += 1;
    return k.sayi > maksIstek;
  };
}

/* ───────────── Devre kesici ───────────── */

export const DEVRE_ESIK = 3;          // ardışık yukarı akış hatası (ağ, zaman aşımı, 5xx)
export const DEVRE_SURE_MS = 60_000;

// Yalnız GERÇEK yukarı akış arızaları `hata()` ile sayılır: ağ hatası, zaman aşımı, 5xx. Yukarı akış 4xx ve
// beklenmedik gövde sayılmaz. `ac(ms)`: kaynak kendisi bekleme istedi (429 Retry-After) -> hemen aç.
export function createDevreKesici({ simdi, esik = DEVRE_ESIK, sureMs = DEVRE_SURE_MS }) {
  let ardisik = 0;
  let acilis;
  let sure = sureMs;
  return {
    acikMi() {
      if (acilis !== undefined && simdi() - acilis < sure) return true;
      acilis = undefined;
      return false;
    },
    hata() {
      ardisik += 1;
      if (ardisik >= esik) { acilis = simdi(); sure = sureMs; ardisik = 0; }
    },
    ac(ms) { acilis = simdi(); sure = ms; ardisik = 0; },
    basari() { ardisik = 0; },
  };
}

/* ───────────── Sınırlı gövde okuma ───────────── */

// Gövdeyi bayt sınırıyla okur: content-length büyükse hiç okumaz; akış sırasında sınırı aşarsa keser.
export async function sinirliOku(res, maks) {
  const bildirilen = Number(res.headers.get('content-length'));
  if (Number.isFinite(bildirilen) && bildirilen > maks) return undefined;
  if (!res.body) {
    const metin = await res.text();
    return new TextEncoder().encode(metin).length <= maks ? metin : undefined;
  }
  const okuyucu = res.body.getReader();
  const parcalar = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    toplam += value.byteLength;
    if (toplam > maks) { await okuyucu.cancel().catch(() => {}); return undefined; }
    parcalar.push(value);
  }
  const tum = new Uint8Array(toplam);
  let konum = 0;
  for (const c of parcalar) { tum.set(c, konum); konum += c.byteLength; }
  return new TextDecoder().decode(tum);
}

/* ───────────── Yukarı akışa tek istek ───────────── */

// Zaman aşımı istemcinin zaman aşımından (5 sn) kısa tutulur ki istemci sunucunun yanıtını alabilsin.
export const UPSTREAM_ZAMAN_ASIMI_MS = 4000;

// Dönüş: { res } ya da { hata: 'zaman_asimi' | 'ulasilamadi' }. Yönlendirme izlenmez (redirect:'error').
export async function yukariAkisaGit(fetchFn, url, init = {}, zamanAsimiMs = UPSTREAM_ZAMAN_ASIMI_MS) {
  try {
    const res = await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(zamanAsimiMs),
      redirect: 'error',
    });
    return { res };
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) return { hata: 'zaman_asimi' };
    return { hata: 'ulasilamadi' };
  }
}

/* ───────────── Kazıma uçları için ortak (KAP, BİST) ───────────── */

export const KULLANICI_KIMLIGI = 'FAGENT/1.0';

// Kazıma bayrağı: sunucu ortam değişkeni FAGENT_KAZIMA=on (ya da acik). Yoksa kapalı (canlıda varsayılan).
// VARSAYILAN RET (allow-list): kazıma YALNIZ ortam AÇIKÇA önizleme/geliştirme ise ve bayrak açıksa çalışır. Ortam bilinmiyorsa
// (VERCEL_ENV boş, Netlify bağlamı yok) ÜRETİM sayılır ve kapalı kalır. Bayrak production'a yanlışlıkla eklense de açılmaz.
// Ortam: VERCEL_ENV (Vercel) > Netlify v2 ikinci argüman `context.deploy.context` > env.CONTEXT (Netlify).
// Satış sonrası alıcı bu kilidi bilinçli kaldırır (docs/devir/kurulum-ve-devir.md). Netlify çalışma anında DOĞRULANMADI.
export const KAZIMA_IZINLI_ORTAMLAR = Object.freeze(['preview', 'deploy-preview', 'branch-deploy', 'development', 'dev']);

const ortamDegerleri = (env, context) => [env?.VERCEL_ENV, context?.deploy?.context, env?.CONTEXT]
  .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : '')).filter(Boolean);

// Kaynaklardan HEPSİ izinli olmalı (biri 'production' ya da bilinmeyense kapalı) ve en az biri dolu olmalı (hiçbiri yoksa üretim sayılır).
export function kazimaOrtamiUygunMu(env, context) {
  const d = ortamDegerleri(env, context);
  return d.length > 0 && d.every((v) => KAZIMA_IZINLI_ORTAMLAR.includes(v));
}

export function kazimaAcikMi(env, context) {
  if (!kazimaOrtamiUygunMu(env, context)) return false;
  const v = String(env?.FAGENT_KAZIMA ?? '').trim().toLowerCase();
  return v === 'on' || v === 'acik';
}

// Dürüst kimlik: yalnız ürün adı/sürüm; FAGENT_ILETISIM güvenli karakterlerdeyse eklenir. Tarayıcı taklidi YOK.
export function kullaniciKimligi(env) {
  const il = String(env?.FAGENT_ILETISIM ?? '').trim();
  return /^[\w@.:/+\- ]{3,100}$/.test(il) ? `${KULLANICI_KIMLIGI} (+${il})` : KULLANICI_KIMLIGI;
}

export const RETRY_AFTER_MIN_MS = 60_000;
export const RETRY_AFTER_MAX_MS = 15 * 60_000;

// 429 bekleme süresi (ms), [60 sn, 15 dk] aralığına sıkıştırılır. Retry-After iki biçimde gelebilir:
// saniye sayısı ya da HTTP-tarih ("Wed, 21 Oct 2026 07:28:00 GMT"). Başlık yoksa gövdedeki {"retryAfter": sn} okunur.
export function retryAfterMs(res, govdeMetni, simdiMs = Date.now()) {
  let ms = NaN;
  const baslik = (res.headers.get('retry-after') ?? '').trim();
  if (/^\d{1,9}$/.test(baslik)) ms = Number(baslik) * 1000;
  else if (baslik) {
    const t = Date.parse(baslik); // HTTP-tarih; çözülemezse NaN
    if (Number.isFinite(t)) ms = t - simdiMs;
  }
  if (!(ms > 0)) {
    try { const sn = Number(JSON.parse(govdeMetni ?? '')?.retryAfter); ms = Number.isFinite(sn) && sn > 0 ? sn * 1000 : NaN; } catch { ms = NaN; }
  }
  if (!(ms > 0)) ms = RETRY_AFTER_MIN_MS;
  return Math.min(RETRY_AFTER_MAX_MS, Math.max(RETRY_AFTER_MIN_MS, ms));
}

// Gövdenin yalnız İLK `n` baytını okur, akışı keser (keşif modu için; gerisi indirilmez).
export async function ilkBaytlariOku(res, n) {
  if (!res.body) return new Uint8Array(0);
  const okuyucu = res.body.getReader();
  const cikis = new Uint8Array(n);
  let dolu = 0;
  while (dolu < n) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    const al = Math.min(value.byteLength, n - dolu);
    cikis.set(value.subarray(0, al), dolu);
    dolu += al;
  }
  await okuyucu.cancel().catch(() => {});
  return cikis.subarray(0, dolu);
}
