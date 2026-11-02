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
    versions: {},    // uid -> portfolios.version (sürümlü mod; bkz. versioned)
    versioned: true, // false: eski veritabanı (version sütunu yok → 42703)
    failWrites: false, // true: portfolios yazmaları 503 döner (internet yok taklidi)
    writes: [],      // { method: 'INSERT'|'PATCH'|'UPSERT', uid, ver }
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
        const u = new URL(url);
        const method = req.method();
        const wantsVersion = (u.searchParams.get('select') || '').includes('version');
        const versionCol404 = () => json(400, { code: '42703', message: 'column portfolios.version does not exist' });
        const eqParam = k => (u.searchParams.get(k) || '').replace(/^eq\./, '');
        if (method === 'GET') {
          const uid = eqParam('user_id');
          const data = mock.rows[uid];
          const accept = req.headers()['accept'] || '';
          if (wantsVersion && !mock.versioned) return versionCol404();
          const item = data === undefined ? undefined : (wantsVersion ? { data, version: mock.versions[uid] ?? 0 } : { data });
          if (accept.includes('vnd.pgrst.object')) {
            return item !== undefined
              ? json(200, item)
              : json(406, { code: 'PGRST116', message: 'no rows' });
          }
          return json(200, item !== undefined ? [item] : []);
        }
        if (mock.failWrites && method !== 'GET') return json(503, { message: 'ag hatasi (taklit)' });
        if (method === 'POST') {
          const body = JSON.parse(req.postData() || '{}');
          const row = Array.isArray(body) ? body[0] : body;
          const isUpsert = u.searchParams.has('on_conflict') || (req.headers()['prefer'] || '').includes('resolution=');
          if (!isUpsert) {
            // düz insert (sürümlü ilk kayıt)
            if (!mock.versioned) return versionCol404();
            if (mock.rows[row.user_id] !== undefined) return json(409, { code: '23505', message: 'duplicate key' });
            mock.writes.push({ method: 'INSERT', uid: row.user_id });
            mock.upserts.push({ uid: row.user_id, row });
            mock.rows[row.user_id] = row.data;
            mock.versions[row.user_id] = 0;
            return json(201, [{ version: 0 }]);
          }
          mock.writes.push({ method: 'UPSERT', uid: row.user_id });
          mock.upserts.push({ uid: row.user_id, row });
          mock.rows[row.user_id] = row.data;
          mock.versions[row.user_id] = (mock.versions[row.user_id] ?? 0) + 1;
          return route.fulfill({ status: 201, body: '' });
        }
        if (method === 'PATCH') {
          const uid = eqParam('user_id');
          const ver = u.searchParams.has('version') ? Number(eqParam('version')) : null;
          if (ver !== null && !mock.versioned) return versionCol404();
          const body = JSON.parse(req.postData() || '{}');
          mock.writes.push({ method: 'PATCH', uid, ver });
          if (mock.rows[uid] === undefined || (ver !== null && (mock.versions[uid] ?? 0) !== ver)) return json(200, []);
          mock.upserts.push({ uid, row: { user_id: uid, ...body } });
          mock.rows[uid] = body.data;
          mock.versions[uid] = (mock.versions[uid] ?? 0) + 1;
          return json(200, [{ version: mock.versions[uid] }]);
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
  'fagent.kaynak.tcmb.tufe.v1': JSON.stringify({ at: 1, v: 41 }),
  'fagent.kaynak.tcmb.kur.v1': JSON.stringify({ at: 1, v: 42 }),
  'fagent.kaynak.kap.v1': JSON.stringify({ surum: 1, kaynak: 'kap', alindi: '2026-01-01T00:00:00.000Z', veri: { bildirimler: [{ no: 1, zaman: '2026-01-01T10:00:00+03:00', kodlar: ['KAPSINAMA'], unvan: 'GIZLI-KAP-ONBELLEK', baslik: 'x' }] } }),
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
  check('(a) Upsert gövdesinde yeni kaynak önbelleği anahtarları (fagent.kaynak.tcmb.*) yok',
    !bodyStr.includes('fagent.kaynak.tcmb.') && !dataKeys.some(k => k.startsWith('fagent.kaynak.')));
  check('(a) Upsert gövdesinde KAP kaynak önbelleği (fagent.kaynak.kap.*) ve içeriği yok',
    !bodyStr.includes('fagent.kaynak.kap.') && !bodyStr.includes('GIZLI-KAP-ONBELLEK') && !dataKeys.includes('fagent.kaynak.kap.v1'));

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
// (c2) G2: bulut satırında geçersiz sayı (eksi maliyet / sayı olmayan tutar): hiçbir şey yazılmaz, upsert atılmaz
// =====================================================================================
for (const [ad, satir] of [
  ['çıplak biçim, eksi costBasis', { onboarded: true, realizedPnl: 0, holdings: [{ id: 'g1', name: 'Bozuk', type: 'fon', amount: 1000, costBasis: -5 }], txns: [] }],
  ['çıplak biçim, metin tutar', { onboarded: true, realizedPnl: 0, holdings: [{ id: 'g1', name: 'Bozuk', type: 'fon', amount: 'abc', costBasis: 5 }], txns: [] }],
  ['yedek biçimi, eksi tutar', { fagentBackup: 1, data: { 'fagent.portfolio.v1': JSON.stringify({ onboarded: true, realizedPnl: 0, holdings: [{ id: 'g1', name: 'Bozuk', type: 'fon', amount: -1, costBasis: 5 }], txns: [] }) } }],
]) {
  const { page, mock } = await newPage(CLOUD_BASE);
  await open(page, CLOUD_BASE);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  await seed(page, LAYERS);
  mock.rows[UID] = satir;
  const before = await lsDump(page);
  await login(page, EMAIL);
  await until(async () => (await sideText(page)).includes(EMAIL), 10000);
  await sleep(2500);
  await page.locator('.side-account').click();
  const sawErr = await until(async () => (await bodyText(page)).includes('Hesaptaki veri tanınmadı'), 5000);
  check(`(c2) ${ad}: kullanıcıya hata gösterildi`, sawErr);
  check(`(c2) ${ad}: localStorage değişmedi`, JSON.stringify(before) === JSON.stringify(await lsDump(page)));
  check(`(c2) ${ad}: Bozuk varlık görünmedi, upsert atılmadı`, (await page.locator('.list-row', { hasText: 'Bozuk' }).count()) === 0 && mock.upserts.length === 0);
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

// =====================================================================================
// KARANTİNA + SÜRÜMLÜ YAZIM (bulut-senkron-arastirma.md 2a: 34+33, 35b, 35c; 2b: 27)
// Hepsi SAHTE Supabase ile sınanır; gerçek projede doğrulanmadı.
// =====================================================================================
const QKEY = 'fagent.quarantine.v1';
const qAll = async page => { const r = await lsGet(page, QKEY); if (!r) return []; const j = JSON.parse(r); return Array.isArray(j) ? j : [j]; };
const qRec = async page => (await qAll(page))[0] ?? null; // en yeni kayıt
// Çıkış (kullanıcının kendi bastığı): hesaba gitmemiş veri varsa önce sorulur; "7 gün bu cihazda sakla ve çık" seçilir.
const askGroup = page => page.getByRole('group', { name: 'Çıkışta hesaba gitmemiş değişiklikler' });
async function leaveKeep(page) {
  await page.locator('.side-account').click();
  await accountCardOf(page).getByRole('button', { name: /Çıkış yap/ }).click();
  await askGroup(page).waitFor({ timeout: 8000 });
  await askGroup(page).getByRole('button', { name: /7 gün bu cihazda sakla ve çık/ }).click();
}
const qCard = page => page.getByRole('region', { name: 'Kurtarılmamış yerel kopya' });
const accountCardOf = page => page.locator('.card').filter({ has: page.locator('.card-title', { hasText: 'Hesabım' }) });
async function addHolding(page, name, amount = '700') {
  if ((await page.locator('#h-name').count()) === 0) await page.locator('.side-nav button', { hasText: /^PANEL$/ }).first().click();
  await page.fill('#h-name', name);
  await page.fill('#h-amount', amount);
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
}
async function signedInWithData(mock, email = EMAIL, names = ['Q Ilk Varlik']) {
  const t = await newPage(CLOUD_BASE, { mock });
  await open(t.page, CLOUD_BASE);
  await seed(t.page, { 'fagent.portfolio.v1': portfolio(names) });
  await login(t.page, email);
  await confirmUpload(t.page);
  await until(async () => mock.upserts.length >= 1);
  await until(async () => (await sideText(t.page)).includes(email));
  await until(async () => (await t.page.locator('#h-name').count()) === 1);
  return t;
}
const dumpHas = async (page, text) => JSON.stringify(await lsDump(page)).includes(text);

// (q1) 35c: internet yokken kullanıcının Çıkış'ı → hesaba gitmemiş değişiklik karantinada; aynı hesapla girişte sorulur
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  mock.failWrites = true;
  await addHolding(page, 'Q1 Gitmeyen Varlik');
  check('(q1) Kayıt başarısız olunca durum "hata"', await until(async () => (await bodyText(page)).includes('Buluta kaydedilemedi') || (await page.locator('.side-account-dot.warn').count()) === 1, 6000));
  await page.locator('.side-account').click();
  await accountCardOf(page).getByRole('button', { name: /Çıkış yap/ }).click();
  await askGroup(page).waitFor({ timeout: 8000 });
  check('(q1) Hesaba gitmemiş veri varken Çıkış ÖNCE sorar (sakla / indir / sil / vazgeç); henüz çıkılmadı',
    await askGroup(page).getByRole('button', { name: /7 gün bu cihazda sakla ve çık/ }).count() === 1
    && await askGroup(page).getByRole('button', { name: /İndir/ }).count() === 1
    && await askGroup(page).getByRole('button', { name: /Sil ve çık/ }).count() === 1
    && await askGroup(page).getByRole('button', { name: /Vazgeç/ }).count() === 1
    && (await sideText(page)).includes(EMAIL) && (await qRec(page)) === null);
  await askGroup(page).getByRole('button', { name: /Vazgeç/ }).click();
  check('(q1) "Vazgeç" oturumu ve veriyi olduğu gibi bırakır',
    (await sideText(page)).includes(EMAIL) && (await lsGet(page, 'fagent.portfolio.v1'))?.includes('Q1 Gitmeyen Varlik') === true && (await qRec(page)) === null);
  await accountCardOf(page).getByRole('button', { name: /Çıkış yap/ }).click();
  await askGroup(page).waitFor({ timeout: 8000 });
  await askGroup(page).getByRole('button', { name: /7 gün bu cihazda sakla ve çık/ }).click();
  check('(q1) Çıkıştan sonra GİRİŞ / KAYIT', await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT')));
  const rec = await qRec(page);
  check('(q1) Hesaba gitmemiş değişiklik silinmedi: karantina kaydı var ve yeni varlığı içerir',
    !!rec && JSON.stringify(rec.data).includes('Q1 Gitmeyen Varlik'));
  check('(q1) Karantina kaydı hesap kimliğinin özetiyle etiketli; e-posta/kullanıcı kimliği düz yazılmamış',
    !!rec && typeof rec.owner === 'string' && rec.owner.length >= 8
    && !JSON.stringify(rec).includes(UID) && !JSON.stringify(rec).includes(EMAIL) && !JSON.stringify(rec).includes('ornek.com'));
  check('(q1) Çıkıştan sonra kullanıcı katmanları yine temizlendi (ortak cihaz)',
    !(await lsKeys(page)).includes('fagent.portfolio.v1') && !(await lsKeys(page)).includes('fagent.cloud.owner.v1'));
  check('(q1) Bulut satırı yeni varlığı İÇERMEZ (kayıt gitmemişti)', !JSON.stringify(mock.rows[UID]).includes('Q1 Gitmeyen Varlik'));
  // Aynı hesapla yeniden giriş → bulut verisi gelir + karantina sorusu
  mock.failWrites = false;
  await login(page, EMAIL);
  await qCard(page).waitFor({ timeout: 12000 });
  check('(q1) Aynı hesapla girişte "indir / hesaba yükle / sil" sorulur',
    await qCard(page).getByRole('button', { name: /İndir/ }).count() === 1
    && await qCard(page).getByRole('button', { name: /Hesabıma yükle/ }).count() === 1
    && await qCard(page).getByRole('button', { name: /Sil/ }).count() === 1);
  check('(q1) Kart sormadan hiçbir şey yazılmadı (karantina duruyor, bulut değişmedi)',
    !!(await qRec(page)) && !JSON.stringify(mock.rows[UID]).includes('Q1 Gitmeyen Varlik'));
  // indir: ayrı dosya, yedek biçiminde
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    qCard(page).getByRole('button', { name: /İndir/ }).click(),
  ]);
  const dlText = await (async () => { const fs = await import('node:fs'); return fs.readFileSync(await dl.path(), 'utf8'); })();
  check('(q1) "İndir" ayrı bir dosya verir (yedek biçimi, kopya içeriği); karantina yine duruyor',
    dl.suggestedFilename().includes('karantina') && dlText.includes('Q1 Gitmeyen Varlik') && dlText.includes('"fagentBackup"') && !!(await qRec(page)));
  // hesaba yükle: bulut satırı kopyayla değişir, karantina silinir
  await qCard(page).getByRole('button', { name: /Hesabıma yükle/ }).click(); // dialog otomatik kabul
  check('(q1) "Hesabıma yükle" bulut satırını kopyayla güncelledi',
    await until(async () => JSON.stringify(mock.rows[UID]).includes('Q1 Gitmeyen Varlik')));
  check('(q1) Yüklemeden sonra karantina silindi', await until(async () => (await lsGet(page, QKEY)) === null));
  check('(q1) Yüklenen kopya bu tarayıcıda görünür',
    await until(async () => (await page.locator('.list-row', { hasText: 'Q1 Gitmeyen Varlik' }).count()) >= 1, 12000));
  // gövde: karantina anahtarı buluta HİÇ girmedi
  const bodies = JSON.stringify(mock.upserts);
  check('(q1) Karantina anahtarı hiçbir bulut gövdesine girmedi', !bodies.includes('quarantine') && !bodies.includes('karantina'));
  check('(q1) Bulut gövdelerinde yalnızca 5 beyaz liste anahtarı var',
    mock.upserts.every(u => Object.keys(u.row.data.data).every(k => WHITELIST.includes(k))));
  check('(q1) Karantina anahtarı sahte Supabase dışına da gitmedi',
    !mock.outside.some(r => (r.url + r.post).includes('quarantine')));
}

