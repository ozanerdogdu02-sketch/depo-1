// TCMB EVDS entegrasyonu — canlı enflasyon + fail-safe geri düşme.
//
// NEDEN: enflasyon oranı ürünün en ayırt edici hesaplarının (reel getiri, vergi sonrası net
// getiri, nakit erimesi) TAMAMINI besliyor ve daha önce DÖRT ayrı yerde sabit olarak duruyordu.
// Artık tek kaynak (`inflation.ts`) ve mümkünse TCMB EVDS'den canlı geliyor.
//
// EN KRİTİK DAVRANIŞ — canlı veri bir BONUSTUR, ürünün şartı değil: fonksiyon yoksa, anahtar
// tanımsızsa ya da ağ koparsa uygulama varsayımla tam çalışmaya devam etmeli ve kullanıcıya
// HİÇBİR hata gösterilmemeli. Bu dosyadaki testlerin çoğu o yolun sessizliğini doğruluyor.
//
// Doğrulanan davranışlar:
//   • Fonksiyon veri döndüğünde oran canlı değere geçiyor ve kaynak "TCMB EVDS" yazıyor
//   • Yıllık değişim ENDEKSTEN hesaplanıyor (baz yılı önemsiz) — 13. gözlemle karşılaştırma
//   • 503 (anahtar yok), 502 (TCMB susuyor) ve ağ kopması: sessizce varsayıma düşülüyor
//   • Bozuk/eksik yanıt: varsayım korunuyor, uydurma sayı ÜRETİLMİYOR
//   • Kullanıcının girdiği oran canlı veriyi EZİYOR (senaryo denemesi meşru)
//   • Üç kart + ajan AYNI oranı söylüyor (önceden her biri kendi state'ini tutuyordu)
//   • Sonuç önbelleğe alınıyor — ikinci yüklemede tekrar istek atılmıyor
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const VARSAYILAN = 32; // inflation.ts → VARSAYILAN_ENFLASYON_PCT

// EVDS yanıt biçimi taklidi. Endeks 1000 → 1450 = %45,0 yıllık.
// 14 gözlem üretiyoruz; istemci sondan 13. ile sonuncuyu karşılaştırıyor.
function evdsBody({ from = 1000, to = 1450 } = {}) {
  const items = [];
  for (let i = 0; i < 14; i++) {
    // İlk gözlem "13 ay önce"nin bir öncesi; sondan 13. gözlem tam bir yıl öncesi olmalı.
    const v = i === 0 ? from * 0.98 : i === 1 ? from : from + ((to - from) * (i - 1)) / 12;
    items.push({ Tarih: `${String((i % 12) + 1).padStart(2, '0')}-2026`, TP_FG_J0: v.toFixed(2), UNIXTIME: { $numberLong: '0' } });
  }
  return { totalCount: items.length, items };
}

async function newPage(handler) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  let calls = 0;
  await page.route('**/.netlify/functions/evds*', route => { calls++; return handler(route); });
  await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(600);
  return { page, calls: () => calls };
}

const insightCard = p => p.locator('.card').filter({ has: p.locator('.card-title', { hasText: 'Proaktif İçgörüler' }) });
const taxCard = p => p.locator('.card').filter({ has: p.locator('.card-title', { hasText: 'Vergi Sonrası Net Getiri' }) });

const ask = async (page, text) => {
  await page.locator('.side-link', { hasText: 'AJAN' }).click();
  await page.waitForTimeout(250);
  await page.fill('input[aria-label="Ajana soru sor"]', text);
  await page.getByRole('button', { name: 'Gönder' }).click();
  await page.waitForTimeout(350);
  return (await page.locator('.msg-agent').last().textContent()) ?? '';
};

/* ── 1) Canlı veri geldiğinde ───────────────────────────────────────────────── */

{
  const ok = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evdsBody()) });
  const { page, calls } = await newPage(ok);

  check('EVDS fonksiyonu çağrıldı', calls() === 1);
  check('Enflasyon canlı değere geçti (%45)', (await page.inputValue('#inflation-input')) === '45');
  const metin = (await insightCard(page).textContent()) ?? '';
  check('Kaynak "TCMB EVDS" olarak yazıldı', metin.includes('TCMB EVDS'));
  check('Kaynak dönemi de gösteriliyor', /TCMB EVDS\s*·\s*\d{2}-2026/.test(metin));
  check('Vergi kartı da aynı oranı gösteriyor', ((await taxCard(page).textContent()) ?? '').includes('%45 enflasyona göre'));
  check('Vergi kartı da kaynağı yazıyor', ((await taxCard(page).textContent()) ?? '').includes('TCMB EVDS'));

  await page.locator('.side-link', { hasText: 'PROJEKSİYON' }).click();
  await page.waitForTimeout(300);
  check('Projeksiyon da aynı oranı kullanıyor', (await page.inputValue('#p-inflation')) === '45');

  const cevap = await ask(page, 'reel getirim ne');
  check('Ajan da canlı oranı kullanıyor (kart ile aynı)', cevap.includes('%45 enflasyon'));
  check('Ajan varsayılan orana DÜŞMEDİ', !cevap.includes(`%${VARSAYILAN} enflasyon`));

  // Önbellek: sayfa yenilenince tekrar istek atılmamalı (12 saatlik TTL).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('Önbellek sayesinde ikinci istek atılmadı', calls() === 1);
  check('Yenilemeden sonra da canlı oran duruyor', (await page.inputValue('#inflation-input')) === '45');
  await page.close();
}

