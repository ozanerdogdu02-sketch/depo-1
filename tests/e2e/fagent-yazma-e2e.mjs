// A7 + A14 — localStorage kotası dolu: yazma hatası görünür olur, veri kaybolmaz; geri yükleme ya-hep-ya-hiç.
// Gerçek Chromium; kota Storage.prototype.setItem'e QuotaExceededError fırlattırılarak TAKLİT edilir
// (gerçek kota dolumu değil). Dış ağ kullanılmaz.
//   1) kota doluyken işlem: sayfa çökmez, "kaydedilmedi" uyarısı (role=alert) görünür, bellek durumu ekranda
//   2) kota doluyken yedek dosyası bekleyen (diske yazılamamış) son değeri taşır
//   3) kota açılınca sonraki işlem uyarıyı kaldırır ve diske yazar
//   4) geri yükleme N. yazımda kota hatası: önceki 3 katman AYNEN geri gelir, mesaj "aynen korundu" der
//   5) geri alma da başarısızsa açık "geri alınamadı" mesajı
//   5b) geri alınamayan katmanın eski değeri bekletilir: uyarı çıkar, yedek eski değeri taşır, IndexedDB kopyası değişmez
//   5c) beforeunload uyarısı yalnız kaydedilmemiş değişiklik varken
//   6) dosya boyutu sınırı: büyük dosya okunmadan reddedilir, veri değişmez
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, acceptDownloads: true });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

// Kota taklidi: window.__kota = { dolu: bool, sonraki: n (n. fagent.* yazımında hata, tek sefer), yapisik: bool }
await page.addInitScript(() => {
  const orig = Storage.prototype.setItem;
  window.__kota = { dolu: false, sonraki: 0, sayac: 0 };
  Storage.prototype.setItem = function (k, v) {
    const q = window.__kota;
    if (this === window.localStorage && String(k).startsWith('fagent.') && !String(k).startsWith('fagent.mirror')) {
      q.sayac++;
      if ((q.dolu && (!q.sadece || q.sadece === k)) || (q.sonraki > 0 && q.sayac === q.sonraki)) {
        throw new DOMException('kota taklidi', 'QuotaExceededError');
      }
    }
    return orig.call(this, k, v);
  };
});
const kota = (o) => page.evaluate(v => { Object.assign(window.__kota, v); }, o);
const ls = (k) => page.evaluate(key => localStorage.getItem(key), k);
const uyari = page.locator('#kayit-uyarisi');

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });

/* ── 1) Kota dolu iken ilk kayıt ── */
check('Başlangıçta uyarı yok', await uyari.count() === 0);
await kota({ dolu: true });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(400);
check('Kota doluyken işlem sayfayı ÇÖKERTMEDİ (panel ekranda)', await page.locator('.side-link', { hasText: 'PANEL' }).count() === 1);
check('Kaydedilmedi uyarısı görünür (role=alert)', await uyari.count() === 1 && (await uyari.getAttribute('role')) === 'alert');
const uyariMetni = (await uyari.textContent()) ?? '';
check('Uyarı kota ve kaybolma riskini söylüyor', uyariMetni.includes('kaydedilemedi') && uyariMetni.includes('kota') && uyariMetni.includes('kaybolur'));
check('Uyarı yedeğin nereden indirileceğini söylüyor (Panel, Veri Yedeği kartı)', uyariMetni.includes('Panel') && uyariMetni.includes('Veri Yedeği'));
const bu = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
check('Kaydedilmemiş değişiklik varken beforeunload onayı isteniyor', await bu() === true);
check('Diske portföy YAZILMADI (taklit çalışıyor)', (await ls('fagent.portfolio.v1')) === null);
check('Bellekteki durum ekranda (5 varlık)', await page.locator('text=5 varlık').count() > 0);

/* ── 2) Yedek, diske yazılamamış son değeri taşır ── */
await page.fill('#h-name', 'KOTATEST');
await page.fill('#h-amount', '1234');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
check('Kota doluyken eklenen varlık ekranda', await page.locator('text=KOTATEST').count() > 0);
const backupCard = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Veri Yedeği' }) });
const [dl] = await Promise.all([page.waitForEvent('download'), backupCard.getByRole('button', { name: 'Yedek Al' }).click()]);
const yedek = JSON.parse(readFileSync(await dl.path(), 'utf8'));
const yedekPortfoy = JSON.parse(yedek.data['fagent.portfolio.v1'] ?? '{}');
check('Yedek dosyası diske yazılamamış son varlığı içeriyor', (yedekPortfoy.holdings ?? []).some(h => h.name === 'KOTATEST'));

