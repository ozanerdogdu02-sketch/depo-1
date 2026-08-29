import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
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

await browser.close();
console.log(failed ? 'FAGENT_FEEDBACK_E2E_FAILED' : 'FAGENT_FEEDBACK_E2E_OK');
process.exit(failed ? 1 : 0);
