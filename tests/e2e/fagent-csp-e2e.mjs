// Güvenlik başlıkları (vercel.json) uygulamayı BOZMUYOR mu? dist/ klasörünü vercel.json'daki başlıklarla
// kendi küçük sunucusundan (port 4210) sunar, tüm sekmeleri gezer ve CSP ihlali / sayfa hatası arar.
// Başlık değerinin tek kaynağı vercel.json'dur; test onu okur (kopya yok).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
const hdrs = Object.fromEntries(cfg.headers[0].headers.map(h => [h.key, h.value]));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = join('dist', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!existsSync(p) || statSync(p).isDirectory()) p = join('dist', 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream', ...hdrs });
  res.end(readFileSync(p));
});
await new Promise(r => server.listen(4210, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

check('vercel.json CSP var', !!hdrs['Content-Security-Policy']);
check('frame-ancestors none', hdrs['Content-Security-Policy'].includes("frame-ancestors 'none'"));
check('nosniff var', hdrs['X-Content-Type-Options'] === 'nosniff');
check('Referrer-Policy var', !!hdrs['Referrer-Policy']);
const scriptSrc = (hdrs['Content-Security-Policy'].split(';').map(x => x.trim()).find(x => x.startsWith('script-src')) ?? '');
check('script-src: unsafe-eval ve unsafe-inline yok', scriptSrc !== '' && !/unsafe-eval|unsafe-inline/.test(scriptSrc));

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const sorunlar = [];
page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) sorunlar.push(m.text().slice(0, 160)); });
page.on('pageerror', e => sorunlar.push('PAGE_ERROR ' + e.message));
await page.goto('http://localhost:4210/', { waitUntil: 'networkidle' });
const baslik = await (await page.request.get('http://localhost:4210/')).headers();
check('Sunucu CSP başlığını gönderdi', !!baslik['content-security-policy']);
// Öz-sınama: izin listesinde OLMAYAN bir adrese istek CSP tarafından engellenmeli ve konsola düşmeli.
// Bu görülmezse "ihlal yok" sonucu anlamsızdır (dedektör çalışmıyor demektir).
await page.evaluate(() => fetch('https://csp-probe.invalid/x').catch(() => {}));
await page.waitForTimeout(300);
check('Öz-sınama: izinsiz adres CSP tarafından engellendi ve yakalandı', sorunlar.length > 0);
sorunlar.length = 0;
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);
for (const etiket of ['PANEL', 'BUGÜN', 'HİSSELER', 'FONLAR', 'KRİPTO', 'İŞLEMLER', 'PROJEKSİYON', 'AJAN']) {
  const l = page.locator('.side-link', { hasText: etiket }).first();
  if (await l.count()) { await l.click(); await page.waitForTimeout(250); }
}
await page.fill('input[aria-label="Ajana soru sor"]', 'dağılımımı çiz');
await page.getByRole('button', { name: 'Gönder' }).click();
await page.waitForTimeout(500);
check('Grafik (inline stil/SVG) CSP altında çizildi', (await page.locator('.msg-agent svg').count()) > 0);
check('Hiçbir CSP ihlali / sayfa hatası yok', sorunlar.length === 0);
if (sorunlar.length) console.log(sorunlar.join('\n'));

await browser.close(); server.close();
console.log(failed ? 'FAGENT_CSP_E2E_FAILED' : 'FAGENT_CSP_E2E_OK');
process.exit(failed ? 1 : 0);
