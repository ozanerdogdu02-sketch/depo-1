// Adres yapısı ve tanıtım sayfası.
// Önceden uygulama tek URL'di: geri tuşu çalışmıyor, ekran paylaşılamıyor, yer imi
// konulamıyordu. Ayrıca kök adres doğrudan uygulamaya düşüyordu ve ziyaretçi bunun ne
// olduğunu anlamıyordu.
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const BASE = 'http://localhost:4200';

/* ── Yeni ziyaretçi: kök adreste tanıtım sayfasını görmeli ── */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  const body = (await page.locator('body').textContent()) ?? '';
  check('Tanıtım sayfası açılıyor', body.includes('Gösteren çok'));
  check('Ürünün ne yaptığı yazıyor', /vergi/i.test(body) && /enflasyon/i.test(body));
  check('Somut örnek sayıları görünür', body.includes('+%2,6') && body.includes('−%22,69'));
  // "tavsiyesi vermez" — Türkçe iyelik eki, esnek desen (bkz. CLAUDE.md §1.5)
  check('Sınırlar bölümü var (tavsiye vermez)', /tavsiye(si)? vermez/i.test(body));
  check('Veri uyarısı görünür', /tarayıc/i.test(body));
  check('Tanıtım sayfasında sidebar YOK', await page.locator('.side-link').count() === 0);

  // CTA panele götürmeli
  await page.getByRole('button', { name: /Örnek portföyle dene/ }).click();
  await page.waitForTimeout(500);
  check('CTA /panel adresine götürdü', new URL(page.url()).pathname === '/panel');
  check('Panelde karşılama ekranı çıktı', ((await page.locator('body').textContent()) ?? '').includes('Nasıl başlamak istersin'));
  await page.close();
}

/* ── Derin bağlantı, geri tuşu, bilinmeyen yol ── */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

  // Doğrudan /ajan adresine gitmek çalışmalı (paylaşılan link senaryosu)
  await page.goto(`${BASE}/ajan`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(500);
  check('Derin bağlantı: /ajan doğrudan açılıyor', await page.locator('input[aria-label="Ajana soru sor"]').count() === 1);

  // Sekmeye tıklamak adresi değiştirmeli
  await page.locator('.side-link', { hasText: 'PROJEKSİYON' }).click();
  await page.waitForTimeout(300);
  check('Sekme tıklaması adresi değiştiriyor', new URL(page.url()).pathname === '/projeksiyon');

  await page.locator('.side-link', { hasText: 'KRİPTO PİYASASI' }).click();
  await page.waitForTimeout(300);
  check('Türkçe karakterli sekme yolu doğru', new URL(page.url()).pathname === '/kripto-piyasa');

  // Geri tuşu bir önceki sekmeye dönmeli
  await page.goBack();
  await page.waitForTimeout(400);
  check('Geri tuşu önceki sekmeye döndü', new URL(page.url()).pathname === '/projeksiyon');
  // Sidebar etiketleri CSS ile değil kaynakta BÜYÜK harf — küçük harfli arama eşleşmez.
  check('Geri sonrası doğru ekran görünüyor',
    /projeksiyon/i.test((await page.locator('body').textContent()) ?? ''));

  await page.goForward();
  await page.waitForTimeout(400);
  check('İleri tuşu da çalışıyor', new URL(page.url()).pathname === '/kripto-piyasa');

  // Bilinmeyen yol panele düşmeli (404 ekranı yok)
  await page.goto(`${BASE}/boyle-bir-sayfa-yok`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  check('Bilinmeyen yol /panel adresine düzeltildi', new URL(page.url()).pathname === '/panel');
  check('Bilinmeyen yolda uygulama çalışıyor', await page.locator('.side-link').count() > 0);
  await page.close();
}

/* ── Verisi olan ziyaretçi kök adreste tanıtım sayfası GÖRMEMELİ ── */
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  await page.goto(`${BASE}/panel`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(400);

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('Verisi olan ziyaretçi kökten /panel\'e yönlendirildi', new URL(page.url()).pathname === '/panel');
  check('Yönlendirme sonrası tanıtım sayfası görünmüyor',
    !((await page.locator('body').textContent()) ?? '').includes('Örnek portföyle dene'));
  await page.close();
}

/* ── Mobil genişlikte tanıtım sayfası taşmamalı ── */
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('Mobilde yatay taşma yok', overflow <= 1);
  check('Mobilde CTA görünür', await page.getByRole('button', { name: /Örnek portföyle dene/ }).isVisible());
  await page.close();
}

await browser.close();
console.log(failed ? 'FAGENT_ROUTING_E2E_FAILED' : 'FAGENT_ROUTING_E2E_OK');
process.exit(failed ? 1 : 0);
