// Kripto Piyasası sekmesi — CoinGecko genel API'sinden canlı coin listesi + portföye ekleme.
// Bu ortamdan gerçek ağa erişilemediği için CoinGecko isteği page.route() ile taklit edilir
// (gerçek /coins/markets şemasıyla aynı alanlar: current_price, price_change_percentage_24h, market_cap).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

// sparkline_in_7d ve market_cap_rank gerçek CoinGecko şemasındaki alanlar — mini grafik
// ve sıralama bunlardan üretilir.
const spark = (base, dir) => ({ price: Array.from({ length: 168 }, (_, i) => base * (1 + dir * (i / 167) * 0.1)) });
const MARKET = [
  { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 4250000, price_change_percentage_24h: 2.5, market_cap: 8.5e12, market_cap_rank: 1, sparkline_in_7d: spark(4250000, 1) },
  { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 130000, price_change_percentage_24h: -1.8, market_cap: 1.5e12, market_cap_rank: 2, sparkline_in_7d: spark(130000, -1) },
  { id: 'solana', symbol: 'sol', name: 'Solana', current_price: 5000, price_change_percentage_24h: 4.2, market_cap: 2.5e11, market_cap_rank: 3, sparkline_in_7d: spark(5000, 1) },
];

let mockFail = false;
await page.route('https://api.coingecko.com/**', route => {
  if (mockFail) return route.fulfill({ status: 500, body: 'error' });
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MARKET) });
});

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
await page.waitForTimeout(300);

// --- Sekme açılınca tablo doluyor ---
await page.locator('.side-link', { hasText: 'KRİPTO PİYASASI' }).click();
await page.waitForTimeout(500);
check('Kripto Piyasası başlığı görünür', await page.locator('.card-title', { hasText: 'Kripto Piyasası' }).count() > 0);
check('En az 3 coin listelendi', await page.locator('.list-row').count() >= 3);
check('Bitcoin satırı var', await page.locator('.list-row', { hasText: 'Bitcoin' }).count() > 0);
check('Fiyat TL formatında görünür (₺4.250.000)', await page.locator('text=₺4.250.000').count() > 0);
check('Piyasa değeri kısa formatta (T)', await page.locator('text=/₺8,50 T/').count() > 0);
await page.screenshot({ path: `${out}/cm1-tablo.png` });

// --- 24s değişim renkleri farklı (pozitif yeşil / negatif kırmızı) ---
const btcChange = page.locator('.list-row', { hasText: 'Bitcoin' }).locator('.mono.sub').first();
const ethChange = page.locator('.list-row', { hasText: 'Ethereum' }).locator('.mono.sub').first();
const btcColor = await btcChange.evaluate(el => getComputedStyle(el).color);
const ethColor = await ethChange.evaluate(el => getComputedStyle(el).color);
console.log('  (BTC renk:', btcColor, '| ETH renk:', ethColor, ')');
check('Pozitif (+2,5%) görünür', await btcChange.locator('text=+2,5%').count() > 0);
check('Negatif (−1,8%) görünür', await ethChange.locator('text=-1,8%').count() > 0);
check('Pozitif ve negatif değişim renkleri farklı', btcColor !== ethColor);

// --- Arama filtreliyor ---
await page.fill('#cm-search', 'ethereum');
await page.waitForTimeout(200);
check('Arama sonrası sadece Ethereum kaldı', await page.locator('.list-row', { hasText: 'Ethereum' }).count() > 0 && await page.locator('.list-row', { hasText: 'Bitcoin' }).count() === 0);
await page.fill('#cm-search', '');
await page.waitForTimeout(200);

// --- "Ekle" gerçekten portföye ekliyor ---
const btcRow = page.locator('.list-row', { hasText: 'Bitcoin' });
await btcRow.locator('.cm-amount').fill('10000');
await btcRow.locator('.cm-add').click();
await page.waitForTimeout(300);
check('Ekleme sonrası "eklendi" geri bildirimi', await btcRow.locator('text=eklendi').count() > 0);
check('Coin "PORTFÖYDE" olarak işaretlendi', await btcRow.locator('text=PORTFÖYDE').count() > 0);

await page.locator('.side-link', { hasText: 'KRİPTO VARLIKLAR' }).click();
await page.waitForTimeout(400);
check('Eklenen coin Kripto Varlıklar panelinde görünüyor', await page.locator('.list-row', { hasText: 'Bitcoin' }).count() > 0);
check('Eklenen coin tutarı ₺10.000', await page.locator('.list-row', { hasText: 'Bitcoin' }).locator('text=₺10.000').count() > 0);
await page.screenshot({ path: `${out}/cm2-portfoye-eklendi.png` });

