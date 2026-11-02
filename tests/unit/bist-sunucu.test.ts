// Birim testler: netlify/functions/bist.mjs (api/bist.mjs bunu Vercel'e bağlar). Sahte fetch; borsaistanbul.com'a gerçek istek ATILMAZ.
// Bülten biçimi DOĞRULANMADI: gerçek ayrıştırıcı yok; testler SENTETİK biçimle hattı sınar (tests/fixtures/bist/bist-sentetik.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import varsayilan, {
  createBistHandler, bistAyristir, beklenenBultenTarihi, bistCdnSaniye, bicimTaniBayt, guvenliOzet, BIST_AYRISTIRICILAR, BIST_SABITLERI, kesifAcikMi,
} from '../../netlify/functions/bist.mjs';
import { kazimaAcikMi } from '../../netlify/ortak/sunucu-ortak.mjs';
import { GET } from '../../api/bist.mjs';
import { sentetikMetin, sentetikAyristirici } from '../fixtures/bist/bist-sentetik.ts';

const BASE = 'https://ornek.invalid/api/bist';
const istek = (url = BASE, basliklar: Record<string, string> = {}, method = 'GET') => new Request(url, { method, headers: basliklar });
const govde = async (r: Response) => await r.json() as Record<string, unknown>;
const ACIK = { FAGENT_KAZIMA: 'on', VERCEL_ENV: 'preview' };
const tsi = (y: number, a: number, g: number, sa: number, dk = 0) => Date.UTC(y, a - 1, g, sa - 3, dk);
const PERSEMBE_20 = tsi(2026, 10, 29, 20, 0);   // bülten sonrası
const IL = (z: { t: number }) => { z.t += 61_000; };

function kur(opts: {
  fetchFn?: (u: string, i: RequestInit) => Promise<Response>; env?: Record<string, string>; zaman?: { t: number };
  ayristiricilar?: unknown[]; platform?: 'netlify' | 'vercel';
} = {}) {
  const zaman = opts.zaman ?? { t: PERSEMBE_20 };
  return createBistHandler({
    fetchFn: opts.fetchFn ?? (async () => new Response(sentetikMetin())),
    env: opts.env ?? ACIK,
    simdi: () => zaman.t,
    platform: opts.platform,
    ayristiricilar: (opts.ayristiricilar ?? [sentetikAyristirici]) as never,
  });
}

/* ── bayrak, parametre, kimlik ── */

test('U6: bayraksız /api/bist -> 503 kapali, Borsa İstanbul\'a HİÇ gidilmez (keşif bayrağı açık olsa bile)', async () => {
  for (const env of [{}, { FAGENT_KAZIMA: 'off' }, { FAGENT_BIST_KESIF: 'on' }]) {
    let n = 0;
    const h = kur({ env, fetchFn: async () => { n++; return new Response('x'); } });
    const r = await h(istek());
    assert.equal(r.status, 503);
    assert.equal((await govde(r)).error, 'kapali');
    assert.equal(n, 0);
  }
});

test('U6: varsayılan dışa aktarma ve api/bist.mjs GET bayraksız ortamda 503 kapali; üretim ayrıştırıcı kaydı BOŞ', async () => {
  const eski = process.env.FAGENT_KAZIMA;
  delete process.env.FAGENT_KAZIMA;
  try {
    const r = await GET(istek(BASE, { 'x-real-ip': '10.0.0.9' }));
    assert.equal(r.status, 503);
    assert.equal((await govde(r)).error, 'kapali');
    assert.equal(typeof varsayilan, 'function');
  } finally { if (eski !== undefined) process.env.FAGENT_KAZIMA = eski; }
  assert.equal(BIST_AYRISTIRICILAR.length, 0);
});

test('parametre: HER sorgu parametresi 400 (kesif/sembol dâhil, yukarı akışa gidilmez); GET dışı yöntem 405', async () => {
  let n = 0;
  const h = kur({ fetchFn: async () => { n++; return new Response('x'); } });
  for (const q of ['?kesif', '?kesif=1', '?symbols=ORNKA', '?x=1']) assert.equal((await h(istek(BASE + q))).status, 400, q);
  assert.equal((await h(istek(BASE, {}, 'POST'))).status, 405);
  assert.equal(n, 0);
});

