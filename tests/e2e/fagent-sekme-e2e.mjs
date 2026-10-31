// A8 — iki sekme aynı anda (gerçek Chromium, AYNI tarayıcı bağlamında iki sayfa; storage olayı gerçek).
//   1) A sekmesi kayıt ekler -> B sekmesi yenilemeden görür
//   2) B sekmesi kendi kaydını ekler -> A'nın kaydı KAYBOLMAZ (eski bellekle ezme yok), diskte ikisi de var
//   3) A'da SIFIRLA -> B boşalır, B diski eski veriyle yeniden DOLDURMAZ (B'de işlem yapılsa bile eski kayıt dönmez)
//   4) B'de kaydedilmemiş (kota taklidi) değer varken A aynı anahtarı değiştirir -> ÇAKIŞMA: B'nin değeri ezilmez,
//      mevcut uyarı kartında (#kayit-uyarisi) betimleyici bildirim görünür, A'nın değeri kurtarma alanına (geri kovası) alınır
//   5) A6 D-b: 256 KB üstü bozuk ham değer IndexedDB'de AYRI bozuk kovada (fagent.recovery.idb.bozuk.*) durur
//   6) O1 SİLME KAZANIR: B'de kaydedilmemiş değer varken A'da SIFIRLA -> B'nin bekleyen değeri atılır, bildirim, B'nin sonraki
//      yazımı eski veriyi geri getirmez; IndexedDB'de de yok
//   8) O-a: TAKILI (süresi geçmiş) silme işareti varken başka sekmenin sıradan yazımı silme sayılmaz: bekleyen değer atılmaz,
//      yanlış 'veriler silindi' bildirimi çıkmaz, kullanıcının kendi işlemi yazılır
//   7) O3 olay gecikmesi: başka sekmenin yazısı olay işlenmeden ezilirse önceki sürüm kurtarma alanına alınır ve bildirilir
// Taklit: yalnız 4. senaryoda setItem kotası; IndexedDB ve storage olayı gerçektir. Dış ağ kullanılmaz.
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_DEFAULT_BASE_URL || 'http://localhost:4200/';
const PK = 'fagent.portfolio.v1';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

