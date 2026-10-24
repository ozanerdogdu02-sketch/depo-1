// Ajan komut ayrıştırma düzeltmeleri (2026-08-04 canlı test raporu):
//   P0 — "BIST 30 Fonu 1000 TL al" ₺30 diye ayrıştırılıyordu (ad içindeki rakam tutar sanılıyordu)
//   P1 — "vazgeç" yazıyla bekleyen işlemi iptal etmiyordu
//   P1 — al/sat tavsiyesi soruları "anlayamadım"a düşüyordu (regülasyon riski)
//   P1 — fallback cevabı ajanı olduğundan yeteneksiz gösteriyordu
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
const lastAgent = () => page.locator('.msg-agent').last();
const lastText = async () => (await lastAgent().textContent()) ?? '';

// ── P0: adında rakam geçen varlıkta tutar ayrıştırma ─────────────────────────────
// Örnek veride "BIST 30 Fonu" var. Ad içindeki 30, tutar olarak alınmamalı.
await ask('BIST 30 Fonu 1000 TL al');
const t1 = await lastText();
check('P0: adında rakam olan varlıkta doğru tutar (₺1.000) ayrıştırıldı', t1.includes('₺1.000'));
check('P0: ad içindeki 30 tutar olarak alınmadı', !t1.includes('₺30 '));
check('P0: doğru varlık seçildi', t1.includes('BIST 30 Fonu'));
check('P0: onay akışı açıldı', await lastAgent().getByRole('button', { name: 'Deftere ekle' }).count() === 1);

// ── P1: yazıyla iptal ────────────────────────────────────────────────────────────
// DİKKAT: lastAgent() dinamik bir seçici — "vazgeç" yazdıktan sonra iptal mesajını gösterir.
// Öneri mesajına SABİT indeksle tutunulmalı (bkz. fagent-action-e2e.mjs aynı deseni kullanıyor).
const pendingIndex = (await page.locator('.msg-agent').count()) - 1;
const pendingMsg = page.locator('.msg-agent').nth(pendingIndex);
await ask('vazgeç');
check('P1: "vazgeç" iptal cevabı döndürdü', (await lastText()).includes('Kayıt eklenmedi'));
check('P1: iptal cevabı veri değişmediğini söylüyor', (await lastText()).includes('defterin değişmedi'));
check('P1: bekleyen öneri "Vazgeçildi" durumuna geçti',
  await pendingMsg.getByRole('button', { name: 'Vazgeçildi' }).count() === 1);
check('P1: iptal sonrası Deftere ekle devre dışı',
  await pendingMsg.getByRole('button', { name: 'Deftere ekle' }).isDisabled());

// İşlem gerçekten uygulanmamış olmalı — İşlemler sekmesinde BIST 30 Fonu alışı olmamalı.
await page.locator('.side-link', { hasText: 'İŞLEMLER' }).click();
await page.waitForTimeout(300);
const islemlerText = (await page.locator('.card').first().textContent()) ?? '';
check('P1: iptal edilen alış işlem geçmişine YAZILMADI', !islemlerText.includes('₺1.000'));
await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);

// Bekleyen işlem YOKKEN "vazgeç" yazmak iptal cevabı vermemeli (normal akışa düşmeli).
await ask('vazgeç');
check('P1: bekleyen işlem yokken "vazgeç" iptal cevabı vermiyor', !(await lastText()).includes('Kayıt eklenmedi'));

// "satışı iptal et" varyantı da çalışmalı — ve yanlışlıkla yeni satış komutu sanılmamalı.
await ask('THYAO\'dan 500 TL sat');
check('P1: yeni öneri açıldı', await lastAgent().getByRole('button', { name: 'Deftere ekle' }).count() === 1);
await ask('satışı iptal et');
check('P1: "satışı iptal et" iptal etti', (await lastText()).includes('Kayıt eklenmedi'));
check('P1: "satışı iptal et" yeni bir öneri AÇMADI',
  await lastAgent().getByRole('button', { name: 'Deftere ekle' }).count() === 0);

