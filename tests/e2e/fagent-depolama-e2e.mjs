// P3 bağlama — IndexedDB aynası (gerçek Chromium IndexedDB'sine karşı).
//
// TEK GERÇEK KAYNAK bu adımda: localStorage ESAS, IndexedDB AYNA (src/mirror.ts, src/storage/mirror.ts).
// Doğrulanan davranışlar:
//   1) write-through: katman değişince IndexedDB'de aynı metin (portföy + ajan öğretisi)
//   2) yenile + localStorage'ı sil -> açılışta IndexedDB'den geri yüklenir
//   3) ikisi de dolu ve farklı -> localStorage esas kalır, IndexedDB'deki değer kurtarma kaydına alınır, ezilmez
//   4) kısmi durum (bir katman bilerek silindi) -> geri yükleme YOK (mevcut yedek e2e'si bunu bekler)
//   5) SIFIRLA iki katmanı da siler; yenileyince veri GERİ GELMEZ; yarım kalan silme (işaret) geri yüklemez
//   6) bozuk JSON: boş açılır ama ham değer kurtarma anahtarında durur; ilk kayıt onu ezmez
//   7) iki sekme eşzamanlı yazar: IndexedDB son localStorage haliyle eşleşir
//   8) IndexedDB yok / açılış asılı kalıyor -> uygulama yine açılır (zaman aşımı), localStorage ile çalışır
// Taklit YOK: IndexedDB gerçek tarayıcıdır. Dış ağ kullanılmaz.
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_DEFAULT_BASE_URL || 'http://localhost:4200/';
const PK = 'fagent.portfolio.v1';
const TK = 'fagent.agent.training.v1';
const REC_IDB = 'fagent.recovery.idb.';
const REC_LS = 'fagent.recovery.corrupt.';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const newCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  return ctx;
};
const open = async (ctx, url = BASE) => {
  const page = await ctx.newPage();
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
};
const lsGet = (page, k) => page.evaluate(key => localStorage.getItem(key), k);
// Mevcut 'fagent' veritabanını AÇAR (uygulama zaten kurmuştur); yoksa aynı şemayı kurar.
const idbRun = (page, mode, fn, arg) => page.evaluate(([m, f, a]) => new Promise(resolve => {
  const r = indexedDB.open('fagent', 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv', { keyPath: 'key' }); };
  r.onerror = () => resolve('ERR');
  r.onsuccess = () => {
    const db = r.result;
    try {
      const s = db.transaction('kv', m).objectStore('kv');
      // eslint-disable-next-line no-new-func
      const out = new Function('s', 'a', 'return (' + f + ')(s, a)')(s, a);
      out.onsuccess = () => { db.close(); resolve(out.result === undefined ? null : out.result); };
      out.onerror = () => { db.close(); resolve('ERR'); };
    } catch (e) { db.close(); resolve('ERR:' + e.name); }
  };
}), [mode, fn.toString(), arg]);
const idbVal = async (page, k) => {
  const rec = await idbRun(page, 'readonly', (s, a) => s.get(a), k);
  return rec && typeof rec === 'object' ? rec.value : rec;
};
const idbKeys = (page) => idbRun(page, 'readonly', s => s.getAllKeys());
const idbPut = (page, k, v) => idbRun(page, 'readwrite', (s, a) => s.put({ key: a[0], value: a[1], updatedAt: 1, schema: 1 }), [k, v]);
const until = async (fn, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 60)); }
  return false;
};
const sampleBtn = p => p.getByRole('button', { name: 'Karma örnek portföy' });

/* ── 1) write-through ───────────────────────────────────────────────────────── */
const ctx1 = await newCtx();
const p1 = await open(ctx1);
check('Taze tarayıcıda onboarding görünüyor', await sampleBtn(p1).count() === 1);
await sampleBtn(p1).click();
check('IndexedDB aynası portföyü localStorage ile AYNI metin olarak yazdı',
  await until(async () => { const l = await lsGet(p1, PK); return l && (await idbVal(p1, PK)) === l; }));

await p1.locator('.side-link', { hasText: 'AJAN' }).click();
await p1.waitForTimeout(250);
await p1.getByRole('button', { name: 'Ajanı Eğit' }).click();
await p1.fill('#teach-q', 'depolama testi sorusu');
await p1.fill('#teach-a', 'depolama testi cevabı');
await p1.getByRole('button', { name: 'Öğret' }).click();
check('Ajan öğretisi (başka katman) da aynaya yazıldı',
  await until(async () => { const l = await lsGet(p1, TK); return !!l && l.includes('depolama testi sorusu') && (await idbVal(p1, TK)) === l; }));

