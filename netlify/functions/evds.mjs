// TCMB EVDS proxy'si — Netlify Function (v2).
//
// NEDEN SUNUCU TARAFI: EVDS bir API anahtarı ister. Bu projenin bir numaralı kuralı anahtarın
// istemci koduna girmemesidir (AGENTS.md §0). Anahtar burada, Netlify'ın ortam değişkeninde
// durur ve tarayıcıya HİÇ inmez. İkinci fayda: isteği sunucu attığı için CORS sorunu hiç doğmaz.
//
// BOZULMAYAN İLKE: uygulama bu fonksiyon OLMADAN da tam çalışır. Anahtar tanımsızsa ya da TCMB
// yanıt vermezse burası düzgün bir hata döner, istemci (src/evds.ts) sessizce elle girilen
// enflasyon varsayımına düşer. Hiçbir koşulda uydurma sayı üretilmez.
//
// DOĞRULAMA SINIRI: bu fonksiyon geliştirme ortamından koşturulamadı (ne netlify-cli var, ne de
// dış ağa erişim). Yalnızca gerçek Netlify deploy'unda doğrulanabilir — "test edildi" DEĞİLDİR.

const EVDS_BASE = 'https://evds2.tcmb.gov.tr/service/evds';

// Seri kodu doğrulaması. Açık bir proxy'yi keyfî istek iletmeye çevirmemek için: yalnızca
// TCMB'nin seri kodu biçimine uyan girdiler geçer (ör. TP.FG.J0). Tam bir beyaz liste
// yazamıyoruz çünkü hangi serilerin kullanılacağı henüz netleşmedi; biçim kısıtı, URL'e
// rastgele yol/parametre enjekte edilmesini engelleyen asıl korumadır.
const SERIES_RE = /^[A-Z0-9]+(\.[A-Z0-9]+)+$/;
const DATE_RE = /^\d{2}-\d{2}-\d{4}$/;

// Beyaz liste: src/evds.ts yalnızca TUFE_SERIES ('TP.FG.J0') ister. Seri kodu birincil kaynakla
// doğrulanınca güncellenir.
const IZINLI_SERILER = ['TP.FG.J0'];
const MAKS_ARALIK_AY = 24;

// GG-AA-YYYY -> gerçek takvim tarihi (UTC ms) ya da null.
function parseTarih(s) {
  const [g, a, y] = s.split('-').map(Number);
  if (y < 2000 || y > 2100 || a < 1 || a > 12 || g < 1 || g > 31) return null;
  const d = new Date(Date.UTC(y, a - 1, g));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== a - 1 || d.getUTCDate() !== g) return null;
  return { t: d.getTime(), ay: y * 12 + (a - 1) };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const series = (url.searchParams.get('series') ?? '').trim().toUpperCase();
  const startDate = (url.searchParams.get('startDate') ?? '').trim();
  const endDate = (url.searchParams.get('endDate') ?? '').trim();

  if (!SERIES_RE.test(series) || series.length > 64) {
    return json({ error: 'gecersiz_seri', message: 'Seri kodu biçimi geçersiz.' }, 400);
  }
  if (!IZINLI_SERILER.includes(series)) {
    return json({ error: 'gecersiz_seri', message: 'Bu seri kodu desteklenmiyor.' }, 400);
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return json({ error: 'gecersiz_tarih', message: 'Tarihler GG-AA-YYYY biçiminde olmalı.' }, 400);
  }
  const bas = parseTarih(startDate);
  const bit = parseTarih(endDate);
  if (!bas || !bit || bas.t > bit.t || bit.ay - bas.ay > MAKS_ARALIK_AY) {
    return json({ error: 'gecersiz_tarih', message: 'Tarih aralığı geçersiz (en çok 24 ay, başlangıç ≤ bitiş).' }, 400);
  }

  const key = process.env.EVDS_API_KEY;
  if (!key) {
    // Anahtar tanımlı değil — bu bir ÇÖKME değil, beklenen bir durum. İstemci varsayıma düşer.
    return json(
      { error: 'anahtar_yok', message: 'EVDS anahtarı tanımlı değil; canlı enflasyon kapalı.' },
      503,
    );
  }

  const upstream = `${EVDS_BASE}/series=${encodeURIComponent(series)}`
    + `&startDate=${encodeURIComponent(startDate)}`
    + `&endDate=${encodeURIComponent(endDate)}`
    + `&type=json`;

  let res;
  try {
    res = await fetch(upstream, { headers: { key, accept: 'application/json' } });
  } catch {
    return json({ error: 'ulasilamadi', message: 'TCMB EVDS servisine ulaşılamadı.' }, 502);
  }

  if (!res.ok) {
    // TCMB'nin ham hata gövdesini istemciye AKTARMIYORUZ — içinde anahtarı yankılayan ya da
    // altyapı bilgisi sızdıran bir metin olabilir. Sade ve sabit bir mesaj döner.
    return json({ error: 'kaynak_hatasi', message: 'TCMB EVDS şu an yanıt vermiyor.', status: res.status }, 502);
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    return json({ error: 'okunamadi', message: 'TCMB EVDS yanıtı okunamadı.' }, 502);
  }

  // TÜFE ayda bir açıklanır — her sayfa açılışında TCMB'ye gitmek gereksiz ve kaba olurdu.
  return json(data, 200, { 'cache-control': 'public, max-age=21600, s-maxage=21600' });
};

export const config = { path: '/.netlify/functions/evds' };