// ── P1: regülasyon cevabı ────────────────────────────────────────────────────────
// ── K3: 9 tavsiye cümlesi × küçük/BÜYÜK/İ-I varyantları → ret; kayıt komutları reddedilmez ──────────
const TAVSIYE9 = ['hangisi daha iyi', 'şimdi girmeli miyim', 'kaç lot almalıyım', 'stop koymalı mıyım', 'altın alayım mı',
  'hisse satayım mı', 'THYAO almalı mıyım', 'portföyümü dengele', 'bu hisse alınır mı'];
const YASAK = /öneri|uygula|işlendi|emir|malısın|melisin/i;
for (const q of TAVSIYE9) {
  for (const v of [q, q.toLocaleUpperCase('tr-TR'), q.toUpperCase()]) {
    await ask(v);
    const t = await lastText();
    check(`Tavsiye reddi: "${v}"`, t.includes('tavsiye veremem') && t.includes('SPK'));
    check(`Tavsiye reddinde Deftere ekle düğmesi yok: "${v}"`, await lastAgent().getByRole('button', { name: 'Deftere ekle' }).count() === 0);
    check(`Ret metni yasaklı kelime içermiyor: "${v}"`, !YASAK.test(t.replace('aracı kurumuna emir gönderilmedi', '')));
  }
}
for (const q of ["THYAO'dan 500 TL sat", 'THYAO 1000 TL al']) {
  await ask(q);
  check(`Kayıt komutu reddedilmiyor: "${q}"`, !(await lastText()).includes('tavsiye veremem'));
}
for (const q of ['dağılımım nasıl', 'hedeften sapmam ne', 'THYAO nasıl gidiyor']) {
  await ask(q);
  check(`Betimleyici soru reddedilmiyor: "${q}"`, !(await lastText()).includes('tavsiye veremem'));
}

for (const q of ['hangi hisseyi almalıyım', 'bana yatırım tavsiyesi ver', 'portföyümü optimize et']) {
  await ask(q);
  const t = await lastText();
  check(`Reg: "${q}" fallback'e DÜŞMÜYOR`, !t.includes('yanıtlayamam'));
  // "tavsiyesi veremem" — iyelik eki nedeniyle esnek desen (Türkçe ek tuzağı, bkz. CLAUDE.md §1.5)
  check(`Reg: "${q}" tavsiye veremediğini açıkça söylüyor`, /tavsiye(si)? veremem/i.test(t));
  check(`Reg: "${q}" SPK gerekçesini veriyor`, t.includes('SPK'));
  check(`Reg: "${q}" alternatif yönlendirme sunuyor`, t.includes('analiz et'));
}

// Hedef dağılım kuralı tavsiye kuralına KAPILMAMALI (sıralama çakışması kontrolü).
await ask('hedef dağılımım nasıl');
check('Sıralama: "hedef dağılımım nasıl" hâlâ hedef kuralına gidiyor',
  !/tavsiye veremem/i.test(await lastText()));

// ── P1: fallback kalitesi ────────────────────────────────────────────────────────
await ask('xyzqwe anlamsız komut');
const fb = await lastText();
check('Fallback: hâlâ anlamadığını söylüyor', fb.includes('yanıtlayamam'));
check('Fallback: somut örnek veriyor (reel getiri)', fb.includes('reel getirim ne'));
check('Fallback: somut örnek veriyor (vergi)', fb.includes('vergiden sonra ne kalıyor'));
check('Fallback: kullanıcının kendi varlığından örnek veriyor', /nasıl gidiyor/.test(fb));
check('Fallback: yardım yönlendirmesi duruyor', fb.includes('yardım'));

// ── Gerileme kontrolü: rakamsız varlıkta eski davranış korunuyor ────────────────
await ask('THYAO 750 TL sat');
check('Gerileme: rakamsız varlıkta tutar hâlâ doğru', (await lastText()).includes('₺750'));

await browser.close();
console.log(failed ? 'FAGENT_PARSER_E2E_FAILED' : 'FAGENT_PARSER_E2E_OK');
process.exit(failed ? 1 : 0);
