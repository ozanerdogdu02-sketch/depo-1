// Birim testler: netlify/functions/kap.mjs (api/kap.mjs bunu Vercel'e bağlar). Sahte fetch ile.
// Fikstürler KÜTÜPHANE KODLARINDAN TÜRETİLDİ; gerçek KAP yanıtıyla DOĞRULANMADI. kap.org.tr'ye gerçek istek ATILMAZ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import varsayilan, {
  createKapHandler, kapAyristir, kapZamanCoz, kapPenceresi, seansIciMi, cdnSaniye, kazimaAcikMi, KAP_SABITLERI,
} from '../../netlify/functions/kap.mjs';
import { GET } from '../../api/kap.mjs';
import trTarih from '../fixtures/kap/kap-ornek-tr-tarih.mjs';
import isoTarih from '../fixtures/kap/kap-ornek-iso-tarih.mjs';

const BASE = 'https://ornek.invalid/api/kap';
const istek = (url = BASE, basliklar: Record<string, string> = {}, method = 'GET') => new Request(url, { method, headers: basliklar });
const govde = async (r: Response) => await r.json() as Record<string, unknown>;
const ACIK = { FAGENT_KAZIMA: 'on', VERCEL_ENV: 'preview' };
// 2026-10-28 Çarşamba 12:00 TSİ (seans içi) ve 2026-10-31 Cumartesi 12:00 TSİ (seans dışı)
const SEANS_ICI = Date.UTC(2026, 9, 29, 13, 0); // Perşembe 16:00 TSİ (bildirimler geçmişte kalsın)
const SEANS_DISI = Date.UTC(2026, 9, 31, 9, 0);

function kur(opts: {
  fetchFn?: (u: string, i: RequestInit) => Promise<Response>; env?: Record<string, string>; zaman?: { t: number };
  platform?: 'netlify' | 'vercel';
} = {}) {
  const zaman = opts.zaman ?? { t: SEANS_ICI };
  return createKapHandler({
    fetchFn: opts.fetchFn ?? (async () => new Response(JSON.stringify(trTarih), { status: 200 })),
    env: opts.env ?? ACIK,
    simdi: () => zaman.t,
    platform: opts.platform,
  });
}
const IL = (z: { t: number }) => { z.t += 61_000; }; // yukarı akış aralığını (60 sn) geç

/* ── bayrak ── */

test('U2: bayraksız /api/kap -> 503 kapali, yukarı akışa HİÇ gidilmez (yok / off / boş)', async () => {
  for (const env of [{}, { FAGENT_KAZIMA: '' }, { FAGENT_KAZIMA: 'off' }, { FAGENT_KAZIMA: 'hayir' }]) {
    let n = 0;
    const h = kur({ env, fetchFn: async () => { n++; return new Response('[]'); } });
    const r = await h(istek());
    assert.equal(r.status, 503);
    assert.equal((await govde(r)).error, 'kapali');
    assert.equal(n, 0);
  }
  assert.equal(kazimaAcikMi({ FAGENT_KAZIMA: 'ON', VERCEL_ENV: 'preview' }), true);
  assert.equal(kazimaAcikMi({}), false);
});

test('U2: varsayılan dışa aktarma ve api/kap.mjs GET bayraksız ortamda 503 kapali', async () => {
  const eski = process.env.FAGENT_KAZIMA;
  delete process.env.FAGENT_KAZIMA;
  try {
    const r = await GET(istek(BASE, { 'x-real-ip': '10.0.0.9' }));
    assert.equal(r.status, 503);
    assert.equal((await govde(r)).error, 'kapali');
    assert.equal(typeof varsayilan, 'function');
  } finally { if (eski !== undefined) process.env.FAGENT_KAZIMA = eski; }
});

/* ── istek biçimi: parametresiz, sabit, dürüst kimlik ── */

