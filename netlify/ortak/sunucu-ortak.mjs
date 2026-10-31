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
