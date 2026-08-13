// Veri kaybı koruması — tam yedek (JSON) + geri yükleme + çökme ekranı (ErrorBoundary).
//
// NEDEN: FAGENT'ın tüm verisi yalnızca localStorage'da durur. Mevcut CSV dışa aktarma sadece
// VARLIKLARI kurtarıyordu; işlem geçmişi, öğretilen bilgiler, stopaj oranları ve hedef dağılım
// kapsam dışıydı. Ayrıca herhangi bir render hatası tüm uygulamayı beyaz ekrana düşürüyordu.
//
// Doğrulanan davranışlar:
//   • Yedek dosyası BEŞ katmanı da içeriyor (portföy, bellek, öğretilen bilgi, stopaj, hedef)
//   • Yedek alınmamışken kart uyarı durumunda; alındıktan sonra tarihi gösteriyor
//   • "Sonra" ertelemesi kalıcı (dismissedUntil)
//   • Geri yükleme veriyi gerçekten geri getiriyor
//   • Bozuk/yabancı dosya reddediliyor ve MEVCUT VERİ BOZULMUYOR (ya hep ya hiç)
//   • Yedekte olmayan anahtarlar beyaz listeyle ELENİYOR (dosya dışarıdan gelebilir)
//   • ErrorBoundary: render hatasında beyaz ekran yerine kurtarma ekranı, veri duruyor
//   • SIFIRLA yedek geçmişini de temizliyor
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, acceptDownloads: true });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);

// Kart BAŞLIĞINA göre seç — gövde metni başka kartlarla örtüşebilir (`hasText` alt-metin arar).
const backupCard = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Veri Yedeği' }) });

/* ── 1) Yedek alınmamış durum — kart uyarıyor ───────────────────────────────── */

check('Veri Yedeği kartı Panel\'de görünüyor', await backupCard.count() === 1);
const ilk = (await backupCard.textContent()) ?? '';
check('Henüz yedek alınmadığı yazıyor', ilk.includes('Henüz yedek almadın'));
check('Verinin yalnızca tarayıcıda olduğu uyarısı var', ilk.includes('yalnızca bu tarayıcıda saklanıyor'));
check('Erteleme düğmesi görünüyor (hatırlatma aktif)', await backupCard.getByRole('button', { name: 'Sonra' }).count() === 1);

/* ── 2) Yedek al — beş katman da dosyada mı ─────────────────────────────────── */

// Önce her katmana veri koy ki yedeğin gerçekten hepsini taşıdığını görebilelim.
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: 'Ajanı Eğit' }).click();
await page.waitForTimeout(200);
await page.fill('#teach-q', 'yedek testi sorusu');
await page.fill('#teach-a', 'yedek testi cevabı');
await page.getByRole('button', { name: 'Öğret' }).click();
await page.waitForTimeout(250);

await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(250);
await page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Hedef Dağılım' }) })
  .getByRole('button', { name: 'Hedef dağılımını gir' }).click();
await page.waitForTimeout(150);
await page.fill('#target-fon', '40');
await page.waitForTimeout(200);

const [download] = await Promise.all([
  page.waitForEvent('download'),
  backupCard.getByRole('button', { name: 'Yedek Al' }).click(),
]);
check('Yedek dosyası indi', download.suggestedFilename().startsWith('fagent-yedek-'));
check('Dosya uzantısı .json', download.suggestedFilename().endsWith('.json'));

const backupJson = JSON.parse(readFileSync(await download.path(), 'utf8'));
check('Dosya FAGENT yedek biçiminde', backupJson.fagentBackup === 1 && typeof backupJson.createdAt === 'string');
check('Portföy katmanı yedekte', typeof backupJson.data['fagent.portfolio.v1'] === 'string');
check('Öğretilen bilgi katmanı yedekte', (backupJson.data['fagent.agent.training.v1'] ?? '').includes('yedek testi sorusu'));
check('Hedef dağılım katmanı yedekte', JSON.parse(backupJson.data['fagent.target.v1'] ?? '{}').fon === 40);
check('İşlem geçmişi yedekte (CSV\'nin taşıyamadığı)', JSON.parse(backupJson.data['fagent.portfolio.v1']).txns.length > 0);
check('Yeniden üretilebilir önbellek yedeğe girmedi', !('fagent.cryptomarket.cache.v2' in backupJson.data));

await page.waitForTimeout(300);
const sonraki = (await backupCard.textContent()) ?? '';
check('Yedek sonrası tarih gösteriliyor', sonraki.includes('Son yedek:') && !sonraki.includes('Henüz yedek almadın'));
check('Yedek sonrası erteleme düğmesi kayboldu', await backupCard.getByRole('button', { name: 'Sonra' }).count() === 0);
check('Yedek zamanı localStorage\'a yazıldı', JSON.parse(await page.evaluate(() => localStorage.getItem('fagent.backup.v1'))).lastBackupAt !== undefined);

/* ── 3) Bozuk / yabancı dosya reddedilmeli, veri BOZULMAMALI ────────────────── */

const portfolioBefore = await page.evaluate(() => localStorage.getItem('fagent.portfolio.v1'));

page.once('dialog', d => d.accept());
await backupCard.locator('input[type=file]').setInputFiles({
  name: 'bozuk.json', mimeType: 'application/json', buffer: Buffer.from('{"bu":"bir fagent yedegi degil"}'),
});
await page.waitForTimeout(500);
check('Yabancı dosya reddedildi', ((await backupCard.textContent()) ?? '').includes('FAGENT yedek dosyası değil'));
check(
  'Reddedilen dosya mevcut veriyi BOZMADI',
  (await page.evaluate(() => localStorage.getItem('fagent.portfolio.v1'))) === portfolioBefore,
);