test('parametre: HER sorgu parametresi 400 (sembol/portföy dâhil), yukarı akışa gidilmez; GET dışı yöntem 405', async () => {
  let n = 0;
  const h = kur({ fetchFn: async () => { n++; return new Response('[]'); } });
  for (const q of ['?x=1', '?symbols=THYAO', '?portfoy=ORNKA,ORNKB', '?fromDate=2026-01-01', '?series=TP.FG.J0']) {
    const r = await h(istek(BASE + q));
    assert.equal(r.status, 400, q);
    assert.equal((await govde(r)).error, 'gecersiz_parametre', q);
  }
  const p = await h(istek(BASE, {}, 'POST'));
  assert.equal(p.status, 405);
  assert.equal(n, 0);
});

test('U3: yukarı akış isteği sabit — adres, POST, dürüst User-Agent (tarayıcı taklidi yok), kullanıcı verisi yok, redirect:error', async () => {
  let gorulen: { url: string; init: RequestInit } | undefined;
  const h = kur({ fetchFn: async (url, init) => { gorulen = { url, init }; return new Response(JSON.stringify(trTarih)); } });
  const r = await h(istek(BASE, { cookie: 'oturum=gizli', authorization: 'Bearer x', 'x-real-ip': '1.2.3.4', referer: 'https://fagent.example/portfoy' }));
  assert.equal(r.status, 200);
  assert.ok(gorulen);
  assert.equal(gorulen.url, KAP_SABITLERI.KAP_URL);
  assert.equal(gorulen.init.method, 'POST');
  assert.equal(gorulen.init.redirect, 'error');
  assert.ok(gorulen.init.signal);
  const b = gorulen.init.headers as Record<string, string>;
  assert.equal(b['user-agent'], 'FAGENT/1.0');
  assert.ok(!/mozilla|chrome|safari/i.test(JSON.stringify(b)));
  for (const yasak of ['cookie', 'authorization', 'origin', 'referer', 'x-forwarded-for', 'x-real-ip']) assert.ok(!(yasak in b), yasak);
  // gövde: yalnız sabit alanlar + sunucu tarihleri (2026-10-28 .. 2026-10-29)
  const g = JSON.parse(gorulen.init.body as string) as Record<string, unknown>;
  assert.deepEqual(Object.keys(g).sort(), ['disclosureClass', 'fromDate', 'memberType', 'mkkMemberOidList', 'subjectList', 'toDate']);
  assert.deepEqual([g.fromDate, g.toDate], ['2026-10-28', '2026-10-29']);
  assert.deepEqual([g.mkkMemberOidList, g.subjectList], [[], []]);
  assert.ok(!JSON.stringify(g).includes('1.2.3.4') && !JSON.stringify(g).includes('gizli'));
});

test('U3: FAGENT_ILETISIM verilirse User-Agent\'a eklenir; zararlı değer yok sayılır', async () => {
  const ua = async (env: Record<string, string>) => {
    let u = '';
    const h = kur({ env, fetchFn: async (_x, i) => { u = (i.headers as Record<string, string>)['user-agent']; return new Response('[]'); } });
    await h(istek());
    return u;
  };
  assert.equal(await ua({ ...ACIK, FAGENT_ILETISIM: 'destek@ornek.invalid' }), 'FAGENT/1.0 (+destek@ornek.invalid)');
  assert.equal(await ua({ ...ACIK, FAGENT_ILETISIM: 'a\r\nX-Evil: 1' }), 'FAGENT/1.0');
});

/* ── yanıt: yalnız meta, süzülmüş ── */