// (q2) 35b: başka sekmeden çıkış (oturum düşüşü) hesaba gitmemiş veriyi silmez; "sil" karantinayı kaldırır
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  mock.failWrites = true;
  await addHolding(page, 'Q2 Yarim Varlik');
  await sleep(2500);
  await page.evaluate(ref => {
    const bc = new BroadcastChannel(`sb-${ref}-auth-token`);
    bc.postMessage({ event: 'SIGNED_OUT', session: null });
    bc.close();
  }, FAKE_REF);
  check('(q2) Oturum düşünce kenar çubuğu GİRİŞ / KAYIT', await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT')));
  const rec = await qRec(page);
  check('(q2) Oturum düşüşünde hesaba gitmemiş veri karantinaya alındı', !!rec && JSON.stringify(rec.data).includes('Q2 Yarim Varlik'));
  check('(q2) Ana kullanıcı anahtarları yine temizlendi', !(await lsKeys(page)).includes('fagent.portfolio.v1'));
  mock.failWrites = false;
  await login(page, EMAIL);
  await qCard(page).waitFor({ timeout: 12000 });
  await qCard(page).getByRole('button', { name: /Sil/ }).click();
  check('(q2) "Sil" karantinayı kaldırır', await until(async () => (await lsGet(page, QKEY)) === null));
  check('(q2) "Sil" sonrası kopyanın içeriği cihazda kalmadı', !(await dumpHas(page, 'Q2 Yarim Varlik')));
  check('(q2) "Sil" bulut satırına dokunmadı', !JSON.stringify(mock.rows[UID]).includes('Q2 Yarim Varlik'));
}

