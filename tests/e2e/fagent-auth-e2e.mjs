// Hesap (giriş/kayıt/şifre sıfırlama/hesap silme) ve bulut senkronu uçtan uca testi.
//
// ÖNEMLİ: Supabase uç noktaları `page.route()` ile TAKLİT edilir (belgelenen yanıt biçimleriyle);
// gerçek bir Supabase projesine hiç gidilmez. Bu yüzden bu takımın yeşil olması "sahte Supabase ile
// yeşil" demektir — RLS, delete_my_account, e-posta yönlendirmeleri ve PASSWORD_RECOVERY gerçek
// projeye karşı DOĞRULANMAMIŞTIR (plan adım 5).
//
// Bu dosya iki derlemeye bağlanır (tests/run-e2e.mjs):
//   E2E_BASE_URL          bulut derlemesi (sahte Supabase değerleriyle derlenmiş, dist-e2e-cloud)
//   E2E_DEFAULT_BASE_URL  hesapsız varsayılan derleme (dist) — yalnızca (g) için
// Elle koşturmak için: önce iki derlemeyi koşucunun yaptığı gibi hazırla (BUILD_OUT_DIR ile) ya da
// doğrudan `npm run test:e2e` kullan.
import { chromium } from 'playwright-core';

const CLOUD_BASE = process.env.E2E_BASE_URL || 'http://localhost:4201/';
const DEFAULT_BASE = process.env.E2E_DEFAULT_BASE_URL || 'http://localhost:4200/';
const FAKE_HOST = process.env.E2E_FAKE_SUPABASE_HOST || 'sahte.supabase.co';
const FAKE_REF = FAKE_HOST.split('.')[0]; // supabase-js depolama anahtarı: sb-<ref>-auth-token

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const out = process.env.TEST_ARTIFACTS || '/tmp';
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };

// ---- Taklit Supabase ----

const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const EXP = Math.floor(Date.now() / 1000) + 3600;
const USERS = {
  'test@ornek.com': '11111111-2222-3333-4444-555555555555',
  'alice@ornek.com': 'aaaaaaaa-0000-0000-0000-000000000001',
  'bob@ornek.com': 'bbbbbbbb-0000-0000-0000-000000000002',
};
const uidToEmail = Object.fromEntries(Object.entries(USERS).map(([e, i]) => [i, e]));
const userObj = uid => ({
  id: uid, aud: 'authenticated', role: 'authenticated', email: uidToEmail[uid],
  app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
});
const sessionFor = uid => ({
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, email: uidToEmail[uid], role: 'authenticated', aud: 'authenticated', exp: EXP })}.sig`,
  token_type: 'bearer', expires_in: 3600, expires_at: EXP, refresh_token: `r-${uid}`, user: userObj(uid),
});
const subOf = req => {
  const m = /Bearer ([^.]+)\.([^.]+)\./.exec(req.headers()['authorization'] || '');
  try { return JSON.parse(Buffer.from(m[2], 'base64url').toString()).sub; } catch { return null; }
};

function makeMock() {
  return {
    rows: {},        // uid -> bulut satırının `data` (jsonb) değeri
    upserts: [],     // { uid, row } — portfolios'a atılan her yazma
    rpcCalls: 0, recoverCalls: 0, wrongPassword: false,
    signupBody: null, recoverBody: null, // PKCE: code_challenge gövdede olmalı
    userTokens: [],  // /auth/v1/user'a giden Bearer token'lar (URL'den enjekte edilen token sorgulanmamalı)
    supaReqs: 0,     // sahte Supabase host'una giden istek sayısı
    outside: [],     // sahte host ve uygulama dışına giden istekler: { url, post }
  };
}

async function attach(page, mock, base) {
  const appOrigin = new URL(base).origin;
  // Catch-all (en önce kayıtlı = en son bakılır): uygulama dışına çıkan her şey kaydedilir ve boş döner.
  await page.route('**/*', route => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.origin === appOrigin || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    if (u.host === FAKE_HOST) return route.fallback();
    mock.outside.push({ url: req.url(), post: req.postData() || '', headers: JSON.stringify(req.headers()) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route(`https://${FAKE_HOST}/**`, async route => {
    mock.supaReqs++;
    const req = route.request();
    const url = req.url();
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.includes('/auth/v1/')) {
      if (url.includes('/signup')) {
        try { mock.signupBody = JSON.parse(req.postData() || '{}'); } catch { /* yok */ }
        return json(200, { ...userObj(USERS['test@ornek.com']), confirmation_sent_at: new Date().toISOString() });
      }
      if (url.includes('/token')) {
        if (mock.wrongPassword) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        let body = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { /* yok */ }
        if (url.includes('grant_type=refresh_token')) {
          const uid = String(body.refresh_token || '').replace(/^r-/, '');
          return uidToEmail[uid] ? json(200, sessionFor(uid)) : json(400, { error: 'invalid_grant' });
        }
        // PKCE kod değişimi (e-posta bağlantısı ?code=...): yerelde code_verifier varsa supabase-js buraya gelir.
        if (url.includes('grant_type=pkce')) return json(200, sessionFor(USERS['test@ornek.com']));
        const uid = USERS[String(body.email || '').toLowerCase()];
        return uid ? json(200, sessionFor(uid)) : json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      if (url.includes('/recover')) {
        mock.recoverCalls++;
        try { mock.recoverBody = JSON.parse(req.postData() || '{}'); } catch { /* yok */ }
        return json(200, {});
      }
      if (url.includes('/logout')) return route.fulfill({ status: 204, body: '' });
      if (url.includes('/user')) {
        mock.userTokens.push(req.headers()['authorization'] || '');
        const uid = subOf(req);
        return uid ? json(200, userObj(uid)) : json(401, { msg: 'no' });
      }
      return route.fulfill({ status: 404, body: '' });
    }

    if (url.includes('/rest/v1/')) {
      if (url.includes('/rpc/delete_my_account')) {
        mock.rpcCalls++;
        delete mock.rows[subOf(req)];
        return route.fulfill({ status: 204, body: '' });
      }
      if (url.includes('/portfolios')) {
        if (req.method() === 'GET') {
          const uid = (new URL(url).searchParams.get('user_id') || '').replace(/^eq\./, '');
          const data = mock.rows[uid];
          const accept = req.headers()['accept'] || '';
          if (accept.includes('vnd.pgrst.object')) {
            return data !== undefined
              ? json(200, { data })
              : json(406, { code: 'PGRST116', message: 'no rows' });
          }
          return json(200, data !== undefined ? [{ data }] : []);
        }
        if (req.method() === 'POST') {
          const body = JSON.parse(req.postData() || '{}');
          const row = Array.isArray(body) ? body[0] : body;
          mock.upserts.push({ uid: row.user_id, row });
          mock.rows[row.user_id] = row.data;
          return route.fulfill({ status: 201, body: '' });
        }
      }
    }
    return route.fulfill({ status: 404, body: '' });
  });
}

