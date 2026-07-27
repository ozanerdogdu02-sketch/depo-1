// FAGENT uçtan uca test koşucusu (Playwright, anahtarsız, tarayıcı tabanlı).
// Vite dev sunucusunu başlatır, hazır olmasını bekler, tüm e2e testlerini sırayla
// koşar, sonuçları özetler ve sunucuyu kapatır.
//
// Çalıştırma:
//   npm run test:e2e
//
// Ortam değişkenleri:
//   CHROMIUM_PATH   Chromium çalıştırılabilirinin yolu. Bu depoyu farklı bir ortamda
//                   (ör. Codex) koşuyorsan ayarla. Yoksa `npx playwright install chromium`
//                   ile kurup yolu ver. Bu sandbox'ta varsayılan /opt/pw-browsers/chromium.
//   TEST_ARTIFACTS  Ekran görüntülerinin/geçici dosyaların yazılacağı dizin
//                   (runner otomatik ayarlar).
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const E2E_DIR = join(__dirname, 'e2e');
const ARTIFACTS = join(__dirname, '.artifacts');
const PORT = 4200;
const BASE = `http://localhost:${PORT}/`;

mkdirSync(ARTIFACTS, { recursive: true });

function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(BASE, res => { res.destroy(); resolve(); });
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
    const child = spawn('node', [join(E2E_DIR, file)], {
      env: { ...process.env, TEST_ARTIFACTS: ARTIFACTS },
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
  console.log('▶ Vite dev sunucusu başlatılıyor (port %d)…', PORT);
  const vite = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    cwd: join(__dirname, '..'),
    stdio: 'ignore',
  });

  const cleanup = () => { try { vite.kill('SIGTERM'); } catch { /* yok */ } };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });

  try {
    await waitForServer();
    console.log('✓ Sunucu hazır.\n');
  } catch (e) {
    console.error('✗', e.message);
    cleanup();
    process.exit(1);
  }

  const files = readdirSync(E2E_DIR).filter(f => f.endsWith('-e2e.mjs')).sort();
  let totalPass = 0, totalFail = 0, suitesFailed = 0;

  for (const file of files) {
    const r = await runTest(file);
    totalPass += r.pass; totalFail += r.fail;
    const ok = r.code === 0 && r.fail === 0;
    if (!ok) suitesFailed++;
    console.log(`${ok ? '✓' : '✗'} ${file.padEnd(28)} ${r.pass} ✓ / ${r.fail} ✗`);
    if (!ok) r.out.split('\n').filter(l => l.startsWith('✗')).forEach(l => console.log('   ' + l));
  }

  console.log(`\nTOPLAM: ${totalPass} geçti, ${totalFail} başarısız (${suitesFailed} takım kırık)`);
  cleanup();
  process.exit(suitesFailed > 0 ? 1 : 0);
})();