/* ── 3) Kota açılınca sonraki işlem uyarıyı kaldırır ── */
await kota({ dolu: false });
await page.fill('#h-name', 'KOTAACIK');
await page.fill('#h-amount', '500');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
check('Kota açılınca uyarı kalktı', await uyari.count() === 0);
check('Kaydedilmemiş değişiklik kalmayınca beforeunload onayı istenmiyor', await bu() === false);
const disk = JSON.parse((await ls('fagent.portfolio.v1')) ?? '{}');
check('Diskteki portföy hem bekleyen hem yeni varlığı içeriyor', ['KOTATEST', 'KOTAACIK'].every(n => (disk.holdings ?? []).some(h => h.name === n)));

/* ── 4) Geri yükleme: N. yazımda kota hatası -> önceki veri AYNEN ── */
await page.evaluate(() => {
  localStorage.setItem('fagent.tax.v1', '{"fon":11}');
  localStorage.setItem('fagent.target.v1', '{"hisse":33}');
});
const onceki = await page.evaluate(() => ['fagent.portfolio.v1', 'fagent.agent.memory.v1', 'fagent.agent.training.v1', 'fagent.tax.v1', 'fagent.target.v1'].map(k => localStorage.getItem(k)));
const dosya = (data) => ({ name: 'yedek.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ fagentBackup: 1, createdAt: new Date().toISOString(), data })) });
const yeni = { 'fagent.portfolio.v1': yedek.data['fagent.portfolio.v1'], 'fagent.tax.v1': '{"fon":99}', 'fagent.target.v1': '{"hisse":77}' };
await kota({ sayac: 0, sonraki: 2 }); // 2. fagent.* yazımında hata (tek sefer): portföy yeni değerle yazılmış olacak
page.once('dialog', d => d.accept());
await backupCard.locator('input[type=file]').setInputFiles(dosya(yeni));
await page.waitForTimeout(500);
const m4 = (await backupCard.textContent()) ?? '';
check('Yarım yazımda mesaj: önceki veriler aynen korundu', m4.includes('aynen korundu'));
const sonra = await page.evaluate(() => ['fagent.portfolio.v1', 'fagent.agent.memory.v1', 'fagent.agent.training.v1', 'fagent.tax.v1', 'fagent.target.v1'].map(k => localStorage.getItem(k)));
check('Beş katman da geri yüklemeden önceki haliyle BİREBİR aynı', JSON.stringify(sonra) === JSON.stringify(onceki));
check('Yarım yazımda sayfa yenilenmedi (kullanıcı mesajı okuyabilir)', m4.includes('Yazma başarısız'));
await kota({ sonraki: 0 });

/* ── 5) Geri alma da başarısız -> açık durum raporu ── */
const idbPortfoy = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('fagent', 1); r.onerror = () => res('ERR'); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get('fagent.portfolio.v1'); g.onsuccess = () => { r.result.close(); res(g.result?.value ?? null); }; g.onerror = () => res('ERR'); }; }));
await page.waitForTimeout(500);
const idbOnce = await idbPortfoy();
await kota({ sayac: 0, sonraki: 0 });
await page.evaluate(() => {
  const orig = Storage.prototype.setItem;
  let n = 0;
  window.__kota2 = { aktif: true };
  // 1. yazım geçer, sonrası (geri alma dahil) hep hata: kota tamamen dolu taklidi (aktif=false ile kapatılır)
  Storage.prototype.setItem = function (k, v) {
    if (this === window.localStorage && String(k).startsWith('fagent.') && !String(k).startsWith('fagent.mirror')) {
      n++;
      if (n > 1 && window.__kota2.aktif) throw new DOMException('kota taklidi', 'QuotaExceededError');
    }
    return orig.call(this, k, v);
  };
});
page.once('dialog', d => d.accept());
await backupCard.locator('input[type=file]').setInputFiles(dosya({ 'fagent.tax.v1': '{"fon":5}', 'fagent.target.v1': '{"hisse":6}' }));
await page.waitForTimeout(500);
const m5 = (await backupCard.textContent()) ?? '';
check('Geri alma da başarısızsa mesaj bunu açıkça söylüyor', m5.includes('tamamen geri alınamadı'));
check('Mesaj yedeği Panel > Veri Yedeği kartından indirmeye yönlendiriyor', m5.includes('Veri Yedeği') && m5.includes('indirilebilir'));
check('Geri alınamayan katman için kaydedilmedi uyarısı görünür', await uyari.count() === 1);
const [dl5] = await Promise.all([page.waitForEvent('download'), backupCard.getByRole('button', { name: 'Yedek Al' }).click()]);
const yedek5 = JSON.parse(readFileSync(await dl5.path(), 'utf8'));
check('Yedek, geri alınamayan katmanın ESKİ değerini taşıyor (portföy)', yedek5.data['fagent.portfolio.v1'] === onceki[0]);
check('Yedek, geri alınamayan katmanın ESKİ değerini taşıyor (vergi)', yedek5.data['fagent.tax.v1'] === onceki[3]);
check('IndexedDB aynasındaki portföy kopyası karışık disk durumuyla ezilmedi', idbOnce !== 'ERR' && (await idbPortfoy()) === idbOnce);