// ---- Yardımcılar ----

async function newPage(base, { viewport = { width: 1440, height: 1100 }, mock = makeMock() } = {}) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  page.on('dialog', d => d.accept());
  await attach(page, mock, base);
  return { ctx, page, mock };
}

const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return true; } catch { /* sayfa yenileniyor olabilir */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lsGet = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const lsKeys = page => page.evaluate(() => Object.keys(localStorage));
const lsDump = page => page.evaluate(() => {
  const o = {};
  for (const k of Object.keys(localStorage)) if (!k.startsWith('sb-')) o[k] = localStorage.getItem(k);
  return o;
});

const portfolio = names => JSON.stringify({
  onboarded: true, realizedPnl: 0,
  holdings: names.map((name, i) => ({ id: `s${i}`, name, type: i % 2 ? 'mevduat' : 'fon', amount: 1000 * (i + 1), costBasis: 900 * (i + 1) })),
  txns: [],
});
const cloudRowOf = data => ({ fagentBackup: 1, data });

async function open(page, base) {
  await page.goto(base, { waitUntil: 'networkidle' });
}
async function seed(page, kv) {
  await page.evaluate(o => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); }, kv);
  await page.reload({ waitUntil: 'networkidle' });
}
async function login(page, email, pw = 'gizli123') {
  await page.locator('.side-account').click();
  await page.getByRole('tab', { name: /Giriş yap/ }).click();
  await page.fill('input[aria-label="E-posta"]', email);
  await page.fill('input[aria-label="Şifre"]', pw);
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
}
const uploadCard = page => page.getByRole('region', { name: 'Yükleme onayı' });
// Bulut boşken ve bu tarayıcıda sahibi belirsiz veri varken çıkan onay kartında "yükle"yi seçer.
async function confirmUpload(page) {
  await uploadCard(page).waitFor({ timeout: 10000 });
  await uploadCard(page).getByRole('button', { name: /Bu tarayıcıdaki veriyi hesabıma yükle/ }).click();
}
const sideText = page => page.locator('.side-account').innerText();
const bodyText = page => page.locator('body').innerText();

// Beyaz liste dışı gürültü anahtarları (önbellekler, AI adresi, EVDS) — gövdede ASLA olmamalı.
const NOISE = {
  'fagent.ai.proxyurl.v1': 'https://worker.example.workers.dev',
  'fagent.pricehistory.v1.THYAO': JSON.stringify({ at: 1, series: [1, 2, 3] }),
  'fagent.cryptomarket.cache.v2': JSON.stringify({ at: 1, rows: [] }),
  'fagent.evds.v1': JSON.stringify({ at: 1, v: 40 }),
};
const WHITELIST = ['fagent.portfolio.v1', 'fagent.agent.memory.v1', 'fagent.agent.training.v1', 'fagent.tax.v1', 'fagent.target.v1'];
const LAYERS = {
  'fagent.agent.memory.v1': JSON.stringify({ totalTurns: 2, topicCounts: {}, holdingMentions: {}, prefs: {}, recentQuestions: ['gizli-soru-xyz'], recentAdvice: [], firstSeenAt: '', lastSeenAt: '', lastAnalysisAt: '' }),
  'fagent.agent.training.v1': JSON.stringify([{ id: 'f1', question: 'ozel soru abc', answer: 'ozel cevap abc', createdAt: '2026-01-01T00:00:00.000Z', timesUsed: 0 }]),
  'fagent.tax.v1': JSON.stringify({ hisse: 17 }),
  'fagent.target.v1': JSON.stringify({ hisse: 40, fon: 60 }),
};
const EMAIL = 'test@ornek.com';
const UID = USERS[EMAIL];