test('yukarı akış isteği sabit: adres, GET, dürüst User-Agent (tarayıcı taklidi yok), çerez/yetki/IP aktarılmaz, redirect:error', async () => {
  let g: { url: string; init: RequestInit } | undefined;
  const h = kur({ fetchFn: async (url, init) => { g = { url, init }; return new Response(sentetikMetin()); } });
  await h(istek(BASE, { cookie: 'a=gizli', authorization: 'Bearer x', 'x-real-ip': '1.2.3.4', referer: 'https://fagent.example/p' }));
  assert.ok(g);
  assert.equal(g.url, BIST_SABITLERI.BULTEN_ADRES);
  assert.equal(g.init.method, 'GET');
  assert.equal(g.init.redirect, 'error');
  assert.ok(g.init.signal);
  const b = g.init.headers as Record<string, string>;
  assert.equal(b['user-agent'], 'FAGENT/1.0');
  assert.ok(!/mozilla|chrome|safari/i.test(JSON.stringify(b)));
  for (const y of ['cookie', 'authorization', 'origin', 'referer', 'x-real-ip', 'x-forwarded-for']) assert.ok(!(y in b), y);
  assert.equal(g.init.body, undefined);
});

/* ── başarı yolu (SENTETİK biçim) ── */

test('başarı: yalnız {tarih, beklenen, satirlar}; ham içerik yok; önbellek başlığı bülten güncelse sonraki iş günü 19:30\'a kadar', async () => {
  const r = await kur()(istek());
  assert.equal(r.status, 200);
  const j = await govde(r);
  assert.deepEqual(Object.keys(j).sort(), ['beklenen', 'satirlar', 'tarih']);
  assert.deepEqual([j.tarih, j.beklenen], ['2026-10-29', '2026-10-29']);
  assert.deepEqual(j.satirlar, [{ kod: 'ORNKA', kapanis: 12.5 }, { kod: 'ORNKB', kapanis: 100 }, { kod: 'ORNKC', kapanis: 7.25 }]);
  // Perşembe 20:00 -> Cuma 19:30 = 23,5 sa
  assert.match(r.headers.get('cache-control') ?? '', /s-maxage=84600\b.*stale-while-revalidate=300/);
});

test('gün sonu penceresi: beklenen bülten tarihi (hafta içi 19:30\'dan sonra bugün, yoksa önceki iş günü, hafta sonu Cuma)', () => {
  assert.equal(beklenenBultenTarihi(tsi(2026, 10, 29, 19, 29)), '2026-10-28');
  assert.equal(beklenenBultenTarihi(tsi(2026, 10, 29, 19, 30)), '2026-10-29');
  assert.equal(beklenenBultenTarihi(tsi(2026, 10, 30, 10, 0)), '2026-10-29');
  assert.equal(beklenenBultenTarihi(tsi(2026, 10, 31, 12, 0)), '2026-10-30'); // Cumartesi
  assert.equal(beklenenBultenTarihi(tsi(2026, 11, 1, 23, 0)), '2026-10-30');  // Pazar
  assert.equal(beklenenBultenTarihi(tsi(2026, 11, 2, 9, 0)), '2026-10-30');   // Pazartesi sabah
  assert.equal(beklenenBultenTarihi(Date.UTC(2026, 9, 29, 17, 0)), '2026-10-29'); // 20:00 TSİ
});

test('CDN süresi: güncel bülten uzun (en çok 24 sa), eski/yok 15 dk; Cuma akşamı 24 saat sınırı', () => {
  const t = tsi(2026, 10, 29, 20, 0);
  assert.equal(bistCdnSaniye(t, '2026-10-29', '2026-10-29'), 84600);
  assert.equal(bistCdnSaniye(t, '2026-10-28', '2026-10-29'), 900);   // eski bülten
  assert.equal(bistCdnSaniye(t, undefined, '2026-10-29'), 900);
  assert.equal(bistCdnSaniye(tsi(2026, 10, 30, 20, 0), '2026-10-30', '2026-10-30'), 86400); // Cuma akşamı: Pazartesi 19:30 > 24 sa
  assert.equal(bistCdnSaniye(tsi(2026, 10, 29, 19, 29), '2026-10-28', '2026-10-28'), 900); // 19:30'a 1 dk kala: alt sınır 15 dk
});

