import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(400);

// --- Genel kâr/zarar özeti ---
check('Toplam Maliyet görünür', await page.locator('text=Toplam Maliyet').count() > 0);
check('Kâr / Zarar başlığı görünür', await page.locator('text=Kâr / Zarar').count() > 0);
// Örnek veri: maliyet toplamı 45000+28000+22000+15000+30000 = 140000, değer 48500+25200+23800+15000+31200=143700 → +3700 (+2.6%)
const pnlText = await page.locator('.mono', { hasText: '+' }).first().textContent();
console.log('  (bulunan ilk + değer:', pnlText, ')');
await page.screenshot({ path: `${out}/p1-genel-pnl.png` });

// --- Tek varlık için maliyet/kar-zarar satırı ---
check('THYAO satırında maliyet bilgisi var', await page.locator('text=Maliyet: ₺28.000').count() > 0);
check('THYAO zararda (kırmızı, negatif) görünüyor', await page.locator('text=−₺2.800').count() > 0 || await page.locator('text=-₺2.800').count() > 0);

// --- Değeri Güncelle akışı ---
const thyaoRow = page.locator('.list-row', { hasText: 'THYAO' });
await thyaoRow.getByRole('button', { name: 'THYAO güncel değerini güncelle' }).click();
await page.waitForTimeout(200);
const editInput = thyaoRow.locator('input[type="number"]');
await editInput.fill('30000');
await thyaoRow.getByRole('button', { name: 'kaydet' }).click();
await page.waitForTimeout(300);
check('THYAO değeri güncellendi (₺30.000)', await thyaoRow.locator('text=₺30.000').count() > 0);
check('THYAO artık kârda (+₺2.000)', await thyaoRow.locator('text=+₺2.000').count() > 0);
await page.screenshot({ path: `${out}/p2-deger-guncellendi.png` });

// Vazgeç butonu çalışıyor mu
await thyaoRow.getByRole('button', { name: 'THYAO güncel değerini güncelle' }).click();
await thyaoRow.locator('input[type="number"]').fill('999999');
await thyaoRow.getByRole('button', { name: 'vazgeç' }).click();
await page.waitForTimeout(200);
check('Vazgeç sonrası değer DEĞİŞMEDİ (hâlâ ₺30.000)', await thyaoRow.locator('text=₺30.000').count() > 0);

// --- Satış sonrası maliyetin orantılı düşmesi ---
await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
await page.selectOption('#t-holding', { label: 'THYAO' });
await page.selectOption('#t-kind', 'satis');
await page.fill('#t-amount', '15000'); // 30000'in yarısını sat
await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(300);
// THYAO: değeri elle 30000 yapmıştık ama maliyet hâlâ örnek veriden 28000'di ("Değeri Güncelle" maliyeti değiştirmez — kasıtlı).
// Yarısı (15000) satılınca: değer 15000, maliyet orantılı yarıya iner: 28000*0.5=14000. Kâr oranı (%7.1) korunmalı.
const thyaoRow2 = page.locator('.list-row', { hasText: 'THYAO' });
console.log('  (THYAO satış sonrası satır metni:', (await thyaoRow2.textContent())?.replace(/\s+/g, ' '), ')');
check('Satış sonrası THYAO değeri ₺15.000', await thyaoRow2.locator('text=₺15.000').count() > 0);
check('Satış sonrası maliyet orantılı düştü (₺14.000, 28000×0.5)', await thyaoRow2.locator('text=Maliyet: ₺14.000').count() > 0);
check('Kâr oranı satıştan bağımsız korundu (+7,1%)', await thyaoRow2.locator('text=+7,1%').count() > 0);

// --- Gerçekleşmiş kâr/zarar (satıştan cebe giren) ayrı gösteriliyor mu ---
// 15000 satıldı, satılan payın maliyeti 30000×(1-0.5)=... aslında costBasis 28000'in yarısı = 14000.
// Gerçekleşen kâr = 15000 − 14000 = +1000 (komisyon 0). Bu, gerçekleşmemiş K/Z'den AYRI görünmeli.
check('"gerçekleşmiş" etiketi Panel özetinde görünür', await page.locator('text=gerçekleşmiş').count() > 0);
check('"gerçekleşmemiş" etiketi Panel özetinde görünür', await page.locator('text=gerçekleşmemiş').count() > 0);
const realizedRow = page.locator('div', { hasText: /Kâr \/ Zarar \(gerçekleşmiş\)/ }).last();
console.log('  (gerçekleşmiş blok metni:', (await realizedRow.textContent())?.replace(/\s+/g, ' '), ')');
check('Gerçekleşmiş K/Z = +₺1.000', await page.locator('text=+₺1.000').count() > 0);

// --- Komisyonlu satış: komisyon gerçekleşen kârdan düşülür ---
await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
await page.selectOption('#t-holding', { label: 'Gram Altın' }); // değer 23800, maliyet 22000
await page.selectOption('#t-kind', 'satis');
await page.fill('#t-amount', '11900'); // yarısını sat → satılan maliyet 11000, brüt kâr +900
await page.fill('#t-commission', '400'); // komisyon 400 → net gerçekleşen +500
await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
await page.waitForTimeout(300);
check('Komisyon işlem geçmişinde görünür', await page.locator('text=komisyon ₺400').count() > 0);
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(300);
// Toplam gerçekleşmiş = önceki +1000 + bu satıştan (11900 − 11000 − 400) = +500 → toplam +1500.
check('Komisyon sonrası gerçekleşmiş K/Z toplam +₺1.500', await page.locator('text=+₺1.500').count() > 0);

// --- CSV dışa aktarma ---
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(200);
const [download1] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('.mini-btn', { hasText: 'CSV' }).first().click(),
]);
check('Varlıklar CSV indirildi', download1.suggestedFilename().includes('varliklar'));

await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(200);
const [download2] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('.mini-btn', { hasText: 'CSV' }).first().click(),
]);
check('İşlemler CSV indirildi', download2.suggestedFilename().includes('islemler'));

// --- Sıfırlama sonrası yeniden örnek veri (regresyon: yeni holding'lerde costBasis var mı) ---
page.once('dialog', d => d.accept());
await page.locator('text=SIFIRLA').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(200);
await page.fill('#h-name', 'Test Fonu');
await page.selectOption('#h-type', 'fon');
await page.fill('#h-amount', '10000');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
check('Yeni eklenen varlıkta maliyet=değer (₺10.000, %0,0)', await page.locator('text=Maliyet: ₺10.000').count() > 0 && await page.locator('text=+₺0 (+0,0%)').count() > 0);

await browser.close();
console.log(failed ? 'FAGENT_PNL_E2E_FAILED' : 'FAGENT_PNL_E2E_OK');
process.exit(failed ? 1 : 0);
