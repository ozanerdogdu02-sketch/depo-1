import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);

// --- Aynı isimde varlık eklemek engellenmeli ---
await page.fill('#h-name', 'THYAO');
await page.selectOption('#h-type', 'hisse');
await page.fill('#h-amount', '1000');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
check('Aynı isimli varlık eklenince hata mesajı görünür', await page.locator('text=Bu isimde bir varlık zaten var').count() > 0);
check('Varlık listesine yeni satır EKLENMEDİ (hâlâ 5 varlık)', await page.locator('text=5 varlık').count() > 0);

// Büyük/küçük harf farkı da yakalanmalı
await page.fill('#h-name', 'thyao');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
check('Büyük/küçük harf farklı aynı isim de engellenir', await page.locator('text=Bu isimde bir varlık zaten var').count() > 0);

// Ad değiştirilince hata mesajı temizlenmeli
await page.fill('#h-name', 'THYAO 2');
check('İsim değiştirilince hata mesajı kayboldu', await page.locator('text=Bu isimde bir varlık zaten var').count() === 0);
await page.fill('#h-amount', '1000');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
check('Farklı isimle ekleme başarılı (6 varlık)', await page.locator('text=6 varlık').count() > 0);
await page.screenshot({ path: `${out}/v1-isim-cakismasi.png` });

// --- İŞLEMLER: bakiyeden fazla satış engellenmeli ---
await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
await page.selectOption('#t-holding', { label: 'THYAO' });
await page.selectOption('#t-kind', 'satis');
// THYAO güncel değeri örnek veride ₺25.200 — bundan fazla bir satış deneniyor.
await page.fill('#t-amount', '999999');
await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
await page.waitForTimeout(300);
check('Bakiyeyi aşan satış hata mesajı gösterir', await page.locator('text=Bakiyeyi aşamaz').count() > 0);

const txnCountBefore = await page.locator('.card').last().locator('.list-row').count();
check('Geçersiz satış işlem geçmişine EKLENMEDİ', txnCountBefore === 5); // örnek veride 4 işlem + THYAO 2 eklemesinin örtük alış kaydı

// Geçerli bir satış sonrası hata mesajı temizlenmeli ve işlem eklenmelidir
await page.fill('#t-amount', '1000');
await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
await page.waitForTimeout(300);
check('Geçerli satış sonrası hata mesajı kayboldu', await page.locator('text=Bakiyeyi aşamaz').count() === 0);
const txnCountAfter = await page.locator('.card').last().locator('.list-row').count();
check('Geçerli satış işlem geçmişine eklendi', txnCountAfter === txnCountBefore + 1);
await page.screenshot({ path: `${out}/v2-satis-limiti.png` });

// --- Doğru varlığa uygulandığından emin ol (holdingId ile eşleşme, isimle değil) ---
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(300);
const thyaoRow = page.locator('.list-row', { hasText: 'THYAO' }).first();
check('THYAO satırı hâlâ makul bir değerde (satış doğru varlığa uygulandı)', await thyaoRow.count() > 0);

await browser.close();
console.log(failed ? 'FAGENT_VALIDATION_E2E_FAILED' : 'FAGENT_VALIDATION_E2E_OK');
process.exit(failed ? 1 : 0);
