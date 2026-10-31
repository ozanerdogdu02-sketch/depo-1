// Birim testler: netlify/functions/evds.mjs (api/evds.mjs bunu Vercel'e bağlar). Sahte fetch ile;
// gerçek EVDS'e karşı doğrulanmadı. Kur seri kodları SENTETİK ('SENTETIK.A'), gerçek kod değildir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import varsayilan, { createEvdsHandler, istemciKimligi, sunucuPenceresi } from '../../netlify/functions/evds.mjs';
import { GET } from '../../api/evds.mjs';

const BASE = 'https://ornek.invalid/api/evds';
const tufeUrl = (extra = '') => `${BASE}?series=TP.FG.J0${extra}`;
const istek = (url: string, basliklar: Record<string, string> = {}) => new Request(url, { headers: basliklar });
const EVDS_JSON = { totalCount: 1, items: [{ Tarih: '09-2026', TP_FG_J0: '1000' }] };

function kur(opts: { fetchFn?: (u: string, i: RequestInit) => Promise<Response>; env?: Record<string, string>; simdi?: () => number; kurSerileri?: string[] } = {}) {
  return createEvdsHandler({
    fetchFn: opts.fetchFn ?? (async () => new Response(JSON.stringify(EVDS_JSON), { status: 200 })),
    env: opts.env ?? { EVDS_API_KEY: 'SENTETIK-1' },
    simdi: opts.simdi,
    kurSerileri: opts.kurSerileri,
  });
}
const govde = async (r: Response) => await r.json() as Record<string, unknown>;

test('anahtarsız: 503 anahtar_yok (mevcut davranış korunur), yukarı akışa gidilmez', async () => {
  let cagri = 0;
  const h = kur({ env: {}, fetchFn: async () => { cagri++; return new Response('{}'); } });
  const r = await h(istek(tufeUrl()));
  assert.equal(r.status, 503);
  assert.equal((await govde(r)).error, 'anahtar_yok');
  assert.equal(cagri, 0);
});

test('varsayılan dışa aktarma ve api/evds.mjs GET: anahtarsız ortamda 503 anahtar_yok', async () => {
  const eski = process.env.EVDS_API_KEY;
  delete process.env.EVDS_API_KEY;
  try {
    const r = await GET(istek(tufeUrl(), { 'x-forwarded-for': '10.0.0.1' }));
    assert.equal(r.status, 503);
    assert.equal((await govde(r)).error, 'anahtar_yok');
    assert.equal(typeof varsayilan, 'function');
  } finally { if (eski !== undefined) process.env.EVDS_API_KEY = eski; }
});

test('seri doğrulaması: biçim bozuk, beyaz liste dışı, kur kodu denemesi -> 400', async () => {
  const h = kur();
  for (const q of [
    '?series=../etc',
    '?series=TP.DK.USD.A.YTL', // doğrulanmadığı için beyaz listede YOK
    '?',
    '?series=TP.FG.J0-TP.FG.J1',
  ]) {
    const r = await h(istek(BASE + q));
    assert.equal(r.status, 400, q);
    assert.equal((await govde(r)).error, 'gecersiz_seri', q);
  }
});

