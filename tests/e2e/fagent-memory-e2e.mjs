import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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

// --- İlk ziyarette hafıza sorgusu boş olmalı ---
await ask('beni ne hatırlıyorsun');
check('İlk ziyarette hafıza boş — öğrenmedim mesajı', (await page.locator('.msg-agent').last().textContent())?.includes('öğrenmedim') ?? false);

// --- Aynı konuyu birkaç kez sorunca hafızaya yazılmalı (localStorage) ---
await ask('dağılımım nasıl');
await ask('dağılımım nasıl');
await ask('THYAO nasıl gidiyor');
await ask('THYAO nasıl gidiyor');
await ask('THYAO nasıl gidiyor');

const memRaw = await page.evaluate(() => localStorage.getItem('fagent.agent.memory.v1'));
const mem = JSON.parse(memRaw ?? '{}');
check('localStorage\'da ajan hafızası kaydedildi', memRaw !== null);
check('Konu sayacı doğru arttı (dağılım >= 2)', (mem.topicCounts?.dagilim ?? 0) >= 2);
check('Varlık bahsi sayaçı doğru arttı (THYAO >= 3)', (mem.holdingMentions?.THYAO ?? 0) >= 3);

await ask('beni ne hatırlıyorsun');
const memReply = await page.locator('.msg-agent').last().textContent();
check('Hafıza sorgusu artık dağılım konusunu içeriyor', memReply?.includes('dağılım') ?? false);
check('Hafıza sorgusu THYAO\'yu içeriyor', memReply?.includes('THYAO') ?? false);
check('Hafıza yanıtı gizlilik notunu içeriyor (yalnızca tarayıcında)', memReply?.includes('tarayıcında') ?? false);

// --- Sayfa yenilenince (yeni "oturum") kişiselleştirilmiş karşılama gelmeli ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);
const greetingAfterReload = await page.locator('.msg-agent').first().textContent();
check('Sayfa yenilenince "Tekrar merhaba" ile kişiselleştirilmiş karşılama geldi', greetingAfterReload?.includes('Tekrar merhaba') ?? false);
check('Kişiselleştirilmiş karşılama önceki konuyu referans alıyor', greetingAfterReload?.includes('THYAO') || greetingAfterReload?.includes('dağılım'));

// --- SIFIRLA ajan hafızasını da silmeli ---
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(200);
page.once('dialog', d => d.accept());
await page.locator('text=SIFIRLA').click();
await page.waitForTimeout(300);
const memAfterReset = await page.evaluate(() => localStorage.getItem('fagent.agent.memory.v1'));
check('SIFIRLA sonrası ajan hafızası da temizlendi', memAfterReset === null);

await browser.close();
console.log(failed ? 'FAGENT_MEMORY_E2E_FAILED' : 'FAGENT_MEMORY_E2E_OK');
process.exit(failed ? 1 : 0);