test('eski bülten: yanıt gelir ama beklenen tarihle farkı istemciye bildirilir ve CDN 15 dk', async () => {
  const r = await kur({ fetchFn: async () => new Response(sentetikMetin('2026-10-28')) })(istek());
  const j = await govde(r);
  assert.deepEqual([j.tarih, j.beklenen], ['2026-10-28', '2026-10-29']);
  assert.match(r.headers.get('cache-control') ?? '', /s-maxage=900\b/);
});

/* ── biçim doğrulanmadı: veri_yok yolu ── */

test('B12-1: ayrıştırıcı kaydı boşken (üretim durumu) Borsa İstanbul\'a HİÇ gidilmez: 502 okunamadi / bicim_dogrulanmadi, fetch sayısı 0', async () => {
  let n = 0;
  const h = kur({ ayristiricilar: [], fetchFn: async () => { n++; return new Response('%PDF-1.7 SIR-ICERIK'); } });
  const z = { t: PERSEMBE_20 };
  for (let i = 0; i < 3; i++) {
    const r = await h(istek());
    assert.equal(r.status, 502);
    const j = await govde(r);
    assert.deepEqual([j.error, j.neden], ['okunamadi', 'bicim_dogrulanmadi']);
    assert.ok(!JSON.stringify(j).includes('SIR-ICERIK'));
  }
  assert.equal(n, 0);
  void z;
});

test('ayrıştırıcı çıktısı doğrulanır: gelecek/gerçek olmayan tarih, bozuk kod, sıfır/negatif/NaN fiyat, kopya, satır sınırı', () => {
  const simdi = PERSEMBE_20;
  const dene = (tarih: string, satirlar: unknown[]) => bistAyristir('#SENTETIK;x', [{ taniyabilir: () => true, ayristir: () => ({ tarih, satirlar }) }] as never, simdi);
  assert.equal(dene('2026-10-30', [{ kod: 'ORNKA', kapanis: 1 }]).ok, false);          // gelecek
  assert.equal(dene('2026-02-31', [{ kod: 'ORNKA', kapanis: 1 }]).ok, false);          // gerçek değil
  assert.equal(dene('29.10.2026', [{ kod: 'ORNKA', kapanis: 1 }]).ok, false);          // biçim
  const a = dene('2026-10-29', [
    { kod: 'ORNKA', kapanis: 1 }, { kod: 'ORNKA', kapanis: 2 }, { kod: 'ornkb', kapanis: 3 }, { kod: 'ORNKC', kapanis: 0 },
    { kod: 'ORNKD', kapanis: -4 }, { kod: 'ORNKE', kapanis: NaN }, { kod: 'ORNKF', kapanis: '5' }, { kod: 'ORNKG', kapanis: 1e6 }, { kod: 'ORNKH', kapanis: 8 }, null,
  ]);
  assert.ok(a.ok);
  assert.deepEqual(a.satirlar, [{ kod: 'ORNKA', kapanis: 1 }, { kod: 'ORNKH', kapanis: 8 }]);
  assert.equal(dene('2026-10-29', [{ kod: 'x', kapanis: 1 }]).ok, false);               // hiç satır tanınmadı
  assert.equal(dene('2026-10-29', Array.from({ length: 3001 }, (_, i) => ({ kod: 'K' + String(i).padStart(4, '0'), kapanis: 1 }))).ok, false);
  const patlayan = bistAyristir('x', [{ taniyabilir: () => true, ayristir: () => { throw new Error('x'); } }] as never);
  assert.deepEqual([patlayan.ok, patlayan.neden], [false, 'sema']);
});

