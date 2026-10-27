import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS || '/tmp';
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

// --- Küçük sohbet ---
await ask('merhaba');
check('Selamlaşma cevabı geldi', (await page.locator('.msg-agent').last().textContent())?.includes('Merhaba') ?? false);

await ask('yardım');
check('Yardım listesi geldi (grafik yeteneği dahil)', (await page.locator('.msg-agent').last().textContent())?.includes('grafik çizerim') ?? false);

// --- Varlık bazlı sorgu ---
await ask('THYAO nasıl gidiyor');
const thyaoReply = await page.locator('.msg-agent').last().textContent();
check('THYAO sorgusu doğru varlığı buldu', thyaoReply?.includes('THYAO') ?? false);
check('THYAO yanıtı maliyet/değer içeriyor', (thyaoReply?.includes('maliyet') ?? false));

// --- En iyi/en kötü kıyaslama ---
await ask('en çok kaybettiren varlığım ne');
check('En kötü performans sorgusu yanıtlandı', (await page.locator('.msg-agent').last().textContent())?.includes('geride kalan') ?? false);

// --- Grafik çizme: dağılım ---
await ask('dağılımımı çiz');
await page.waitForTimeout(300);
check('Dağılım grafiği istek metni geldi', (await page.locator('.msg-agent').last().textContent())?.includes('Sınıf Dağılımı') ?? false);
check('Pasta grafik DOM\'a çizildi (sohbet içinde)', await page.locator('.msg-agent').last().locator('.recharts-pie').count() > 0);
const sohbetSira = await page.locator('.msg-agent').last().locator('.pie-sira').allTextContents();
const sohbetLejant = await page.locator('.msg-agent').last().locator('.pie-lejant > div').allTextContents();
check('Sohbet pastasında sıra numaraları ve aynı sayıda numaralı lejant satırı var',
  sohbetSira.length > 0 && sohbetSira.length === sohbetLejant.length && sohbetLejant.every((t, i) => t.trim().startsWith(`${i + 1} · `)));
await page.screenshot({ path: `${out}/a1-ajan-pasta-grafik.png` });

// --- Grafik çizme: yatırım geçmişi ---
await ask('yatırım grafiğimi göster');
await page.waitForTimeout(300);
check('Yatırım geçmişi grafiği metni geldi', (await page.locator('.msg-agent').last().textContent())?.includes('Net Yatırım') ?? false);
check('Alan grafiği DOM\'a çizildi', await page.locator('.msg-agent').last().locator('.recharts-area').count() > 0);

// --- Grafik çizme: kâr/zarar bar ---
await ask('kâr zarar grafiğimi çiz');
await page.waitForTimeout(300);
check('Kâr/zarar bar grafiği metni geldi', (await page.locator('.msg-agent').last().textContent())?.includes('Kâr/Zarar') ?? false);
check('Bar grafiği DOM\'a çizildi', await page.locator('.msg-agent').last().locator('.recharts-bar').count() > 0);
await page.screenshot({ path: `${out}/a2-ajan-bar-grafik.png` });

// --- Bağlam hafızası: takip cümlesi son konuyu genişletmeli ---
await ask('analiz et');
const analizMsgCountBefore = await page.locator('.msg-agent').count();
await ask('devam et');
const followupReply = await page.locator('.msg-agent').last().textContent();
check('Takip cümlesi analiz konusunu genişletti (rastgele "yanıtlayamam" değil)', !(followupReply?.includes('yanıtlayamam') ?? true));
check('Takip cümlesi sonrası yeni mesaj eklendi', await page.locator('.msg-agent').count() > analizMsgCountBefore);

// --- Anlaşılmayan girdi için fallback ---
await ask('asdkjalksjd rastgele metin 12345');
check('Anlamsız girdi için fallback mesajı geldi', (await page.locator('.msg-agent').last().textContent())?.includes('yanıtlayamam') ?? false);

// --- Analiz Et butonu hâlâ çalışıyor mu (regresyon) ---
await page.getByRole('button', { name: 'Analiz Et' }).click();
await page.waitForTimeout(300);
check('Analiz Et butonu hâlâ mesaj üretiyor', (await page.locator('.msg-agent').last().textContent())?.includes('Not: Bu analiz') ?? false);

// --- Ajan ürünün KENDİ özelliklerini biliyor mu (yedek/geri yükleme) ---
// Regresyon: "portföyümü aklında tut, sonra geri döneyim" gibi doğal bir istek fallback'e düşüyordu.
await ask('şuanki portföyümü aklında tut birazdan işlemleri silicem geri dönmek istiyorum');
const yedek1 = await page.locator('.msg-agent').last().textContent();
check('Yedekleme isteği fallback\'e DÜŞMÜYOR', !(yedek1 ?? '').includes('yanıtlayamam'));
check('Cevap CSV yedeğini anlatıyor', (yedek1 ?? '').includes('CSV'));
check('Cevap "İçe Aktar" ile geri yüklemeyi anlatıyor', (yedek1 ?? '').includes('İçe Aktar'));

await ask('nasıl yedek alırım');
check('"nasıl yedek alırım" da aynı cevabı veriyor', ((await page.locator('.msg-agent').last().textContent()) ?? '').includes('CSV'));

// --- Dış AI bağlantısı yok (adım 3) ---
check('Ajan sekmesinde "Gerçek AI" kartı yok', (await page.locator('text=/Gerçek AI|Worker adresi/i').count()) === 0);
const disIstek = [];
page.on('request', r => { try { if (new URL(r.url()).origin !== 'http://localhost:4200') disIstek.push(r.url()); } catch { /* data: vb. */ } });
await ask('kaç lot almalıyım');
await ask('bugün hava nasıl olacak');
const sonCevap = (await page.locator('.msg-agent').last().textContent()) ?? '';
check('Anlaşılmayan soru sabit yanıta düşüyor', sonCevap.includes('yanıtlayamam'));
check('Sohbet sırasında uygulama dışına istek gitmedi', disIstek.length === 0);
const anahtarlar = await page.evaluate(() => Object.keys(localStorage));
check('fagent.ai.proxyurl.v1 anahtarı yok', !anahtarlar.includes('fagent.ai.proxyurl.v1'));
await page.evaluate(() => localStorage.setItem('fagent.ai.proxyurl.v1', 'https://eski.example/x'));
await page.reload({ waitUntil: 'networkidle' });
check('Eski AI adresi ilk açılışta silindi', await page.evaluate(() => localStorage.getItem('fagent.ai.proxyurl.v1')) === null);

await browser.close();
console.log(failed ? 'FAGENT_AGENT_E2E_FAILED' : 'FAGENT_AGENT_E2E_OK');
process.exit(failed ? 1 : 0);