// (q3) başka hesapla girişte, (q4) süre dolunca, (q5) SIFIRLA'da ve hesap silmede karantina SİLİNİR
{
  const mock = makeMock();
  mock.rows[USERS['bob@ornek.com']] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Bob Bulut']) });
  const { page } = await signedInWithData(mock);
  const makeQuarantine = async name => {
    mock.failWrites = true;
    await addHolding(page, name);
    await sleep(1800);
    await leaveKeep(page);
    await until(async () => (await qRec(page)) !== null);
    mock.failWrites = false;
  };
  await makeQuarantine('Q3 Test Varlik');
  check('(q3) Hazırlık: karantina var', !!(await qRec(page)));
  // süre dolumu: kaydı 8 gün öncesine çek, aynı hesapla gir
  await page.evaluate(k => { const j = JSON.parse(localStorage.getItem(k)); const a = Array.isArray(j) ? j : [j]; a.forEach(r => { r.savedAt -= 8 * 86400000; }); localStorage.setItem(k, JSON.stringify(a)); }, QKEY);
  await login(page, EMAIL);
  await until(async () => (await sideText(page)).includes(EMAIL));
  await sleep(1500);
  check('(q4) 7 günü dolmuş karantina silinir ve kart çıkmaz', (await lsGet(page, QKEY)) === null && await qCard(page).count() === 0);
  check('(q4) Süresi dolan kopyanın içeriği cihazda kalmadı', !(await dumpHas(page, 'Q3 Test Varlik')));
  // yeni karantina, sonra BAŞKA hesapla giriş
  await addHolding(page, 'Q3 Ikinci Varlik');
  await sleep(1800);
  mock.failWrites = true;
  await addHolding(page, 'Q3 Ucuncu Varlik');
  await sleep(1800);
  await leaveKeep(page);
  await until(async () => (await qRec(page)) !== null);
  mock.failWrites = false;
  check('(q3) Hazırlık: ikinci karantina var', !!(await qRec(page)));
  await login(page, 'bob@ornek.com');
  await until(async () => (await sideText(page)).includes('bob@ornek.com'));
  await sleep(1500);
  check('(q3) Başka hesapla girişte karantina silinir, kart çıkmaz', (await lsGet(page, QKEY)) === null && await qCard(page).count() === 0);
  check('(q3) Başka hesapla girişte önceki hesabın kopyası cihazda kalmadı', !(await dumpHas(page, 'Q3 Ucuncu Varlik')));
}
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  mock.failWrites = true;
  await addHolding(page, 'Q5 Sifirla Varlik');
  await sleep(1800);
  await leaveKeep(page);
  await until(async () => (await qRec(page)) !== null);
  check('(q5) Hazırlık: karantina var', !!(await qRec(page)));
  // Girişsiz yeni kullanım başlar (SIFIRLA düğmesi kurulumdan sonra görünür); karantina bundan etkilenmez.
  await page.getByRole('button', { name: 'Hesapsız devam et' }).click();
  await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
  await page.waitForTimeout(300);
  check('(q5) Girişsiz yeni kullanım karantinayı silmez', !!(await qRec(page)));
  await page.click('text=SIFIRLA');
  check('(q5) SIFIRLA karantinayı siler', await until(async () => (await lsGet(page, QKEY)) === null));
}
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  mock.failWrites = true;
  await addHolding(page, 'Q5b Hesap Silme Varlik');
  await sleep(1800);
  await leaveKeep(page);
  await until(async () => (await qRec(page)) !== null);
  mock.failWrites = false;
  await login(page, EMAIL);
  await qCard(page).waitFor({ timeout: 12000 });
  await page.locator('.side-account').click();
  await page.getByRole('button', { name: /Hesabımı sil/ }).click();
  check('(q5) Hesap silme karantinayı da siler', await until(async () => mock.rpcCalls === 1 && (await lsGet(page, QKEY)) === null));
  check('(q5) Hesap silmeden sonra kopyanın içeriği cihazda kalmadı', !(await dumpHas(page, 'Q5b Hesap Silme Varlik')));
}

