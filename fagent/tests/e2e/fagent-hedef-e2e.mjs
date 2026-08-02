// Hedef dağılım + %5/%25 sapma bandı.
//
// Sektör standardı bir denge ölçüsü ("5/25 kuralı", Larry Swedroe): bir varlık sınıfı
// hedefinden 5 PUANDAN fazla (mutlak) VEYA hedefinin %25'inden fazla (göreli) saparsa denge
// bozulmuş sayılır — hangisi önce tetiklerse. Bant = min(5, hedef × 0,25).
//
// Doğrulanan davranışlar:
//   • Hedef girilmemişken kart "hedef gir" durumunda, ajan da yönlendiriyor ve hedef ÖNERMİYOR
//   • Bandın İKİ UCU da ayrı ayrı tetikleniyor:
//       – büyük hedefte MUTLAK 5 puan bağlıyor (fon: hedef %40 → bant 5,0)
//       – küçük hedefte GÖRELİ %25 bağlıyor (döviz: hedef %8 → bant 2,0; mutlak kural sussa da tetikler)
//   • Bandın TAM SINIRINDA sapma sayılmıyor (kesin eşitsizlik: |sapma| > bant)
//   • Hedef toplamı %100 değilken uyarılıyor ama hesap yine yapılıyor ve sayılar düzeltilmiyor
//   • Karttaki sayı ile ajanın söylediği sayı AYNI (ajan her turda taze okuyor)
//   • Hedef girilince proaktif içgörüde sapma satırı beliriyor
//   • Hedefler sayfa yenilendikten sonra kalıcı
//   • SIFIRLA hedefleri de temizliyor (beşinci kalıcı katman)
//
// Karma örnek portföy — toplam ₺143.700:
//   BIST 30 Fonu (fon)    48.500 → %33,7508
//   Vadeli Mevduat        31.200 → %21,7118
//   THYAO (hisse)         25.200 → %17,5365
//   Gram Altın (altin)    23.800 → %16,5623
//   USD (doviz)           15.000 → %10,4384
//
// Girilecek hedefler (toplam %100): fon 40 · mevduat 18 · hisse 18 · altın 16 · döviz 8
//   fon:     bant min(5, 10)   = 5,0  · sapma −6,2  → BANT DIŞI (mutlak uç bağlıyor)
//   döviz:   bant min(5, 2)    = 2,0  · sapma +2,4  → BANT DIŞI (göreli uç bağlıyor; 5 puan sussa da)
//   mevduat: bant min(5, 4,5)  = 4,5  · sapma +3,7  → içeride
//   hisse:   bant min(5, 4,5)  = 4,5  · sapma −0,5  → içeride
//   altın:   bant min(5, 4)    = 4,0  · sapma +0,6  → içeride
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);

const hedefCard = page.locator('.card').filter({ hasText: 'Hedef Dağılım' });
const insightCard = page.locator('.card').filter({ hasText: 'Proaktif İçgörüler' });

const ask = async (text) => {
  await page.fill('input[aria-label="Ajana soru sor"]', text);
  await page.getByRole('button', { name: 'Gönder' }).click();
  await page.waitForTimeout(350);
  return (await page.locator('.msg-agent').last().textContent()) ?? '';
};

/* ── 1) Hedef girilmemiş durum ──────────────────────────────────────────────── */

check('Hedef Dağılım kartı Panel\'de görünüyor', await hedefCard.count() === 1);
const bosMetin = (await hedefCard.textContent()) ?? '';
check('Boş durumda giriş düğmesi var', bosMetin.includes('Hedef dağılımını gir'));
check('Boş durumda hedef ÖNERİLMEDİĞİ söyleniyor', bosMetin.includes('Sana bir hedef önermiyorum'));
check('Boş durumda henüz sapma satırı yok', !bosMetin.includes('puan'));

check(
  'Hedef girilmemişken proaktif içgörüde sapma uyarısı YOK',
  !((await insightCard.textContent()) ?? '').includes('bandının dışında'),
);

await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);
const ajanBos = await ask('hedef dağılımım nasıl');
check('Ajan hedef girilmediğini söylüyor', ajanBos.includes('Henüz bir hedef dağılım girmemişsin'));
check('Ajan Panel\'deki karta yönlendiriyor', ajanBos.includes('Hedef Dağılım'));
check('Ajan da hedef ÖNERMEDİĞİNİ belirtiyor', ajanBos.includes('ÖNERMİYORUM') || ajanBos.includes('önermiyorum'));

/* ── 2) Hedefleri gir (toplam %100) ──────────────────────────────────────────── */

await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(300);
await hedefCard.getByRole('button', { name: 'Hedef dağılımını gir' }).click();
await page.waitForTimeout(200);