// =====================================================================================
// S1 — standalone'dan korunan akış + (a) (e) (l)
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  const sideAccount = page.locator('.side-account');
  check('Kenar çubuğunda GİRİŞ / KAYIT düğmesi var', (await sideText(page)).includes('GİRİŞ / KAYIT'));

  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(300);
  // Girişten önce: 4 katman + gürültü anahtarları + eski sahiplik işareti olmayan temiz tarayıcı.
  await seed(page, { ...LAYERS, ...NOISE });

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
  check('E-posta doğrulama mesajı gösterildi',
    await until(async () => (await page.locator('text=Doğrulama bağlantısı e-postana gönderildi').count()) === 1));
  await page.screenshot({ path: `${out}/a1-kayit.png` });

  // --- Hatalı şifre ---
  await page.getByRole('tab', { name: /Giriş yap/ }).click();
  mock.wrongPassword = true;
  await page.fill('input[aria-label="E-posta"]', EMAIL);
  await page.fill('input[aria-label="Şifre"]', 'yanlis12');
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  check('Hatalı şifrede Türkçe hata mesajı',
    await until(async () => (await page.locator('text=E-posta veya şifre hatalı.').count()) === 1));
  mock.wrongPassword = false;

  // PKCE (#15): kayıt isteği code_challenge taşır (implicit akışta taşımaz).
  check('(n) Kayıt isteği PKCE code_challenge taşır', !!mock.signupBody?.code_challenge && mock.signupBody?.code_challenge_method === 's256');

  // --- Giriş: bulut boş + bu tarayıcıda sahibi belirsiz veri → ONAY sorulur, kendiliğinden yüklenmez ---
  await page.fill('input[aria-label="Şifre"]', 'gizli123');
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await uploadCard(page).waitFor({ timeout: 10000 });
  await sleep(2500); // kayıt gecikmesinin (1 sn) üstünde bekle
  check('(m) Giriş sonrası onay kartı çıktı; sen onaylamadan upsert atılmadı', mock.upserts.length === 0);
  check('(m) Onay beklerken sahiplik işareti yazılmadı', (await lsGet(page, 'fagent.cloud.owner.v1')) === null);
  await uploadCard(page).getByRole('button', { name: /Bu tarayıcıdaki veriyi hesabıma yükle/ }).click();
  await until(async () => mock.upserts.length >= 1, 8000);
  check('Giriş sonrası kenar çubuğunda e-posta görünür', (await sideText(page)).includes(EMAIL));
  const first = mock.upserts.at(-1);
  check('İlk girişte yerel portföy buluta yüklendi (5 varlık)', !!first && first.row.data.data['fagent.portfolio.v1'] && JSON.parse(first.row.data.data['fagent.portfolio.v1']).holdings.length === 5);
  check('Yüklenen kayıt doğru kullanıcıya ait', first?.uid === UID);
  check('Giriş sonrası panele dönüldü', await until(async () => (await page.locator('#h-name').count()) === 1));

  // (a) Gövde: 5 beyaz liste anahtarı VAR; gürültü/oturum/sahiplik anahtarları YOK.
  const dataKeys = Object.keys(first.row.data.data);
  const bodyStr = JSON.stringify(first.row);
  check('(a) Upsert gövdesinde 5 beyaz liste anahtarı var (training, tax, target dahil)',
    WHITELIST.every(k => dataKeys.includes(k)) && dataKeys.length === 5);
  check('(a) Upsert gövdesinde sb-*, ai.proxyurl, pricehistory, cryptomarket, evds, cloud.owner yok',
    !dataKeys.some(k => k.startsWith('sb-'))
    && !['fagent.ai.proxyurl.v1', 'fagent.cryptomarket.cache.v2', 'fagent.evds.v1', 'fagent.cloud.owner.v1'].some(k => bodyStr.includes(k))
    && !bodyStr.includes('fagent.pricehistory.v1.') && !bodyStr.includes('sb-'));

  // --- Değişiklik → gecikmeli otomatik kayıt ---
  const before = mock.upserts.length;
  await page.fill('#h-name', 'Senkron Test Varlığı');
  await page.fill('#h-amount', '1234');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  check('Yeni varlık eklendikten sonra buluta kaydedildi', await until(async () => mock.upserts.length > before));
  check('Bulut kaydında yeni varlık var',
    mock.upserts.at(-1).row.data.data['fagent.portfolio.v1'].includes('Senkron Test Varlığı'));

  // --- Hesabım ekranı ---
  await sideAccount.click();
  const accountCard = page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Hesabım' }) });
  check('Hesabım ekranında senkron durumu görünür',
    await until(async () => (await accountCard.locator('text=Bulutla senkron').count()) === 1));
  await page.screenshot({ path: `${out}/a2-hesabim.png` });

  // --- Çıkış (e): kullanıcı katmanları, oturum anahtarı ve önbellekler temiz ---
  await accountCard.getByRole('button', { name: /Çıkış yap/ }).click();
  check('Çıkışta kenar çubuğu GİRİŞ / KAYIT\'a döndü',
    await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT')));
  const keysAfter = await lsKeys(page);
  const localAfterLogout = await lsGet(page, 'fagent.portfolio.v1');
  check('Çıkışta bu tarayıcıdaki portföy temizlendi', !localAfterLogout || !JSON.parse(localAfterLogout).onboarded);
  check('(e) Çıkıştan sonra 5 kullanıcı anahtarı temiz', WHITELIST.every(k => !keysAfter.includes(k)));
  check('(e) Çıkıştan sonra sb-*-auth-token, price history ve cryptomarket önbelleği temiz',
    !keysAfter.some(k => /^sb-.*-auth-token$/.test(k))
    && !keysAfter.some(k => k.startsWith('fagent.pricehistory.v1.'))
    && !keysAfter.includes('fagent.cryptomarket.cache.v2')
    && !keysAfter.includes('fagent.cloud.owner.v1'));

  // --- Yeniden giriş (l): bulut verisi, vergi/hedef/öğretilen bilgi geri gelir ---
  await page.fill('input[aria-label="E-posta"]', EMAIL);
  await page.fill('input[aria-label="Şifre"]', 'gizli123');
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  check('Yeniden girişte buluttaki varlık geri yüklendi',
    await until(async () => (await page.locator('.list-row', { hasText: 'Senkron Test Varlığı' }).count()) === 1));
  const tax = JSON.parse((await lsGet(page, 'fagent.tax.v1')) || '{}');
  const target = JSON.parse((await lsGet(page, 'fagent.target.v1')) || '{}');
  const training = JSON.parse((await lsGet(page, 'fagent.agent.training.v1')) || '[]');
  check('(l) Yeniden girişte vergi oranı geri geldi', tax.hisse === 17);
  check('(l) Yeniden girişte hedef dağılım geri geldi', target.hisse === 40 && target.fon === 60);
  check('(l) Yeniden girişte öğretilen bilgi geri geldi', training.length === 1 && training[0].question === 'ozel soru abc');
  check('(l) Yeniden girişte ajan belleği geri geldi', (await lsGet(page, 'fagent.agent.memory.v1'))?.includes('gizli-soru-xyz') === true);

  // --- Hesap silme ---
  await sideAccount.click();
  await page.getByRole('button', { name: /Hesabımı sil/ }).click();
  check('Hesap silme veritabanı fonksiyonu çağrıldı', await until(async () => mock.rpcCalls === 1));
  check('Silme sonrası onay mesajı',
    await until(async () => (await page.locator('text=Hesabın ve hesabındaki tüm veriler silindi.').count()) === 1));
  check('Silme sonrası kenar çubuğu GİRİŞ / KAYIT', (await sideText(page)).includes('GİRİŞ / KAYIT'));

  // --- Şifremi unuttum ---
  await page.getByRole('button', { name: 'Şifremi unuttum' }).click();
  await page.fill('input[aria-label="E-posta"]', EMAIL);
  await page.getByRole('button', { name: 'Bağlantı gönder' }).click();
  check('Şifre sıfırlama isteği gönderildi', await until(async () => mock.recoverCalls === 1));
  check('Şifre sıfırlama mesajı gösterildi (nötr metin)',
    await until(async () => (await page.locator('text=Bu e-posta ile bir hesap varsa şifre sıfırlama bağlantısı gönderildi.').count()) === 1));
  await page.screenshot({ path: `${out}/a3-sifre.png` });

  // --- Mobil yerleşim ---
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(200);
  check('Mobilde hesap düğmesi görünür', await sideAccount.isVisible());

  // (h) bu akış boyunca uygulama ve sahte Supabase dışına giden isteklerde varlık adı / e-posta yok.
  const leak = mock.outside.filter(r => /Senkron Test|BIST 30|THYAO|Gram Alt|test@ornek|ornek\.com|gizli-soru|ozel soru/i.test(r.url + r.post + r.headers));
  check('(h) Sahte Supabase dışına giden hiçbir istekte varlık adı ya da e-posta yok', leak.length === 0);
}

