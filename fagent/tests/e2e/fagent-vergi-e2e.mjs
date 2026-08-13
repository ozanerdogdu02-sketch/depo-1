// Vergi sonrası net reel getiri — zincirin üçüncü halkası.
// Yaygın uygulamalar brüt getiride durur, bir kısmı reeli hesaplar; vergiyi katan neredeyse yok.
// Ajan artık BRÜT → STOPAJ → NET → ENFLASYON → REEL zincirinin tamamını kuruyor.
//
// Doğrulanan davranışlar:
//   • Zincirin dört halkası da sayıyla veriliyor
//   • Vergi KAZANÇ üzerinden alınıyor (zarardaki kalemden kesinti yok)
//   • Kalem bazında kesinti dökümü veriliyor
//   • Oranın VARSAYIM olduğu ve dayanağı (11107 sayılı CB Kararı) açıkça söyleniyor
//   • Doğrulanamayan sınıflar (kripto/altın/döviz) %0 varsayılıyor ve bu "vergi yok" demek
//     OLMADIĞI açıkça belirtiliyor — projenin "uydurma veri yok" ilkesinin vergi karşılığı
//   • Kullanıcının metinde verdiği enflasyon oranı dikkate alınıyor
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);

const ask = async (text) => {
  await page.fill('input[aria-label="Ajana soru sor"]', text);
  await page.getByRole('button', { name: 'Gönder' }).click();
  await page.waitForTimeout(350);
  return (await page.locator('.msg-agent').last().textContent()) ?? '';
};

/* ── Karma örnek portföy beklenen hesabı ───────────────────────────────────────
   BIST 30 Fonu (fon)      48.500 − 45.000 = +3.500  → %17,5 → ₺612,50 stopaj
   THYAO (hisse)           25.200 − 28.000 = −2.800  → ZARAR, kesinti yok
   Gram Altın (altin)      23.800 − 22.000 = +1.800  → oran doğrulanamadı → %0
   USD (doviz)             15.000 − 15.000 =      0  → kesinti yok
   Vadeli Mevduat          31.200 − 30.000 = +1.200  → %17,5 → ₺210 stopaj
   -----------------------------------------------------------------------------
   brüt kazanç +3.700 · stopaj ₺822,50 · net kazanç +2.877,50 · maliyet 140.000  */

const vergi = await ask('vergiden sonra ne kalıyor');

check('Vergi sorusu fallback DEĞİL', !vergi.includes('tam olarak anlayamadım'));
check('Zincir baştan kuruluyor', vergi.includes('Zinciri baştan sona kuralım'));

// --- Zincirin dört halkası ---
check('1) Brüt kazanç veriliyor', /Brüt kazanç:\s*\+₺\s?3\.700/.test(vergi));
check('2) Stopaj tutarı veriliyor (₺823 ≈ 612,50 + 210)', /Varsayılan stopaj:\s*−₺\s?82[23]/.test(vergi));
check('2) Net kazanç veriliyor', /net kazanç \+₺\s?2\.87[78]/.test(vergi));
check('3) REEL net getiri veriliyor', /REEL net getirin: %-?\d+[.,]\d{2}/.test(vergi));
check('Vergisiz reel getiriyle karşılaştırılıyor', /Vergi hiç olmasaydı reel getirin %-?\d/.test(vergi));
check('Stopajın reel maliyeti puan olarak veriliyor', /puan stopajın reel maliyeti/.test(vergi));

// --- Vergi KAZANÇ üzerinden alınır: zarardaki kalem dökümde olmamalı ---
check('Kalem bazında kesinti dökümü var', vergi.includes('Kalem bazında kesinti'));
check('Kârdaki fon dökümde (BIST 30 Fonu)', vergi.includes('BIST 30 Fonu'));
check('Kârdaki mevduat dökümde (Vadeli Mevduat)', vergi.includes('Vadeli Mevduat'));
check('ZARARDAKİ hisse (THYAO) kesinti dökümünde YOK', !/THYAO.*%\d/.test(vergi.split('Kalem bazında kesinti')[1] ?? ''));
check('Fon oranı %17,5 olarak gösteriliyor', /%17[.,]5/.test(vergi));

// --- Dürüstlük: oran bir VARSAYIM, dayanağı yazılı ---
check('Oranın varsayım olduğu söyleniyor', /VARSAYILMIŞTIR/.test(vergi));
check('Dayanak (11107 sayılı CB Kararı) belirtiliyor', vergi.includes('11107'));
check('Beyanname olmadığı açıkça söyleniyor', /vergi beyannamesi değil/.test(vergi));

// --- Doğrulanamayan sınıflar: %0 ama "vergi yok" DEĞİL ---
// Karma portföyde altın ve döviz var → uyarı çıkmalı.
check('Doğrulanamayan sınıf uyarısı veriliyor', /%0 varsaydım/.test(vergi));
check('"%0 = vergi yok değildir" ayrımı yapılıyor', /"vergi yok" demek değil/.test(vergi));