test('U3: yanıt yalnız meta alanlar + pencere; özet/ek/ham alanlar GEÇMEZ; en yeni önce', async () => {
  const h = kur();
  const r = await h(istek());
  assert.equal(r.status, 200);
  const j = await govde(r);
  assert.deepEqual(Object.keys(j).sort(), ['items', 'pencere']);
  assert.deepEqual(j.pencere, ['2026-10-28', '2026-10-29']);
  const items = j.items as Array<Record<string, unknown>>;
  assert.deepEqual(items.map(i => i.no), [1000003, 1000002, 1000001]);
  const metin = JSON.stringify(j);
  for (const sizmamali of ['ÖZET', 'summary', 'attachment', 'hasAttachment', 'ekAlan', 'disclosureType']) assert.ok(!metin.includes(sizmamali), sizmamali);
  for (const it of items) for (const k of Object.keys(it)) assert.ok(['no', 'zaman', 'kodlar', 'unvan', 'baslik', 'sinif', 'gec', 'duzeltme'].includes(k), k);
  assert.deepEqual(items[0], { no: 1000003, zaman: '2026-10-28T18:42:10+03:00', kodlar: ['ORNKA'], unvan: 'ÖRNEK SANAYİ A.Ş.', baslik: 'Özel Durum Açıklaması (Genel)', sinif: 'ODA' });
  assert.deepEqual(items[1].kodlar, ['ORNKB', 'ORNKC']);
  assert.equal(items[1].gec, true);
  assert.equal(items[2].duzeltme, true);
});

test('U3: önbellek başlığı — seans içi 900 sn, seans dışı 3600 sn; hata yanıtında no-store', async () => {
  const a = await kur({ zaman: { t: SEANS_ICI } })(istek());
  assert.match(a.headers.get('cache-control') ?? '', /s-maxage=900\b.*stale-while-revalidate=300/);
  const b = await kur({ zaman: { t: SEANS_DISI } })(istek());
  assert.match(b.headers.get('cache-control') ?? '', /s-maxage=3600\b/);
  const c = await kur({ fetchFn: async () => new Response('x', { status: 500 }) })(istek());
  assert.equal(c.headers.get('cache-control'), 'no-store');
});

test('seans/pencere yardımcıları: sınırlar TSİ takvimine göre', () => {
  const tsi = (y: number, a: number, g: number, sa: number, dk = 0) => Date.UTC(y, a - 1, g, sa - 3, dk);
  assert.equal(seansIciMi(tsi(2026, 10, 30, 18, 59)), true);   // Cuma
  assert.equal(seansIciMi(tsi(2026, 10, 30, 19, 0)), false);
  assert.equal(seansIciMi(tsi(2026, 10, 30, 8, 59)), false);
  assert.equal(seansIciMi(tsi(2026, 10, 30, 9, 0)), true);
  assert.equal(seansIciMi(tsi(2026, 10, 31, 12)), false);      // Cumartesi
  assert.equal(seansIciMi(tsi(2026, 11, 1, 12)), false);       // Pazar
  assert.equal(cdnSaniye(tsi(2026, 10, 28, 12)), 900);
  assert.equal(cdnSaniye(tsi(2026, 10, 28, 20)), 3600);
  assert.deepEqual(kapPenceresi(tsi(2026, 10, 28, 12)), ['2026-10-27', '2026-10-28']);
  assert.deepEqual(kapPenceresi(Date.UTC(2026, 9, 30, 22, 0)), ['2026-10-30', '2026-10-31']); // UTC 22:00 = TSİ ertesi gün 01:00
  assert.deepEqual(kapPenceresi(tsi(2026, 1, 1, 12)), ['2026-01-01', '2026-01-01']);           // yıl başı: aynı takvim yılı
  assert.deepEqual(kapPenceresi(tsi(2026, 3, 1, 12)), ['2026-02-28', '2026-03-01']);
});

/* ── ayrıştırıcı ── */

test('ayrıştırıcı: iki tarih biçimi ve memberTitle/kapTitle, virgüllü / dizi kodlar, sayı-metin no', () => {
  const a = kapAyristir(isoTarih);
  assert.ok(a.ok);
  assert.deepEqual(a.items!.map(i => [i.no, i.zaman, i.unvan, i.kodlar]), [
    [1000010, '2026-10-29T10:15:30+03:00', 'ÖRNEK ENERJİ A.Ş.', ['ORNKA', 'ORNKD']],
    [1000009, '2026-10-29T08:00:00+03:00', 'ÖRNEK GAYRİMENKUL A.Ş.', ['ORNKE']],
  ]);
  const b = kapAyristir(trTarih);
  assert.equal(b.items![0].zaman, '2026-10-28T18:42:10+03:00');
  assert.equal(kapZamanCoz('28.10.2026'), '2026-10-28T00:00:00+03:00');
  assert.equal(kapZamanCoz('2026-10-28'), '2026-10-28T00:00:00+03:00');
});

