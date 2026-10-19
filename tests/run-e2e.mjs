// FAGENT uçtan uca test koşucusu (Playwright, anahtarsız, tarayıcı tabanlı).
// Üretim build'ini statik sunucuda açar, hazır olmasını bekler, tüm e2e testlerini sırayla
// koşar, sonuçları özetler ve sunucuyu kapatır.
//
// Çalıştırma:
//   npm run test:e2e
//
// Ortam değişkenleri:
//   CHROMIUM_PATH   Chromium çalıştırılabilirinin yolu. Bu depoyu farklı bir ortamda
//                   (ör. Codex) koşuyorsan ayarla. Yoksa `npx playwright install chromium`
//                   ile kurup yolu ver. Bu sandbox'ta varsayılan /opt/pw-browsers/chromium.
//   E2E_SKIP_BUILD=1  İki derlemeyi atlar (dist/ ve dist-e2e-cloud/ hazırsa). Varsayılan: koşucu
//                   ikisini de kendisi derler.
//   TEST_ARTIFACTS  Ekran görüntülerinin/geçici dosyaların yazılacağı dizin
//                   (runner otomatik ayarlar).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const E2E_DIR = join(__dirname, 'e2e');
const ARTIFACTS = join(__dirname, '.artifacts');
const ROOT = join(__dirname, '..');
// İki derleme, iki port:
//   dist/            — hesapsız varsayılan derleme (Supabase env'leri AÇIKÇA boş), port 4200.
//                      Mevcut tüm testler buna karşı koşar; geliştiricinin .env.local'ı etkilemez.
//   dist-e2e-cloud/  — açıkça SAHTE Supabase değerleriyle derlenir, port 4201. Yalnızca
//                      fagent-auth-e2e.mjs buna karşı koşar (Supabase page.route ile taklit edilir).
// Vite'ta process.env, .env.local'dan önceliklidir; boş string de bu önceliği korur.
const PORT = 4200;
const CLOUD_PORT = 4201;
const BASE = `http://localhost:${PORT}/`;
const CLOUD_BASE = `http://localhost:${CLOUD_PORT}/`;
const FAKE_HOST = 'sahte.supabase.co';
const FAKE_URL = `https://${FAKE_HOST}`;
const FAKE_KEY = 'sb_publishable_e2e_sahte';
const CLOUD_TESTS = new Set(['fagent-auth-e2e.mjs']);

mkdirSync(ARTIFACTS, { recursive: true });

function buildTo(outDir, supabaseUrl, supabaseKey) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      BUILD_OUT_DIR: outDir,
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
    },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(`✗ ${outDir} derlemesi başarısız:\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
}

// dist/ içinde sahte Supabase adresi ya da anahtarı olmamalı (hesapsız derleme gerçekten hesapsız).
function distIsClean() {
  const walk = dir => readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const leaks = walk(join(ROOT, 'dist')).filter(p => {
    const t = readFileSync(p, 'latin1');
    return t.includes(FAKE_HOST) || t.includes(FAKE_KEY);
  });
  return leaks;
}

function waitForServer(base = BASE, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(base, res => { res.destroy(); resolve(); });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Dev sunucusu zamanında ayağa kalkmadı'));
        else setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

function runTest(file) {
  return new Promise(resolve => {
    const cloud = CLOUD_TESTS.has(file);
    const child = spawn('node', [join(E2E_DIR, file)], {
      env: {
        ...process.env,
        TEST_ARTIFACTS: ARTIFACTS,
        E2E_BASE_URL: cloud ? CLOUD_BASE : BASE,
        E2E_DEFAULT_BASE_URL: BASE,
        E2E_FAKE_SUPABASE_HOST: FAKE_HOST,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => {
      const pass = (out.match(/^✓/gm) || []).length;
      const fail = (out.match(/^✗/gm) || []).length;
      resolve({ file, code, pass, fail, out });
    });
  });
}

(async () => {
  if (process.env.E2E_SKIP_BUILD !== '1') {
    console.log('▶ Hesapsız varsayılan derleme → dist/ (Supabase env\'leri boş)…');
    buildTo('dist', '', '');
    console.log('▶ Bulut derlemesi (sahte Supabase) → dist-e2e-cloud/ …');
    rmSync(join(ROOT, 'dist-e2e-cloud'), { recursive: true, force: true });
    buildTo('dist-e2e-cloud', FAKE_URL, FAKE_KEY);
  }
  if (!existsSync(join(ROOT, 'dist-e2e-cloud', 'index.html')) || !existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.error('✗ dist/ ya da dist-e2e-cloud/ yok (E2E_SKIP_BUILD=1 ise önce derle).');
    process.exit(1);
  }
  const leaks = distIsClean();
  if (leaks.length) {
    console.error('✗ dist/ içinde sahte Supabase değeri var — hesapsız derleme temiz değil:\n  ' + leaks.join('\n  '));
    process.exit(1);
  }
  console.log('✓ dist/ içinde sahte Supabase adresi/anahtarı yok.');

  console.log('▶ Statik sunucular başlatılıyor (hesapsız :%d, bulut :%d)…', PORT, CLOUD_PORT);
  const SERVER_RUNNER = join(ROOT, 'scripts', 'e2e-server.mjs');
  const servers = [
    spawn(process.execPath, [SERVER_RUNNER], { cwd: ROOT, env: { ...process.env, E2E_PORT: String(PORT), E2E_ROOT: 'dist' }, stdio: 'ignore' }),
    spawn(process.execPath, [SERVER_RUNNER], { cwd: ROOT, env: { ...process.env, E2E_PORT: String(CLOUD_PORT), E2E_ROOT: 'dist-e2e-cloud' }, stdio: 'ignore' }),
  ];
  const cleanup = () => { for (const v of servers) { try { v.kill('SIGTERM'); } catch { /* yok */ } } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  try {
    await waitForServer(BASE);
    await waitForServer(CLOUD_BASE);
    console.log('✓ Sunucular hazır.\n');
  } catch (e) {
    console.error('✗', e.message);
    cleanup();
    process.exit(1);
  }

  const files = readdirSync(E2E_DIR).filter(f => f.endsWith('-e2e.mjs')).sort();
  let totalPass = 0, totalFail = 0, suitesFailed = 0, authPass = 0;

  for (const file of files) {
    const r = await runTest(file);
    totalPass += r.pass; totalFail += r.fail;
    if (CLOUD_TESTS.has(file)) authPass += r.pass;
    const ok = r.code === 0 && r.fail === 0;
    if (!ok) suitesFailed++;
    console.log(`${ok ? '✓' : '✗'} ${file.padEnd(28)} ${r.pass} ✓ / ${r.fail} ✗`);
    if (!ok) r.out.split('\n').filter(l => /^(✗|PAGE_ERROR)/.test(l)).forEach(l => console.log('   ' + l));
  }

  console.log(`\nTOPLAM: ${totalPass} geçti, ${totalFail} başarısız (${suitesFailed} takım kırık)`);
  console.log(`  = ${totalPass - authPass} (hesapsız derleme) + ${authPass} auth (sahte Supabase, bulut derlemesi)`);
  cleanup();
  process.exit(suitesFailed > 0 ? 1 : 0);
})();
