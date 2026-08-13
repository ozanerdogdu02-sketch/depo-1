import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/panel', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);

const ask = async (text) => {
  await page.fill('input[aria-label="Ajana soru sor"]', text);
  await page.getByRole('button', { name: 'Gönder' }).click();
  await page.waitForTimeout(250);
};

// --- Greeting mesajında rating butonu olmamalı (statik/ratable değil) ---
check('Karşılama mesajında 👍/👎 yok', await page.locator('.msg-agent').first().locator('button[aria-label*="beğen"]').count() === 0);

// --- Built-in bir cevaba 👍: otomatik olarak öğretilmiş bilgiye terfi etmeli ---
await ask('risk durumum nasıl');
const lastMsg = page.locator('.msg-agent').last();
check('Ratable cevapta 👍/👎 butonları görünür', await lastMsg.locator('button[aria-label="Bu cevabı beğendim"]').count() === 1);
await lastMsg.locator('button[aria-label="Bu cevabı beğendim"]').click();
await page.waitForTimeout(300);
check('👍 sonrası buton "rated" durumuna geçti (tekrar tıklanamaz)', await lastMsg.locator('button[aria-label="Bu cevabı beğendim"]').isDisabled());

await page.getByRole('button', { name: /Ajanı Eğit/ }).click();
await page.waitForTimeout(200);
check('👍 built-in cevabı otomatik öğretilmiş bilgiye terfi ettirdi', await page.locator('.list-row', { hasText: 'risk durumum nasıl' }).count() === 1);
await page.getByRole('button', { name: /Ajanı Eğit/ }).click(); // paneli kapat
await page.waitForTimeout(200);

// --- 👎: Ajanı Eğit panelini soru önceden dolu şekilde açmalı ---
await ask('enflasyon hakkında ne düşünüyorsun');
const lastMsg2 = page.locator('.msg-agent').last();
await lastMsg2.locator('button[aria-label="Bu cevabı beğenmedim, düzeltmek istiyorum"]').click();
await page.waitForTimeout(300);
check('👎 sonrası Ajanı Eğit paneli otomatik açıldı', await page.locator('#teach-q').count() === 1);
check('Soru alanı önceden dolduruldu (kullanıcının sorusuyla)', (await page.inputValue('#teach-q')) === 'enflasyon hakkında ne düşünüyorsun');
check('Cevap alanı boş (built-in cevap, düzeltilmesi bekleniyor)', (await page.inputValue('#teach-a')) === '');

// Kullanıcı düzeltmeyi yazıp öğretsin
await page.fill('#teach-a', 'Düzeltilmiş: enflasyon dönemlerinde reel getiri önceliklendirilmelidir.');
await page.getByRole('button', { name: 'Öğret', exact: true }).click();
await page.waitForTimeout(300);
check('Düzeltme öğretilmiş bilgiye eklendi', await page.locator('.list-row', { hasText: 'enflasyon hakkında ne düşünüyorsun' }).count() === 1);

await ask('enflasyon hakkında ne düşünüyorsun');
check('Bir sonraki soruda düzeltilmiş cevap kullanılıyor', (await page.locator('.msg-agent').last().textContent())?.includes('Düzeltilmiş') ?? false);

// --- Fallback cevapta 👎 ile de öğretme paneli açılabilmeli ---
await ask('asdkjqwe123 anlamsız bir soru');
const fallbackMsg = page.locator('.msg-agent').last();
check('Fallback cevapta da rating butonları var', await fallbackMsg.locator('button[aria-label*="beğen"]').count() === 2);
await fallbackMsg.locator('button[aria-label="Bu cevabı beğenmedim, düzeltmek istiyorum"]').click();
await page.waitForTimeout(300);
check('Fallback\'te 👎 de Eğit panelini soru dolu açtı', (await page.inputValue('#teach-q')) === 'asdkjqwe123 anlamsız bir soru');

// --- SAYI İÇEREN cevaba 👍 basmak onu SABİTLEMEMELİ (bayat rakam koruması) ---
// Gerçek bir hataydı: "reel getirim ne" cevabı 👍 ile kalıcı bilgiye dönüşüyor, portföy
// değişse bile aynı rakamı gösteriyordu. Bkz. agentTraining.hasComputedFigures.
await ask('reel getirim ne');
const numericMsg = page.locator('.msg-agent').last();
const firstAnswer = (await numericMsg.textContent()) ?? '';
check('Sayısal cevap gerçekten rakam içeriyor', /%[-−]?\d/.test(firstAnswer));

const factsBefore = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('fagent.agent.training.v1') || '[]').length);
await numericMsg.locator('button[aria-label="Bu cevabı beğendim"]').click();
await page.waitForTimeout(300);
const factsAfter = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('fagent.agent.training.v1') || '[]').length);
check('Sayı içeren cevap öğretilmiş bilgiye EKLENMEDİ', factsAfter === factsBefore);
// DİKKAT: `a?.includes(x) ?? b` yanlış — includes() false döndürünce ?? devreye GİRMEZ
// (yalnızca null/undefined'da girer). Alternatifleri tek regex ile kontrol et.
check('Ajan neden sabitlemediğini açıkladı',
  /sabitleseydim|kalıcı bilgiye çevirmedim/i.test((await page.locator('.msg-agent').last().textContent()) ?? ''));

// Portföy değişince aynı soru GÜNCEL rakamı döndürmeli (donmuş cevap gelmemeli)
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fagent.portfolio.v1'));
  s.holdings[0].amount = s.holdings[0].amount * 3;
  localStorage.setItem('fagent.portfolio.v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);
await ask('reel getirim ne');
const secondAnswer = (await page.locator('.msg-agent').last().textContent()) ?? '';
check('Portföy değişince cevap GÜNCELLENDİ (bayat rakam dönmedi)',
  firstAnswer.trim() !== secondAnswer.trim());

// Sayı içermeyen cevapta terfi HÂLÂ çalışmalı — §1.9 davranışı korunuyor
await ask('merhaba');
const plainMsg = page.locator('.msg-agent').last();
const before2 = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('fagent.agent.training.v1') || '[]').length);
await plainMsg.locator('button[aria-label="Bu cevabı beğendim"]').click();
await page.waitForTimeout(300);
const after2 = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('fagent.agent.training.v1') || '[]').length);
check('Sayısız cevapta 👍 terfisi hâlâ çalışıyor', after2 === before2 + 1);

await browser.close();
console.log(failed ? 'FAGENT_FEEDBACK_E2E_FAILED' : 'FAGENT_FEEDBACK_E2E_OK');
process.exit(failed ? 1 : 0);
