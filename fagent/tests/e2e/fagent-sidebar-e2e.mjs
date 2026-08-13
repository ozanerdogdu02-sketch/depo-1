import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

// ---- DESKTOP (1440px) ----
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

  await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
  check('Anahtar kutusu YOK', await page.locator('text=ANAHTAR GEREKLİ').count() === 0);
  check('Anahtarsız rozeti VAR', await page.locator('text=ANAHTARSIZ MOD').count() > 0);
  await page.screenshot({ path: `${out}/s1-karsilama.png` });

  // Boş başla -> panel boş durum mesajı
  await page.click('text=Kendi paramı gireceğim');
  await page.waitForTimeout(400);
  check('Sol menü görünür (PANEL)', await page.locator('.side-link', { hasText: 'PANEL' }).count() > 0);
  check('Boş grafik mesajı doğru', await page.locator('text=dağılım grafiği burada görünecek').count() > 0);
  await page.screenshot({ path: `${out}/s2-panel-bos.png` });

  // Varlık ekle -> pasta grafik çıkmalı
  await page.fill('#h-name', 'BIST 30 Fonu');
  await page.selectOption('#h-type', 'fon');
  await page.fill('#h-amount', '40000');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await page.waitForTimeout(400);
  check('Varlık eklendikten sonra toplam güncellendi', (await page.locator('.big-number').first().textContent())?.includes('40.000') ?? false);
  check('Varlık eklendikten sonra pasta grafik çıktı', await page.locator('.recharts-wrapper').count() > 0);
  await page.screenshot({ path: `${out}/s3-panel-dolu.png` });

  // İşlemler: rehber kutusu + kayıt
  await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
  await page.waitForTimeout(300);
  check('Nasıl İşlem Eklerim rehberi görünür', await page.locator('text=Nasıl İşlem Eklerim').count() > 0);
  await page.screenshot({ path: `${out}/s4-islemler-rehber.png` });
  check('İşlem formu (holdings var olduğu için) görünür', await page.locator('#t-amount').count() > 0);
  await page.fill('#t-amount', '5000');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await page.waitForTimeout(300);
  check('İşlem geçmişine düştü', await page.locator('.badge-green').count() > 0);

  // Projeksiyon: grafik var mı
  await page.click('.side-link:has-text("PROJEKSİYON")');
  await page.waitForTimeout(400);
  check('Projeksiyon grafiği çizildi (3 senaryo çizgisi)', await page.locator('.recharts-line').count() >= 3);
  await page.screenshot({ path: `${out}/s5-projeksiyon.png` });

  // Ajan: analiz + sohbet
  await page.click('.side-link:has-text("AJAN")');
  await page.getByRole('button', { name: /Analiz Et/ }).click();
  await page.waitForTimeout(400);
  check('Ajan analiz mesajları geldi', await page.locator('.msg-agent').count() >= 3);
  await page.screenshot({ path: `${out}/s6-ajan.png` });

  // Sıfırla akışı (dialog kabul)
  page.once('dialog', d => d.accept());
  await page.click('text=SIFIRLA');
  await page.waitForTimeout(400);
  check('Sıfırlama sonrası karşılama ekranına döndü', await page.locator('text=Nasıl başlamak istersin').count() > 0);

  await page.close();
}

// ---- MOBİL (390px) ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', err => { console.log('PAGE_ERROR (mobil):', err.message); failed = true; });
  await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
  await page.click('text=Karma örnek portföy');
  await page.waitForTimeout(400);
  const sidebarBox = await page.locator('.sidebar').boundingBox();
  check('Mobilde sidebar tam genişlik (yatay bar)', sidebarBox !== null && sidebarBox.width > 350);
  check('Mobilde yatay taşma yok', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: `${out}/s7-mobil.png` });
  await page.close();
}

await browser.close();
console.log(failed ? 'FAGENT_SIDEBAR_E2E_FAILED' : 'FAGENT_SIDEBAR_E2E_OK');
process.exit(failed ? 1 : 0);
