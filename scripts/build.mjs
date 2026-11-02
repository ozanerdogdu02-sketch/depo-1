import { build, loadEnv } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { supabaseCspEksikleri } from './csp-kontrol.mjs';

// İstemciye gömülen VITE_* değerlerinde gizli Supabase anahtarı varsa derleme durur.
// Yalnızca publishable/anon anahtar istemciye girebilir (AGENTS.md §0).
const viteEnv = loadEnv(process.env.MODE || 'production', process.cwd(), 'VITE_');
const jwtRole = (v) => {
  const p = v.split('.');
  if (p.length !== 3) return null;
  try { return JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8')).role ?? null; } catch { return null; }
};
for (const [ad, deger] of Object.entries(viteEnv)) {
  const v = String(deger).trim();
  if (v.startsWith('sb_secret_') || jwtRole(v) === 'service_role') {
    console.error(`DERLEME DURDURULDU: ${ad} gizli (secret/service_role) bir Supabase anahtarı içeriyor. ` +
      'İstemciye yalnızca publishable/anon anahtar girebilir.');
    process.exit(1);
  }
}

// Supabase adresi doluysa https zorunlu (http: ya da geçersiz adres: anahtar ve oturum düz metin gider). Boşsa serbest (hesapsız derleme).
const sbUrl = String(viteEnv.VITE_SUPABASE_URL ?? '').trim();
if (sbUrl) {
  let https = false;
  try { https = new URL(sbUrl).protocol === 'https:'; } catch { /* geçersiz */ }
  if (!https) {
    console.error('DERLEME DURDURULDU: VITE_SUPABASE_URL geçerli bir https:// adresi olmalı (boş bırakılırsa hesap özelliği kapalı derlenir).');
    process.exit(1);
  }
}

// Hesap açılıyorsa (URL dolu) proje host'u CSP connect-src'de olmalı; yoksa tarayıcı bağlantıyı SESSİZCE engeller.
// Derlemeyi durdurmaz (CSP'yi dağıtım yapılandırması kurar), yalnız UYARI yazar.
if (sbUrl) {
  const metinler = {};
  for (const ad of ['vercel.json', 'netlify.toml']) metinler[ad] = existsSync(ad) ? readFileSync(ad, 'utf8') : '';
  const eksik = supabaseCspEksikleri(sbUrl, metinler);
  if (eksik.length) {
    console.warn(`UYARI: VITE_SUPABASE_URL (${new URL(sbUrl).hostname}) ${eksik.join(' ve ')} dosyasında connect-src içinde yok; ` +
      'tarayıcı hesap isteklerini CSP ile engeller. docs/devir/kurulum-ve-devir.md → "CSP adımı".');
  }
}

// configFile belirtilmiyor: Vite kök dizindeki vite.config.ts'i kendisi bulup yükler.
// Önceki hâl (configFile:false + inline plugins) vite.config.ts'i tamamen atlıyordu —
// oradaki define/__BUILD_TIME__ hiçbir zaman gerçek prod build'e uygulanmıyordu, bu da
// 2026-09-04'teki beyaz ekranın bir parçasıydı (bkz. main.tsx).
// BUILD_OUT_DIR yalnızca e2e koşucusu içindir (tests/run-e2e.mjs, bulut derlemesi için
// `dist-e2e-cloud`); verilmezse çıktı her zamanki gibi `dist/`'e gider.
await build({
  root: process.cwd(),
  build: { outDir: process.env.BUILD_OUT_DIR || 'dist' },
});