test('ayrıştırıcı: gerçek olmayan tarih, eksik zorunlu alan, kopya no ve bozuk satır atılır; kalanlar korunur', () => {
  const a = kapAyristir([
    { disclosureIndex: 1, publishDate: '31.02.2026 10:00:00', subject: 'x' },     // gerçek olmayan tarih
    { disclosureIndex: 2, publishDate: '2026-10-28 25:00:00', subject: 'x' },     // saat 25
    { publishDate: '2026-10-28 10:00:00', subject: 'x' },                         // no yok
    { disclosureIndex: 4, publishDate: '2026-10-28 10:00:00' },                   // başlık yok
    { disclosureIndex: -5, publishDate: '2026-10-28 10:00:00', subject: 'x' },    // negatif no
    { disclosureIndex: 6, publishDate: '2026-10-28 10:00:00', subject: 'iyi', stockCodes: 'thyao, <b>, ABCDEFGHI' },
    { disclosureIndex: 6, publishDate: '2026-10-28 10:00:00', subject: 'kopya' },
    null, 7, 'x', [],
  ]);
  assert.ok(a.ok);
  assert.equal(a.items!.length, 1);
  assert.deepEqual(a.items![0].kodlar, ['THYAO']); // biçim dışı kodlar atılır, küçük harf büyütülür
  assert.equal(a.items![0].unvan, '');
});

test('ayrıştırıcı: kontrol karakterleri temizlenir, uzun metin kesilir', () => {
  const a = kapAyristir([{ disclosureIndex: 1, publishDate: '2026-10-28 10:00:00', subject: 'a\u0000b\n\tc ' + 'x'.repeat(1000), memberTitle: 'Ş\u0007' }]);
  assert.ok(a.ok);
  assert.ok(a.items![0].baslik.startsWith('a b c x'));
  assert.ok(a.items![0].baslik.length <= 300);
  assert.equal(a.items![0].unvan, 'Ş');
});

test('ayrıştırıcı: dizi olmayan gövde / HTML / hiçbir satırı tanınmayan şema -> ok:false; boş dizi geçerli', () => {
  for (const g of [null, 'metin', 42, { message: 'Too Many Requests', retryAfter: 60 }, '<html>duvar</html>',
    [{ id: 1, title: 'başka şema' }, { id: 2 }]]) {
    assert.equal(kapAyristir(g).ok, false);
  }
  const bos = kapAyristir([]);
  assert.ok(bos.ok);
  assert.deepEqual(bos.items, []);
  assert.ok(kapAyristir({ data: trTarih }).ok); // sarmalayıcı nesne içinde dizi de kabul
});

test('ayrıştırıcı: 500 satır sınırı -> en yeni 500 + kesildi:true', () => {
  const cok = Array.from({ length: 650 }, (_, i) => ({
    disclosureIndex: 2000000 + i, publishDate: `2026-10-28 ${String(Math.floor(i / 60) % 24).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`, subject: 'b',
  }));
  const a = kapAyristir(cok);
  assert.ok(a.ok);
  assert.equal(a.items!.length, 500);
  assert.equal(a.kesildi, true);
  assert.ok(a.items![0].zaman >= a.items![499].zaman);
  assert.equal(kapAyristir(cok.slice(0, 500)).kesildi, false);
});

/* ── yukarı akış hataları ── */