test('başarı: anahtar yalnız istek BAŞLIĞINDA, yukarı akış adresi sabit tabandan; anahtar yanıtta yok; önbellek başlığı', async () => {
  let gorulen: { url: string; init: RequestInit } | undefined;
  const h = kur({ simdi: () => Date.UTC(2026, 9, 27, 12), fetchFn: async (url, init) => { gorulen = { url, init }; return new Response(JSON.stringify(EVDS_JSON)); } });
  const r = await h(istek(tufeUrl()));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { items: EVDS_JSON.items });
  assert.equal(gorulen!.url, 'https://evds2.tcmb.gov.tr/service/evds/series=TP.FG.J0&startDate=01-08-2025&endDate=27-10-2026&type=json');
  assert.equal(gorulen!.init.redirect, 'error', 'D1');
  assert.ok(!gorulen!.url.includes('SENTETIK-1'), 'anahtar URL içinde değil');
  assert.equal((gorulen!.init.headers as Record<string, string>).key, 'SENTETIK-1');
  assert.match(r.headers.get('cache-control') ?? '', /s-maxage=21600/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('parametre: tarih dâhil bilinmeyen HER parametre 400 (CDN önbelleği atlatılamaz, yukarı akışa taşınmaz)', async () => {
  let cagri = 0;
  const h = kur({ fetchFn: async () => { cagri++; return new Response(JSON.stringify(EVDS_JSON)); } });
  for (const ek of ['&startDate=01-08-2025&endDate=27-10-2026', '&url=https://kotu.invalid', '&type=csv', '&key=SIZDIR', '&x=1']) {
    const r = await h(istek(tufeUrl(ek), { 'x-real-ip': '203.0.113.1' }));
    assert.equal(r.status, 400, ek);
    assert.equal((await govde(r)).error, 'gecersiz_parametre');
  }
  assert.equal(cagri, 0, 'yukarı akışa hiç gidilmedi');
});

test('sunucu penceresi: TÜFE son 14 ay (ayın 1\'i), kur son 14 gün; istemci tarihi etkilemez', () => {
  const t = Date.UTC(2026, 9, 27, 12);
  assert.deepEqual(sunucuPenceresi(t, false), ['01-08-2025', '27-10-2026']);
  assert.deepEqual(sunucuPenceresi(t, true), ['13-10-2026', '27-10-2026']);
  assert.deepEqual(sunucuPenceresi(Date.UTC(2026, 0, 5), false), ['01-11-2024', '05-01-2026']);
});

test('kur tablosu: seri listesi boşken 503 seri_dogrulanmadi (anahtar varken); anahtarsızken anahtar_yok', async () => {
  const kurUrl = `${BASE}?tablo=kur`;
  const r = await kur()(istek(kurUrl));
  assert.equal(r.status, 503);
  assert.equal((await govde(r)).error, 'seri_dogrulanmadi');
  const r2 = await kur({ env: {} })(istek(kurUrl));
  assert.equal((await govde(r2)).error, 'anahtar_yok');
});

test('kur tablosu (sentetik seri listesiyle): sabit liste yukarı akışa gider, istemci seri/tablo karışımı reddedilir', async () => {
  let url = '';
  const h = kur({ simdi: () => Date.UTC(2026, 9, 27, 12), kurSerileri: ['SENTETIK.A', 'SENTETIK.B'], fetchFn: async u => { url = u; return new Response(JSON.stringify(EVDS_JSON)); } });
  const r = await h(istek(`${BASE}?tablo=kur`));
  assert.equal(r.status, 200);
  assert.match(url, /series=SENTETIK\.A-SENTETIK\.B&startDate=13-10-2026&endDate=27-10-2026/);
  assert.match(r.headers.get('cache-control') ?? '', /s-maxage=3600/);
  for (const q of ['?tablo=baska', '?tablo=kur&series=TP.FG.J0']) {
    assert.equal((await h(istek(BASE + q))).status, 400, q);
  }
});

test('yukarı akış hataları: ham gövde aktarılmaz; durum kodları 502', async () => {
  const hamGovde = 'SIR: anahtar=SENTETIK-1';
  const a = await kur({ fetchFn: async () => new Response(hamGovde, { status: 500 }) })(istek(tufeUrl()));
  assert.equal(a.status, 502);
  const ga = await govde(a);
  const m = JSON.stringify(ga);
  assert.ok(!m.includes('SIR') && !m.includes('SENTETIK-1'));
  assert.equal('status' in ga, false, 'D5: yukarı akış durum kodu aktarılmaz');
  assert.equal(ga.error, 'kaynak_hatasi');
  const b = await kur({ fetchFn: async () => { throw new TypeError('ağ'); } })(istek(tufeUrl()));
  assert.equal((await govde(b)).error, 'ulasilamadi');
  const c = await kur({ fetchFn: async () => new Response('<html>', { status: 200 }) })(istek(tufeUrl()));
  assert.equal((await govde(c)).error, 'okunamadi');
  const d = await kur({ fetchFn: async () => new Response('x'.repeat(600 * 1024), { status: 200 }) })(istek(tufeUrl()));
  assert.equal((await govde(d)).error, 'okunamadi', 'gövde üst sınırı');
});

test('zaman aşımı: yukarı akış TimeoutError -> 502 zaman_asimi; istek AbortSignal ile çıkar', async () => {
  let sinyal: AbortSignal | undefined;
  const h = kur({ fetchFn: async (_u, init) => { sinyal = init.signal as AbortSignal; throw new DOMException('zaman', 'TimeoutError'); } });
  const r = await h(istek(tufeUrl()));
  assert.equal(r.status, 502);
  assert.equal((await govde(r)).error, 'zaman_asimi');
  assert.ok(sinyal instanceof AbortSignal);
});

test('devre kesici: 3 ardışık yukarı akış hatasından sonra 60 sn yukarı akışa gidilmez, sonra yeniden denenir', async () => {
  let t = 1_000_000, cagri = 0, saglam = false;
  const h = kur({
    simdi: () => t,
    fetchFn: async () => { cagri++; return saglam ? new Response(JSON.stringify(EVDS_JSON)) : new Response('', { status: 500 }); },
  });
  const sor = (ip: string) => h(istek(tufeUrl(), { 'x-real-ip': ip }));
  for (let i = 0; i < 3; i++) assert.equal((await sor(`10.0.0.${i}`)).status, 502);
  assert.equal(cagri, 3);
  const acik = await sor('10.0.1.1');
  assert.equal(acik.status, 502);
  assert.equal(acik.headers.get('retry-after'), '60');
  assert.equal(cagri, 3, 'devre açıkken yukarı akışa gidilmedi');
  t += 60_001; saglam = true;
  assert.equal((await sor('10.0.1.2')).status, 200);
  assert.equal(cagri, 4);
});

test('hız sınırı: aynı istemci pencerede 30 istekten sonra 429; başka istemci etkilenmez; pencere dolunca açılır', async () => {
  let t = 5_000_000;
  const h = kur({ simdi: () => t });
  const sor = (ip: string) => h(istek(tufeUrl(), { 'x-nf-client-connection-ip': ip }));
  for (let i = 0; i < 30; i++) assert.equal((await sor('192.0.2.1')).status, 200, `istek ${i + 1}`);
  const sinir = await sor('192.0.2.1');
  assert.equal(sinir.status, 429);
  assert.equal(sinir.headers.get('retry-after'), '60');
  assert.equal((await govde(sinir)).error, 'sinir_asildi');
  assert.equal((await sor('192.0.2.2')).status, 200);
  t += 60_001;
  assert.equal((await sor('192.0.2.1')).status, 200);
});

/* ── O1: istemci kimliği ve hız sınırı ── */

test('Y1: istemciKimligi platforma göre YALNIZ kendi başlığını okur; öbür platformun ve XFF başlığı yok sayılır', () => {
  const h = (o: Record<string, string>, p?: 'vercel' | 'netlify') => istemciKimligi(new Headers(o), p);
  // Netlify (varsayılan)
  assert.equal(h({ 'x-nf-client-connection-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }), '1.1.1.1');
  assert.equal(h({ 'x-real-ip': '2.2.2.2', 'x-vercel-forwarded-for': '3.3.3.3' }), 'bilinmeyen');
  assert.equal(h({ 'x-forwarded-for': '6.6.6.6' }), 'bilinmeyen');
  assert.equal(h({}), 'bilinmeyen');
  // Vercel
  assert.equal(h({ 'x-nf-client-connection-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }, 'vercel'), '2.2.2.2');
  assert.equal(h({ 'x-real-ip': '2.2.2.2', 'x-vercel-forwarded-for': '3.3.3.3' }, 'vercel'), '2.2.2.2');
  assert.equal(h({ 'x-vercel-forwarded-for': '3.3.3.3, 9.9.9.9' }, 'vercel'), '3.3.3.3');
  assert.equal(h({ 'x-nf-client-connection-ip': '1.1.1.1' }, 'vercel'), 'bilinmeyen');
  assert.equal(h({ 'x-forwarded-for': '6.6.6.6' }, 'vercel'), 'bilinmeyen');
  assert.equal(h({ 'x-real-ip': 'a'.repeat(200) }, 'vercel').length, 64);
});

test('Y1: Vercel işleyicisinde sahte x-nf-client-connection-ip ile hız sınırı atlatılamaz', async () => {
  const h = createEvdsHandler({ platform: 'vercel', env: { EVDS_API_KEY: 'SENTETIK-1' }, simdi: () => 9_200_000,
    fetchFn: async () => new Response(JSON.stringify(EVDS_JSON)) });
  let son = 0;
  for (let i = 0; i < 31; i++) son = (await h(istek(tufeUrl(), { 'x-real-ip': '198.51.100.9', 'x-nf-client-connection-ip': `10.3.${i}.1` }))).status;
  assert.equal(son, 429);
});

test('Y1: Netlify işleyicisinde (varsayılan) sahte x-real-ip yok sayılır', async () => {
  const h = createEvdsHandler({ env: { EVDS_API_KEY: 'SENTETIK-1' }, simdi: () => 9_300_000,
    fetchFn: async () => new Response(JSON.stringify(EVDS_JSON)) });
  let son = 0;
  for (let i = 0; i < 31; i++) son = (await h(istek(tufeUrl(), { 'x-nf-client-connection-ip': '198.51.100.9', 'x-real-ip': `10.4.${i}.1` }))).status;
  assert.equal(son, 429);
  // Aynı sahte x-real-ip değişimi başlıksız (bilinmeyen) kovayı da bölemez
  const h2 = createEvdsHandler({ env: { EVDS_API_KEY: 'SENTETIK-1' }, simdi: () => 9_400_000,
    fetchFn: async () => new Response(JSON.stringify(EVDS_JSON)) });
  let son2 = 0;
  for (let i = 0; i < 31; i++) son2 = (await h2(istek(tufeUrl(), { 'x-real-ip': `10.5.${i}.1` }))).status;
  assert.equal(son2, 429);
});

test('O1: x-forwarded-for değiştirerek hız sınırı aşılamaz (aynı gerçek istemci)', async () => {
  const h = kur({ simdi: () => 9_000_000 });
  let sonDurum = 0;
  for (let i = 0; i < 31; i++) sonDurum = (await h(istek(tufeUrl(), { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': `10.1.${i}.1` }))).status;
  assert.equal(sonDurum, 429);
});

test('O1: başlıksız istekler tek ortak kovada sayılır', async () => {
  const h = kur({ simdi: () => 9_100_000 });
  let sonDurum = 0;
  for (let i = 0; i < 31; i++) sonDurum = (await h(istek(tufeUrl(), { 'x-forwarded-for': `10.2.${i}.1` }))).status;
  assert.equal(sonDurum, 429);
});

test('O1: tablo dolunca yalnız EN ESKİ kayıt atılır; başkalarının sayaçları sıfırlanmaz', async () => {
  let t = 1;
  const h = kur({ simdi: () => t });
  const sor = (ip: string) => h(istek(tufeUrl(), { 'x-real-ip': ip }));
  for (let i = 0; i < 30; i++) await sor('hedef'); // 'hedef' sınırın dibinde (30. istek geçti)
  for (let i = 0; i < 1000; i++) { t += 1; await sor(`ip-${i}`); } // tablo 1000'e dolup taşar; 'hedef' en eskidir
  // 'hedef' atıldıysa sayacı sıfırlanmıştır (en eski atılır: beklenen), son eklenenler ise KORUNMUŞTUR.
  for (let i = 0; i < 29; i++) await sor('ip-999');
  assert.equal((await sor('ip-999')).status, 429, 'en yeni istemcinin sayacı korundu (clear() olsaydı sıfırlanırdı)');
});

/* ── O2: devre kesici yalnız gerçek yukarı akış arızalarını sayar ── */

test('O2: yukarı akış 4xx devre kesiciyi AÇMAZ ve kaynak_reddetti döner (status alanı yok)', async () => {
  let cagri = 0;
  const h = kur({ fetchFn: async () => { cagri++; return new Response('yasak', { status: 403 }); } });
  for (let i = 0; i < 6; i++) {
    const r = await h(istek(tufeUrl(), { 'x-real-ip': `192.0.2.${i}` }));
    assert.equal(r.status, 502);
    const g = await govde(r);
    assert.equal(g.error, 'kaynak_reddetti');
    assert.equal('status' in g, false);
  }
  assert.equal(cagri, 6, 'devre açılmadı, her istek yukarı akışa gitti');
});

test('O2: geçersiz/beklenmedik gövde (HTML, items yok, dizi) devre kesiciyi AÇMAZ', async () => {
  let cagri = 0;
  const govdeler = ['<html>', JSON.stringify({ baska: 1 }), JSON.stringify([1, 2]), 'x'.repeat(600 * 1024)];
  const h = kur({ fetchFn: async () => new Response(govdeler[cagri++ % govdeler.length]) });
  for (let i = 0; i < 8; i++) {
    const r = await h(istek(tufeUrl(), { 'x-real-ip': `192.0.2.${i}` }));
    assert.equal((await govde(r)).error, 'okunamadi');
  }
  assert.equal(cagri, 8);
});

test('O2: 5xx ve ağ hatası karışık 3 ardışık hata devreyi açar', async () => {
  let cagri = 0;
  const secenekler = [() => new Response('', { status: 503 }), () => { throw new TypeError('ağ'); }, () => new Response('', { status: 500 })];
  const h = kur({ fetchFn: async () => secenekler[cagri++ % 3]() });
  for (let i = 0; i < 3; i++) await h(istek(tufeUrl(), { 'x-real-ip': `192.0.2.${i}` }));
  const r = await h(istek(tufeUrl(), { 'x-real-ip': '192.0.2.9' }));
  assert.equal(r.headers.get('retry-after'), '60');
  assert.equal(cagri, 3);
});

test('O2: gelecek tarihli (ya da herhangi bir) tarih parametresi 400 ile reddedilir ve devre sayacına girmez', async () => {
  let cagri = 0;
  const h = kur({ fetchFn: async () => { cagri++; return new Response('', { status: 500 }); } });
  for (let i = 0; i < 5; i++) {
    const r = await h(istek(`${BASE}?series=TP.FG.J0&startDate=01-01-2030&endDate=31-12-2030`, { 'x-real-ip': `192.0.2.${i}` }));
    assert.equal(r.status, 400);
  }
  assert.equal(cagri, 0);
});

/* ── D2/D3: gövde bayt sınırı ve süzme ── */

test('D2: content-length sınırı aşıyorsa gövde okunmaz; çok baytlı (UTF-8) gövde bayt olarak sayılır', async () => {
  let okundu = false;
  const buyuk = new Response(new ReadableStream({ pull(c) { okundu = true; c.enqueue(new Uint8Array(10)); c.close(); } }), { headers: { 'content-length': String(600 * 1024) } });
  const r = await kur({ fetchFn: async () => buyuk })(istek(tufeUrl()));
  assert.equal((await govde(r)).error, 'okunamadi');
  assert.equal(buyuk.bodyUsed, false, 'gövde okunmadı');
  void okundu;
  // 300 bin "ş" = 600 bin bayt > 512 KB, ama 300 bin karakter < 512 K karakter
  const metin = JSON.stringify({ items: [{ a: 'ş'.repeat(300_000) }] });
  const r2 = await kur({ fetchFn: async () => new Response(metin) })(istek(tufeUrl(), { 'x-real-ip': '192.0.2.50' }));
  assert.equal((await govde(r2)).error, 'okunamadi', 'bayt sayımı');
});

test('D3: yalnız { items } döner; yukarı akışın başka alanları süzülür', async () => {
  const h = kur({ fetchFn: async () => new Response(JSON.stringify({ items: [{ Tarih: '09-2026', TP_FG_J0: '1' }], totalCount: 1, ic: 'sir', key: 'x' })) });
  const r = await h(istek(tufeUrl()));
  assert.deepEqual(await r.json(), { items: [{ Tarih: '09-2026', TP_FG_J0: '1' }] });
});
