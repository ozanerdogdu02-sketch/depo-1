// Otomasyon hattından portföy aktarımı (`fagent-aktarim.json`).
//
// NEDEN: Kullanıcının harici otomasyon hattı gerçek portföyü tutabilir; Fagent'a elle girmek
// hem zahmetli hem hataya açıktı. Aktarım DOSYA ile yapılır — Fagent hiçbir ağ isteği yapmaz,
// "anahtarsız, veri tarayıcıdan çıkmaz" tezi bozulmaz.
//
// Doğrulanan davranışlar:
//   • Kart Panel'de görünüyor
//   • Geçerli dosya: onay istenir, onaylanınca portföy GERÇEKTEN değişir
//   • Onay reddedilirse HİÇBİR ŞEY değişmez
//   • Maliyeti bilinmeyen kalemler için uyarı gösterilir ("kazanç bilinmiyor", sıfır değil)
//   • Bayat veri uyarısı gösterilir
//   • Yanlış şema sürümü reddedilir ve MEVCUT VERİ BOZULMAZ
//   • Bozuk JSON reddedilir
//   • Tek bir geçersiz kalem tüm aktarımı reddettirir (ya hep ya hiç)
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);

// Kart BAŞLIĞINA göre seç — gövde metni başka kartlarla örtüşebilir (`hasText` alt-metin arar).
const kart = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Otomasyon Aktarımı' }) });

const dosya = (obj, ad = 'fagent-aktarim.json') => ({
  name: ad, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)),
});

const gecerli = {
  sema_surum: 1,
  uretim_zamani: '2026-08-29T10:00:00+03:00',
  kaynak: { veri_json_zamani: '2026-08-29 09:00:00', veri_yasi_saat: 1.0, bayat: false, bayat_esigi_saat: 48 },
  makro: { tufe_yillik: 31.75, tufe_donem: '2026-07' },
  portfoy: {
    onboarded: true,
    holdings: [
      { id: 'oto-citas-is', name: 'Citlekci Magazacilik', type: 'hisse', amount: 853.2, costBasis: 442.2 },
      { id: 'oto-tzl', name: 'Ziraat Para Piyasasi', type: 'fon', amount: 757, costBasis: 757 },
      { id: 'oto-nakit', name: 'Serbest nakit', type: 'mevduat', amount: 6157, costBasis: 6157 },
    ],
    txns: [
      { id: 'oto-islem-1', date: '2026-08-12', holdingId: 'oto-citas-is', holdingName: 'Citlekci Magazacilik', kind: 'alis', amount: 442.2, commission: 0 },
    ],
    realizedPnl: 0,
  },
  bilinmeyen_maliyet: ['TZL', 'NAKIT'],
  guncel_fiyati_olmayan: [],
};

/* ── 1) Kart var mı ─────────────────────────────────────────────────────────── */

check('Otomasyon Aktarımı kartı Panel\'de görünüyor', await kart.count() === 1);
const ilk = (await kart.textContent()) ?? '';
check('Dosya adı anlatılıyor', ilk.includes('fagent-aktarim.json'));
check('Fagent\'in internete çıkmadığı yazıyor', ilk.includes('internete çıkmaz'));

/* ── 2) Onay reddedilirse hiçbir şey değişmemeli ────────────────────────────── */

const oncekiPortfoy = await page.evaluate(() => localStorage.getItem('fagent.portfolio.v1'));

page.once('dialog', d => d.dismiss());
await kart.locator('input[type=file]').setInputFiles(dosya(gecerli));
await page.waitForTimeout(500);
check('İptal edildiği söyleniyor', ((await kart.textContent()) ?? '').includes('iptal edildi'));
check(
  'İptal sonrası portföy DEĞİŞMEDİ',
  (await page.evaluate(() => localStorage.getItem('fagent.portfolio.v1'))) === oncekiPortfoy,
);

/* ── 3) Bozuk / yanlış dosyalar reddedilmeli, veri bozulmamalı ──────────────── */

await kart.locator('input[type=file]').setInputFiles({
  name: 'bozuk.json', mimeType: 'application/json', buffer: Buffer.from('bu json bile degil {{{'),
});
await page.waitForTimeout(400);
check('Bozuk JSON reddedildi', ((await kart.textContent()) ?? '').includes('geçerli bir JSON değil'));

await kart.locator('input[type=file]').setInputFiles(dosya({ ...gecerli, sema_surum: 99 }));
await page.waitForTimeout(400);
check('Yanlış şema sürümü reddedildi', ((await kart.textContent()) ?? '').includes('şema sürümü'));

// Tek bir geçersiz kalem TÜM aktarımı reddettirmeli — yarım portföy, hiç portföyden tehlikelidir.
const bozukKalem = structuredClone(gecerli);
bozukKalem.portfoy.holdings[1].type = 'tahvil';
await kart.locator('input[type=file]').setInputFiles(dosya(bozukKalem));
await page.waitForTimeout(400);
check('Tanınmayan varlık türü reddedildi', ((await kart.textContent()) ?? '').includes('Tanınmayan varlık türü'));

