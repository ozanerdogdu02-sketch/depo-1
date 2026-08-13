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

// --- Öğretmeden önce: bilinmeyen bir soru fallback'e düşmeli ---
await ask('temettü nedir');
check('Öğretilmeden önce fallback mesajı geldi', (await page.locator('.msg-agent').last().textContent())?.includes('anlayamadım') ?? false);

// --- Panel kapalı görünür, açılır ---
check('Ajanı Eğit paneli başta kapalı', await page.locator('#teach-q').count() === 0);
await page.getByRole('button', { name: /Ajanı Eğit/ }).click();
await page.waitForTimeout(200);
check('Panel açıldı, soru/cevap alanları görünür', await page.locator('#teach-q').count() === 1);

// --- Öğretme ---
await page.fill('#teach-q', 'temettü nedir');
await page.fill('#teach-a', 'Temettü, şirketin kârından hissedarlara dağıttığı paydır.');
await page.getByRole('button', { name: 'Öğret', exact: true }).click();
await page.waitForTimeout(300);
check('Öğretilen bilgi listede görünüyor', await page.locator('text=Temettü, şirketin kârından').count() > 0);
check('Kullanım sayacı başta 0', await page.locator('text=0 kez kullanıldı').count() > 0);

// --- Şimdi aynı soru öğretilen cevabı vermeli (built-in fallback yerine) ---
await ask('temettü nedir');
const taughtReply = await page.locator('.msg-agent').last().textContent();
check('Öğretilen soru artık öğretilen cevabı veriyor', taughtReply?.includes('hissedarlara dağıttığı') ?? false);
check('Kullanım sayacı arttı (panel görünür haldeyken)', await page.locator('text=1 kez kullanıldı').count() > 0);

// --- Benzer (tam aynı olmayan) bir varyasyon da eşleşmeli (bulanık eşleştirme) ---
await ask('temettü nedir bana anlat');
const fuzzyReply = await page.locator('.msg-agent').last().textContent();
check('Varyasyon (fuzzy match) da öğretilen cevabı buldu', fuzzyReply?.includes('hissedarlara dağıttığı') ?? false);

// --- Aynı soruyu yeniden öğretmek düzeltme olarak üzerine yazmalı ---
await page.fill('#teach-q', 'temettü nedir');
await page.fill('#teach-a', 'Düzeltilmiş cevap: temettü kâr payı demektir.');
await page.getByRole('button', { name: 'Öğret', exact: true }).click();
await page.waitForTimeout(300);
check('Aynı soru tekrar öğretilince tek kayıt kaldı (üzerine yazıldı)', await page.locator('.list-row', { hasText: 'temettü nedir' }).count() === 1);
await ask('temettü nedir');
check('Düzeltilmiş cevap kullanılıyor', (await page.locator('.msg-agent').last().textContent())?.includes('Düzeltilmiş cevap') ?? false);

// --- Öğretilen bilgi built-in kurallardan önce gelir (öncelik testi) ---
await page.fill('#teach-q', 'merhaba');
await page.fill('#teach-a', 'Selam! Bu özel bir öğretilmiş karşılama.');
await page.getByRole('button', { name: 'Öğret', exact: true }).click();
await page.waitForTimeout(300);
await ask('merhaba');
check('Öğretilen bilgi built-in "merhaba" kuralının önüne geçti', (await page.locator('.msg-agent').last().textContent())?.includes('özel bir öğretilmiş') ?? false);

// --- Silme ---
const rowCountBefore = await page.locator('.list-row', { hasText: 'temettü' }).count();
await page.locator('.list-row', { hasText: 'temettü nedir' }).locator('button[aria-label*="öğretisini sil"]').click();
await page.waitForTimeout(200);
check('Silme sonrası satır sayısı azaldı', await page.locator('.list-row', { hasText: 'temettü' }).count() < rowCountBefore);
await ask('temettü nedir');
check('Silinen bilgi artık fallback\'e düşüyor', (await page.locator('.msg-agent').last().textContent())?.includes('anlayamadım') ?? false);

// --- SIFIRLA öğretilen bilgileri de temizlemeli ---
await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(200);
page.once('dialog', d => d.accept());
await page.locator('text=SIFIRLA').click();
await page.waitForTimeout(300);
const trainingAfterReset = await page.evaluate(() => localStorage.getItem('fagent.agent.training.v1'));
check('SIFIRLA sonrası öğretilen bilgiler de temizlendi', trainingAfterReset === null);

await browser.close();
console.log(failed ? 'FAGENT_TEACH_E2E_FAILED' : 'FAGENT_TEACH_E2E_OK');
process.exit(failed ? 1 : 0);