// (q6) 34+33: girişliyken SIFIRLA + yeniden kurulum hesaptaki portföyü SORMADAN ezmez
{
  const mock = makeMock();
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q6 Hesap Portfoyu', 'Q6 Ikinci']) });
  const { page, ctx } = await newPage(CLOUD_BASE, { mock });
  const dialogs = [];
  page.removeAllListeners('dialog');
  page.on('dialog', d => { dialogs.push(d.message()); void d.accept(); });
  await open(page, CLOUD_BASE);
  await login(page, EMAIL);
  check('(q6) Hazırlık: hesap portföyü yüklendi', await until(async () => (await page.locator('.list-row', { hasText: 'Q6 Hesap Portfoyu' }).count()) >= 1, 12000));
  const rowBefore = JSON.stringify(mock.rows[UID]);
  const writesBefore = mock.writes.length;
  await page.click('text=SIFIRLA');
  check('(q6) SIFIRLA onay metni olanı söyler (hesaptaki kopya silinmez, yeniden kurulumda seçim sorulur)',
    dialogs.some(m => m.includes('hesab') && m.includes('silinmez') && m.includes('sor')));
  await until(async () => (await page.getByRole('button', { name: 'Karma örnek portföy' }).count()) === 1);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  const region = page.getByRole('region', { name: 'Senkron çakışması' });
  check('(q6) Yeniden kurulumdan sonra çakışma kartı çıkar (hesaptaki kayıt sorulmadan ezilmez)',
    await until(async () => (await region.count()) === 1, 10000));
  await sleep(2500);
  check('(q6) Kullanıcı seçmeden hesaba yazma gitmedi', mock.writes.length === writesBefore && JSON.stringify(mock.rows[UID]) === rowBefore);
  check('(q6) Kartta güvenli seçenek (hesaptakini getir) birincil, bu cihazdakiyle değiştirme ayrı ve onaylı',
    await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).count() === 1);
  await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).click();
  check('(q6) "Hesabımdaki veriyi yükle" hesap portföyünü geri getirir',
    await until(async () => (await page.locator('.list-row', { hasText: 'Q6 Hesap Portfoyu' }).count()) >= 1, 12000));
  await sleep(2000);
  check('(q6) Geri getirme sonrası bulut satırı değişmedi', JSON.stringify(mock.rows[UID]) === rowBefore);
  await ctx.close();
}
{
  // (q6b) kullanıcı "bu cihazdakiyle değiştir" derse yazılır (onayla)
  const mock = makeMock();
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q6b Hesap']) });
  const { page } = await newPage(CLOUD_BASE, { mock });
  await open(page, CLOUD_BASE);
  await login(page, EMAIL);
  await until(async () => (await page.locator('.list-row', { hasText: 'Q6b Hesap' }).count()) >= 1, 12000);
  await page.click('text=SIFIRLA');
  await until(async () => (await page.getByRole('button', { name: 'Karma örnek portföy' }).count()) === 1);
  await page.getByRole('button', { name: 'Karma örnek portföy' }).click();
  const region = page.getByRole('region', { name: 'Senkron çakışması' });
  await region.waitFor({ timeout: 10000 });
  await region.getByRole('button', { name: /bu tarayıcıdaki veriyi hesabıma yükle/i }).click();
  check('(q6b) Açık onayla "bu cihazdakiyle değiştir" hesabı günceller',
    await until(async () => JSON.stringify(mock.rows[UID]).includes('BIST 30') || !JSON.stringify(mock.rows[UID]).includes('Q6b Hesap'), 10000));
}

