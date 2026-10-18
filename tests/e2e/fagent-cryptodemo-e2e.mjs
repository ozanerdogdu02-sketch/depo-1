// BtcTurk sunumu için 90 saniyelik kripto demo akışının uçtan uca doğrulaması.
// Demo yolu: aç → kripto portföyü → canlı fiyat çek → analiz → grafik → komutla işlem → onayla
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

// Bu kum havuzunda dış ağ kapalı — CoinGecko taklit ediliyor. Gerçek tarayıcıda gerçek fiyat gelir.
const MOCK_PRICES = { bitcoin: 4250000, ethereum: 145000, solana: 2150, tether: 42.5 };
await page.route('**/api.coingecko.com/**', route => {
  const url = new URL(route.request().url());
  const id = url.searchParams.get('ids');
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ [id]: { try: MOCK_PRICES[id] ?? 1 } }),
  });
});

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });

// --- 1. Açılışta kripto seçeneği var mı ---
check('Açılışta "Kripto örnek portföyü" seçeneği var',
  await page.getByRole('button', { name: /Kripto örnek portföyü/ }).count() === 1);
await page.screenshot({ path: `${out}/d0-acilis.png` });

await page.getByRole('button', { name: /Kripto örnek portföyü/ }).click();
await page.waitForTimeout(400);

// --- 2. Kripto portföyü yüklendi mi ---
check('4 kripto varlık yüklendi', await page.locator('text=4 varlık').count() > 0);
for (const coin of ['Bitcoin', 'Ethereum', 'Solana', 'Tether']) {
  check(`${coin} listede`, await page.locator('.list-row', { hasText: coin }).count() > 0);
}
check('Hepsi CANLI rozetli (canlı fiyata bağlı)', await page.locator('.badge-live').count() === 4);
await page.screenshot({ path: `${out}/d1-kripto-portfoy.png` });

// --- 3. Canlı fiyat çekme çalışıyor mu (demonun en kritik anı) ---
const btcRow = page.locator('.list-row', { hasText: 'Bitcoin' }).first();
await btcRow.locator('button[aria-label*="canlı kaynaktan güncelle"]').click();
await page.waitForTimeout(600);
// 0.01 BTC × 4.250.000 = 42.500
check('Bitcoin canlı fiyattan güncellendi (0,01 × 4.250.000 = ₺42.500)',
  (await btcRow.textContent())?.includes('42.500') ?? false);
check('Son fiyat zaman damgası göründü', (await btcRow.textContent())?.includes('Son fiyat') ?? false);
check('CoinGecko kaynağı belirtiliyor', (await btcRow.textContent())?.includes('CoinGecko') ?? false);

// --- 4. Ajan analizi — kripto bağlamında doğru mu ---
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);

const ask = async (text) => {
  await page.fill('input[aria-label="Ajana soru sor"]', text);
  await page.getByRole('button', { name: 'Gönder' }).click();
  await page.waitForTimeout(350);
};

await page.getByRole('button', { name: 'Analiz Et' }).click();
await page.waitForTimeout(400);
const analysis = await page.locator('.chat-box').textContent();
check('Analiz konsantrasyon riskini yakaladı (%100 kripto)', analysis?.includes('Konsantrasyon uyarısı') ?? false);
check('Stablecoin nakit pozisyonu olarak tanındı (USDT likidite sayıldı)',
  (analysis?.includes('stablecoin') ?? false) && !(analysis?.includes("%10'un altında") ?? true));
check('Analiz yatırım tavsiyesi olmadığını belirtiyor', analysis?.includes('yatırım tavsiyesi değildir') ?? false);
await page.screenshot({ path: `${out}/d2-ajan-analiz.png` });

// --- 5. Sohbet içinde grafik ---
await ask('kripto dağılımımı çiz');
check('Dağılım grafiği sohbet içinde çizildi', await page.locator('.msg-agent').last().locator('.recharts-pie').count() > 0);

await ask('kâr zarar grafiğimi çiz');
check('Kâr/zarar grafiği çizildi', await page.locator('.msg-agent').last().locator('.recharts-bar').count() > 0);
await page.screenshot({ path: `${out}/d3-ajan-grafik.png` });

// --- 6. Varlık bazlı sorgu ---
await ask('Solana nasıl gidiyor');
const solReply = await page.locator('.msg-agent').last().textContent();
check('Solana sorgusu doğru varlığı buldu', solReply?.includes('Solana') ?? false);
check('Solana kârda olduğu doğru raporlandı', solReply?.includes('kârda') ?? false);

// --- 7. Komutla işlem — demonun kapanış vuruşu ---
await ask("Bitcoin'den 5000 TL sat");
const idx = (await page.locator('.msg-agent').count()) - 1;
const proposal = page.locator('.msg-agent').nth(idx);
check('İşlem önerisi geldi', (await proposal.textContent())?.includes('satmak istediğini anladım') ?? false);
check('Onayla butonu var', await proposal.getByRole('button', { name: 'Onayla' }).count() === 1);
await page.screenshot({ path: `${out}/d4-islem-onayi.png` });

await proposal.getByRole('button', { name: 'Onayla' }).click();
await page.waitForTimeout(400);
check('Onay sonrası işlem uygulandı', (await page.locator('.msg-agent').last().textContent())?.includes('Yaptım') ?? false);

// Gerçekten veriye yazıldı mı
await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
check('İşlem geçmişine SATIŞ kaydı düştü', await page.locator('.badge-red', { hasText: 'SATIŞ' }).count() >= 1);
check('Satış tutarı doğru (₺5.000)', await page.locator('text=−₺5.000').count() > 0);
await page.screenshot({ path: `${out}/d5-islem-gecmisi.png` });

// --- 8. Mobil görünüm (telefonda demo yapılacaksa) ---
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(400);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Mobilde yatay taşma yok (iPhone 14 genişliği)', !overflow);
await page.screenshot({ path: `${out}/d6-mobil.png`, fullPage: true });

await browser.close();
console.log(failed ? 'FAGENT_CRYPTODEMO_E2E_FAILED' : 'FAGENT_CRYPTODEMO_E2E_OK');
process.exit(failed ? 1 : 0);