const open = async (ctx) => {
  const page = await ctx.newPage();
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return page;
};
const lsGet = (page, k) => page.evaluate(key => localStorage.getItem(key), k);
const holdings = async (page) => JSON.parse((await lsGet(page, PK)) ?? '{"holdings":[]}').holdings.map(h => h.name);
const idbKeys = (page) => page.evaluate(() => new Promise(res => { const r = indexedDB.open('fagent', 1); r.onerror = () => res('ERR'); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').getAllKeys(); g.onsuccess = () => { r.result.close(); res(g.result.map(String)); }; g.onerror = () => res('ERR'); }; }));
const idbVal = (page, k) => page.evaluate(key => new Promise(res => { const r = indexedDB.open('fagent', 1); r.onerror = () => res('ERR'); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get(key); g.onsuccess = () => { r.result.close(); res(g.result?.value ?? null); }; g.onerror = () => res('ERR'); }; }), k);
const ekle = async (page, ad, tutar = '1000') => {
  await page.fill('#h-name', ad);
  await page.fill('#h-amount', tutar);
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
};

/* ── 1) A kayıt ekler -> B yenilemeden görür ── */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const A = await open(ctx);
const B = await open(ctx);
await A.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await A.waitForSelector('#h-name');
await ekle(A, 'ALFA');
check('A: ALFA diske yazıldı', await until(async () => (await holdings(A)).includes('ALFA')));
check('B: yenileme olmadan panele geçti ve ALFA ekranda (storage olayı)', await until(async () => (await B.locator('text=ALFA').count()) > 0));

/* ── 2) B kendi kaydını ekler -> A'nın kaydı kaybolmaz ── */
await B.waitForSelector('#h-name');
await ekle(B, 'BETA');
check('Disk: ALFA ve BETA birlikte (B eski bellekle ALFA\'yı ezmedi)', await until(async () => { const h = await holdings(B); return h.includes('ALFA') && h.includes('BETA'); }));
check('A: B\'nin eklediği BETA ekranda', await until(async () => (await A.locator('text=BETA').count()) > 0));

/* ── 3) A'da SIFIRLA -> B boşalır, diski yeniden doldurmaz ── */
A.on('dialog', d => d.accept());
await A.click('text=SIFIRLA');
check('A: SIFIRLA sonrası onboarding', await until(async () => (await A.getByRole('button', { name: 'Karma örnek portföy' }).count()) === 1));
check('B: bellek boşaldı (onboarding), ALFA/BETA ekranda yok', await until(async () => (await B.getByRole('button', { name: 'Karma örnek portföy' }).count()) === 1 && (await B.locator('text=ALFA').count()) === 0));
await B.waitForTimeout(1500);
check('B: localStorage\'a eski kayıt geri yazılmadı', !(await lsGet(B, PK) ?? '').includes('ALFA') && !(await lsGet(B, PK) ?? '').includes('BETA'));
const ks = await idbKeys(B);
const idbPortfoy = (await idbVal(B, PK)) ?? '';
check('B: IndexedDB\'de eski veri ve kurtarma kaydı yok, silme işareti kalktı',
  !idbPortfoy.includes('ALFA') && !idbPortfoy.includes('BETA') && ks.every(k => k === PK) && (await lsGet(B, 'fagent.mirror.cleared.v1')) === null);
// B'de yeni işlem: yalnız yeni veri yazılır (eski bellek dönmez)
await B.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await B.waitForSelector('#h-name');
await ekle(B, 'GAMA');
check('B: yeni işlem sonrası disk yalnız GAMA (ALFA/BETA geri gelmedi)', await until(async () => { const h = await holdings(B); return h.length === 1 && h[0] === 'GAMA'; }));
check('A: GAMA\'yı gördü', await until(async () => (await A.locator('text=GAMA').count()) > 0));

/* ── 4) Çakışma: B\'de kaydedilmemiş değer varken A aynı anahtarı değiştirir ── */
const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx4.addInitScript(() => {
  const orig = Storage.prototype.setItem;
  window.__kota = { dolu: false };
  Storage.prototype.setItem = function (k, v) {
    if (this === window.localStorage && window.__kota.dolu && String(k).startsWith('fagent.') && !String(k).startsWith('fagent.mirror')) {
      throw new DOMException('kota taklidi', 'QuotaExceededError');
    }
    return orig.call(this, k, v);
  };
});
const A4 = await open(ctx4);
const B4 = await open(ctx4);
await A4.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await A4.waitForSelector('#h-name');
await ekle(A4, 'TEMEL');
await until(async () => (await B4.locator('text=TEMEL').count()) > 0);
await B4.evaluate(() => { window.__kota.dolu = true; });
await B4.waitForSelector('#h-name');
await ekle(B4, 'BEKLEYEN');
check('B: kota doluyken BEKLEYEN ekranda ve kaydedilmedi uyarısı var', await until(async () => (await B4.locator('text=BEKLEYEN').count()) > 0 && (await B4.locator('#kayit-uyarisi').count()) === 1));
await B4.evaluate(() => { window.__kota.dolu = false; });
await ekle(A4, 'DIGERSEKME');
check('A: DIGERSEKME diske yazıldı', await until(async () => (await holdings(A4)).includes('DIGERSEKME')));
const uyari = B4.locator('#kayit-uyarisi');
check('B: uyarı kartında çakışma bildirimi (başka sekmede aynı veri değiştirildi)', await until(async () => ((await uyari.textContent()) ?? '').includes('Başka bir sekmede aynı veri değiştirildi')));
check('B: kopya alındıktan sonra bildirim "kurtarma alanına kopyalandı" der', await until(async () => ((await uyari.textContent()) ?? '').includes('Diğer sekmenin sürümü bu tarayıcıdaki kurtarma alanına kopyalandı')));
const metin = (await uyari.textContent()) ?? '';
check('B: bildirim betimleyici (olmayan güvence yok), emir/tavsiye kipi yok', metin.includes('açık sayfada duruyor ve yedek dosyasına giriyor') && !metin.includes('otomatik silinmedi') && !/malısın|yapmalı|öneri/i.test(metin));
check('B: bekleyen değer ekranda kaybolmadı (BEKLEYEN hâlâ görünür), DIGERSEKME ile ezilmedi', (await B4.locator('text=BEKLEYEN').count()) > 0);
check('B: diskteki değer A\'nınki (B zorla ezmedi)', !(await lsGet(B4, PK) ?? '').includes('BEKLEYEN'));
check('B: A\'nın değeri IndexedDB kurtarma alanına (geri kovası) alındı ve içinde DIGERSEKME var', await until(async () => { const k = (await idbKeys(B4)).find(x => x.startsWith('fagent.recovery.idb.geri.' + PK)); return !!k && ((await idbVal(B4, k)) ?? '').includes('DIGERSEKME'); }));
const [bYedek] = await Promise.all([B4.waitForEvent('download'), B4.getByRole('button', { name: 'Yedek Al' }).click()]);
const yedek = JSON.parse(await (await import('node:fs/promises')).readFile(await bYedek.path(), 'utf8'));
check('B: yedek dosyası bekleyen değeri taşıyor', (JSON.parse(yedek.data[PK] ?? '{"holdings":[]}').holdings ?? []).some(h => h.name === 'BEKLEYEN'));

/* ── 5) A6 D-b: büyük bozuk ham değer ayrı kovada ── */
const ctx5 = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const P5 = await open(ctx5);
await P5.evaluate(k => { localStorage.setItem(k, 'x'.repeat(300000)); }, PK);
await P5.reload({ waitUntil: 'networkidle' });
const bozukAnahtar = 'fagent.recovery.idb.bozuk.' + PK;
check('Büyük bozuk değer IndexedDB bozuk kovasında (300000 karakter)', await until(async () => ((await idbVal(P5, bozukAnahtar)) ?? '').length === 300000));
check('localStorage\'da yalnız not var, ham değer kopyası yok', await P5.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('fagent.recovery.corrupt.')).every(k => k.endsWith('.not'))));