// (q7) 2b: sürümlü koşullu yazım (sürüm sütunu var)
{
  const mock = makeMock(); // versioned: true
  const { page } = await signedInWithData(mock);
  check('(q7) İlk kayıt düz insert (sürüm 0) ile yapıldı', mock.writes[0]?.method === 'INSERT' && mock.versions[UID] === 0);
  await addHolding(page, 'Q7 Ikinci Varlik');
  check('(q7) Sonraki kayıt koşullu güncelleme (PATCH, version=0) ile yapıldı; sürüm 1 oldu',
    await until(async () => mock.writes.some(w => w.method === 'PATCH' && w.ver === 0) && mock.versions[UID] === 1));
  check('(q7) Normal yazımda upsert kullanılmadı', !mock.writes.some(w => w.method === 'UPSERT'));
  // başka cihaz araya girdi: sürüm ilerledi, içerik farklı
  const other = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q7 Baska Cihaz']) });
  mock.rows[UID] = other; mock.versions[UID] = 5;
  const rowBefore = JSON.stringify(mock.rows[UID]);
  await addHolding(page, 'Q7 Yerel Degisiklik');
  const region = page.getByRole('region', { name: 'Senkron çakışması' });
  check('(q7) Eşleşmeyen sürümde çakışma kartı çıkar', await until(async () => (await region.count()) === 1, 10000));
  check('(q7) Eşleşmeyen sürümde bulut satırı EZİLMEDİ', JSON.stringify(mock.rows[UID]) === rowBefore && mock.versions[UID] === 5);
  const rec = await qRec(page);
  check('(q7) Kaybeden kopya (bu cihazın değişikliği) karantinaya alındı', !!rec && rec.reason === 'surum-cakismasi' && JSON.stringify(rec.data).includes('Q7 Yerel Degisiklik'));
  check('(q7) Kullanıcıya bildirim: kartta bu cihazın değişikliklerinin ayrıca saklandığı yazıyor',
    (await region.innerText()).includes('ayrıca') && (await region.innerText()).includes('7 gün'));
  await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).click();
  check('(q7) Hesaptakini yükleyince başka cihazın verisi görünür', await until(async () => (await page.locator('.list-row', { hasText: 'Q7 Baska Cihaz' }).count()) >= 1, 12000));
  await qCard(page).waitFor({ timeout: 12000 }).catch(() => {});
  check('(q7) Reddedilen kopya silinmedi: aynı hesapla "kurtarılmamış kopya" kartı sorar', await qCard(page).count() === 1);
  await qCard(page).getByRole('button', { name: /Hesabıma yükle/ }).click();
  check('(q7) Kopya hesaba yüklenince bulut satırı kopyayı içerir', await until(async () => JSON.stringify(mock.rows[UID]).includes('Q7 Yerel Degisiklik'), 10000));
  const bodies = JSON.stringify(mock.upserts);
  check('(q7) Sürümlü yolda da karantina anahtarı buluta girmedi', !bodies.includes('quarantine'));
}

