import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(400);

// Yeni sekmeler sidebar'da var mı
for (const label of ['PANEL', 'BUGÜN', 'HİSSELER', 'FONLAR', 'KRİPTO VARLIKLAR', 'KRİPTO PİYASASI', 'İŞLEMLER', 'PROJEKSİYON', 'AJAN']) {
  check(`Sidebar'da "${label}" linki var`, await page.locator('.side-link', { hasText: label }).count() === 1);
}
check('AJAN yanında YENİ rozeti var', await page.locator('.side-link', { hasText: 'AJAN' }).locator('.side-badge').count() > 0);
await page.screenshot({ path: `${out}/n1-sidebar-tam.png` });

// BUGÜN sekmesi
await page.locator('.side-link', { hasText: 'BUGÜN' }).click();
await page.waitForTimeout(300);
check('Bugün başlığı görünür', await page.locator('.card-title').first().textContent().then(t => t?.includes('Bugün') ?? false));
await page.screenshot({ path: `${out}/n2-bugun.png` });

// HİSSELER sekmesi — sadece hisse varlıkları görünmeli
await page.locator('.side-link', { hasText: 'HİSSELER' }).click();
await page.waitForTimeout(300);
check('Hisseler başlığı "Toplam Hisse"', (await page.locator('.card-title').first().textContent())?.includes('Toplam Hisse') ?? false);
check('THYAO (hisse) listede var', await page.locator('text=THYAO').count() > 0);
check('Sınıf Dağılımı kartı YOK (filtrelenmiş view)', await page.locator('.card-title', { hasText: 'Sınıf' }).count() === 0);
await page.screenshot({ path: `${out}/n3-hisseler.png` });

// FONLAR sekmesi
await page.locator('.side-link', { hasText: 'FONLAR' }).click();
await page.waitForTimeout(300);
check('BIST 30 Fonu (fon) listede var', await page.locator('text=BIST 30 Fonu').count() > 0);
check('THYAO (hisse) FONLAR sekmesinde YOK', await page.locator('text=THYAO').count() === 0);

// KRİPTO sekmesi — örnek veride kripto yok, boş mesaj görünmeli
await page.locator('.side-link', { hasText: 'KRİPTO VARLIKLAR' }).click();
await page.waitForTimeout(300);
check('Kripto boş mesajı görünür', await page.locator('text=Henüz kripto eklenmedi').count() > 0);
await page.screenshot({ path: `${out}/n4-kripto-bos.png` });

// ARAMA testi: PANEL'e dön, "THYAO" ara
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(200);
await page.fill('input[aria-label="Varlık ve işlemlerde ara"]', 'thyao');
await page.waitForTimeout(300);
const varliklarCard = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Varlıklar' }) });
const panelRows = await varliklarCard.locator('.list-row').count();
check('Arama "thyao" ile PANEL listesi 1 satıra indi', panelRows === 1);
check('Toplam Portföy arama ile DEĞİŞMEDİ (gerçek toplam)', (await page.locator('.big-number').first().textContent())?.includes('143.700') ?? false);
await page.screenshot({ path: `${out}/n5-arama.png` });

// Arama İŞLEMLER geçmişine de yansıyor mu
await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
const txnRowsWithSearch = await page.locator('.card').last().locator('.list-row').count();
console.log('  (İşlemler, "thyao" aramasıyla satır sayısı:', txnRowsWithSearch, ')');
check('Arama işlem geçmişini de filtreliyor', txnRowsWithSearch >= 1);

// Aramayı temizle
await page.fill('input[aria-label="Varlık ve işlemlerde ara"]', '');
await page.waitForTimeout(300);
check('Arama temizlenince tüm işlemler geri geldi', await page.locator('.card').last().locator('.list-row').count() > txnRowsWithSearch);

await browser.close();
console.log(failed ? 'FAGENT_NAV_E2E_FAILED' : 'FAGENT_NAV_E2E_OK');
process.exit(failed ? 1 : 0);