/* ── 6) O1 SİLME KAZANIR ── */
const kotaScript = () => {
  const orig = Storage.prototype.setItem;
  window.__kota = { dolu: false };
  Storage.prototype.setItem = function (k, v) {
    if (this === window.localStorage && window.__kota.dolu && String(k).startsWith('fagent.') && !String(k).startsWith('fagent.mirror')) {
      throw new DOMException('kota taklidi', 'QuotaExceededError');
    }
    return orig.call(this, k, v);
  };
};
const ctx6 = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx6.addInitScript(kotaScript);
const C = await open(ctx6);
const D = await open(ctx6);
await C.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await C.waitForSelector('#h-name');
await ekle(C, 'TEMEL');
await until(async () => (await D.locator('text=TEMEL').count()) > 0);
await D.evaluate(() => { window.__kota.dolu = true; });
await D.waitForSelector('#h-name');
await ekle(D, 'BEKLEYEN');
check('D: kota doluyken BEKLEYEN ekranda ve kaydedilmedi uyarısı var', await until(async () => (await D.locator('text=BEKLEYEN').count()) > 0 && (await D.locator('#kayit-uyarisi').count()) === 1));
C.on('dialog', d => d.accept());
await C.click('text=SIFIRLA');
const uyariD = D.locator('#kayit-uyarisi');
check('D: bildirim: başka sekmede veriler silindi, bu sekmedeki kaydedilmemiş değişiklik de silindi', await until(async () => ((await uyariD.textContent()) ?? '').includes('Başka bir sekmede veriler silindi; bu sekmedeki kaydedilmemiş değişiklik de silindi.')));
check('D: bekleyen değer atıldı (onboarding, BEKLEYEN/TEMEL ekranda yok)', await until(async () => (await D.getByRole('button', { name: 'Karma örnek portföy' }).count()) === 1 && (await D.locator('text=BEKLEYEN').count()) === 0));
await D.evaluate(() => { window.__kota.dolu = false; });
await D.waitForTimeout(1500);
check('D: localStorage\'da BEKLEYEN/TEMEL yok (geri yazılmadı)', !((await lsGet(D, PK)) ?? '').includes('BEKLEYEN') && !((await lsGet(D, PK)) ?? '').includes('TEMEL'));
const idbD = (await idbVal(D, PK)) ?? '';
check('D: IndexedDB\'de BEKLEYEN/TEMEL yok, kurtarma kaydı yok, silme işareti kalktı', !idbD.includes('BEKLEYEN') && !idbD.includes('TEMEL') && (await idbKeys(D)).every(k => k === PK) && (await lsGet(D, 'fagent.mirror.cleared.v1')) === null);
await D.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await D.waitForSelector('#h-name');
await ekle(D, 'YENIDEN');
check('D: sonraki yazım yalnız yeni veriyi yazar (eski kayıt geri gelmedi)', await until(async () => { const h = await holdings(D); return h.length === 1 && h[0] === 'YENIDEN'; }));
await D.waitForTimeout(800);
const idbD2 = (await idbVal(D, PK)) ?? '';
check('D: IndexedDB aynası da yalnız YENIDEN', idbD2.includes('YENIDEN') && !idbD2.includes('BEKLEYEN') && !idbD2.includes('TEMEL'));