// =====================================================================================
// (b) bulut satırındaki beyaz liste dışı anahtarlar localStorage'a yazılmaz
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  mock.rows[UID] = cloudRowOf({
    'fagent.portfolio.v1': portfolio(['Bulut Varlığı']),
    'fagent.ai.proxyurl.v1': 'https://evil.example/x',
    'evil.key': '1',
  });
  await open(page, CLOUD_BASE);
  await login(page, EMAIL);
  check('(b) Bulut verisi uygulandı (girişsiz boş tarayıcıda otomatik)',
    await until(async () => (await page.locator('.list-row', { hasText: 'Bulut Varlığı' }).count()) >= 1));
  const keys = await lsKeys(page);
  check('(b) fagent.ai.proxyurl.v1 ve evil.key localStorage\'a yazılmadı',
    !keys.includes('fagent.ai.proxyurl.v1') && !keys.includes('evil.key'));
}

// =====================================================================================
// (c) tanınmayan biçimli satır: localStorage değişmez, upsert atılmaz
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await seed(page, LAYERS);
  mock.rows[UID] = { hello: 'world' };
  const before = await lsDump(page);
  await login(page, EMAIL);
  await until(async () => (await sideText(page)).includes(EMAIL), 10000);
  await sleep(2500); // kayıt gecikmesinin (1 sn) üstünde bekle
  await page.locator('.side-account').click(); // hata metni Hesabım ekranındadır
  const sawErr = await until(async () => (await bodyText(page)).includes('Hesaptaki veri tanınmadı'), 5000);
  const after = await lsDump(page);
  check('(c) Tanınmayan biçimde kullanıcıya sabit Türkçe hata gösterildi', sawErr);
  check('(c) Tanınmayan biçimde localStorage değişmedi', JSON.stringify(before) === JSON.stringify(after));
  check('(c) Tanınmayan biçimde upsert atılmadı', mock.upserts.length === 0);
}

