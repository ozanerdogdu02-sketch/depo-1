// A-D1-2: SIFIRLA (clearLocalUserData) fiyat geçmişi önbelleğini siler. localData.ts uzantısız içe aktarmalar
// kullandığı için Node'da yüklenemez: (1) gövdede çağrının varlığı kaynak düzeyinde, (2) gerçek davranış
// (pricehistory.v1.* silinir, başka anahtar durur) tarayıcıda fagent-yedek-e2e "SIFIRLA" bloğunda sınanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('clearLocalUserData gövdesi clearPriceHistoryCache() çağırır (SIFIRLA yolu)', () => {
  const kod = readFileSync('src/localData.ts', 'utf8');
  const bas = kod.indexOf('export function clearLocalUserData');
  const son = kod.indexOf('\n}\n', bas);
  assert.ok(bas > 0 && son > bas);
  assert.match(kod.slice(bas, son), /clearPriceHistoryCache\(\)/);
});

test('yedek e2e SIFIRLA bloğu pricehistory silinmesini ve başka anahtarın korunmasını denetler', () => {
  const e2e = readFileSync('tests/e2e/fagent-yedek-e2e.mjs', 'utf8');
  assert.match(e2e, /fagent\.pricehistory\.v1\.bitcoin/);
  assert.match(e2e, /baska\.uygulama\.anahtari/);
});