/* ── 2) yenile + localStorage'ı sil -> geri yükleme ─────────────────────────── */
const portfolioBefore = await lsGet(p1, PK);
const trainingBefore = await lsGet(p1, TK);
await p1.reload({ waitUntil: 'networkidle' });
check('Yenilemeden sonra veri durur (onboarding yok)', await sampleBtn(p1).count() === 0);
await p1.evaluate(() => localStorage.clear());
await p1.reload({ waitUntil: 'networkidle' });
check('localStorage silinince açılışta portföy IndexedDB aynasından GERİ YÜKLENDİ (bire bir)', (await lsGet(p1, PK)) === portfolioBefore);
check('Öğretilen bilgi de geri yüklendi (bire bir)', (await lsGet(p1, TK)) === trainingBefore);
check('Geri yükleme sonrası onboarding gösterilmiyor', await sampleBtn(p1).count() === 0);
check('Geri yüklemede kurtarma kaydı OLUŞMADI (çakışma yok)', !(await idbKeys(p1)).some(k => String(k).startsWith(REC_IDB)));

/* ── 3) ikisi de dolu ve farklı -> localStorage esas, hiçbiri ezilmez ───────── */
const edited = JSON.stringify({ ...JSON.parse(portfolioBefore), realizedPnl: 12345 });
await p1.evaluate(([k, v]) => localStorage.setItem(k, v), [PK, edited]); // aynayı tetiklemeyen dış düzenleme
await p1.reload({ waitUntil: 'networkidle' });
check('Farklıyken localStorage değeri esas kaldı (ezilmedi)', (await lsGet(p1, PK)) === edited);
check('IndexedDB\'deki farklı değer kurtarma kaydına alındı (kayıp yok)', (await idbVal(p1, REC_IDB + PK)) === portfolioBefore);
check('Kurtarma kaydından sonra ayna localStorage ile eşitlendi (l esas)', await until(async () => (await idbVal(p1, PK)) === edited));

/* ── 4) kısmi durum: bir katman bilerek silindi -> geri yükleme yok ─────────── */
await p1.evaluate(k => localStorage.removeItem(k), TK);
await p1.reload({ waitUntil: 'networkidle' });
check('Yalnız bir katman silinince geri yüklenmedi (kısmi durum kullanıcı/test eylemi sayılır)', (await lsGet(p1, TK)) === null);
check('Silinen katmanın IndexedDB kopyası kurtarma kaydında korundu', ((await idbVal(p1, REC_IDB + TK)) ?? '').includes('depolama testi sorusu'));

/* ── 5) SIFIRLA iki katmanı da siler ────────────────────────────────────────── */
p1.on('dialog', d => d.accept());
await p1.click('text=SIFIRLA');
check('SIFIRLA sonrası onboarding döndü', await until(async () => await sampleBtn(p1).count() === 1));
const settledAfterReset = await until(async () => {
  const ks = (await idbKeys(p1)).map(String);
  const lsTomb = await lsGet(p1, 'fagent.mirror.cleared.v1');
  return lsTomb === null && ks.every(k => k === PK);
});
check('SIFIRLA sonrası IndexedDB\'de portföy dışında katman ve kurtarma kaydı kalmadı; silme işareti kalktı', settledAfterReset);
check('SIFIRLA sonrası IndexedDB\'deki portföy yalnızca boş durum (eski veri YOK)',
  !((await idbVal(p1, PK)) ?? '').includes('Karma') && JSON.parse((await idbVal(p1, PK)) ?? '{"onboarded":false}').onboarded === false);
check('SIFIRLA sonrası localStorage\'da öğretilen bilgi ve kurtarma anahtarı yok',
  (await lsGet(p1, TK)) === null && (await p1.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('fagent.recovery.')).length)) === 0);
await p1.reload({ waitUntil: 'networkidle' });
check('SIFIRLA sonrası yenileme: veri GERİ GELMEDİ (onboarding)', await sampleBtn(p1).count() === 1 && (await lsGet(p1, TK)) === null);

// Yarım kalan SIFIRLA: silme işareti konmuş, IndexedDB hâlâ dolu, localStorage boş -> açılış GERİ YÜKLEMEZ, aynayı siler.
await idbPut(p1, PK, portfolioBefore);
await idbPut(p1, TK, trainingBefore);
await p1.evaluate(() => { localStorage.clear(); localStorage.setItem('fagent.mirror.cleared.v1', String(Date.now())); });
await p1.reload({ waitUntil: 'networkidle' });
check('Yarım kalan SIFIRLA (işaret var): açılışta veri geri yüklenmedi', await sampleBtn(p1).count() === 1 && (await lsGet(p1, TK)) === null);
check('...aynada eski katman silindi ve işaret kalktı',
  await until(async () => (await idbVal(p1, TK)) === null && (await lsGet(p1, 'fagent.mirror.cleared.v1')) === null));
await ctx1.close();