/* ── hata yolları ve kibar kullanım ── */

test('hatalar: ağ/zaman aşımı/5xx/4xx -> 502 (ham gövde ve durum kodu geçmez); 4xx devreyi açmaz', async () => {
  const z = { t: PERSEMBE_20 };
  const senaryolar: Array<[() => Promise<Response>, string]> = [
    [async () => { throw new TypeError('ağ'); }, 'ulasilamadi'],
    [async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }, 'zaman_asimi'],
    [async () => new Response('SIR-GOVDE', { status: 503 }), 'kaynak_hatasi'],
    [async () => new Response('SIR-WAF', { status: 403 }), 'kaynak_reddetti'],
  ];
  for (const [fetchFn, beklenen] of senaryolar) {
    const r = await kur({ fetchFn, zaman: z })(istek());
    const j = await govde(r);
    assert.equal(r.status, 502);
    assert.equal(j.error, beklenen);
    assert.ok(!('status' in j) && !JSON.stringify(j).includes('SIR-'));
  }
  let n = 0;
  const h = kur({ zaman: z, fetchFn: async () => { n++; return new Response('x', { status: 403 }); } });
  for (let i = 0; i < 5; i++) { await h(istek()); IL(z); }
  assert.equal(n, 5);
});

test('devre kesici: 3 ardışık ağ hatası -> 15 dk gidilmez; sonra denenir', async () => {
  const z = { t: PERSEMBE_20 };
  let n = 0;
  const h = kur({ zaman: z, fetchFn: async () => { n++; throw new TypeError('ağ'); } });
  for (let i = 0; i < 3; i++) { await h(istek()); IL(z); }
  assert.equal((await h(istek())).status, 502);
  assert.equal(n, 3);
  z.t += 15 * 60_000;
  await h(istek());
  assert.equal(n, 4);
});

test('429: Retry-After (saniye ve HTTP-tarih) uygulanır, devre açılır, yeniden deneme yok', async () => {
  const z = { t: Date.UTC(2026, 9, 29, 17, 0, 0) };
  let n = 0;
  const h = kur({ zaman: z, fetchFn: async () => { n++; return n === 1 ? new Response('', { status: 429, headers: { 'retry-after': 'Thu, 29 Oct 2026 17:05:00 GMT' } }) : new Response(sentetikMetin()); } });
  const r = await h(istek());
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '300');
  z.t += 120_000;
  assert.equal((await h(istek())).status, 502);
  assert.equal(n, 1);
  z.t += 181_000;
  assert.equal((await h(istek())).status, 200);
});

test('F1 büyük gövde: (a) content-length 3 MB, (b) akışta 2 MB aşımı -> okunamadi (bicim_dogrulanmadi DEĞİL, sınır); 1 MB gövde kabul edilir', async () => {
  // Sahte ayrıştırıcı kayıtlı (kur varsayılanı): sınır olmasaydı geçerli sentetik metin 200 dönerdi -> test sınırı gerçekten sınar.
  const ge = sentetikMetin();
  const a = await kur({ fetchFn: async () => new Response(ge, { headers: { 'content-length': String(3 * 1024 * 1024) } }) })(istek());
  assert.equal(a.status, 502);
  const ja = await govde(a);
  assert.deepEqual([ja.error, ja.neden], ['okunamadi', undefined]);
  const akis = (bayt: number) => new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(ge));
    for (let k = 0; k < bayt; k += 65536) c.enqueue(new TextEncoder().encode(' '.repeat(Math.min(65536, bayt - k))));
    c.close();
  } });
  const b = await kur({ fetchFn: async () => new Response(akis(2 * 1024 * 1024 + 1024)) })(istek());
  assert.equal(b.status, 502);
  const jb = await govde(b);
  assert.deepEqual([jb.error, jb.neden], ['okunamadi', undefined]);
  const iyi = await kur({ fetchFn: async () => new Response(akis(1024 * 1024)) })(istek());
  assert.equal(iyi.status, 200);
});