for (const [id, val] of [['fon', '40'], ['mevduat', '18'], ['hisse', '18'], ['altin', '16'], ['doviz', '8']]) {
  await page.fill(`#target-${id}`, val);
  await page.waitForTimeout(80);
}
await page.waitForTimeout(250);

const dolu = (await hedefCard.textContent()) ?? '';
check('İki sınıfın bant dışında olduğu bildiriliyor', dolu.includes('2 sınıf kendi belirlediğin bandın dışında'));

// MUTLAK uç: hedef %40 → bant 5,0 puan (göreli %25 olsaydı 10 puan olurdu ve tetiklemezdi)
check(
  'fon satırı: hedef %40 · güncel %33,8 · −6,2 puan · bant 5,0 (mutlak uç bağlıyor)',
  dolu.includes('hedef %40 · güncel %33,8') && dolu.includes('−6,2 puan') && dolu.includes('(bant 5,0)'),
);
// GÖRELİ uç: hedef %8 → bant 2,0 puan. Sapma 2,4 puan; mutlak 5 puanlık kural SUSARDI.
check(
  'döviz satırı: hedef %8 · güncel %10,4 · +2,4 puan · bant 2,0 (göreli uç bağlıyor)',
  dolu.includes('hedef %8 · güncel %10,4') && dolu.includes('+2,4 puan') && dolu.includes('(bant 2,0)'),
);
check('mevduat bandı hedefin dörtte biri (4,5) olarak hesaplandı', dolu.includes('(bant 4,5)'));
check('altın bandı 4,0 olarak hesaplandı', dolu.includes('(bant 4,0)'));
check('%5/%25 kuralı kartta açıklanıyor', dolu.includes('min(5 puan, hedefin dörtte biri)'));
check('Kart yatırım tavsiyesi olmadığını yazıyor', dolu.includes('yatırım tavsiyesi değildir'));
check('Toplam %100 iken uyarı YOK', !dolu.includes('%100 değil'));

const insightMetin = (await insightCard.textContent()) ?? '';
check('Proaktif içgörüde sapma satırı belirdi', insightMetin.includes('2 sınıf kendi belirlediğin hedef bandının dışında'));
check('İçgörü en büyük sapmayı (fon) veriyor', insightMetin.includes('Fon') && insightMetin.includes('6,2 puan'));
// Yalnızca sapma cümlesini ölç, tüm kartı değil. (İlk sürümde `al\b` deseni kullanılmıştı ve
// başka bir içgörüdeki "alım gücü" ifadesine takılıyordu: Türkçe 'ı' JS'in \w sınıfında
// olmadığı için \b orada sınır sayıyor. Türkçe metinde \b'ye güvenme.)
const driftInsight = (await insightCard.locator('span').filter({ hasText: 'hedef bandının dışında' }).first().textContent()) ?? '';
check(
  'İçgörü betimleyici kipte — emir yok',
  driftInsight.length > 0 && !/dengele|azalt|artır|kaydır|değerlendir|malısın|melisin/i.test(driftInsight),
);

if (out) await page.screenshot({ path: `${out}/hedef-dagilim.png` });

/* ── 3) Ajan aynı sayıları söylüyor mu (taze okuma) ──────────────────────────── */

await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);
const ajanDolu = await ask('hedef dağılımım nasıl');
check('Ajan da 2 sınıf sapma sayıyor', ajanDolu.includes('2 sınıf bandının dışında'));
check('Ajan fon için aynı sayıları veriyor', ajanDolu.includes('hedef %40, güncel %33,8') && ajanDolu.includes('6,2 puan altında'));
check('Ajan döviz için aynı sayıları veriyor', ajanDolu.includes('hedef %8, güncel %10,4') && ajanDolu.includes('2,4 puan üzerinde'));
check('Ajan bant değerlerini de veriyor', ajanDolu.includes('bant 5,0 puan') && ajanDolu.includes('bant 2,0 puan'));
check('Ajan hedefe eşitleme farkını TL olarak veriyor', /₺/.test(ajanDolu) && ajanDolu.includes('eksik'));
check('Ajan bandın içinde kalanları da sayıyor', ajanDolu.includes('Bandın içinde kalanlar'));
check('Ajan %5/%25 kuralını açıklıyor', ajanDolu.includes('min(5 puan, hedefin dörtte biri)'));
check('Ajan yatırım tavsiyesi sınırını yazıyor', ajanDolu.includes('yatırım tavsiyesi değil'));
check('Ajan yanıtında markdown yıldızı yok', !ajanDolu.includes('**'));

/* ── 4) Hedef toplamı %100 değilken ──────────────────────────────────────────── */

