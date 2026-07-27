# FAGENT — Uçtan Uca Testler

Playwright tabanlı, gerçek tarayıcıda çalışan uçtan uca testler. Toplam ~188 kontrol,
14 test dosyası. Ürünün kritik akışlarını (portföy, kâr/zarar, CSV, ajan, proaktif
içgörüler, komutla işlem) doğrular.

## Çalıştırma

```bash
cd fagent
npm install                       # playwright-core devDependency olarak gelir
npm run test:e2e                  # dev sunucusunu başlatır, tüm testleri koşar, kapatır
```

## Chromium yolu (ÖNEMLİ)

Testler `playwright-core` kullanır — bu paket tarayıcı İNDİRMEZ, var olan bir Chromium'a
ihtiyaç duyar. Chromium'un yolunu `CHROMIUM_PATH` ile ver:

```bash
# Seçenek 1: Playwright'ın yönettiği tarayıcıyı kur ve yolunu bul
npx playwright install chromium
export CHROMIUM_PATH="$(node -e "console.log(require('playwright-core').chromium.executablePath())")"
npm run test:e2e

# Seçenek 2: Sistemdeki Chromium/Chrome'u kullan
export CHROMIUM_PATH=/usr/bin/chromium   # ya da chrome yolu
npm run test:e2e
```

`CHROMIUM_PATH` ayarlanmazsa varsayılan `/opt/pw-browsers/chromium` denenir (bu, projenin
geliştirildiği sandbox'a özgüdür; başka ortamda büyük olasılıkla yoktur).

## Yapı

- `run-e2e.mjs` — koşucu: Vite'ı port 4200'de başlatır, her testi koşar, özetler, kapatır.
- `e2e/*.mjs` — bağımsız test dosyaları. Her biri dev sunucusuna (`localhost:4200`) bağlanır.
- `.artifacts/` — ekran görüntüleri buraya yazılır (git'e girmez, `.gitignore`'da).

## Yeni test ekleme

Yeni bir davranış eklediğinde ilgili test dosyasına kontrol ekle (ya da yeni bir
`e2e/fagent-<konu>-e2e.mjs` oluştur). Konvansiyon:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});
let failed = false;
const check = (label, ok) => { console.log(`${ok ? '✓' : '✗'} ${label}`); if (!ok) failed = true; };
// ... test adımları ...
process.exit(failed ? 1 : 0);
```

Ekran görüntüsü yazacaksan `process.env.TEST_ARTIFACTS` dizinini kullan (koşucu verir).