// (q7b) 2b: hesapta SÜRÜMLÜ kayıt varken girişte okunan sürüm kullanılır; başka cihaz ilerlerse çakışma
{
  const mock = makeMock();
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q7b Hesap Varligi']) });
  mock.versions[UID] = 3;
  const { page } = await newPage(CLOUD_BASE, { mock });
  await open(page, CLOUD_BASE);
  await login(page, EMAIL);
  check('(q7b) Hazırlık: hesap portföyü yüklendi', await until(async () => (await page.locator('.list-row', { hasText: 'Q7b Hesap Varligi' }).count()) >= 1, 12000));
  await addHolding(page, 'Q7b Yeni Varlik');
  check('(q7b) Okunan sürümle (3) koşullu güncelleme yapıldı; sürüm 4 oldu',
    await until(async () => mock.writes.some(w => w.method === 'PATCH' && w.ver === 3) && mock.versions[UID] === 4));
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q7b Baska Cihaz']) });
  mock.versions[UID] = 9; // başka cihaz hem içeriği hem sürümü ilerletti
  const rowBefore = JSON.stringify(mock.rows[UID]);
  await addHolding(page, 'Q7b Eski Surumle Yazilmaz');
  check('(q7b) Eski sürümle yazım reddedilir: bulut ezilmedi, çakışma kartı çıktı',
    await until(async () => (await page.getByRole('region', { name: 'Senkron çakışması' }).count()) === 1, 10000)
    && JSON.stringify(mock.rows[UID]) === rowBefore && mock.versions[UID] === 9);
}

// (q8) 2b: sürüm sütunu YOKSA (eski veritabanı) bugünkü davranış: düz upsert, hata yok
{
  const mock = makeMock();
  mock.versioned = false;
  const { page } = await signedInWithData(mock);
  await addHolding(page, 'Q8 Eski DB Varlik');
  check('(q8) Sürüm sütunu yokken kayıt düz upsert ile sürer',
    await until(async () => JSON.stringify(mock.rows[UID]).includes('Q8 Eski DB Varlik')) && mock.writes.some(w => w.method === 'UPSERT'));
  check('(q8) Sürüm sütunu yokken hata durumu görünmez', !(await bodyText(page)).includes('Senkron hatası') && (await page.locator('.side-account-dot.warn').count()) === 0);
}

// =====================================================================================
// TUR 2: O1 (iki sekme), O2 (Çıkış önce sorar), O3 (sahibi belirsiz veri), D1, D2, D5 + uyum
// =====================================================================================

