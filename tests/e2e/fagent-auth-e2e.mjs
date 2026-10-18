// Hesap (giriş/kayıt/şifre sıfırlama/hesap silme) ve bulut senkronu uçtan uca testi.
// Supabase uç noktaları belgelenen yanıt biçimleriyle taklit edilir; gerçek ağa gidilmez.
// Not: dev sunucusu .env.local içindeki VITE_SUPABASE_URL ile çalışmalıdır (bulut açık).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS;
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
page.on('dialog', d => d.accept());

const USER_ID = '11111111-2222-3333-4444-555555555555';
const EMAIL = 'test@ornek.com';
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const ACCESS = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER_ID, email: EMAIL, role: 'authenticated', aud: 'authenticated', exp })}.sig`;
const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: ACCESS, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user };

let cloudRow = null; // buluttaki portfolios satırı (taklit)
const upserts = [];
let rpcCalls = 0;
let recoverCalls = 0;
let wrongPassword = false;

await page.route('**/auth/v1/**', async route => {
  const url = route.request().url();
  if (url.includes('/signup')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...user, confirmation_sent_at: new Date().toISOString() }) });
  }
  if (url.includes('/token')) {
    if (wrongPassword) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
  }
  if (url.includes('/recover')) {
    recoverCalls++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  if (url.includes('/logout')) return route.fulfill({ status: 204, body: '' });
  if (url.includes('/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
  return route.fulfill({ status: 404, body: '' });
});

await page.route('**/rest/v1/**', async route => {
  const req = route.request();
  const url = req.url();
  if (url.includes('/rpc/delete_my_account')) {
    rpcCalls++;
    cloudRow = null;
    return route.fulfill({ status: 204, body: '' });
  }
  if (url.includes('/portfolios')) {
    if (req.method() === 'GET') {
      const accept = req.headers()['accept'] || '';
      if (accept.includes('vnd.pgrst.object')) {
        return cloudRow
          ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: cloudRow.data }) })
          : route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cloudRow ? [{ data: cloudRow.data }] : []) });
    }
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() || '{}');
      const row = Array.isArray(body) ? body[0] : body;
      upserts.push(row);
      cloudRow = row;
      return route.fulfill({ status: 201, body: '' });
    }
  }
  return route.fulfill({ status: 404, body: '' });
});
// Kripto örnek portföyü canlı fiyat çekmez ama yine de dış ağa gitmesin.
await page.route('https://api.coingecko.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

await page.goto('http://localhost:4200/', { waitUntil: 'networkidle' });

const sideAccount = page.locator('.side-account');
check('Kenar çubuğunda GİRİŞ / KAYIT düğmesi var', (await sideAccount.innerText()).includes('GİRİŞ / KAYIT'));

// Önce hesapsız: örnek portföy
await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
await page.waitForTimeout(300);

// --- Kayıt: rıza kutusu zorunlu, doğrulama mesajı ---
await sideAccount.click();
await page.getByRole('tab', { name: /Hesap oluştur/ }).click();
await page.fill('input[aria-label="E-posta"]', EMAIL);
await page.fill('input[aria-label="Şifre"]', 'gizli123');
const createBtn = page.getByRole('button', { name: 'Hesap oluştur', exact: true });
check('Rıza işaretlenmeden kayıt düğmesi pasif', await createBtn.isDisabled());
await page.locator('.auth-consent input').check();
check('Rıza işaretlenince kayıt düğmesi aktif', await createBtn.isEnabled());
await createBtn.click();
await page.waitForTimeout(400);
check('E-posta doğrulama mesajı gösterildi', await page.locator('text=Doğrulama bağlantısı e-postana gönderildi').count() === 1);
await page.screenshot({ path: `${out}/a1-kayit.png` });

// --- Hatalı şifre ---
await page.getByRole('tab', { name: /Giriş yap/ }).click();
wrongPassword = true;
await page.fill('input[aria-label="E-posta"]', EMAIL);
await page.fill('input[aria-label="Şifre"]', 'yanlis12');
await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
await page.waitForTimeout(400);
check('Hatalı şifrede Türkçe hata mesajı', await page.locator('text=E-posta veya şifre hatalı.').count() === 1);
wrongPassword = false;

// --- Giriş: bulut boş → yerel örnek portföy hesaba yüklenir ---
await page.fill('input[aria-label="Şifre"]', 'gizli123');
await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
await page.waitForTimeout(2200);
check('Giriş sonrası kenar çubuğunda e-posta görünür', (await sideAccount.innerText()).includes(EMAIL));
check('İlk girişte yerel portföy buluta yüklendi (5 varlık)', upserts.length >= 1 && upserts.at(-1).data.holdings.length === 5);
check('Yüklenen kayıt doğru kullanıcıya ait', upserts.at(-1).user_id === USER_ID);
check('Giriş sonrası panele dönüldü', await page.locator('#h-name').count() === 1);

// --- Değişiklik → gecikmeli otomatik kayıt ---
const before = upserts.length;
await page.fill('#h-name', 'Senkron Test Varlığı');
await page.fill('#h-amount', '1234');
await page.getByRole('button', { name: 'Ekle', exact: true }).click();
await page.waitForTimeout(2000);
check('Yeni varlık eklendikten sonra buluta kaydedildi', upserts.length > before);
check('Bulut kaydında yeni varlık var', upserts.at(-1).data.holdings.some(h => h.name === 'Senkron Test Varlığı'));

// --- Çıkış: yerel veri temizlenir ---
await sideAccount.click();
await page.waitForTimeout(200);
check('Hesabım ekranında senkron durumu görünür', await page.locator('text=Bulutla senkron').count() === 1);
await page.screenshot({ path: `${out}/a2-hesabim.png` });
await page.getByRole('button', { name: /Çıkış yap/ }).click();
await page.waitForTimeout(800);
check('Çıkışta kenar çubuğu GİRİŞ / KAYIT\'a döndü', (await sideAccount.innerText()).includes('GİRİŞ / KAYIT'));
const localAfterLogout = await page.evaluate(() => localStorage.getItem('fagent.portfolio.v1'));
check('Çıkışta bu tarayıcıdaki portföy temizlendi', !localAfterLogout || !JSON.parse(localAfterLogout).onboarded);

// --- Yeniden giriş: bulut verisi geri gelir ---
await page.fill('input[aria-label="E-posta"]', EMAIL);
await page.fill('input[aria-label="Şifre"]', 'gizli123');
await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
await page.waitForTimeout(1500);
check('Yeniden girişte buluttaki varlık geri yüklendi', await page.locator('.list-row', { hasText: 'Senkron Test Varlığı' }).count() === 1);

// --- Hesap silme ---
await sideAccount.click();
await page.getByRole('button', { name: /Hesabımı sil/ }).click();
await page.waitForTimeout(800);
check('Hesap silme veritabanı fonksiyonu çağrıldı', rpcCalls === 1);
check('Silme sonrası onay mesajı', await page.locator('text=Hesabın ve buluttaki verilerin silindi.').count() === 1);
check('Silme sonrası kenar çubuğu GİRİŞ / KAYIT', (await sideAccount.innerText()).includes('GİRİŞ / KAYIT'));

// --- Şifremi unuttum ---
await page.getByRole('button', { name: 'Şifremi unuttum' }).click();
await page.fill('input[aria-label="E-posta"]', EMAIL);
await page.getByRole('button', { name: 'Bağlantı gönder' }).click();
await page.waitForTimeout(400);
check('Şifre sıfırlama isteği gönderildi', recoverCalls === 1);
check('Şifre sıfırlama mesajı gösterildi', await page.locator('text=Şifre sıfırlama bağlantısı e-postana gönderildi.').count() === 1);
await page.screenshot({ path: `${out}/a3-sifre.png` });

// --- Mobil yerleşim: düğme görünür kalır ---
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(200);
check('Mobilde hesap düğmesi görünür', await sideAccount.isVisible());

await browser.close();
console.log(failed ? 'FAGENT_AUTH_E2E_FAILED' : 'FAGENT_AUTH_E2E_OK');
process.exit(failed ? 1 : 0);
