import { build } from 'vite';

// configFile belirtilmiyor: Vite kök dizindeki vite.config.ts'i kendisi bulup yükler.
// Önceki hâl (configFile:false + inline plugins) vite.config.ts'i tamamen atlıyordu —
// oradaki define/__BUILD_TIME__ hiçbir zaman gerçek prod build'e uygulanmıyordu, bu da
// 2026-09-04'teki beyaz ekranın bir parçasıydı (bkz. main.tsx).
await build({
  root: process.cwd(),
});
