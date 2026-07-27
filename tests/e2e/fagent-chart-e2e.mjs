import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

// --- Örnek veri: birden fazla farklı tarihte işlem var, grafik görünmeli ---
await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(400);
check('Örnek veride grafik görünür', await page.locator('text=Net Yatırım Tutarı Geçmişi').count() === 1);
check('Grafik açıklaması doğru (piyasa performansı değil)', await page.locator('text=piyasa performansını değil').count() === 1);
check('Alanlı grafik (area) çizildi', await page.locator('.recharts-area').count() > 0);
await page.screenshot({ path: `${out}/c1-grafik-orneklle.png` });

// --- Filtrelenmiş görünümde (Hisseler) grafik OLMAMALI ---
await page.locator('.side-link', { hasText: 'HİSSELER' }).click();
await page.waitForTimeout(300);
check('Hisseler sekmesinde grafik YOK', await page.locator('text=Net Yatırım Tutarı Geçmişi').count() === 0);

// --- Boş başlangıç: grafik olmamalı (0 işlem) ---
page.once('dialog', d => d.accept());
await page.locator('text=SIFIRLA').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'PANEL' }).click();
check('Boş portföyde grafik YOK', await page.locator('text=Net Yatırım Tutarı Geçmişi').count() === 0);

// --- Panel'den doğrudan varlık eklemek artık İşlem Geçmişi'ne de düşmeli ---
await page.fill('#h-name', 'Test Hissesi');
await page.selectOption('#h-type', 'hisse');
await page.fill('#h-amount', '5000');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
// Tek işlem = tek tarih = grafik için yeterli veri yok (≥2 farklı tarih gerekiyor), bu doğru davranış.
check('Tek işlemden sonra grafik hâlâ YOK (yeterli veri yok, beklenen)', await page.locator('text=Net Yatırım Tutarı Geçmişi').count() === 0);

await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
check('Varlık ekleme İşlem Geçmişi\'ne de yansıdı (örtük alış kaydı)', await page.locator('.badge-green', { hasText: 'ALIŞ' }).count() === 1);
check('İşlem tutarı doğru (₺5.000)', await page.locator('text=+₺5.000').count() === 1);

await page.locator('.side-link', { hasText: 'BUGÜN' }).click();
await page.waitForTimeout(300);
check('Bugünkü Alışlar da güncellendi (₺5.000)', await page.locator('text=₺5.000').count() > 0);
await page.screenshot({ path: `${out}/c2-bugun-eslesme.png` });

await browser.close();
console.log(failed ? 'FAGENT_CHART_E2E_FAILED' : 'FAGENT_CHART_E2E_OK');
process.exit(failed ? 1 : 0);
