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

// Örnek veride THYAO (hisse): amount 25200, costBasis 28000.

// --- Onaylanan bir satış gerçek işlem oluşturmalı ---
await ask('THYAO\'dan 1000 TL sat');
const proposalIndex = (await page.locator('.msg-agent').count()) - 1;
const proposalMsg = page.locator('.msg-agent').nth(proposalIndex);
check('İşlem önerisi metni geldi', (await proposalMsg.textContent())?.includes('satmak istediğini anladım') ?? false);
check('Onayla/Vazgeç butonları görünür', await proposalMsg.getByRole('button', { name: 'Onayla' }).count() === 1);

await proposalMsg.getByRole('button', { name: 'Onayla' }).click();
await page.waitForTimeout(300);
check('Onay sonrası "Onaylandı" durumuna geçti', await proposalMsg.getByRole('button', { name: 'Onaylandı ✓' }).count() === 1);
check('Onaylandıktan sonra buton devre dışı', await proposalMsg.getByRole('button', { name: 'Onaylandı ✓' }).isDisabled());
check('Yeni bir onay mesajı geldi', (await page.locator('.msg-agent').last().textContent())?.includes('Yaptım') ?? false);

// Panel'e geçip gerçekten işlendiğini doğrula
await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
check('İşlem geçmişinde yeni satış görünüyor', await page.locator('.badge-red', { hasText: 'SATIŞ' }).count() >= 1);
check('İşlem tutarı doğru (₺1.000)', await page.locator('text=−₺1.000').count() > 0);

// --- Vazgeçilen bir öneri hiçbir veri değiştirmemeli ---
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);
const txnCountBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('fagent.portfolio.v1')).txns.length);
await ask('THYAO\'dan 500 TL sat');
const proposalIndex2 = (await page.locator('.msg-agent').count()) - 1;
const proposalMsg2 = page.locator('.msg-agent').nth(proposalIndex2);
await proposalMsg2.getByRole('button', { name: 'Vazgeç' }).click();
await page.waitForTimeout(300);
check('Vazgeçilince onay mesajı gelmedi, iptal mesajı geldi', (await page.locator('.msg-agent').last().textContent())?.includes('iptal ettim') ?? false);
const txnCountAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('fagent.portfolio.v1')).txns.length);
check('Vazgeçilen işlem gerçek veriye yansımadı', txnCountAfter === txnCountBefore);

// --- Bakiyeyi aşan bir satış önerisi onaylansa bile engellenmeli ---
await ask('THYAO\'dan 999999 TL sat');
const proposalIndex3 = (await page.locator('.msg-agent').count()) - 1;
const proposalMsg3 = page.locator('.msg-agent').nth(proposalIndex3);
await proposalMsg3.getByRole('button', { name: 'Onayla' }).click();
await page.waitForTimeout(300);
check('Bakiyeyi aşan işlem onaylansa bile reddedildi', (await page.locator('.msg-agent').last().textContent())?.includes('Bakiyeyi aşamaz') ?? false);

// --- Belirsiz komutlar (varlık bulunamayan/birden fazla eşleşen) normal soru-cevaba düşmeli ---
await ask('nakit sat');
check('Var olmayan varlık için işlem önerilmedi (normal cevaba düştü)', await page.locator('.msg-agent').last().getByRole('button', { name: 'Onayla' }).count() === 0);

await browser.close();
console.log(failed ? 'FAGENT_ACTION_E2E_FAILED' : 'FAGENT_ACTION_E2E_OK');
process.exit(failed ? 1 : 0);