test('hatalar: ağ/zaman aşımı/5xx -> 502, ham gövde ve durum kodu istemciye geçmez', async () => {
  const z = { t: SEANS_ICI };
  const senaryolar: Array<[() => Promise<Response>, string]> = [
    [async () => { throw new TypeError('ağ'); }, 'ulasilamadi'],
    [async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }, 'zaman_asimi'],
    [async () => new Response('SIR-ANAHTAR-GOVDE', { status: 503 }), 'kaynak_hatasi'],
    [async () => new Response('SIR-WAF-GOVDE', { status: 403 }), 'kaynak_reddetti'],
  ];
  for (const [fetchFn, beklenen] of senaryolar) {
    const h = kur({ fetchFn, zaman: z });
    const r = await h(istek());
    assert.equal(r.status, 502);
    const j = await govde(r);
    assert.equal(j.error, beklenen);
    assert.ok(!('status' in j));
    assert.ok(!JSON.stringify(j).includes('SIR-'));
  }
});

test('devre kesici: 3 ardışık ağ/5xx hatası -> 15 dk yukarı akışa gidilmez; sonra yeniden denenir', async () => {
  const z = { t: SEANS_ICI };
  let n = 0;
  const h = kur({ zaman: z, fetchFn: async () => { n++; throw new TypeError('ağ'); } });
  for (let i = 0; i < 3; i++) { await h(istek()); IL(z); }
  assert.equal(n, 3);
  const acik = await h(istek());
  assert.equal(acik.status, 502);
  assert.equal(n, 3);
  z.t += 13 * 60_000;
  await h(istek());
  assert.equal(n, 3, '15 dk dolmadan gidilmez');
  z.t += 2 * 60_000;
  await h(istek());
  assert.equal(n, 4);
});

test('devre kesici: yukarı akış 4xx (403 duvar dâhil), HTML gövde ve şema uyuşmazlığı devreyi AÇMAZ', async () => {
  const z = { t: SEANS_ICI };
  let n = 0;
  const sira = [() => new Response('x', { status: 403 }), () => new Response('<html>', { status: 200 }), () => new Response('{"a":1}', { status: 200 }),
    () => new Response('x', { status: 404 }), () => new Response('x', { status: 403 })];
  const h = kur({ zaman: z, fetchFn: async () => sira[n++]() });
  const kodlar: string[] = [];
  for (let i = 0; i < 5; i++) { kodlar.push(String((await govde(await h(istek()))).error)); IL(z); }
  assert.deepEqual(kodlar, ['kaynak_reddetti', 'okunamadi', 'okunamadi', 'kaynak_reddetti', 'kaynak_reddetti']);
  assert.equal(n, 5);
});

test('429: Retry-After kadar devre açılır (min 60 sn, en çok 15 dk), yeniden deneme yok; süre dolunca denenir', async () => {
  const z = { t: SEANS_ICI };
  let n = 0;
  const h = kur({ zaman: z, fetchFn: async () => { n++; return n === 1 ? new Response('{"message":"Too Many Requests"}', { status: 429, headers: { 'retry-after': '300' } }) : new Response(JSON.stringify(trTarih)); } });
  const r = await h(istek());
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '300');
  assert.equal((await govde(r)).error, 'sinir_asildi');
  z.t += 120_000;
  const acik = await h(istek());
  assert.equal(acik.status, 502);
  assert.equal(n, 1, 'devre açıkken yukarı akışa gidilmez');
  z.t += 181_000;
  assert.equal((await h(istek())).status, 200);
  assert.equal(n, 2);
});

test('429: gövdedeki retryAfter okunur; çok büyük değer 15 dk ile sınırlanır', async () => {
  for (const [gov, beklenen] of [['{"message":"x","retryAfter":120}', '120'], ['{"retryAfter":999999}', '900'], ['bozuk', '60']]) {
    const h = kur({ fetchFn: async () => new Response(gov, { status: 429 }) });
    const r = await h(istek());
    assert.equal(r.headers.get('retry-after'), beklenen, gov);
  }
});