// (q9) O1: başka sekmede SIFIRLA yapıldı; bayrağı olmayan sekmede yeniden kurulum hesabı sormadan ezmez
{
  const mock = makeMock();
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q9 Hesap Portfoyu']) });
  const { page: p1, ctx } = await newPage(CLOUD_BASE, { mock });
  await open(p1, CLOUD_BASE);
  await login(p1, EMAIL);
  await until(async () => (await p1.locator('.list-row', { hasText: 'Q9 Hesap Portfoyu' }).count()) >= 1, 12000);
  await sleep(1500);
  const p2 = await ctx.newPage(); // aynı oturum ve depolama, AYRI bellek (SIFIRLA bayrağı yok)
  p2.on('pageerror', err => { console.log('PAGE_ERROR:', err.message); failed = true; });
  p2.on('dialog', d => d.accept());
  await attach(p2, mock, CLOUD_BASE);
  await p2.goto(CLOUD_BASE, { waitUntil: 'networkidle' });
  check('(q9) Hazırlık: ikinci sekme hesap portföyüyle senkron', await until(async () => (await p2.locator('.list-row', { hasText: 'Q9 Hesap Portfoyu' }).count()) >= 1, 12000));
  await sleep(1500);
  const rowBefore = JSON.stringify(mock.rows[UID]);
  const writesBefore = mock.writes.length;
  await p1.click('text=SIFIRLA'); // sekme 1: SIFIRLA (sahiplik işareti silinir)
  check('(q9) Sekme 1: SIFIRLA sahiplik işaretini sildi', await until(async () => (await lsGet(p1, 'fagent.cloud.owner.v1')) === null));
  const onboardBtn = p2.getByRole('button', { name: 'Karma örnek portföy' });
  check('(q9) Sekme 2 sıfırlanmayı gördü (kurulum ekranı)', await until(async () => (await onboardBtn.count()) === 1, 8000));
  await onboardBtn.click(); // sekme 2: bayrağı olmayan sekmede yeniden kurulum
  const region2 = p2.getByRole('region', { name: 'Senkron çakışması' });
  check('(q9) Başka sekmede SIFIRLA sonrası yeniden kurulum çakışma kartını açar (hesap sorulmadan ezilmez)',
    await until(async () => (await region2.count()) === 1, 10000));
  await sleep(2500);
  check('(q9) Hesaptaki kayıt değişmedi, yazma gitmedi', JSON.stringify(mock.rows[UID]) === rowBefore && mock.writes.length === writesBefore);
  await ctx.close();
}

// (q10) O3: sahibi belirsiz veri (girişten önce hesapsız kullanılmış) oturum düşüşünde hesap etiketiyle karantinaya YAZILMAZ
{
  const mock = makeMock();
  const { page } = await newPage(CLOUD_BASE, { mock });
  await open(page, CLOUD_BASE);
  await seed(page, { 'fagent.portfolio.v1': portfolio(['Q10 Sahibi Belirsiz']) });
  await login(page, EMAIL);
  await uploadCard(page).waitFor({ timeout: 10000 }); // bulut boş + sahibi belirsiz veri → onay bekliyor
  await page.evaluate(ref => {
    const bc = new BroadcastChannel(`sb-${ref}-auth-token`);
    bc.postMessage({ event: 'SIGNED_OUT', session: null });
    bc.close();
  }, FAKE_REF);
  check('(q10) Oturum düştü', await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT')));
  await sleep(500);
  check('(q10) Sahibi belirsiz veri hesap etiketiyle karantinaya yazılmadı', (await lsGet(page, QKEY)) === null);
  check('(q10) Kullanıcı katmanları yine temizlendi', !(await lsKeys(page)).includes('fagent.portfolio.v1'));
}

// (q11) O2: "Sil ve çık" kopya bırakmaz; synced veride Çıkış sormaz
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  await page.locator('.side-account').click();
  await accountCardOf(page).getByRole('button', { name: /Çıkış yap/ }).click();
  check('(q11) Hesapla eşit veride Çıkış sormadan çıkar (yalnız gitmemiş veri için sorulur)',
    await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT')) && (await qRec(page)) === null);
}
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  mock.failWrites = true;
  await addHolding(page, 'Q11 Silinecek Varlik');
  await sleep(1800);
  await page.locator('.side-account').click();
  await accountCardOf(page).getByRole('button', { name: /Çıkış yap/ }).click();
  await askGroup(page).waitFor({ timeout: 8000 });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }),
    askGroup(page).getByRole('button', { name: /İndir/ }).click(),
  ]);
  const fs = await import('node:fs');
  check('(q11) Çıkış sorusundaki "İndir" gitmemiş değişikliği yedek dosyası olarak verir; hâlâ girişli',
    fs.readFileSync(await dl.path(), 'utf8').includes('Q11 Silinecek Varlik') && (await sideText(page)).includes(EMAIL));
  await askGroup(page).getByRole('button', { name: /Sil ve çık/ }).click();
  check('(q11) "Sil ve çık" çıkar', await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT')));
  check('(q11) "Sil ve çık" karantina kopyası bırakmaz ve veriyi cihazdan siler', (await lsGet(page, QKEY)) === null && !(await dumpHas(page, 'Q11 Silinecek Varlik')));
}

