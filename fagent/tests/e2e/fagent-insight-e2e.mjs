// Proaktif içgörüler — FAGENT'ın Bloki'den ayrıştığı çekirdek: kullanıcı sormadan,
// enflasyona karşı reel getiri uyarısı. BtcTurk sunumunun en kritik farkı.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(500);

const card = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Proaktif' }) });

// --- 1. Kart kullanıcı hiçbir şey yapmadan (sormadan) otomatik görünüyor ---
check('Proaktif içgörü kartı otomatik göründü', await card.count() === 1);
check('"OTOMATİK" rozeti var', await card.locator('text=OTOMATİK').count() > 0);
check('"sen sormadan" vurgusu var', (await card.innerText()).includes('sen sormadan'));

// --- 2. Reel getiri uyarısı: nakit benzeri erimesi somut TL ile ---
const text = await card.innerText();
check('Nakit benzeri reel değer kaybı uyarısı var', text.includes('reel değer kaybediyor'));
check('Somut TL erozyon tutarı gösteriliyor (₺)', /~₺[\d.]+/.test(text));
// Kaynak etiketi: canlı veri yokken "varsayım" demeli ve TCMB'den geldiğini İDDİA ETMEMELİ.
check('Enflasyon kaynağı "varsayım" olarak etiketli', text.includes('varsayım'));
check('Canlı veri yokken TCMB EVDS iddiası YOK', !text.includes('TCMB EVDS'));

// --- 3. Enflasyon varsayımı değişince hesap yeniden yapılıyor ---
const before = await card.innerText();
const m1 = before.match(/~₺([\d.]+) reel/);
await page.fill('#inflation-input', '80');
await page.waitForTimeout(300);
const after = await card.innerText();
const m2 = after.match(/~₺([\d.]+) reel/);
const v1 = m1 ? Number(m1[1].replace(/\./g, '')) : 0;
const v2 = m2 ? Number(m2[1].replace(/\./g, '')) : 0;
check('Enflasyon 40→80 olunca reel kayıp arttı (yaklaşık 2 katı)', v2 > v1 && v2 >= v1 * 1.8);

// --- 4. Enflasyon 0 olunca reel getiri uyarısı kalkar (matematiksel doğruluk) ---
await page.fill('#inflation-input', '0');
await page.waitForTimeout(300);
check('Enflasyon 0 iken nakit erimesi uyarısı görünmüyor', !(await card.innerText()).includes('reel değer kaybediyor'));

// --- 5. Kripto örnek portföyünde de çalışıyor (konsantrasyon + stablecoin) ---
page.once('dialog', d => d.accept());
await page.locator('text=SIFIRLA').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Kripto örnek portföyü/ }).click();
await page.waitForTimeout(500);
const cryptoText = await card.innerText();
check('Kripto portföyünde konsantrasyon uyarısı var (%100 kripto)', cryptoText.includes('tek sınıfta'));
check('Kripto portföyünde stablecoin nakit erimesi hesaplanıyor (USDT)', cryptoText.includes('reel değer kaybediyor'));
// SIFIRLA kullanıcının girdiği enflasyon oranını da temizlemeli — yukarıda 0 girilmişti,
// sıfırlamadan sonra ayakta kalsaydı nakit erimesi uyarısı hiç çıkmazdı.
check('SIFIRLA enflasyon geçersiz kılmasını da temizledi', (await page.inputValue('#inflation-input')) === '32');

// --- 6. Boş portföyde kart hiç görünmez ---
page.once('dialog', d => d.accept());
await page.locator('text=SIFIRLA').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await page.waitForTimeout(300);
check('Boş portföyde proaktif kart görünmüyor', await card.count() === 0);

await browser.close();
console.log(failed ? 'FAGENT_INSIGHT_E2E_FAILED' : 'FAGENT_INSIGHT_E2E_OK');
process.exit(failed ? 1 : 0);