// =====================================================================================
// (d) eski biçimli (çıplak PortfolioState) satır
// =====================================================================================
{
  const legacy = {
    onboarded: true, realizedPnl: 0,
    holdings: [{ id: 'e1', name: 'Eski Biçim Varlığı', type: 'fon', amount: 1000, costBasis: 900 }], txns: [],
  };
  // d1: yerelde kaybedilecek veri yok (yalnızca vergi/hedef/bellek) → otomatik uygulanır.
  {
    const { page, mock } = await newPage(CLOUD_BASE);
    mock.rows[UID] = legacy;
    await open(page, CLOUD_BASE);
    const { 'fagent.agent.training.v1': _t, ...noTraining } = LAYERS;
    await seed(page, noTraining);
    await login(page, EMAIL);
    check('(d) Eski biçimli satırda varlık görünür',
      await until(async () => (await page.locator('.list-row', { hasText: 'Eski Biçim Varlığı' }).count()) >= 1));
    const tax = JSON.parse((await lsGet(page, 'fagent.tax.v1')) || '{}');
    const target = JSON.parse((await lsGet(page, 'fagent.target.v1')) || '{}');
    check('(d) Eski biçimde yerel vergi ve hedef korundu', tax.hisse === 17 && target.hisse === 40);
  }
  // d2: yerelde öğretilen bilgi var → çakışma; "Hesabımdaki veriyi yükle" sonrası eğitim korunur.
  {
    const { page, mock } = await newPage(CLOUD_BASE);
    mock.rows[UID] = legacy;
    await open(page, CLOUD_BASE);
    await seed(page, LAYERS);
    await login(page, EMAIL);
    const region = page.getByRole('region', { name: 'Senkron çakışması' });
    await region.waitFor({ timeout: 10000 });
    await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).click();
    check('(d) Eski biçim + çakışmada varlık görünür',
      await until(async () => (await page.locator('.list-row', { hasText: 'Eski Biçim Varlığı' }).count()) >= 1));
    const training = JSON.parse((await lsGet(page, 'fagent.agent.training.v1')) || '[]');
    const tax = JSON.parse((await lsGet(page, 'fagent.tax.v1')) || '{}');
    const target = JSON.parse((await lsGet(page, 'fagent.target.v1')) || '{}');
    check('(d) Eski biçimde yerel tax/target/training korundu',
      training.length === 1 && tax.hisse === 17 && target.hisse === 40);
  }
}

// =====================================================================================
// (f) A -> B: A çıkış yapmadan oturum düşer, ardından B girer
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  const A_NAME = 'AliceGizliVarlik';
  await seed(page, { 'fagent.portfolio.v1': portfolio([A_NAME]) });
  await login(page, 'alice@ornek.com');
  await confirmUpload(page); // hesapsız kullanılmış veri: A kendi verisi olduğunu onaylar
  check('(f) A girişinde A\'nın verisi A\'nın hesabına yüklendi',
    await until(async () => mock.upserts.some(u => u.uid === USERS['alice@ornek.com'] && JSON.stringify(u.row).includes(A_NAME))));
  // Kullanıcının başlatmadığı oturum düşüşü: başka sekmeden çıkışın yayını (supabase-js BroadcastChannel).
  await page.evaluate(ref => {
    const bc = new BroadcastChannel(`sb-${ref}-auth-token`);
    bc.postMessage({ event: 'SIGNED_OUT', session: null });
    bc.close();
  }, FAKE_REF);
  check('(f) Oturum düşünce yerel kullanıcı katmanları temizlendi (A adı localStorage\'da yok)',
    await until(async () => !(JSON.stringify(await lsDump(page))).includes(A_NAME)));
  check('(f) Oturum düşünce kenar çubuğu GİRİŞ / KAYIT\'a döndü',
    await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT')));
  // Yarış / başka sekme artığı: A'nın verisi ve sahiplik işareti yeniden bulunsa bile B'ye geçmemeli.
  await page.evaluate(([name, pf]) => {
    localStorage.setItem('fagent.portfolio.v1', pf);
    localStorage.setItem('fagent.cloud.owner.v1', 'aaaaaaaa-0000-0000-0000-000000000001');
  }, [A_NAME, portfolio([A_NAME])]);
  const upsertsBeforeB = mock.upserts.length;
  await login(page, 'bob@ornek.com');
  await until(async () => (await sideText(page)).includes('bob@ornek.com'));
  await sleep(2500);
  check('(f) B girince A\'nın verisi B\'nin tarayıcısından temizlendi',
    !(JSON.stringify(await lsDump(page))).includes(A_NAME));
  // B kendi verisini girer; yüklenen gövdede A'nın adı olmamalı.
  await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
  await page.fill('#h-name', 'BobVarlik');
  await page.fill('#h-amount', '500');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await until(async () => mock.upserts.slice(upsertsBeforeB).some(u => u.uid === USERS['bob@ornek.com']));
  const bobUps = mock.upserts.slice(upsertsBeforeB);
  check('(f) B\'nin upsert gövdesi B\'nin varlığını içerir', bobUps.some(u => JSON.stringify(u.row).includes('BobVarlik')));
  check('(f) B\'nin upsert gövdesinde A\'nın varlık adı yok', bobUps.length > 0 && bobUps.every(u => !JSON.stringify(u.row).includes(A_NAME)));
  check('(f) A\'nın bulut satırı B tarafından değiştirilmedi',
    mock.upserts.filter(u => u.uid === USERS['alice@ornek.com']).every(u => JSON.stringify(u.row).includes(A_NAME))
    && !bobUps.some(u => u.uid === USERS['alice@ornek.com']));
}

// =====================================================================================
// (g) env'siz varsayılan derleme: hesap düğmesi yok, /auth/v1 ve /rest/v1 isteği sıfır
// =====================================================================================
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  page.on('dialog', d => d.accept());
  const supaUrls = [];
  page.on('request', r => { if (/\/auth\/v1|\/rest\/v1|supabase/i.test(r.url())) supaUrls.push(r.url()); });
  await page.route(/^(?!http:\/\/localhost).*/, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await open(page, DEFAULT_BASE);
  check('(g) Varsayılan derlemede hesap düğmesi (.side-account) yok', await page.locator('.side-account').count() === 0);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(1500);
  check('(g) Varsayılan derlemede hesap düğmesi onboarding sonrası da yok', await page.locator('.side-account').count() === 0);
  check('(g) Varsayılan derlemede /auth/v1, /rest/v1 ve supabase isteği sıfır', supaUrls.length === 0);
  check('(g) Varsayılan derlemede gizlilik metni değişmedi (veriler tarayıcında saklanır)',
    (await bodyText(page)).includes('veriler tarayıcında saklanır'));
  await ctx.close();
}

