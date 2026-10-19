import { build, loadEnv } from 'vite';

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
