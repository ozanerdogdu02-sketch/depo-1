// Risk Analizi — GERÇEK tarihsel fiyat serisinden volatilite, maks düşüş, Sharpe ve
// çeşitlendirme faydası. Ağ bu ortamda kapalı olduğu için CoinGecko /market_chart ve
// Frankfurter zaman serisi page.route() ile taklit edilir (gerçek şemayla aynı).
//
// En kritik kontrol: KAPSAM BEYANI. Fiyat geçmişi alınamayan varlıklar hesaba katılmaz ve
// raporun portföyün yüzde kaçını temsil ettiği açıkça yazılır.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

// 90 günlük sentetik seri üret — deterministik, ama gerçekçi dalgalanmalı.
const daysAgo = (d) => { const t = new Date(); t.setDate(t.getDate() - d); return t; };
const makeCryptoSeries = (base, amplitude, phase) => {
  const rows = [];
  for (let i = 90; i >= 0; i--) {
    const t = daysAgo(i);
    const price = base * (1 + amplitude * Math.sin((i + phase) / 7));
    rows.push([t.getTime(), price]);
  }
  return rows;
};

// Bitcoin: geniş dalga (yüksek volatilite)
await page.route('**/api/v3/coins/bitcoin/market_chart**', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prices: makeCryptoSeries(4_000_000, 0.20, 0) }) }));
// Ethereum: TERS fazda dalga -> Bitcoin ile negatif korele, çeşitlendirme faydası çıkmalı
await page.route('**/api/v3/coins/ethereum/market_chart**', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prices: makeCryptoSeries(130_000, 0.20, 22) }) }));
// Kripto piyasa listesi (portföye coin eklemek için)
await page.route('**/api/v3/coins/markets**', r =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
    { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 4000000, price_change_percentage_24h: 1.5, market_cap: 8e12 },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 130000, price_change_percentage_24h: -1.2, market_cap: 1.5e12 },
  ]) }));

await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(400);

// --- Kapsanabilir varlık YOKKEN: dürüst "hesaplayamıyorum" ---
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(300);
check('Risk Analizi kartı Panel\'de var', await page.getByRole('button', { name: /Risk Analizi/ }).count() > 0);
await page.getByRole('button', { name: /Risk Analizi/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Hesapla/ }).click();
await page.waitForTimeout(800);
check('Kapsanacak varlık yokken dürüstçe hesaplayamadığını söylüyor',
  await page.locator('[data-testid="risk-body"]', { hasText: 'hesaplayamıyorum' }).count() > 0);
check('Nedenini varlık bazında açıklıyor (BIST/TEFAS kaynağı yok)',
  await page.locator('text=/anahtarsız tarihsel fiyat kaynağı yok/').count() > 0);
await page.screenshot({ path: `${out}/risk1-kapsam-yok.png`, fullPage: true });

// --- Canlı fiyata bağlı iki kripto ekle ---
await page.locator('.side-link', { hasText: 'KRİPTO PİYASASI' }).click();
await page.waitForTimeout(700);
for (const coin of ['Bitcoin', 'Ethereum']) {
  const row = page.locator('.list-row', { hasText: coin });
  await row.locator('.cm-amount').fill('50000');
  await row.locator('.cm-add').click();
  await page.waitForTimeout(300);
}

// --- Şimdi risk hesaplanabilmeli ---
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Risk Analizi/ }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Hesapla/ }).click();
await page.waitForTimeout(1500);

const body = page.locator('[data-testid="risk-body"]');
const text = (await body.textContent()) ?? '';
console.log('  (kapsam satırı:', (text.match(/portföyünün %\d+/) ?? ['bulunamadı'])[0], ')');

check('Yıllık volatilite hesaplandı', /Yıllık volatilite/.test(text) && /%\d+[.,]\d/.test(text));
check('Maksimum düşüş hesaplandı', /Maksimum düşüş/.test(text));
check('Sharpe oranı hesaplandı (risksiz faiz varsayımıyla)', /Sharpe oranı/.test(text));
check('KAPSAM BEYANI var (portföyün yüzde kaçı)', /portföyünün %\d+/.test(text));
check('Kapsam dışı varlıklar açıkça listeleniyor', /Kapsam dışı:/.test(text));
check('Varlık bazında kırılım gösteriliyor', await body.locator('.list-row', { hasText: 'Bitcoin' }).count() > 0);
check('Çeşitlendirme faydası hesaplandı (ters korele seriler)', /Çeşitlendirme faydası/.test(text));
await page.screenshot({ path: `${out}/risk2-hesaplandi.png`, fullPage: true });

// --- Ajan artık "hesaplayamam" demiyor, Risk Analizi'ne yönlendiriyor ---
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);
await page.fill('input[aria-label="Ajana soru sor"]', 'volatilitem ne kadar');
await page.getByRole('button', { name: 'Gönder' }).click();
await page.waitForTimeout(400);
const reply = (await page.locator('.msg-agent').last().textContent()) ?? '';
check('Ajan Risk Analizi kartına yönlendiriyor', reply.includes('Risk Analizi'));
check('Ajan veri kaynaklarını belirtiyor', reply.includes('CoinGecko') && reply.includes('ECB'));
check('Ajan kapsanabilen varlıkları sayıyor', reply.includes('Bitcoin') || reply.includes('kapsanabiliyor'));
check('Ajan cevabı fallback DEĞİL', !reply.includes('tam olarak anlayamadım'));

await browser.close();
console.log(failed ? 'FAGENT_RISK_E2E_FAILED' : 'FAGENT_RISK_E2E_OK');
process.exit(failed ? 1 : 0);