/* ── 5d) AYNA KORUMASI (src/mirror.ts bindUnsavedGuard -> writer.protect) gerçek kanıtı ──
   Kota artık yalnız portföy anahtarı için dolu; diğer katmanlar yazılabilir. Başka bir katmana (hedef) başarılı yazım
   aynayı AÇIKÇA tetikler. Korumasız ayna, localStorage'da olmayan portföyü (geri alınamadı) IndexedDB'den siler. */
const idbAnahtar = (k) => page.evaluate(key => new Promise(res => { const r = indexedDB.open('fagent', 1); r.onerror = () => res('ERR'); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get(key); g.onsuccess = () => { r.result.close(); res(g.result?.value ?? null); }; g.onerror = () => res('ERR'); }; }), k);
const kadarBekle = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(100); } return false; };
check('Ön koşul: IndexedDB portföy kopyası, diskteki son sağlam portföyle aynı', idbOnce === onceki[0]);
await page.evaluate(() => { window.__kota2.aktif = false; window.__kota.dolu = true; window.__kota.sadece = 'fagent.portfolio.v1'; });
await page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Hedef Dağılım' }) })
  .getByRole('button', { name: 'Hedef dağılımını gir' }).click();
await page.fill('#target-fon', '12');
const ayna1 = await kadarBekle(async () => (await idbAnahtar('fagent.target.v1')) === (await ls('fagent.target.v1')) && (await ls('fagent.target.v1')) !== null);
check('Ayna gerçekten çalıştı (hedef katmanı IndexedDB ile eşitlendi)', ayna1);
check('Bekleyen (diske yazılamayan) portföy için IndexedDB kopyası DEĞİŞMEDİ (koruma)', (await idbAnahtar('fagent.portfolio.v1')) === idbOnce);
check('Uyarı hâlâ görünür (portföy ve vergi bekliyor)', await uyari.count() === 1);

/* ── 5e) Kota açılır, portföye başarılı yazım: koruma kalkar, ayna yeni değerle eşitlenir ── */
await page.evaluate(() => { window.__kota.dolu = false; window.__kota.sadece = ''; });
await page.fill('#h-name', 'AYNATEST');
await page.fill('#h-amount', '321');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
const ayna2 = await kadarBekle(async () => { const l = await ls('fagent.portfolio.v1'); return l !== null && l.includes('AYNATEST') && (await idbAnahtar('fagent.portfolio.v1')) === l; });
check('Portföye başarılı yazımdan sonra IndexedDB yeni değerle eşitlendi (koruma kalktı)', ayna2);
await page.getByRole('button', { name: 'Stopaj oranlarını düzenle' }).click();
await page.fill('#tax-fon', '14');
await page.waitForTimeout(300);
check('Tüm bekleyenler çözülünce uyarı kalktı', await uyari.count() === 0);
check('Uyarı kalkınca beforeunload onayı istenmiyor', await bu() === false);

/* ── 6) Dosya boyutu sınırı ── */
const page2 = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
page2.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
await page2.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page2.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page2.waitForTimeout(300);
const kart2 = page2.locator('.card').filter({ has: page2.locator('.card-title', { hasText: 'Veri Yedeği' }) });
const once2 = await page2.evaluate(() => localStorage.getItem('fagent.portfolio.v1'));
let dialogGoruldu = false;
page2.once('dialog', d => { dialogGoruldu = true; d.accept(); });
await kart2.locator('input[type=file]').setInputFiles({ name: 'dev.json', mimeType: 'application/json', buffer: Buffer.alloc(10_000_001, 32) });
await page2.waitForTimeout(500);
check('Sınırı aşan dosya reddedildi (mesaj: çok büyük, yaklaşık 10 MB)', ((await kart2.textContent()) ?? '').includes('Dosya çok büyük') && ((await kart2.textContent()) ?? '').includes('yaklaşık 10 MB'));
check('Büyük dosyada onay penceresi bile açılmadı, veri değişmedi', !dialogGoruldu && (await page2.evaluate(() => localStorage.getItem('fagent.portfolio.v1'))) === once2);

await browser.close();
console.log(failed ? '\nBAŞARISIZ' : '\nTAMAM');
process.exit(failed ? 1 : 0);