// =====================================================================================
// (i) girişliyken gizlilik metinleri; girişsiz bulut derlemesinde eski metinler aynı
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  const onbSignedOut = await bodyText(page);
  check('(i) Girişsizken onboarding eski metni korur (yalnızca kendi tarayıcında saklanır)',
    onbSignedOut.includes('Verilerin yalnızca kendi tarayıcında saklanır.'));
  await login(page, EMAIL);
  await until(async () => (await sideText(page)).includes(EMAIL));
  const onb = await bodyText(page);
  check('(i) Girişliyken onboarding "hesabına ... eşitlenir" der, "tarayıcından çıkmaz" yok',
    /hesabına[^.]*eşitlenir/.test(onb) && !onb.includes('tarayıcından çıkmaz'));
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(500);
  const panel = await bodyText(page);
  check('(i) Girişliyken Panel "veriler hesabına eşitlenir" der', panel.includes('veriler hesabına eşitlenir'));
  check('(i) Girişliyken Panel\'de "tarayıcından çıkmaz" görünmez', !panel.includes('tarayıcından çıkmaz'));

  await page.locator('.side-link', { hasText: 'AJAN' }).click();
  await page.waitForTimeout(300);
  const agentPage = await bodyText(page);
  check('(i) Girişliyken ajan alt notu "Fagent hesabına eşitlenir" der, "tarayıcından çıkmaz" yok',
    /Fagent hesabına eşitlenir/.test(agentPage) && !agentPage.includes('tarayıcından çıkmaz'));
  await page.fill('input[aria-label="Ajana soru sor"]', 'beni ne hatırlıyorsun');
  await page.getByRole('button', { name: 'Gönder' }).click();
  await page.waitForTimeout(400);
  const reply = (await page.locator('.msg-agent').last().textContent()) || '';
  check('(i) "beni ne hatırlıyorsun" yanıtı hesaba eşitlemeyi söyler, "gönderilmez" demez',
    reply.includes('Fagent hesabına') && !reply.includes('hiçbir sunucuya gönderilmez') && !reply.includes('tarayıcından çıkmaz'));
  // Çıkış: eski metinler geri gelir.
  await page.locator('.side-account').click();
  await page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Hesabım' }) })
    .getByRole('button', { name: /Çıkış yap/ }).click();
  await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT'));
  // Çıkıştan sonra Hesap ekranı girişsiz formla kalır (silme mesajı gibi bildirimler görünsün diye);
  // portföy boşken dönüş yolu "Hesapsız devam et"tir (yenileme gerekmez).
  await page.getByRole('button', { name: 'Hesapsız devam et' }).click();
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(400);
  check('(i) Çıkıştan sonra Panel eski metne döner (veriler tarayıcında saklanır)',
    (await bodyText(page)).includes('veriler tarayıcında saklanır'));
  void mock;
}

// =====================================================================================
// (j) çakışma: bulut verisi otomatik uygulanmaz, upsert yok; karardan sonra bulut verisi görünür
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Bulut Fonu Çakışma']) });
  await open(page, CLOUD_BASE);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(300);
  const localBefore = await lsGet(page, 'fagent.portfolio.v1');
  await login(page, EMAIL);
  const region = page.getByRole('region', { name: 'Senkron çakışması' });
  await region.waitFor({ timeout: 10000 });
  check('(j) Çakışma kartı "Hesabımdaki veriyi yükle" ve "Önce yedeğini indir" sunar',
    await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).count() === 1
    && await region.getByRole('button', { name: /Önce yedeğini indir/ }).count() === 1);
  await sleep(2500);
  check('(j) Çakışmada bulut verisi otomatik uygulanmadı (yerel portföy aynı)',
    (await lsGet(page, 'fagent.portfolio.v1')) === localBefore);
  check('(j) Çakışmada upsert atılmadı', mock.upserts.length === 0);
  await page.screenshot({ path: `${out}/a4-cakisma.png` });
  await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).click();
  check('(j) "Hesabımdaki veriyi yükle" sonrası bulut verisi görünür',
    await until(async () => (await page.locator('.list-row', { hasText: 'Bulut Fonu Çakışma' }).count()) >= 1));
  await sleep(2500);
  check('(j) Bulut verisini yüklemek upsert tetiklemedi', mock.upserts.length === 0);
}

// =====================================================================================
// (k) girişliyken SIFIRLA: bulut satırı boşaltılmaz, upsert atılmaz
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(300);
  await login(page, EMAIL);
  await confirmUpload(page);
  await until(async () => mock.upserts.length >= 1);
  const countBefore = mock.upserts.length;
  const rowBefore = JSON.stringify(mock.rows[UID]);
  await page.click('text=SIFIRLA');
  await sleep(3000);
  check('(k) SIFIRLA bu tarayıcıdaki portföyü temizledi',
    !(await lsGet(page, 'fagent.portfolio.v1')) || !JSON.parse(await lsGet(page, 'fagent.portfolio.v1')).onboarded);
  check('(k) SIFIRLA sonrası upsert atılmadı', mock.upserts.length === countBefore);
  check('(k) SIFIRLA bulut satırını boşaltmadı', JSON.stringify(mock.rows[UID]) === rowBefore
    && JSON.parse(mock.rows[UID].data['fagent.portfolio.v1']).holdings.length === 5);
}