// (q12) D2: karantina yazılamazsa (yer yok) çıkış DURDURULUR, veri silinmez; kullanıcı bilgilendirilir
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'fagent.quarantine.v1' && window.__qFail) throw new DOMException('quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  mock.failWrites = true;
  await addHolding(page, 'Q12 Yer Yok Varlik');
  await sleep(1800);
  await page.evaluate(() => { window.__qFail = true; });
  await page.locator('.side-account').click();
  await accountCardOf(page).getByRole('button', { name: /Çıkış yap/ }).click();
  await askGroup(page).waitFor({ timeout: 8000 });
  await askGroup(page).getByRole('button', { name: /7 gün bu cihazda sakla ve çık/ }).click();
  check('(q12) Kopya yazılamayınca çıkış yapılmadı ve kullanıcıya bildirildi',
    await until(async () => (await bodyText(page)).includes('Bu cihazda kopya için yer yok'), 8000) && (await sideText(page)).includes(EMAIL));
  check('(q12) Veri silinmedi (portföy yerelde duruyor)', (await lsGet(page, 'fagent.portfolio.v1'))?.includes('Q12 Yer Yok Varlik') === true);
  check('(q12) "İndir" hâlâ sunuluyor', await askGroup(page).getByRole('button', { name: /İndir/ }).count() === 1);
}

// (q13) D1 + uyum: karara bağlanmamış karantinanın üzerine sessizce yazılmaz; kopya saklanamazsa kartta uyarı
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  const bump = async name => {
    mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio([name]) });
    mock.versions[UID] = (mock.versions[UID] ?? 0) + 5;
  };
  await bump('Q13 Baska Cihaz 1');
  await addHolding(page, 'Q13 Ilk Yerel');
  const region = page.getByRole('region', { name: 'Senkron çakışması' });
  await region.waitFor({ timeout: 10000 });
  await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).click();
  await qCard(page).waitFor({ timeout: 12000 });
  check('(q13) Hazırlık: ilk kopya kartta (1 kayıt)', (await qAll(page)).length === 1);
  await bump('Q13 Baska Cihaz 2');
  await addHolding(page, 'Q13 Ikinci Yerel');
  await region.waitFor({ timeout: 10000 });
  const recs = await qAll(page);
  check('(q13) Karara bağlanmamış ilk kopya korunur; ikinci çakışma ikinci kayıt olur',
    recs.length === 2 && JSON.stringify(recs[1].data).includes('Q13 Ilk Yerel') && JSON.stringify(recs[0].data).includes('Q13 Ikinci Yerel'));
  await region.getByRole('button', { name: /Hesabımdaki veriyi yükle/ }).click();
  await qCard(page).waitFor({ timeout: 12000 });
  check('(q13) Kart iki kopyayı da ayrı satırlarda sunar', await qCard(page).getByRole('button', { name: /Sil/ }).count() === 2);
  await qCard(page).getByRole('button', { name: /Sil/ }).first().click();
  check('(q13) Bir kopyayı silmek diğerini silmez', await until(async () => (await qAll(page)).length === 1));
}
{
  const mock = makeMock();
  const { page } = await signedInWithData(mock);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'fagent.quarantine.v1') throw new DOMException('quota', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q13b Baska Cihaz']) });
  mock.versions[UID] = 7;
  await addHolding(page, 'Q13b Yerel');
  const region = page.getByRole('region', { name: 'Senkron çakışması' });
  await region.waitFor({ timeout: 10000 });
  check('(q13b) Sürüm çakışmasında kopya saklanamazsa kartta koşullu uyarı (önce yedek indir) çıkar',
    (await region.innerText()).includes('SAKLANAMADI') && (await region.innerText()).includes('yedeğini indir'));
}

// (q14) D5: çıkışta sürüm kipi sıfırlanır (eski veritabanı → yeni veritabanı geçişinde koşullu yazım yeniden öğrenilir)
{
  const mock = makeMock();
  mock.versioned = false;
  mock.rows[UID] = cloudRowOf({ 'fagent.portfolio.v1': portfolio(['Q14 Hesap']) });
  const { page } = await newPage(CLOUD_BASE, { mock });
  await open(page, CLOUD_BASE);
  await login(page, EMAIL);
  await until(async () => (await page.locator('.list-row', { hasText: 'Q14 Hesap' }).count()) >= 1, 12000);
  await page.locator('.side-account').click();
  await accountCardOf(page).getByRole('button', { name: /Çıkış yap/ }).click();
  await until(async () => (await sideText(page)).includes('GİRİŞ / KAYIT'));
  mock.versioned = true; // veritabanı yükseltildi; aynı sayfa (yenileme yok), başka hesap, boş bulut
  await login(page, 'bob@ornek.com');
  await until(async () => (await sideText(page)).includes('bob@ornek.com'));
  await page.getByRole('button', { name: 'Kendi paramı gireceğim' }).click();
  await addHolding(page, 'Q14 Bob Varlik');
  check('(q14) Çıkıştan sonra sürüm kipi yeniden öğrenildi: yeni hesabın ilk kaydı sürümlü insert ile yapıldı',
    await until(async () => mock.writes.some(w => w.method === 'INSERT' && w.uid === USERS['bob@ornek.com']), 8000));
}

await browser.close();
console.log(failed ? 'FAGENT_AUTH_E2E_FAILED' : 'FAGENT_AUTH_E2E_OK');
process.exit(failed ? 1 : 0);