test('büyük gövde: content-length 2 MB üstü okunmaz -> okunamadi; akışta sınır aşımı da', async () => {
  const buyuk = await kur({ fetchFn: async () => new Response('[]', { status: 200, headers: { 'content-length': String(3 * 1024 * 1024) } }) })(istek());
  assert.equal((await govde(buyuk)).error, 'okunamadi');
  const akis = await kur({ fetchFn: async () => new Response('[' + '"a",'.repeat(700_000) + '"a"]') })(istek());
  assert.equal((await govde(akis)).error, 'okunamadi');
});

/* ── kibar kullanım ── */

test('kibar kullanım: 60 sn içinde sonuç paylaşılır (tek yukarı akış isteği); eşzamanlı istekler tek isteği paylaşır', async () => {
  const z = { t: SEANS_ICI };
  let n = 0;
  const h = kur({ zaman: z, fetchFn: async () => { n++; await new Promise(r => setTimeout(r, 10)); return new Response(JSON.stringify(trTarih)); } });
  const [a, b, c] = await Promise.all([h(istek(BASE, { 'x-nf-client-connection-ip': '1.1.1.1' })), h(istek(BASE, { 'x-nf-client-connection-ip': '2.2.2.2' })), h(istek())]);
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);
  assert.equal(n, 1);
  z.t += 30_000;
  await h(istek());
  assert.equal(n, 1);
  z.t += 31_000;
  await h(istek());
  assert.equal(n, 2);
});

test('kibar kullanım: hata sonucu da 60 sn paylaşılır (art arda saldırıya yukarı akış yanıt vermez)', async () => {
  let n = 0;
  const h = kur({ fetchFn: async () => { n++; return new Response('x', { status: 403 }); } });
  for (let i = 0; i < 5; i++) await h(istek());
  assert.equal(n, 1);
});

