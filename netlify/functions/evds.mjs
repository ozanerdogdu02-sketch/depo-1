// TCMB EVDS proxy'si — TEK KAYNAK. Vercel: api/evds.mjs bunu bağlar; Netlify: Function (v2).
//
// NEDEN SUNUCU TARAFI: EVDS bir API anahtarı ister. Bu projenin bir numaralı kuralı anahtarın
// istemci koduna girmemesidir (AGENTS.md §0). Anahtar burada, sunucu ortam değişkeninde
// durur ve tarayıcıya HİÇ inmez. İkinci fayda: isteği sunucu attığı için CORS sorunu hiç doğmaz.
//
// BOZULMAYAN İLKE: uygulama bu fonksiyon OLMADAN da tam çalışır. Anahtar tanımsızsa ya da TCMB
// yanıt vermezse burası düzgün bir hata döner, istemci (src/kaynaklar/tcmb.ts) sessizce elle girilen
// enflasyon varsayımına düşer. Hiçbir koşulda uydurma sayı üretilmez.
//
// İSTEK BİÇİMLERİ (kullanıcı verisi taşımaz; sembol/portföy listesi KABUL EDİLMEZ):
//   TÜFE: ?series=TP.FG.J0   (series beyaz listede olmalı)
//   Kur : ?tablo=kur         (seri listesi SUNUCUDA sabit)
//   Tarih aralığını SUNUCU kurar; başka her parametre (startDate/endDate dâhil) 400 ile reddedilir.
//
// DOĞRULAMA SINIRI: bu fonksiyon geliştirme ortamından gerçek EVDS'e karşı koşturulamadı (dış ağ yok,
// EVDS_API_KEY yok). Birim testler sahte fetch ile yazıldı; "gerçek ağda doğrulanmadı".
//
// TODO(hukuk): EVDS şartlarının ticari/abonelikli üründe gösterime izin verip vermediği birincil metinle doğrulanmadı.

import {
  json, istemciKimligi, createIstemciSiniri, createDevreKesici, sinirliOku, yukariAkisaGit,
} from '../ortak/sunucu-ortak.mjs';

// Test ve eski içe aktarımlar için aynı adla dışa aktarılır (asıl kod netlify/ortak/sunucu-ortak.mjs).
export { istemciKimligi };

const EVDS_BASE = 'https://evds2.tcmb.gov.tr/service/evds';

const SERIES_RE = /^[A-Z0-9]+(\.[A-Z0-9]+)+$/;

// Beyaz liste (yalnız bunlar yukarı akışa gider). Seri kodu birincil kaynakla doğrulanınca güncellenir.
// TODO(muhasebe): TP.FG.J0 gerçek yanıtla doğrulanmadı (anahtar gelince denenecek).
const IZINLI_SERILER = ['TP.FG.J0'];

// Kur serileri: BOŞ. DOĞRULANMADI — anahtar gelince EVDS arayüzünden / gerçek yanıtla denenecek.
// Boşken `tablo=kur` isteği 503 `seri_dogrulanmadi` döner; uydurma kod EKLENMEZ.
// Doldurulunca src/kaynaklar/tcmb.ts KUR_ALANLARI da aynı kodlarla doldurulur (alan adı: '.' -> '_').
// TODO(muhasebe): hangi kur (döviz alış / satış / efektif) esas alınacak karar bekliyor.
const KUR_SERILERI = [];

// SUNUCU TARİH PENCERESİ: istemci tarih GÖNDERMEZ; pencereyi sunucu kurar (TÜFE son ~14 ay, kur son 14 gün).
// Böylece URL kanonik kalır (CDN önbelleği parametreyle atlatılamaz) ve yukarı akışa keyfî aralık gitmez.
// Geriye uyumluluk: startDate/endDate/başka her parametre 400 ile reddedilir (eski paket yalnızca varsayıma düşer).
const TUFE_PENCERE_AY = 14;
const KUR_PENCERE_GUN = 14;
const IZINLI_PARAMETRELER = ['series', 'tablo'];

// Yukarı akış koruması (hız sınırı, devre kesici, zaman aşımı) netlify/ortak/sunucu-ortak.mjs içindedir.
const MAKS_GOVDE_BAYT = 512 * 1024;