/* ── 6) bozuk JSON: kayıp önlenir ───────────────────────────────────────────── */
const ctx2 = await newCtx();
const p2 = await open(ctx2);
await sampleBtn(p2).click();
await until(async () => (await idbVal(p2, PK)) !== null);
const BOZUK = '{"onboarded":true,"holdings":[{"id":"h1","name":"Önemli';
await p2.evaluate(([k, v]) => localStorage.setItem(k, v), [PK, BOZUK]);
await p2.reload({ waitUntil: 'networkidle' });
check('Bozuk JSON: uygulama çökmeden boş (onboarding) açıldı', await sampleBtn(p2).count() === 1);
check('Bozuk ham değer kurtarma anahtarına KOPYALANDI', (await lsGet(p2, REC_LS + PK)) === BOZUK);
check('Bozuk değer henüz ezilmedi (yalnızca okuma yapıldı)', (await lsGet(p2, PK)) === BOZUK);
await p2.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
check('İlk kayıt bozuk anahtarı yeni geçerli durumla değiştirdi', await until(async () => { try { return JSON.parse(await lsGet(p2, PK)).onboarded === true; } catch { return false; } }));
check('...ama kurtarma kopyası hâlâ duruyor (veri kaybı yok)', (await lsGet(p2, REC_LS + PK)) === BOZUK);
check('...ve aynada geçerli yeni durum var', await until(async () => (await idbVal(p2, PK)) === (await lsGet(p2, PK))));
// Yedek dosyası ve bulut kurtarma anahtarını İÇERMEZ (BACKED_UP_KEYS dışı)
const snap = await p2.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('fagent.recovery.')));
check('Kurtarma anahtarı yalnızca fagent.recovery. önekinde (BACKED_UP_KEYS dışı)', snap.length === 1 && snap[0] === REC_LS + PK);
await ctx2.close();

/* ── 7) iki sekme eşzamanlı ─────────────────────────────────────────────────── */
const ctx3 = await newCtx();
const a = await open(ctx3);
const b = await open(ctx3);
await Promise.all([sampleBtn(a).click(), b.getByRole('button', { name: 'Kendi paramı gireceğim' }).click()]);
const lsFinal = await until(async () => !!(await lsGet(a, PK)));
check('İki sekme eşzamanlı yazdı, localStorage dolu', lsFinal);
check('IndexedDB aynası son localStorage haliyle EŞLEŞİYOR (iki sekme sonrası)',
  await until(async () => (await idbVal(a, PK)) === (await lsGet(a, PK)), 5000));
// B sekmesi değişiklik yaptıktan sonra A yenilenince veri tutarlı açılır
await b.reload({ waitUntil: 'networkidle' });
check('İkinci sekme yenilenince localStorage ile ayna farkı yok (kurtarma kaydı oluşmadı)',
  !(await idbKeys(b)).some(k => String(k).startsWith(REC_IDB)));
await ctx3.close();

/* ── 8) IndexedDB yok / asılı ───────────────────────────────────────────────── */
const ctx4 = await newCtx();
await ctx4.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
const p4 = await open(ctx4);
check('IndexedDB yokken uygulama açılıyor (onboarding)', await sampleBtn(p4).count() === 1);
await sampleBtn(p4).click();
check('IndexedDB yokken localStorage ile çalışıyor (veri yazıldı)', await until(async () => !!(await lsGet(p4, PK))));
await ctx4.close();

const ctx5 = await newCtx();
await ctx5.addInitScript(() => {
  // open() asla yanıt vermeyen sahte istek döner: açılış zaman aşımına düşmeli.
  const fake = { };
  window.indexedDB.open = () => fake;
});
const t0 = Date.now();
const p5 = await ctx5.newPage();
p5.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
await p5.goto(BASE, { waitUntil: 'networkidle' });
await sampleBtn(p5).waitFor({ timeout: 8000 });
check('IndexedDB açılışı asılı kalsa da uygulama zaman aşımıyla açılıyor (< 7 sn)', Date.now() - t0 < 7000);
await sampleBtn(p5).click();
check('Zaman aşımında uygulama localStorage ile çalışıyor', await until(async () => !!(await lsGet(p5, PK))));
await ctx5.close();

/* ── 9) açılış kodu yüklenemezse düz hata mesajı ───────────────────────────── */
const ctx6 = await newCtx();
await ctx6.route('**/assets/App-*.js', route => route.abort());
const p6 = await ctx6.newPage();
await p6.goto(BASE, { waitUntil: 'networkidle' });
check('Uygulama kodu yüklenemezse beyaz ekran yerine düz mesaj gösteriliyor',
  await until(async () => ((await p6.locator('#yukleme-hatasi').textContent().catch(() => '')) ?? '').includes('Sayfa yüklenemedi')));
check('...ve "Yeniden yükle" düğmesi var', await p6.getByRole('button', { name: 'Yeniden yükle' }).count() === 1);
await ctx6.close();

await browser.close();
console.log(failed ? '\nBAŞARISIZ' : '\nTAMAM');
process.exit(failed ? 1 : 0);
