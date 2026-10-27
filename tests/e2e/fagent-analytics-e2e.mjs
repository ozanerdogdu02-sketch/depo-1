// İleri finansal matematik + grafik yorumlama.
// Ajan artık grafiği çizip susmuyor; HHI konsantrasyonu, XIRR (para-ağırlıklı yıllık getiri),
// Fisher reel getirisi ve katkı paylarıyla GERÇEK SAYILAR üzerinden okuyor.
// Ayrıca hesaplanamayanları (volatilite/Sharpe/beta — fiyat serisi yok) dürüstçe reddediyor.
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
  await page.waitForTimeout(350);
  return (await page.locator('.msg-agent').last().textContent()) ?? '';
};

// --- Dağılım grafiği artık YORUMLANIYOR ---
const dag = await ask('dağılımımı çiz');
check('Dağılım grafiği çizildi', await page.locator('.recharts-wrapper').count() > 0);
check('Grafik yorumlanıyor ("Grafiği okuyalım")', dag.includes('Grafiği okuyalım'));
check('HHI (Herfindahl) hesaplanıp veriliyor', /HHI = 0[.,]\d{3}/.test(dag));
check('Etkin varlık sayısı açıklanıyor', dag.includes('etkin') && /\d[.,]\d\s*varlığa/.test(dag));
check('En büyük pozisyonun ağırlığı yüzdeyle veriliyor', /%\d+[.,]\d/.test(dag));
await page.screenshot({ path: `${out}/an1-dagilim-yorum.png` });

// --- Kâr/zarar grafiği yorumu: katkı payları ---
const pnl = await ask('kâr zarar grafiği çiz');
check('K/Z grafiği yorumlanıyor', pnl.includes('Grafiği okuyalım'));
check('Net kâr/zarar veriliyor', /net kâr\/zararın/i.test(pnl));
check('En büyük katkı payı yüzdeyle veriliyor', /toplam hareketin %\d+/.test(pnl));

// --- Net yatırım grafiği yorumu: tempo + katkı ayrıştırma ---
const yat = await ask('yatırım geçmişi grafiğimi çiz');
check('Yatırım grafiği yorumlanıyor', yat.includes('Grafiği okuyalım'));
check('Yatırım süresi/temposu veriliyor', /gündür/.test(yat));
check('Katkı vs getiri ayrıştırması yapılıyor', /getiridir|kazançtan|kayıptan/.test(yat));

// --- Reel getiri: Fisher denklemi, gerçek hesap (Bloki bunu kullanıcıya bırakıyordu) ---
const reel = await ask('reel getirim ne');
check('Reel getiri HESAPLANIYOR (formül anlatıp bırakmıyor)', /REEL getirin -?%\d/.test(reel));
check('Yüzde yazımı tek kural: "%-" biçimi yok (negatifte -%22,7)', !reel.includes('%-'));
check('Fisher denklemi açıkça belirtiliyor', reel.includes('Fisher'));
check('Naif "nominal eksi enflasyon" kestirmesiyle farkı gösteriliyor', reel.includes('kestirme'));

// Kullanıcının verdiği enflasyon oranı kullanılıyor mu
const reel55 = await ask('%55 enflasyona göre reel getirim ne');
check('Metindeki %55 enflasyon oranı dikkate alınıyor', reel55.includes('%55 enflasyon'));

// --- Çeşitlenme sorusu ---
const ces = await ask('ne kadar çeşitlenmişim');
check('Çeşitlenme HHI ile cevaplanıyor', ces.includes('HHI'));
check('Etkin varlık sayısı veriliyor', ces.includes('etkin olarak'));
check('HHI yanıtları hüküm/tavsiye dili içermiyor (gerekir|malısın|öneri|sayılır)', !/gerekir|malısın|melisin|öneri|sayılır|kesin|tavsiye(?! değildir| veremem)/i.test(dag) && !/gerekir|malısın|melisin|öneri|sayılır|kesin|tavsiye(?! değildir| veremem)/i.test(ces));
check('HHI eşikleri "gösterim aralığı; resmî standart değil" diye etiketli', /gösterim aralığı/.test(dag) && /resmî bir standart değildir/.test(dag) && /gösterim aralığı/.test(ces));