// =====================================================================================
// (m) hesapsız A'nın verisi, aynı tarayıcıda yeni/boş hesaba giren B'ye sızmaz (ortak cihaz)
// =====================================================================================
{
  const A_NAME = 'AHesapsizGizliVarlik';
  const BOB = 'bob@ornek.com';
  const BOB_UID = USERS[BOB];
  const everyBody = mock => JSON.stringify([mock.upserts, mock.outside]);

  // m1: B giriş yapar (bulut boş) → onay kartı; çıkışta veri olduğu gibi kalır, buluta hiçbir şey gitmez.
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await seed(page, { 'fagent.portfolio.v1': portfolio([A_NAME]), ...LAYERS });
  await login(page, BOB);
  await uploadCard(page).waitFor({ timeout: 10000 });
  await sleep(2500);
  check('(m) Hesapsız veri + boş hesap: upsert atılmadı (A\'nın verisi B\'nin hesabına gitmedi)', mock.upserts.length === 0);
  check('(m) Onay kartı yedek indirme, yükleme, silme ve çıkış seçeneklerini sunar',
    await uploadCard(page).getByRole('button', { name: /Önce yedeğini indir/ }).count() === 1
    && await uploadCard(page).getByRole('button', { name: /Bu tarayıcıdaki veriyi sil/ }).count() === 1
    && await uploadCard(page).getByRole('button', { name: /Çıkış yap/ }).count() === 1);
  check('(m) Kenar çubuğundaki durum noktası uyarı renginde (karar bekleniyor)',
    await page.locator('.side-account-dot.warn').count() === 1);
  await page.screenshot({ path: `${out}/a5-yukleme-onayi.png` });
  await uploadCard(page).getByRole('button', { name: /Çıkış yap/ }).click();
  await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT'));
  check('(m) Çıkışta hesaba ait olmayan yerel veri olduğu gibi kaldı', (await lsGet(page, 'fagent.portfolio.v1'))?.includes(A_NAME) === true);
  check('(m) Çıkışa kadar hiçbir istek gövdesinde A\'nın verisi yok', !everyBody(mock).includes(A_NAME));

  // m2: B bu sefer "sil" der → yerel veri temizlenir, upsert yok, B boş hesapla başlar.
  await login(page, BOB);
  await uploadCard(page).waitFor({ timeout: 10000 });
  await uploadCard(page).getByRole('button', { name: /Bu tarayıcıdaki veriyi sil/ }).click(); // diyalog kabul edilir
  check('(m) "Sil" sonrası A\'nın verisi bu tarayıcıdan temizlendi',
    await until(async () => !JSON.stringify(await lsDump(page)).includes(A_NAME)));
  check('(m) "Sil" sonrası sahiplik işareti B\'yi gösterir', (await lsGet(page, 'fagent.cloud.owner.v1')) === BOB_UID);
  await sleep(2500);
  check('(m) "Sil" sonrası hâlâ upsert yok', mock.upserts.length === 0);
  check('(m) "Sil" sonrası B onboarding\'e düştü (sahte portföy yok)', await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).count() === 1);

  // m3: B kendi verisini girer → artık kendi hesabına eşitlenir (sahiplik işareti B).
  await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
  await page.fill('#h-name', 'BobKendiVarlik');
  await page.fill('#h-amount', '700');
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  check('(m) "Sil"den sonra B\'nin kendi verisi B\'nin hesabına eşitlendi',
    await until(async () => mock.upserts.some(u => u.uid === BOB_UID && JSON.stringify(u.row).includes('BobKendiVarlik'))));
  check('(m) B\'nin hiçbir yüklemesinde A\'nın verisi yok', !everyBody(mock).includes(A_NAME));
}
{
  // m4: "yükle" açıkça seçilirse veri yüklenir; yalnızca seçimden sonra.
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await seed(page, { 'fagent.portfolio.v1': portfolio(['KendiVerim']) });
  await login(page, 'alice@ornek.com');
  await uploadCard(page).waitFor({ timeout: 10000 });
  await sleep(1500);
  check('(m) "Yükle" seçilmeden upsert yok', mock.upserts.length === 0);
  await uploadCard(page).getByRole('button', { name: /Bu tarayıcıdaki veriyi hesabıma yükle/ }).click();
  check('(m) "Yükle" seçilince veri hesaba yüklendi',
    await until(async () => mock.upserts.some(u => u.uid === USERS['alice@ornek.com'] && JSON.stringify(u.row).includes('KendiVerim'))));
  check('(m) "Yükle"den sonra sahiplik işareti kullanıcıyı gösterir', (await lsGet(page, 'fagent.cloud.owner.v1')) === USERS['alice@ornek.com']);
}
{
  // m5: sahiplik işareti bu hesabı gösteriyorsa (daha önce onaylanmış / bu hesaba ait) onaysız yüklenir.
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await seed(page, { 'fagent.portfolio.v1': portfolio(['SahipliVeri']) });
  // İşaret sayfa yüklendikten SONRA konur (oturumsuz açılışta işaret görülürse yerel veri temizlenir — doğru davranış).
  await page.evaluate(uid => localStorage.setItem('fagent.cloud.owner.v1', uid), USERS['alice@ornek.com']);
  await login(page, 'alice@ornek.com');
  check('(m) İşaret bu hesabı gösteriyorsa onay sorulmadan yüklenir',
    await until(async () => mock.upserts.some(u => JSON.stringify(u.row).includes('SahipliVeri'))));
  check('(m) İşaret bu hesabı gösteriyorsa onay kartı çıkmaz', await uploadCard(page).count() === 0);
}