test('hız sınırı: aynı istemci pencerede 30 istekten sonra 429; sahte x-forwarded-for / öbür platform başlığı kovayı değiştirmez', async () => {
  const h = kur({ platform: 'vercel' });
  let son = 200;
  for (let i = 0; i < 31; i++) {
    son = (await h(istek(BASE, { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': `10.0.0.${i}`, 'x-nf-client-connection-ip': `8.8.8.${i}` }))).status;
  }
  assert.equal(son, 429);
  assert.equal((await h(istek(BASE, { 'x-real-ip': '7.7.7.7' }))).status, 200);
});

/* ── kaynak kodu işaretleri ── */

test('TODO(hukuk) işareti ve dürüst kimlik kodda durur; kod tarayıcı taklidi içermez', () => {
  const kod = readFileSync(new URL('../../netlify/functions/kap.mjs', import.meta.url), 'utf8');
  assert.ok(kod.includes('TODO(hukuk)'));
  assert.ok(!/Mozilla|Chrome\/|Safari\//i.test(kod.replace(/^\s*\/\/.*$/gm, '')));
  const api = readFileSync(new URL('../../api/kap.mjs', import.meta.url), 'utf8');
  assert.ok(api.includes("platform: 'vercel'"));
});

/* ── B11 düzeltmeleri (D1, D3, D4) ── */

test('D1: bidi, sıfır genişlikli ve U+2028/2029 karakterleri başlık/unvan/kodda temizlenir', () => {
  const kirli = 'Ba\u202Eşl\u200Bık\u200F\uFEFF\u2066x\u2069 a\u2028b\u2029c';
  const a = kapAyristir([{ disclosureIndex: 1, publishDate: '2026-10-28 10:00:00', subject: kirli, memberTitle: '\u202AÖRNEK\u200D A.Ş.', stockCodes: 'ORN\u200BKA' }]);
  assert.ok(a.ok);
  assert.equal(a.items![0].baslik, 'Başlıkx a b c');
  assert.equal(a.items![0].unvan, 'ÖRNEK A.Ş.');
  assert.deepEqual(a.items![0].kodlar, []); // kod alanı metin()'den geçmez: biçim dışı (gizli karakterli) kod atılır
  const tum = JSON.stringify(a);
  assert.ok(!/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u2028\u2029]/.test(tum));
});

test('D3: Retry-After HTTP-tarih biçimi de çözülür; geçmiş/bozuk tarih 60 sn tabanına düşer', async () => {
  const z = { t: Date.UTC(2026, 9, 29, 13, 0, 0) };
  const dene = async (basliklar: Record<string, string>) => {
    const h = kur({ zaman: z, fetchFn: async () => new Response('', { status: 429, headers: basliklar }) });
    return (await h(istek())).headers.get('retry-after');
  };
  assert.equal(await dene({ 'retry-after': 'Thu, 29 Oct 2026 13:05:00 GMT' }), '300');
  assert.equal(await dene({ 'retry-after': 'Thu, 29 Oct 2026 15:00:00 GMT' }), '900');  // 15 dk üst sınır
  assert.equal(await dene({ 'retry-after': 'Thu, 29 Oct 2026 12:00:00 GMT' }), '60');   // geçmiş
  assert.equal(await dene({ 'retry-after': 'bir gun sonra' }), '60');
  assert.equal(await dene({ 'retry-after': '120' }), '120');
});

test('D4: gelecek tarihli bildirim reddedilir (10 dk tolerans); sunucu saatiyle sınanır', async () => {
  const simdi = Date.UTC(2026, 9, 29, 7, 0, 0); // 10:00 TSİ
  assert.equal(kapZamanCoz('2026-10-29 10:09:00', simdi), '2026-10-29T10:09:00+03:00');   // 9 dk ileri: tolerans içinde
  assert.equal(kapZamanCoz('2026-10-29 10:11:00', simdi), undefined);                      // 11 dk ileri
  assert.equal(kapZamanCoz('30.10.2026 09:00:00', simdi), undefined);
  assert.equal(kapZamanCoz('2026-10-29 23:00:00'), '2026-10-29T23:00:00+03:00');           // simdi verilmezse denetim yok
  const a = kapAyristir([
    { disclosureIndex: 1, publishDate: '2026-10-29 09:00:00', subject: 'geçmiş' },
    { disclosureIndex: 2, publishDate: '2026-12-31 09:00:00', subject: 'gelecek' },
  ], simdi);
  assert.deepEqual(a.items!.map(i => i.no), [1]);
  assert.equal(kapAyristir([{ disclosureIndex: 2, publishDate: '2026-12-31 09:00:00', subject: 'g' }], simdi).ok, false); // hepsi tanınmadı
  // sunucu işleyicisi simdi() ile çağırır
  const h = kur({ zaman: { t: simdi }, fetchFn: async () => new Response(JSON.stringify([
    { disclosureIndex: 5, publishDate: '2026-10-29 09:30:00', subject: 'a' },
    { disclosureIndex: 6, publishDate: '2026-10-29 23:30:00', subject: 'b' },
  ])) });
  assert.deepEqual(((await govde(await h(istek()))).items as Array<{ no: number }>).map(i => i.no), [5]);
});

test('B12-3/R1: production, boş ve bilinmeyen ortamda FAGENT_KAZIMA yok sayılır: KAP da 503 kapali, 0 fetch', async () => {
  const ortamlar: Array<[Record<string, string>, unknown]> = [
    [{ VERCEL_ENV: 'production' }, undefined], [{ CONTEXT: 'production' }, undefined], [{ VERCEL_ENV: '' }, undefined], [{}, undefined],
    [{}, { deploy: { context: 'production' } }],
  ];
  for (const [ek, ctx] of ortamlar) {
    let n = 0;
    const h = kur({ env: { FAGENT_KAZIMA: 'on', ...ek }, fetchFn: async () => { n++; return new Response('{}'); } });
    const r = await h(istek(), ctx as never);
    assert.equal(r.status, 503, JSON.stringify([ek, ctx]));
    assert.equal((await govde(r)).error, 'kapali');
    assert.equal(n, 0);
  }
  const h = kur({ env: { FAGENT_KAZIMA: 'on' }, fetchFn: async () => new Response('{"items":[]}') });
  assert.equal((await h(istek(), { deploy: { context: 'deploy-preview' } } as never)).status, 200);
});