const sayiDegil = structuredClone(gecerli);
sayiDegil.portfoy.holdings[0].amount = 'yüz';
await kart.locator('input[type=file]').setInputFiles(dosya(sayiDegil));
await page.waitForTimeout(400);
check('Sayı olmayan tutar reddedildi', ((await kart.textContent()) ?? '').includes('tutar sayı değil'));

check(
  'Reddedilen dosyaların HİÇBİRİ mevcut veriyi bozmadı',
  (await page.evaluate(() => localStorage.getItem('fagent.portfolio.v1'))) === oncekiPortfoy,
);

/* ── 4) Geçerli aktarım — portföy gerçekten değişmeli ───────────────────────── */

page.once('dialog', d => d.accept());
await kart.locator('input[type=file]').setInputFiles(dosya(gecerli));
await page.waitForTimeout(600);

const sonra = (await kart.textContent()) ?? '';
check('Kaç kalem okunduğu bildiriliyor', sonra.includes('3 kalem') && sonra.includes('1 işlem'));

const durum = await page.evaluate(() => JSON.parse(localStorage.getItem('fagent.portfolio.v1') ?? '{}'));
check('Portföy 3 kaleme indi (üzerine yazdı, eklemedi)', durum.holdings?.length === 3);
check('Kalem adı aktarıldı', durum.holdings?.some(h => h.name === 'Citlekci Magazacilik'));
check('Güncel değer aktarıldı', durum.holdings?.[0]?.amount === 853.2);
check('Maliyet aktarıldı', durum.holdings?.[0]?.costBasis === 442.2);
check('İşlem geçmişi aktarıldı', durum.txns?.length === 1);
check('onboarded true kaldı', durum.onboarded === true);

/* ── 5) Uyarılar — sayının neden öyle göründüğü söylenmeli ──────────────────── */

check('Maliyeti bilinmeyen kalemler uyarısı var', sonra.includes('Maliyeti bilinmeyen'));
// Metin BÜYÜK harfle yazılı: vurgu için markdown yıldızı kullanılamıyor (düz metin basılıyor).
check(
  'Uyarı "kazanç sıfır" ile "kazanç bilinmiyor" ayrımını yapıyor',
  sonra.includes('KAZANÇ BİLİNMİYOR') && sonra.includes('kazanç sıfır demek değildir'),
);
check('Hangi kalemler olduğu yazıyor', sonra.includes('TZL') && sonra.includes('NAKIT'));

/* ── 6) Bayat veri uyarısı ──────────────────────────────────────────────────── */

const bayat = structuredClone(gecerli);
bayat.kaynak.bayat = true;
bayat.kaynak.veri_yasi_saat = 72.5;
page.once('dialog', d => d.accept());
await kart.locator('input[type=file]').setInputFiles(dosya(bayat));
await page.waitForTimeout(600);
const bayatMetin = (await kart.textContent()) ?? '';
check('BAYAT VERİ uyarısı gösteriliyor', bayatMetin.includes('BAYAT VERİ'));
check('Kaç saat önce çekildiği yazıyor', bayatMetin.includes('72.5'));
check('Ne yapılacağı söyleniyor', bayatMetin.includes('yeniden üret'));

/* ── 7) ÖRNEK veri açıkça uyarmalı ──────────────────────────────────────────── */

const ornekDosya = structuredClone(gecerli);
ornekDosya.ornek = true;
page.once('dialog', d => { globalThis.__diyalog = d.message(); d.accept(); });
await kart.locator('input[type=file]').setInputFiles(dosya(ornekDosya));
await page.waitForTimeout(600);
const ornekMetin = (await kart.textContent()) ?? '';
check('ÖRNEK VERİ uyarısı gösteriliyor', ornekMetin.includes('ÖRNEK VERİ'));
check('Sayıların gerçek olmadığı söyleniyor', ornekMetin.includes('gerçek pozisyonunu göstermez'));
check('Mesajda da ÖRNEK ibaresi var', ornekMetin.includes('ÖRNEK veri —'));
check('Onay kutusunda sahte veri uyarısı vardı', String(globalThis.__diyalog ?? '').includes('SAHTE'));

// Markdown sızmamalı — mesajlar düz metin basılıyor, yıldızlar ekranda görünürdü.
check('Uyarı metinlerinde markdown yıldızı yok', !ornekMetin.includes('**'));

/* ── 8) Panel gerçekten aktarılan veriyi gösteriyor ─────────────────────────── */

const panelMetin = (await page.locator('.dash, main').first().textContent()) ?? '';
check('Aktarılan varlık Panel\'de görünüyor', panelMetin.includes('Serbest nakit'));

await browser.close();
console.log(failed ? '\nBAŞARISIZ' : '\nTümü geçti');
process.exit(failed ? 1 : 0);