// =====================================================================================
// (n) PKCE: URL fragment'iyle oturum enjeksiyonu (login CSRF) başarısız olur
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  const attacker = sessionFor(USERS['alice@ornek.com']);
  const hash = `#access_token=${attacker.access_token}&refresh_token=${attacker.refresh_token}&expires_in=3600&token_type=bearer&type=magiclink`;
  await page.goto(CLOUD_BASE + hash, { waitUntil: 'networkidle' });
  await sleep(800);
  check('(n) Enjekte edilmiş hash ile kurban saldırganın hesabına girmedi (GİRİŞ / KAYIT)',
    (await sideText(page)).includes('GİRİŞ / KAYIT') && !(await bodyText(page)).includes('alice@ornek.com'));
  check('(n) Enjekte edilmiş token\'dan oturum kaydedilmedi (sb-*-auth-token yok)',
    !(await lsKeys(page)).some(k => /^sb-.*-auth-token$/.test(k)));
  check('(n) Token\'lar adres çubuğundan (hash) silindi', !(await page.evaluate(() => location.hash)).includes('access_token'));
  check('(n) Enjekte edilen token ile sunucuya sorgu atılmadı', !mock.userTokens.some(t => t.includes(attacker.access_token)));
  check('(n) Enjeksiyon sonrası upsert yok', mock.upserts.length === 0);
}
{
  // Zaten girişli B varken enjekte hash B'nin oturumunu değiştirmez.
  const { page } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await login(page, 'bob@ornek.com');
  await until(async () => (await sideText(page)).includes('bob@ornek.com'));
  const attacker = sessionFor(USERS['alice@ornek.com']);
  await page.goto(CLOUD_BASE + `#access_token=${attacker.access_token}&refresh_token=${attacker.refresh_token}&expires_in=3600&token_type=bearer`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(800);
  check('(n) Girişli kullanıcıda enjekte hash oturumu değiştirmez (hâlâ B)',
    (await sideText(page)).includes('bob@ornek.com') && !(await sideText(page)).includes('alice@ornek.com'));
}
{
  // Şifre sıfırlama isteği de PKCE code_challenge taşır.
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await page.locator('.side-account').click();
  await page.getByRole('button', { name: 'Şifremi unuttum' }).click();
  await page.fill('input[aria-label="E-posta"]', EMAIL);
  await page.getByRole('button', { name: 'Bağlantı gönder' }).click();
  await until(async () => mock.recoverCalls === 1);
  check('(n) Şifre sıfırlama isteği PKCE code_challenge taşır', !!mock.recoverBody?.code_challenge);
}

// =====================================================================================
// (o) yalnızca vergi/hedef/ajan belleği olan yerel veri, bulut kaydıyla sessizce ezilmez
// =====================================================================================
{
  const { page, mock } = await newPage(CLOUD_BASE);
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Bulut Varlığı O']) });
  await open(page, CLOUD_BASE);
  await seed(page, { 'fagent.tax.v1': LAYERS['fagent.tax.v1'], 'fagent.target.v1': LAYERS['fagent.target.v1'] });
  await login(page, EMAIL);
  await page.getByRole('region', { name: 'Senkron çakışması' }).waitFor({ timeout: 10000 });
  await sleep(1500);
  check('(o) Portföysüz ama vergi/hedef içeren yerel veri sessizce silinmedi (çakışma sorulur)',
    JSON.parse((await lsGet(page, 'fagent.tax.v1')) || '{}').hisse === 17
    && JSON.parse((await lsGet(page, 'fagent.target.v1')) || '{}').fon === 60);
  check('(o) Bu çakışmada upsert atılmadı', mock.upserts.length === 0);
}

// =====================================================================================
// (p) çıkmaz: girişsiz Hesap ekranından geri dönüş; şifre sıfırlama bağlantısı Hesap ekranına götürür
// =====================================================================================
{
  const { page } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await page.locator('.side-account').click();
  check('(p) Girişsiz, portföy boşken Hesap ekranında "Hesapsız devam et" var',
    (await page.getByRole('button', { name: 'Hesapsız devam et' }).count()) === 1);
  await page.getByRole('button', { name: 'Hesapsız devam et' }).click();
  check('(p) "Hesapsız devam et" Onboarding\'e döner (yenileme gerekmez)',
    await until(async () => (await page.getByRole('button', { name: 'Karma örnek portföy' }).count()) === 1));
}
{
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await page.waitForTimeout(300);
  // Şifre sıfırlama isteği yerelde PKCE code_verifier (recovery işaretli) bırakır.
  await page.locator('.side-account').click();
  await page.getByRole('button', { name: 'Şifremi unuttum' }).click();
  await page.fill('input[aria-label="E-posta"]', EMAIL);
  await page.getByRole('button', { name: 'Bağlantı gönder' }).click();
  await until(async () => mock.recoverCalls === 1);
  // E-postadaki bağlantı aynı tarayıcıda, Panel açıkken ?code= ile açılır.
  await page.goto(CLOUD_BASE + '?code=sahte-kod', { waitUntil: 'networkidle' });
  check('(p) Şifre sıfırlama bağlantısı doğrudan "Yeni şifre belirle" formunu açar',
    await until(async () => (await page.locator('.card-title', { hasText: 'Yeni şifre belirle' }).count()) === 1));
}

await browser.close();
console.log(failed ? 'FAGENT_AUTH_E2E_FAILED' : 'FAGENT_AUTH_E2E_OK');
process.exit(failed ? 1 : 0);
