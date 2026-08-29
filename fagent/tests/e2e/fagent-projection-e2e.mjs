// Projeksiyon sekmesi — 3 senaryo (düşük/orta/yüksek) + enflasyona göre reel (bugünkü alım gücü) değer.
// Kullanıcı geri bildirimi: tek bir "beklenen getiri" yerine bir aralık göster ve enflasyonun etkisini vurgula.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(400);

await page.locator('.side-link', { hasText: 'PROJEKSİYON' }).click();
await page.waitForTimeout(400);

// --- Üç senaryo girişi var mı ---
check('Düşük getiri oranı girişi var', await page.locator('#p-rate-dusuk').count() > 0);
check('Orta getiri oranı girişi var', await page.locator('#p-rate-orta').count() > 0);
check('Yüksek getiri oranı girişi var', await page.locator('#p-rate-yuksek').count() > 0);
check('Enflasyon varsayımı girişi var', await page.locator('#p-inflation').count() > 0);

// --- Üç senaryo çizgisi çiziliyor mu ---
check('Grafikte 3 senaryo çizgisi var', await page.locator('.recharts-line').count() >= 3);
check('"Bugünkü alım gücü" (reel) gösteriliyor', await page.locator('text=Bugünkü alım gücü').count() > 0);
check('3 senaryo başlığı (Düşük/Orta/Yüksek) görünür',
  await page.locator('text=Düşük').count() > 0 &&
  await page.locator('text=Orta').count() > 0 &&
  await page.locator('text=Yüksek').count() > 0);

await page.screenshot({ path: `${out}/proj1-uc-senaryo.png` });

// --- Enflasyon reel değeri etkiliyor mu (davranışsal) ---
const resultsCard = page.locator('.card', { hasText: '3 Senaryo' });
const before = (await resultsCard.textContent())?.replace(/\s+/g, ' ') ?? '';
await page.fill('#p-inflation', '0'); // enflasyon 0 → reel = nominal
await page.waitForTimeout(300);
const after = (await resultsCard.textContent())?.replace(/\s+/g, ' ') ?? '';
console.log('  (enflasyon 40→0 sonrası kart metni değişti mi)');
check('Enflasyon değişince reel değerler güncelleniyor', before !== after);

// --- Getiri oranını değiştirince senaryo değeri değişiyor mu ---
const midBefore = (await resultsCard.textContent()) ?? '';
await page.fill('#p-rate-orta', '80');
await page.waitForTimeout(300);
const midAfter = (await resultsCard.textContent()) ?? '';
check('Orta getiri oranı değişince projeksiyon güncelleniyor', midBefore !== midAfter);

await browser.close();
console.log(failed ? 'FAGENT_PROJECTION_E2E_FAILED' : 'FAGENT_PROJECTION_E2E_OK');
process.exit(failed ? 1 : 0);