// --- Risk metrikleri: artık HESAPLANIYOR (gerçek tarihsel fiyattan), ama kapsam dürüstçe belirtiliyor ---
// Not: bu davranış bilinçli olarak değişti — önceden ajan "hesaplayamıyorum" diyordu. CoinGecko
// /market_chart ve Frankfurter zaman serisi anahtarsız erişilebilir olduğu için artık hesaplıyoruz.
const vol = await ask('volatilitem ne kadar');
check('Volatilite sorusu Risk Analizi kartına yönlendiriyor', vol.includes('Risk Analizi'));
check('Gerçek veri kaynakları belirtiliyor (CoinGecko / ECB)', vol.includes('CoinGecko') && vol.includes('ECB'));
check('Geçmiş fiyat serisi gerektiği açıklanıyor', /GEÇMİŞ FİYAT SERİSİ|fiyat serisi/i.test(vol));
check('Volatilite cevabı fallback DEĞİL', !vol.includes('yanıtlayamam'));

// Karma örnek portföyde canlı fiyata bağlı varlık YOK — ajan bunu dürüstçe söylemeli.
check('Kapsanamayan varlıklar için dürüst uyarı veriyor', /kapsanabilen|kapsayamıyorum|YOK/i.test(vol));
check('BIST/TEFAS/altın sınırını açıklıyor', /BIST|TEFAS|altın/.test(vol));

const sharpe = await ask('sharpe oranım kaç');
check('Sharpe da aynı akışa yönlendiriliyor', sharpe.includes('Risk Analizi'));

await page.screenshot({ path: `${out}/an2-durust-sinir.png` });

// --- HHI yorumunun 3 dalı ayrı küçük portföylerle (agent.ts readAllocationChart) ---
// Yasak kalıp listesi .claude/skills/uyum-dili/SKILL.md ile aynı: tavsiye yalnızca "tavsiye değildir/veremem".
const YASAK_KALIP = /gerekir|malısın|melisin|öneri|sayılır|kesin|tavsiye(?! değildir| veremem)/i;
const hhiDallari = [
  { ad: 'yoğun', agirliklar: [100], beklenen: '"yoğun" bölgede' },
  { ad: 'orta', agirliklar: [30, 25, 20, 15, 10], beklenen: '"orta" bölgede' },   // HHI 0,225
  { ad: 'dağıtık', agirliklar: Array(8).fill(12.5), beklenen: '"dağıtık" bölgede' }, // HHI 0,125
];
for (const d of hhiDallari) {
  await page.evaluate(ag => {
    localStorage.setItem('fagent.portfolio.v1', JSON.stringify({
      onboarded: true, realizedPnl: 0, txns: [],
      holdings: ag.map((w, i) => ({ id: `hhi${i}`, name: `HHI Varlık ${i + 1}`, type: i % 2 ? 'fon' : 'hisse', amount: w * 1000, costBasis: w * 1000 })),
    }));
  }, d.agirliklar);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.locator('.side-link', { hasText: 'AJAN' }).click();
  await page.waitForTimeout(300);
  const yanit = await ask('dağılımımı çiz');
  check(`HHI ${d.ad} dalı: ${d.beklenen} yorumu çıkıyor`, yanit.includes(d.beklenen));
  check(`HHI ${d.ad} dalı: diğer iki dal çıkmıyor`, hhiDallari.filter(x => x !== d).every(x => !yanit.includes(x.beklenen)));
  check(`HHI ${d.ad} dalı: tavsiye/kesinlik dili yok`, !YASAK_KALIP.test(yanit));
  check(`HHI ${d.ad} dalı: "resmî bir standart değildir" notu var`, yanit.includes('resmî bir standart değildir'));
}

await browser.close();
console.log(failed ? 'FAGENT_ANALYTICS_E2E_FAILED' : 'FAGENT_ANALYTICS_E2E_OK');
process.exit(failed ? 1 : 0);