// --- Mini grafik (sparkline) ve sıralama ---
// Not: yukarıda KRİPTO VARLIKLAR sekmesine geçilmişti; piyasa tablosuna geri dön.
await page.locator('.side-link', { hasText: 'KRİPTO PİYASASI' }).click();
await page.waitForTimeout(500);
check('Satır içi mini grafikler çizildi (7 günlük seri)', await page.locator('.cm-row svg path').count() >= 3);
check('Piyasa değeri sıra numarası gösteriliyor (#1)', await page.locator('text=#1').count() > 0);
check('Sıralama düğmeleri var', await page.locator('.cm-sort').count() === 4);

// Tasarım: "Sıra" artan, diğer sütunlar AZALAN başlar (önce en çok yükseleni görmek
// daha doğal bir varsayılan). İlk tıklamada Solana (+4.2) başa gelmeli.
await page.locator('.cm-sort', { hasText: '24s değişim' }).click();
await page.waitForTimeout(300);
const firstAfterSort = await page.locator('.cm-row').first().textContent();
check('24s değişime göre sıralama çalışıyor (en çok yükselen başta)', (firstAfterSort ?? '').includes('Solana'));
// Tekrar tıkla -> yön tersine, en çok düşen (Ethereum −1.8) başa gelmeli
await page.locator('.cm-sort', { hasText: '24s değişim' }).click();
await page.waitForTimeout(300);
const firstAfterToggle = await page.locator('.cm-row').first().textContent();
check('Sıralama yönü tersine çevrilebiliyor (en çok düşen başta)', (firstAfterToggle ?? '').includes('Ethereum'));
// Sıraya geri dön
await page.locator('.cm-sort', { hasText: 'Sıra' }).click();
await page.waitForTimeout(300);

// --- Ağ hatası + ÖNBELLEK: son gerçek fiyatlar bayat etiketiyle gösterilmeli ---
// (CoinGecko ücretsiz ucu rate-limitli; limite takılınca elde veri varsa onu dürüstçe
//  "şu tarihteki son gerçek fiyatlar" diye göstermek, hiçbir şey göstermemekten iyi.)
mockFail = true;
await page.locator('.side-link', { hasText: 'KRİPTO PİYASASI' }).click();
await page.waitForTimeout(300);
await page.locator('.mini-btn', { hasText: 'Yenile' }).click();
await page.waitForTimeout(600);
check('Ağ hatasında önbellekteki coinler hâlâ listeleniyor', await page.locator('.list-row', { hasText: 'Bitcoin' }).count() > 0);
check('Bayat veri uyarısı görünür', await page.locator('text=/Canlı fiyat alınamadı/').count() > 0);
check('Uyarı istek sınırını açıklıyor', await page.locator('text=/istek sınırı/').count() > 0);
await page.screenshot({ path: `${out}/cm3-bayat-onbellek.png` });

// --- Önbellek YOKKEN ağ hatası: net hata + "Tekrar dene" ---
await page.evaluate(() => localStorage.removeItem('fagent.cryptomarket.cache.v2'));
await page.locator('.mini-btn', { hasText: 'Yenile' }).click();
await page.waitForTimeout(600);
check('Önbelleksiz hatada Türkçe hata mesajı görünür', await page.locator('text=/istek sınırına takıl|yanıt vermiyor|alınamadı/').count() > 0);
check('"Tekrar dene" butonu görünür', await page.getByRole('button', { name: /Tekrar dene/ }).count() > 0);
await page.screenshot({ path: `${out}/cm4-hata.png` });

// --- Önbellek istek sayısını gerçekten azaltıyor mu (sekme değişiminde ağa çıkmamalı) ---
mockFail = false;
await page.evaluate(() => localStorage.removeItem('fagent.cryptomarket.cache.v2'));
let apiCalls = 0;
page.on('request', r => { if (r.url().includes('api.coingecko.com')) apiCalls++; });
await page.getByRole('button', { name: /Tekrar dene/ }).click();
await page.waitForTimeout(600);
const afterFirst = apiCalls;
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'KRİPTO PİYASASI' }).click();
await page.waitForTimeout(600);
console.log(`  (ilk yükleme: ${afterFirst} çağrı · sekmeye dönüş sonrası toplam: ${apiCalls})`);
check('Sekmeye tekrar girişte yeni ağ isteği ATILMADI (önbellek)', apiCalls === afterFirst);

await browser.close();
console.log(failed ? 'FAGENT_CRYPTOMARKET_E2E_FAILED' : 'FAGENT_CRYPTOMARKET_E2E_OK');
process.exit(failed ? 1 : 0);