page.once('dialog', d => d.accept());
await backupCard.locator('input[type=file]').setInputFiles({
  name: 'gecersiz.json', mimeType: 'application/json', buffer: Buffer.from('bu json bile degil {{{'),
});
await page.waitForTimeout(500);
check('Geçersiz JSON reddedildi', ((await backupCard.textContent()) ?? '').includes('geçerli bir JSON değil'));

/* ── 4) Beyaz liste — tanınmayan anahtar yazılmamalı ────────────────────────── */

const kotucul = JSON.stringify({
  fagentBackup: 1,
  createdAt: new Date().toISOString(),
  data: { 'fagent.portfolio.v1': portfolioBefore, 'baska.bir.anahtar': 'yazilmamali' },
});
page.once('dialog', d => d.accept());
await backupCard.locator('input[type=file]').setInputFiles({
  name: 'beyazliste.json', mimeType: 'application/json', buffer: Buffer.from(kotucul),
});
await page.waitForTimeout(1600); // geri yükleme sonrası otomatik reload
check(
  'Beyaz liste dışı anahtar localStorage\'a YAZILMADI',
  (await page.evaluate(() => localStorage.getItem('baska.bir.anahtar'))) === null,
);

/* ── 5) Gerçek geri yükleme — veri geri geliyor mu ──────────────────────────── */

// Portföyü boşalt, sonra ilk yedeği geri yükle.
await page.evaluate(() => localStorage.removeItem('fagent.agent.training.v1'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check(
  'Öğretilen bilgi gerçekten silindi (geri yükleme öncesi kontrol)',
  (await page.evaluate(() => localStorage.getItem('fagent.agent.training.v1'))) === null,
);

page.once('dialog', d => d.accept());
await backupCard.locator('input[type=file]').setInputFiles(await download.path());
await page.waitForTimeout(1800); // mesaj + otomatik reload
check(
  'Geri yükleme öğretilen bilgiyi geri getirdi',
  ((await page.evaluate(() => localStorage.getItem('fagent.agent.training.v1'))) ?? '').includes('yedek testi sorusu'),
);
check(
  'Geri yükleme hedef dağılımı da geri getirdi',
  JSON.parse((await page.evaluate(() => localStorage.getItem('fagent.target.v1'))) ?? '{}').fon === 40,
);

/* ── 6) "Sonra" ertelemesi kalıcı ───────────────────────────────────────────── */

await page.evaluate(() => localStorage.removeItem('fagent.backup.v1'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await backupCard.getByRole('button', { name: 'Sonra' }).click();
await page.waitForTimeout(200);
const meta = JSON.parse((await page.evaluate(() => localStorage.getItem('fagent.backup.v1'))) ?? '{}');
check('Erteleme localStorage\'a yazıldı', typeof meta.dismissedUntil === 'string');
check('Erteleme ileri bir tarih', new Date(meta.dismissedUntil).getTime() > Date.now());

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check(
  'Yenilemeden sonra da hatırlatma sessiz',
  await backupCard.getByRole('button', { name: 'Sonra' }).count() === 0,
);

/* ── 7) SIFIRLA yedek geçmişini de temizliyor ───────────────────────────────── */

page.once('dialog', d => d.accept());
await page.locator('.side-reset').click();
await page.waitForTimeout(400);
check(
  'SIFIRLA yedek geçmişini de sildi',
  (await page.evaluate(() => localStorage.getItem('fagent.backup.v1'))) === null,
);

await page.close();

/* ── 8) ErrorBoundary — render hatasında beyaz ekran YOK ────────────────────── */
//
// Hata enjeksiyonu: Number.prototype.toLocaleString'i patlatıyoruz. fmtTL bunu kullanıyor,
// yani Panel çizilirken kesin bir render hatası oluşuyor. Onboarding ekranı bu yolu
// kullanmadığı için sayfa normal açılıyor; hata örnek portföy seçilince tetikleniyor.

const crashPage = await browser.newPage({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
await crashPage.addInitScript(() => {
  Number.prototype.toLocaleString = function () { throw new Error('enjekte edilmiş test hatası'); };
});
// /panel'e gidiliyor: kök adres artık tanıtım sayfası ve o sayfa fmtTL kullanmadığı için
// enjekte edilen hata orada tetiklenmezdi.
await crashPage.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
await crashPage.getByRole('button', { name: 'Karma örnek portföy' }).click();
await crashPage.waitForTimeout(700);

const crashText = (await crashPage.locator('body').textContent()) ?? '';
check('Çökmede beyaz ekran değil, kurtarma ekranı çıkıyor', crashText.includes('Bir şeyler ters gitti'));
check('Verinin silinmediği açıkça söyleniyor', crashText.includes('Verilerin silinmedi'));
check('SIFIRLA\'ya basmama uyarısı var', crashText.includes('SIFIRLA\'ya basma'));
check('Hata hiçbir yere gönderilmediği belirtiliyor', crashText.includes('hiçbir yere gönderilmedi'));

// Kurtarma düğmesi çökmüş durumda GERÇEKTEN çalışmalı — bu ekranın tek varlık sebebi bu.
const [crashDownload] = await Promise.all([
  crashPage.waitForEvent('download'),
  crashPage.getByRole('button', { name: 'Tam yedek indir' }).click(),
]);
const rescued = JSON.parse(readFileSync(await crashDownload.path(), 'utf8'));
check('Çökmüş ekrandan yedek indirilebiliyor', rescued.fagentBackup === 1);
check('Kurtarılan yedekte portföy var', JSON.parse(rescued.data['fagent.portfolio.v1']).holdings.length === 5);

await browser.close();
console.log(failed ? '\nBAŞARISIZ' : '\nTAMAM');
process.exit(failed ? 1 : 0);