/* ── 2) Anahtar yok (503) — sessizce varsayıma düş ──────────────────────────── */

{
  const noKey = route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: 'anahtar_yok', message: 'EVDS anahtarı tanımlı değil; canlı enflasyon kapalı.' }),
  });
  const { page } = await newPage(noKey);

  check('Anahtar yokken varsayım kullanılıyor', (await page.inputValue('#inflation-input')) === String(VARSAYILAN));
  const metin = (await insightCard(page).textContent()) ?? '';
  check('Kaynak "varsayım" olarak yazıyor', metin.includes('varsayım'));
  check('Kullanıcıya HİÇBİR hata gösterilmiyor', !/hata|başarısız|ulaşılamadı|EVDS anahtarı/i.test(metin));
  check('Panel normal çalışmaya devam ediyor', await page.locator('.card').count() > 3);
  await page.close();
}

/* ── 3) TCMB susuyor (502) ve ağ tamamen kopuk ─────────────────────────────── */

{
  const { page } = await newPage(route => route.fulfill({ status: 502, body: '{}' }));
  check('502\'de varsayıma düşülüyor', (await page.inputValue('#inflation-input')) === String(VARSAYILAN));
  await page.close();
}

{
  const { page } = await newPage(route => route.abort());
  check('Ağ koptuğunda varsayıma düşülüyor', (await page.inputValue('#inflation-input')) === String(VARSAYILAN));
  check('Ağ koptuğunda sayfa yine de çalışıyor', await page.locator('.card').count() > 3);
  await page.close();
}

/* ── 4) Bozuk yanıtlar — uydurma sayı ÜRETİLMEMELİ ─────────────────────────── */

{
  // Yeterli gözlem yok: yıllık değişim hesaplanamaz.
  const { page } = await newPage(route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ items: [{ Tarih: '01-2026', TP_FG_J0: '1000' }] }),
  }));
  check('Eksik seride varsayım korunuyor', (await page.inputValue('#inflation-input')) === String(VARSAYILAN));
  await page.close();
}

{
  // Akıl dışı değer (endeks 100 katına çıkmış gibi): akla yatkınlık kontrolü elemeli.
  const { page } = await newPage(route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(evdsBody({ from: 1000, to: 900000 })),
  }));
  check('Akıl dışı oran reddedildi, varsayım korundu', (await page.inputValue('#inflation-input')) === String(VARSAYILAN));
  await page.close();
}

/* ── 5) Kullanıcının girdiği oran canlı veriyi ezer ─────────────────────────── */

{
  const ok = route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(evdsBody()) });
  const { page } = await newPage(ok);

  check('Başlangıçta canlı oran', (await page.inputValue('#inflation-input')) === '45');
  await page.fill('#inflation-input', '70');
  await page.waitForTimeout(300);

  check('Kullanıcı oranı yazıldı', (await page.inputValue('#inflation-input')) === '70');
  check('Kaynak "senin girdiğin oran" oldu', ((await insightCard(page).textContent()) ?? '').includes('senin girdiğin oran'));
  check('Vergi kartı da kullanıcı oranına geçti', ((await taxCard(page).textContent()) ?? '').includes('%70 enflasyona göre'));

  await page.locator('.side-link', { hasText: 'PROJEKSİYON' }).click();
  await page.waitForTimeout(300);
  check('Projeksiyon da kullanıcı oranını aldı (önceden ayrı state\'ti)', (await page.inputValue('#p-inflation')) === '70');

  const cevap = await ask(page, 'reel getirim ne');
  check('Ajan da kullanıcı oranını kullanıyor', cevap.includes('%70 enflasyon'));
  await page.close();
}

await browser.close();
console.log(failed ? '\nBAŞARISIZ' : '\nTAMAM');
process.exit(failed ? 1 : 0);