await page.screenshot({ path: `${out}/vergi1-zincir.png` });

// --- Kullanıcının verdiği enflasyon oranı kullanılıyor mu ---
const vergi55 = await ask('%55 enflasyona göre vergiden sonra ne kalıyor');
check('Metindeki %55 enflasyon oranı dikkate alınıyor', /%55 enflasyon/.test(vergi55));

// --- Reel getiri cevabı artık vergi katmanına yönlendiriyor ---
const reel = await ask('reel getirim ne');
check('Reel getiri cevabı VERGİ ÖNCESİ olduğunu söylüyor', /VERGİ ÖNCESİ/.test(reel));
check('Reel getiri cevabı vergi sorusuna yönlendiriyor', /vergiden sonra ne kalıyor/.test(reel));

// --- Yardım metni yeni yeteneği listeliyor ---
const yardim = await ask('yardım');
check('Yardım listesinde vergi zinciri var', /brüt → stopaj → net → reel/i.test(yardim));

// --- Tamamı doğrulanamayan sınıftan oluşan portföy: stopaj 0, ama uyarı yine var ---
// SIFIRLA `.side-nav` içindeki bir link değil, ayrı bir `.side-reset` düğmesi — ve onay
// diyaloğu açıyor. Dinleyici tıklamadan ÖNCE kurulmalı (bkz. fagent-memory-e2e.mjs).
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(200);
page.once('dialog', d => d.accept());
await page.locator('.side-reset').click();
await page.waitForTimeout(400);
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Kripto örnek portföyü/ }).click();
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);

const kripto = await ask('stopaj sonrası net getirim ne');
check('Kripto portföyünde de zincir kuruluyor', kripto.includes('Zinciri baştan sona kuralım'));
check('Kripto için oran doğrulanamadığı belirtiliyor', /%0 varsaydım/.test(kripto));
check('Kripto portföyünde stopaj ₺0', /Varsayılan stopaj:\s*−₺\s?0/.test(kripto));

await page.screenshot({ path: `${out}/vergi2-kripto.png` });

/* ── Panel'deki Vergi Sonrası Net Getiri kartı + düzenlenebilir oranlar ──────────
   Ajan "kendi oranını söyle" diyor; girecek bir yer olmadan bu söz boş kalırdı.
   Buradaki kritik davranış: kartta girilen oran KALICI ve AJAN DA aynı oranı kullanmalı. */
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(400);

const card = page.locator('.card', { hasText: 'Vergi Sonrası Net Getiri' });
check('Panel\'de vergi kartı var', await card.count() > 0);
check('Kart zinciri özetliyor (brüt → stopaj → reel)', (await card.first().innerText()).includes('Brüt kazanç'));
check('Kartta dayanak (11107) yazılı', (await card.first().innerText()).includes('11107'));

// Oran düzenleme panelini aç
await card.getByRole('button', { name: 'Stopaj oranlarını düzenle' }).click();
await page.waitForTimeout(250);
check('Kripto için oran alanı var', await page.locator('#tax-kripto').count() > 0);
check('Kripto varsayılanı 0', (await page.locator('#tax-kripto').inputValue()) === '0');

// Kullanıcı kendi oranını giriyor
await page.fill('#tax-kripto', '20');
await page.waitForTimeout(350);
check('Girilen oran "senin girdiğin oran" olarak etiketleniyor',
  (await card.first().innerText()).includes('senin girdiğin oran'));

const persisted = await page.evaluate(() => localStorage.getItem('fagent.tax.v1'));
check('Oran localStorage\'a yazıldı', !!persisted && JSON.parse(persisted).kripto === 20);

// AJAN da aynı oranı kullanmalı — iki yerde farklı sayı söylemek en kötüsü
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(350);
const kriptoVergili = await ask('vergiden sonra ne kalıyor');
check('Ajan kullanıcının girdiği %20 oranını kullanıyor', /%20/.test(kriptoVergili));
check('Ajan artık stopajı sıfır göstermiyor', !/Varsayılan stopaj:\s*−₺\s?0\b/.test(kriptoVergili));

await page.screenshot({ path: `${out}/vergi3-oran-duzenleme.png` });

// SIFIRLA oranları da temizlemeli (dördüncü kalıcı katman)
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(200);
page.once('dialog', d => d.accept());
await page.locator('.side-reset').click();
await page.waitForTimeout(400);
const afterReset = await page.evaluate(() => localStorage.getItem('fagent.tax.v1'));
check('SIFIRLA vergi oranlarını da temizledi', afterReset === null);

await browser.close();
console.log(failed ? 'FAGENT_VERGI_E2E_FAILED' : 'FAGENT_VERGI_E2E_OK');
process.exit(failed ? 1 : 0);