test('60 sn içinde sonuç paylaşılır; eşzamanlı istekler tek istek', async () => {
  const z = { t: PERSEMBE_20 };
  let n = 0;
  const h = kur({ zaman: z, fetchFn: async () => { n++; await new Promise(r => setTimeout(r, 10)); return new Response(sentetikMetin()); } });
  const sonuc = await Promise.all([h(istek()), h(istek()), h(istek())]);
  assert.deepEqual(sonuc.map(s => s.status), [200, 200, 200]);
  z.t += 30_000;
  await h(istek());
  assert.equal(n, 1);
  z.t += 31_000;
  await h(istek());
  assert.equal(n, 2);
});
test('hız sınırı: 30 istekten sonra 429; sahte x-forwarded-for / öbür platform başlığı kovayı değiştirmez', async () => {
  const h = kur({ platform: 'vercel' });
  let son = 200;
  for (let i = 0; i < 31; i++) son = (await h(istek(BASE, { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': `10.0.0.${i}`, 'x-nf-client-connection-ip': `8.8.8.${i}` }))).status;
  assert.equal(son, 429);
  assert.equal((await h(istek(BASE, { 'x-real-ip': '7.7.7.7' }))).status, 200);
});

/* ── U5 keşif modu ── */

test('U5 keşif: FAGENT_BIST_KESIF=on iken yalnız durum, content-type, boyut ve ilk 512 baytın güvenli özeti döner; ayrıştırma yapılmaz', async () => {
  const gizli = '<script>alert(1)</script>\u0000\u0007ÇŞ' + 'A'.repeat(2000);
  const h = kur({
    env: { ...ACIK, FAGENT_BIST_KESIF: 'on' },
    fetchFn: async () => {
      const bytes = new TextEncoder().encode(gizli);
      const akis = new ReadableStream({ start(c) { c.enqueue(bytes.subarray(0, 300)); c.enqueue(bytes.subarray(300)); c.close(); }});
      return new Response(akis, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(bytes.length) } });
    },
  });
  const r = await h(istek());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const j = await govde(r);
  assert.deepEqual(Object.keys(j).sort(), ['adres', 'boyut', 'contentType', 'durum', 'hex16', 'ilkBayt', 'imza', 'kesif', 'ozet']);
  assert.equal(j.kesif, true);
  assert.equal(j.adres, BIST_SABITLERI.BULTEN_ADRES);
  assert.equal(j.durum, 200);
  assert.equal(j.contentType, 'text/html; charset=utf-8');
  assert.equal(j.boyut, new TextEncoder().encode(gizli).length);
  assert.equal(j.ilkBayt, 512);
  assert.equal((j.ozet as string).length, 512);
  assert.ok(/^[\x20-\x7e]*$/.test(j.ozet as string), 'özet yalnız yazdırılabilir ASCII');
  assert.equal(j.imza, 'bilinmiyor'); // ilk baytlarda NUL/kontrol karakteri var; '<script' html etiketi sayılmaz
});

test('U5 keşif: imza etiketleri (pdf, zip, html, metin, bilinmiyor); content-type temizlenir; ağ hatası 502', async () => {
  const enc = (s: string | number[]) => (typeof s === 'string' ? new TextEncoder().encode(s) : Uint8Array.from(s));
  assert.equal(bicimTaniBayt(enc('%PDF-1.4')), 'pdf');
  assert.equal(bicimTaniBayt(enc([0x50, 0x4b, 3, 4, 0])), 'zip');
  assert.equal(bicimTaniBayt(enc('  <!DOCTYPE html><html>')), 'html');
  assert.equal(bicimTaniBayt(enc('KOD;KAPANIS\nORNKA;1,5')), 'metin');
  assert.equal(bicimTaniBayt(enc([0, 1, 2, 3, 255, 254])), 'bilinmiyor');
  assert.equal(guvenliOzet(enc([65, 0, 10, 200, 66])), 'A. .B');
  const h = kur({ env: { ...ACIK, FAGENT_BIST_KESIF: 'on' }, fetchFn: async () => new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf<script>' } }) });
  const j = await govde(await h(istek()));
  assert.deepEqual([j.imza, j.contentType, j.boyut], ['pdf', '?', null]);
  const hata = kur({ env: { ...ACIK, FAGENT_BIST_KESIF: 'on' }, fetchFn: async () => { throw new TypeError('ağ'); } });
  assert.equal((await hata(istek())).status, 502);
  assert.equal(kesifAcikMi({ FAGENT_BIST_KESIF: 'on', VERCEL_ENV: 'preview' }), true);
  assert.equal(kesifAcikMi({}), false);
});

test('U5 keşif: sorgu parametresiyle tetiklenemez (400); bayrak kapalıyken normal yol çalışır', async () => {
  const h = kur({ env: { ...ACIK, FAGENT_BIST_KESIF: 'on' } });
  assert.equal((await h(istek(BASE + '?kesif'))).status, 400);
  const normal = await govde(await kur()(istek()));
  assert.ok('satirlar' in normal && !('kesif' in normal));
});

/* ── kaynak kodu işaretleri ── */

test('TODO(hukuk) işareti, dürüst kimlik ve Üst Kurul beklemesi kayıtlı; kodda tarayıcı taklidi yok', () => {
  const kod = readFileSync(new URL('../../netlify/functions/bist.mjs', import.meta.url), 'utf8');
  assert.ok(kod.includes('TODO(hukuk)'));
  assert.ok(!/Mozilla|Chrome\/|Safari\//i.test(kod.replace(/^\s*\/\/.*$/gm, '')));
  assert.ok(readFileSync(new URL('../../api/bist.mjs', import.meta.url), 'utf8').includes('TODO(hukuk)'));
  assert.ok(readFileSync(new URL('../../docs/teknoloji-talepleri.md', import.meta.url), 'utf8').includes('BEKLEMEDE'));
});

/* ── gün içi veri yok (AGENTS.md §0.4) ── */

test('gün içi yok: ayrıştırıcı anlık/açılış/hacim/saat alanı üretse bile yanıta yalnız {kod, kapanis} girer; yanıtta saat/anlık alanı yok', async () => {
  const zengin = {
    ad: 'zengin', taniyabilir: () => true,
    ayristir: () => ({ tarih: '2026-10-29', satirlar: [{ kod: 'ORNKA', kapanis: 12.5, son: 12.9, anlik: 13, acilis: 12, hacim: 999, saat: '14:03:11' }] }),
  };
  const r = await kur({ ayristiricilar: [zengin] })(istek());
  const j = await govde(r);
  assert.deepEqual(j.satirlar, [{ kod: 'ORNKA', kapanis: 12.5 }]);
  assert.ok(!/anlik|acilis|hacim|saat|son"/.test(JSON.stringify(j)));
});

test('gün içi yok: sunucu ve istemci kaynağında gün içi/anlık fiyat alanı okunmaz', () => {
  for (const yol of ['../../netlify/functions/bist.mjs', '../../src/kaynaklar/bist.ts']) {
    const kod = readFileSync(new URL(yol, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/(anlik|intraday|realtime|websocket|setInterval)/i.test(kod), yol);
  }
});

/* ── B12-3 üretimde varsayılan ret, B12-4 keşifte 4xx/5xx ── */

test('B12-3/R1: yalnız ortam AÇIKÇA önizleme/geliştirme + bayrak on ise açılır; production, boş ve bilinmeyen ortam kapalı (503, 0 fetch)', async () => {
  const kapaliOrtamlar: Array<[Record<string, string>, unknown]> = [
    [{ VERCEL_ENV: 'production' }, undefined], [{ CONTEXT: 'production' }, undefined], [{ VERCEL_ENV: 'Production' }, undefined],
    [{ VERCEL_ENV: '' }, undefined], [{}, undefined], [{ VERCEL_ENV: 'staging' }, undefined], [{ CONTEXT: 'ozel' }, undefined],
    [{ VERCEL_ENV: 'preview', CONTEXT: 'production' }, undefined],             // biri production ise kapalı
    [{}, { deploy: { context: 'production' } }], [{ CONTEXT: 'deploy-preview' }, { deploy: { context: 'production' } }],
  ];
  for (const [ek, ctx] of kapaliOrtamlar) {
    for (const bayrak of [{ FAGENT_KAZIMA: 'on' }, { FAGENT_KAZIMA: 'on', FAGENT_BIST_KESIF: 'on' }]) {
      let n = 0;
      const h = kur({ env: { ...bayrak, ...ek }, fetchFn: async () => { n++; return new Response(sentetikMetin()); } });
      const r = await h(istek(), ctx as never);
      assert.equal(r.status, 503, JSON.stringify([ek, ctx]));
      assert.equal((await govde(r)).error, 'kapali');
      assert.equal(n, 0);
    }
  }
  assert.equal(kesifAcikMi({ FAGENT_BIST_KESIF: 'on', VERCEL_ENV: 'production' }), false);
  assert.equal(kesifAcikMi({ FAGENT_BIST_KESIF: 'on' }), false);
  assert.equal(kesifAcikMi({ FAGENT_BIST_KESIF: 'on', VERCEL_ENV: 'preview' }), true);
  assert.equal(kazimaAcikMi({ FAGENT_KAZIMA: 'on', CONTEXT: 'production' }), false);
  assert.equal(kazimaAcikMi({ FAGENT_KAZIMA: 'on', VERCEL_ENV: '' }), false);
  const acik: Array<[Record<string, string>, unknown]> = [
    [{ VERCEL_ENV: 'preview' }, undefined], [{ VERCEL_ENV: 'development' }, undefined], [{ CONTEXT: 'deploy-preview' }, undefined],
    [{ CONTEXT: 'branch-deploy' }, undefined], [{}, { deploy: { context: 'deploy-preview' } }],
  ];
  for (const [ek, ctx] of acik) {
    let n = 0;
    const h = kur({ env: { FAGENT_KAZIMA: 'on', ...ek }, fetchFn: async () => { n++; return new Response(sentetikMetin()); } });
    assert.equal((await h(istek(), ctx as never)).status, 200, JSON.stringify([ek, ctx]));
    assert.equal(n, 1);
  }
  // ortam doğru ama bayrak yok -> kapalı
  assert.equal((await kur({ env: { VERCEL_ENV: 'preview' } })(istek())).status, 503);
});

test('B12-4: keşifte yukarı akış 4xx/5xx başarı sayılmaz: 3 ardışık hata devreyi açar; 200 açmaz', async () => {
  for (const [kod, acilir] of [[503, true], [403, true], [200, false]] as const) {
    const z = { t: PERSEMBE_20 };
    let n = 0;
    const h = kur({ zaman: z, env: { ...ACIK, FAGENT_BIST_KESIF: 'on' }, fetchFn: async () => { n++; return new Response('x', { status: kod }); } });
    for (let i = 0; i < 4; i++) { await h(istek()); IL(z); }
    assert.equal(n, acilir ? 3 : 4, String(kod));
  }
});

test('F2 keşif isteği başlıkları: yalnız user-agent FAGENT/1.0 + accept, signal, redirect:error, GET, gövde yok; çerez/yetki/IP aktarılmaz', async () => {
  let g: { url: string; init: RequestInit } | undefined;
  const h = kur({ env: { ...ACIK, FAGENT_BIST_KESIF: 'on' }, fetchFn: async (url, init) => { g = { url, init }; return new Response('%PDF-1.7'); } });
  await h(istek(BASE, { cookie: 'a=gizli', authorization: 'Bearer x', 'x-real-ip': '1.2.3.4', referer: 'https://fagent.example/p' }));
  assert.ok(g);
  assert.equal(g.url, BIST_SABITLERI.BULTEN_ADRES);
  assert.equal(g.init.method, 'GET');
  assert.equal(g.init.redirect, 'error');
  assert.ok(g.init.signal);
  assert.equal(g.init.body, undefined);
  const b = g.init.headers as Record<string, string>;
  assert.deepEqual(Object.keys(b).sort(), ['accept', 'user-agent']);
  assert.equal(b['user-agent'], 'FAGENT/1.0');
});