/* ── 7) O3 olay gecikmesi: olay işlenmeden eski bellekle yazım ── */
const ctx7 = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const E = await open(ctx7);
await E.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await E.waitForSelector('#h-name');
await ekle(E, 'XRAY');
await until(async () => (await holdings(E)).includes('XRAY'));
// Başka sekmenin yazısını ve olay gecikmesini taklit: aynı belgede doğrudan setItem (bu belgede storage olayı üretmez)
await E.evaluate(k => localStorage.setItem(k, JSON.stringify({ onboarded: true, realizedPnl: 0, txns: [], holdings: [{ id: 'f1', name: 'YABANCI', type: 'hisse', amount: 1, costBasis: 1 }] })), PK);
await ekle(E, 'YANKEE');
const uyariE = E.locator('#kayit-uyarisi');
check('E: ezen yazım uygulandı (XRAY ve YANKEE diskte)', await until(async () => { const h = await holdings(E); return h.includes('XRAY') && h.includes('YANKEE'); }));
check('E: ezilen sürüm IndexedDB kurtarma alanında (içinde YABANCI)', await until(async () => { const k = (await idbKeys(E)).find(x => x.startsWith('fagent.recovery.idb.geri.' + PK)); return !!k && ((await idbVal(E, k)) ?? '').includes('YABANCI'); }));
check('E: uyarı kartında üzerine yazma + kopyalandı bildirimi', await until(async () => { const t = (await uyariE.textContent().catch(() => '')) ?? ''; return t.includes('üzerine yazıldı') && t.includes('kurtarma alanına kopyalandı'); }));

/* ── 8) O-a: takılı (süresi geçmiş) silme işareti ── */
const ctx8 = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx8.addInitScript(kotaScript);
const F = await open(ctx8);
const G = await open(ctx8);
await F.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await F.waitForSelector('#h-name');
await ekle(F, 'TEMEL8');
await until(async () => (await G.locator('text=TEMEL8').count()) > 0);
await G.evaluate(() => { window.__kota.dolu = true; });
await G.waitForSelector('#h-name');
await ekle(G, 'BEKLEYEN8');
await until(async () => (await G.locator('#kayit-uyarisi').count()) === 1);
// silme işareti takıldı (2 dakika önce konmuş, hiç kalkmadı) ve F sıradan bir kayıt ekliyor
await F.evaluate(() => localStorage.setItem('fagent.mirror.cleared.v1', String(Date.now() - 120000)));
await ekle(F, 'DIGER8');
const uyariG = G.locator('#kayit-uyarisi');
check('G: takılı işaretle sıradan yabancı yazım = çakışma bildirimi (yanlış "veriler silindi" YOK)', await until(async () => { const t = (await uyariG.textContent()) ?? ''; return t.includes('Başka bir sekmede aynı veri değiştirildi') && !t.includes('veriler silindi'); }));
check('G: bekleyen değer atılmadı (BEKLEYEN8 ekranda)', (await G.locator('text=BEKLEYEN8').count()) > 0);
await G.evaluate(() => { window.__kota.dolu = false; });
await ekle(G, 'GSON8');
check('G: takılı işaret kopyayı/yazıcıyı engellemedi (G\'nin son yazımı diskte ve IndexedDB aynasında)', await until(async () => ((await lsGet(G, PK)) ?? '').includes('GSON8') && ((await idbVal(G, PK)) ?? '').includes('GSON8')));
await F.evaluate(() => localStorage.removeItem('fagent.mirror.cleared.v1'));
// F'nin kendi işlemi takılı işaretle de yazılır
await ekle(F, 'SON8');
check('F: kullanıcının kendi işlemi yazıldı (takılı işaret işlemi atmadı)', await until(async () => (await holdings(F)).includes('SON8')));

await browser.close();
if (failed) { console.log('BAŞARISIZ'); process.exit(1); }
console.log('Tüm sekme kontrolleri geçti');