await page.locator('.side-link', { hasText: 'PANEL' }).click();
await page.waitForTimeout(300);
await hedefCard.getByRole('button', { name: 'Hedefleri düzenle' }).click();
await page.waitForTimeout(200);
await page.fill('#target-mevduat', '10');
await page.waitForTimeout(250);

const eksikToplam = (await hedefCard.textContent()) ?? '';
check('Toplam %92 olduğunda kart uyarıyor', eksikToplam.includes('Hedef toplamın %92,0 — %100 değil'));
check('Düzenleme panelinde toplam gösteriliyor', eksikToplam.includes('Toplam: %92,0'));
check('Toplam bozukken hesap yine yapılıyor', eksikToplam.includes('(bant 5,0)'));

await page.locator('.side-link', { hasText: 'AJAN' }).click();
await page.waitForTimeout(300);
const ajanEksik = await ask('hedefimden ne kadar saptım');
check('Ajan da toplamın %100 olmadığını söylüyor', ajanEksik.includes('toplamı %92,0'));
check('Ajan sayıları kendiliğinden düzeltmediğini belirtiyor', ajanEksik.includes('kendiliğinden düzeltmedim'));

/* ── 5) Kalıcılık — sayfa yenilendikten sonra ───────────────────────────────── */

const persisted = await page.evaluate(() => localStorage.getItem('fagent.target.v1'));
check('Hedefler localStorage\'a yazıldı', persisted !== null && JSON.parse(persisted).fon === 40);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const sonraki = (await hedefCard.textContent()) ?? '';
check('Yenilemeden sonra hedefler duruyor', sonraki.includes('hedef %40 · güncel %33,8'));

/* ── 6) SIFIRLA hedefleri de temizliyor ─────────────────────────────────────── */

page.once('dialog', d => d.accept());
await page.locator('.side-reset').click();
await page.waitForTimeout(400);
const afterReset = await page.evaluate(() => localStorage.getItem('fagent.target.v1'));
check('SIFIRLA hedef dağılımı da sildi', afterReset === null);

/* ── 7) Bandın TAM SINIRI — kesin eşitsizlik (|sapma| > bant) ───────────────── */
//
// Kurgu portföy: hisse ₺25.000 + fon ₺75.000 = ₺100.000 → %25 / %75 (tam sayılar).
//   hisse: hedef %20 → bant min(5, 5,0) = 5,0 · sapma tam +5,0 → SAYILMAMALI
//   fon:   hedef %80 → bant min(5, 20)  = 5,0 · sapma tam −5,0 → SAYILMAMALI
// Karşılaştırma `>=` olsaydı ikisi de bant dışı sayılırdı; bu kontrol onu yakalar.

await page.evaluate(() => {
  localStorage.setItem('fagent.portfolio.v1', JSON.stringify({
    onboarded: true, realizedPnl: 0, txns: [],
    holdings: [
      { id: 'b1', name: 'Sınır Hisse', type: 'hisse', amount: 25000, costBasis: 25000 },
      { id: 'b2', name: 'Sınır Fon', type: 'fon', amount: 75000, costBasis: 75000 },
    ],
  }));
  localStorage.setItem('fagent.target.v1', JSON.stringify({
    hisse: 20, fon: 80, doviz: 0, altin: 0, kripto: 0, mevduat: 0,
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const sinir = (await hedefCard.textContent()) ?? '';
check('Tam sınırda sapma SAYILMIYOR (kesin eşitsizlik)', sinir.includes('Bütün sınıflar bandının içinde'));
check('Sınır satırı yine de sapmayı gösteriyor (hisse +5,0 / bant 5,0)', sinir.includes('+5,0 puan') && sinir.includes('(bant 5,0)'));
check(
  'Tam sınırda proaktif içgörüde uyarı çıkmıyor',
  !((await insightCard.textContent()) ?? '').includes('bandının dışında'),
);

// Sınırın bir tık ötesi: hedef %19 → bant 4,75 · sapma +6,0 → BANT DIŞI olmalı
await hedefCard.getByRole('button', { name: 'Hedefleri düzenle' }).click();
await page.waitForTimeout(200);
await page.fill('#target-hisse', '19');
await page.waitForTimeout(250);
const otesi = (await hedefCard.textContent()) ?? '';
check('Sınırın ötesinde sapma sayılıyor', otesi.includes('1 sınıf kendi belirlediğin bandın dışında'));
check('Bant hedefin dörtte biri olarak daraldı (4,8)', otesi.includes('(bant 4,8)'));

await browser.close();
console.log(failed ? '\nBAŞARISIZ' : '\nTAMAM');
process.exit(failed ? 1 : 0);
