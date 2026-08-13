import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

// Bu ortamdan gerçek ağa erişilemediği için (kum havuzu proxy'si dış API'leri engelliyor),
// frankfurter.dev ve coingecko.com isteklerini belgelenen gerçek yanıt biçimleriyle taklit ediyoruz.
let mockFail = false;
await page.route('https://api.frankfurter.dev/**', route => {
  if (mockFail) return route.fulfill({ status: 500, body: 'error' });
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ amount: 1, base: 'USD', date: '2026-07-12', rates: { TRY: 41.5 } }) });
});
await page.route('https://api.coingecko.com/**', route => {
  if (mockFail) return route.fulfill({ status: 500, body: 'error' });
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ bitcoin: { try: 4250000 } }) });
});

await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await page.waitForTimeout(300);

// --- Hisse/Fon/Altın/Mevduat türünde canlı-bağlama kutusu ÇIKMAMALI ---
check('Varsayılan tür (Hisse) canlı kutusu YOK', await page.locator('text=Canlı Fiyata Bağla').count() === 0);
await page.selectOption('#h-type', 'altin');
check('Altın türünde canlı kutusu YOK', await page.locator('text=Canlı Fiyata Bağla').count() === 0);

// --- Döviz: canlı hesaplama akışı ---
await page.selectOption('#h-type', 'doviz');
check('Döviz türünde canlı kutusu ÇIKTI', await page.locator('text=Canlı Fiyata Bağla').count() === 1);
await page.selectOption('#h-live-symbol', 'USD');
await page.fill('#h-live-qty', '500');
await page.getByRole('button', { name: /Hesapla ve Doldur/ }).click();
await page.waitForTimeout(400);
check('Hesapla sonrası TL tutarı doğru dolduruldu (500×41.5=20750)', (await page.inputValue('#h-amount')) === '20750');
check('Başarı mesajı görünür', await page.locator('text=canlı fiyata bağlanır').count() > 0);

await page.fill('#h-name', 'ABD Doları');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
const usdRow = page.locator('.list-row', { hasText: 'ABD Doları' });
check('Yeni varlık CANLI rozetiyle listelendi', await usdRow.locator('.badge-live').count() === 1);
check('Son fiyat zaman damgası görünür', await usdRow.locator('text=Son fiyat:').count() === 1);
check('ECB açıklaması görünür', await usdRow.locator('text=ECB günlük referans kuru').count() === 1);
await page.screenshot({ path: `${out}/l1-canli-doviz.png` });

// --- Kripto: canlı hesaplama akışı ---
await page.selectOption('#h-type', 'kripto');
check('Kripto türünde canlı kutusu ÇIKTI', await page.locator('text=Canlı Fiyata Bağla').count() === 1);
await page.selectOption('#h-live-symbol', 'bitcoin');
await page.fill('#h-live-qty', '0.01');
await page.getByRole('button', { name: /Hesapla ve Doldur/ }).click();
await page.waitForTimeout(400);
check('Kripto hesabı doğru (0.01×4250000=42500)', (await page.inputValue('#h-amount')) === '42500');
await page.fill('#h-name', 'Bitcoin Birikimim');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(300);
const btcRow = page.locator('.list-row', { hasText: 'Bitcoin Birikimim' });
check('CoinGecko açıklaması görünür', await btcRow.locator('text=CoinGecko').count() === 1);

// --- Fiyatı Güncelle (refresh) butonu ---
await page.getByRole('button', { name: /ABD Doları fiyatını canlı kaynaktan güncelle/ }).click();
await page.waitForTimeout(400);
check('Refresh sonrası değer aynı kaldı (kur değişmedi, 20750)', await usdRow.locator('text=₺20.750').count() > 0);

// --- Hata yönetimi: sahte 500 hatası ---
mockFail = true;
await page.getByRole('button', { name: /ABD Doları fiyatını canlı kaynaktan güncelle/ }).click();
await page.waitForTimeout(400);
check('Hata mesajı kullanıcıya gösterildi', await usdRow.locator('text=yanıt vermiyor').count() > 0);
check('Uygulama çökmedi, değer hâlâ görünür', await usdRow.locator('text=₺20.750').count() > 0);
await page.screenshot({ path: `${out}/l2-hata-durumu.png` });

// Ekleme formunda da hata yönetimi
await page.selectOption('#h-type', 'kripto');
await page.selectOption('#h-live-symbol', 'bitcoin');
await page.fill('#h-live-qty', '1');
await page.getByRole('button', { name: /Hesapla ve Doldur/ }).click();
await page.waitForTimeout(400);
check('Ekleme formunda da hata mesajı gösterildi', await page.locator('text=yanıt vermiyor').count() > 0);
mockFail = false;

// --- Manuel varlıkta (symbol yok) refresh butonu görünmemeli ---
check('Manuel varlıkta (Gram Altın vb. yok burada, THYAO benzeri) refresh butonu görünmüyor',
  await page.locator('button[aria-label*="canlı kaynaktan güncelle"]').count() === 2); // sadece USD + BTC

await browser.close();
console.log(failed ? 'FAGENT_LIVE_E2E_FAILED' : 'FAGENT_LIVE_E2E_OK');
process.exit(failed ? 1 : 0);