const p2 = (n) => String(n).padStart(2, '0');
const evdsTarih = (d) => `${p2(d.getUTCDate())}-${p2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;

// Sunucu saatine göre sabit pencere. Dönüş: [başlangıç, bitiş] GG-AA-YYYY.
export function sunucuPenceresi(simdiMs, kurIstegi) {
  const bugun = new Date(simdiMs);
  const bas = kurIstegi
    ? new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth(), bugun.getUTCDate() - KUR_PENCERE_GUN))
    : new Date(Date.UTC(bugun.getUTCFullYear(), bugun.getUTCMonth() - TUFE_PENCERE_AY, 1));
  return [evdsTarih(bas), evdsTarih(bugun)];
}

// Test için enjekte edilebilir üretici. Varsayılan dışa aktarma gerçek ortamı kullanır.
export function createEvdsHandler({
  fetchFn = (...a) => globalThis.fetch(...a),
  env = process.env,
  simdi = () => Date.now(),
  kurSerileri = KUR_SERILERI,
  platform = 'netlify', // 'netlify' | 'vercel': hangi platform başlığına güvenileceği (api/evds.mjs 'vercel' verir)
} = {}) {
  const istemciSiniriAsildi = createIstemciSiniri({ simdi, platform });
  const devre = createDevreKesici({ simdi });

  return async (req) => {
    if (istemciSiniriAsildi(req)) {
      return json({ error: 'sinir_asildi', message: 'Çok sık istek; biraz sonra tekrar denenecek.' }, 429, { 'retry-after': '60' });
    }

    const url = new URL(req.url);
    for (const ad of url.searchParams.keys()) {
      if (!IZINLI_PARAMETRELER.includes(ad)) {
        return json({ error: 'gecersiz_parametre', message: 'Yalnızca series ya da tablo parametresi kabul edilir.' }, 400);
      }
    }
    const tablo = (url.searchParams.get('tablo') ?? '').trim().toLowerCase();
    const kurIstegi = tablo !== '';

    let series;
    if (kurIstegi) {
      if (tablo !== 'kur' || url.searchParams.has('series')) {
        return json({ error: 'gecersiz_tablo', message: 'Bu tablo desteklenmiyor.' }, 400);
      }
    } else {
      series = (url.searchParams.get('series') ?? '').trim().toUpperCase();
      if (!SERIES_RE.test(series) || series.length > 64) {
        return json({ error: 'gecersiz_seri', message: 'Seri kodu biçimi geçersiz.' }, 400);
      }
      if (!IZINLI_SERILER.includes(series)) {
        return json({ error: 'gecersiz_seri', message: 'Bu seri kodu desteklenmiyor.' }, 400);
      }
    }

    const key = env.EVDS_API_KEY;
    if (!key) {
      // Anahtar tanımlı değil — bu bir ÇÖKME değil, beklenen bir durum. İstemci varsayıma düşer.
      return json(
        { error: 'anahtar_yok', message: 'EVDS anahtarı tanımlı değil; canlı enflasyon kapalı.' },
        503,
      );
    }
    if (kurIstegi && kurSerileri.length === 0) {
      return json({ error: 'seri_dogrulanmadi', message: 'Kur serisi henüz doğrulanmadı; kur kapalı.' }, 503);
    }

    // Devre kesici: yukarı akış üst üste hata verdiyse kısa süre ona gidilmez (hem TCMB'ye hem bize yük bindirmez).
    if (devre.acikMi()) {
      return json({ error: 'ulasilamadi', message: 'TCMB EVDS servisine ulaşılamadı.' }, 502, { 'retry-after': '60' });
    }

    const [startDate, endDate] = sunucuPenceresi(simdi(), kurIstegi);
    const seriParam = kurIstegi ? kurSerileri.join('-') : series;
    const upstream = `${EVDS_BASE}/series=${encodeURIComponent(seriParam)}`
      + `&startDate=${encodeURIComponent(startDate)}`
      + `&endDate=${encodeURIComponent(endDate)}`
      + `&type=json`;

    // Yalnız GERÇEK yukarı akış arızaları sayılır: ağ hatası, zaman aşımı, 5xx. Yukarı akış 4xx ve
    // beklenmedik gövde sayılmaz (bizim isteğimizin/anahtarın sorunu olabilir; devreyi açmak yardım etmez).
    const g = await yukariAkisaGit(fetchFn, upstream, { headers: { key, accept: 'application/json' } });
    if (g.hata) {
      devre.hata();
      return g.hata === 'zaman_asimi'
        ? json({ error: 'zaman_asimi', message: 'TCMB EVDS zamanında yanıt vermedi.' }, 502)
        : json({ error: 'ulasilamadi', message: 'TCMB EVDS servisine ulaşılamadı.' }, 502);
    }
    const res = g.res;

    if (!res.ok) {
      // TCMB'nin ham hata gövdesini ve durum kodunu istemciye AKTARMIYORUZ — içinde anahtarı yankılayan ya da
      // altyapı bilgisi sızdıran bir metin olabilir. Sade ve sabit bir mesaj döner.
      if (res.status >= 500) {
        devre.hata();
        return json({ error: 'kaynak_hatasi', message: 'TCMB EVDS şu an yanıt vermiyor.' }, 502);
      }
      return json({ error: 'kaynak_reddetti', message: 'TCMB EVDS isteği kabul etmedi.' }, 502);
    }

    // Gövde okuma: akış hatası (zaman aşımı, bağlantı kopması) gerçek yukarı akış arızasıdır -> devre kesiciye sayılır.
    // Bozuk JSON / sınır aşımı ise (yukarı akış sağlam, gövde beklenmedik) sayılmaz.
    let metin;
    try {
      metin = await sinirliOku(res, MAKS_GOVDE_BAYT);
    } catch (e) {
      devre.hata();
      return e && (e.name === 'TimeoutError' || e.name === 'AbortError')
        ? json({ error: 'zaman_asimi', message: 'TCMB EVDS zamanında yanıt vermedi.' }, 502)
        : json({ error: 'ulasilamadi', message: 'TCMB EVDS servisine ulaşılamadı.' }, 502);
    }
    let data = null;
    try { if (metin !== undefined) data = JSON.parse(metin); } catch { data = null; }
    // Yalnız { items } süzülür; yukarı akışın başka alanları istemciye geçmez.
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
      return json({ error: 'okunamadi', message: 'TCMB EVDS yanıtı okunamadı.' }, 502);
    }

    devre.basari();
    // TÜFE ayda, kur günde bir açıklanır — her sayfa açılışında TCMB'ye gitmek gereksiz ve kaba olurdu.
    const saniye = kurIstegi ? 3600 : 21600;
    return json({ items: data.items }, 200, { 'cache-control': `public, max-age=${saniye}, s-maxage=${saniye}` });
  };
}

export default createEvdsHandler();

export const config = { path: '/.netlify/functions/evds' };
