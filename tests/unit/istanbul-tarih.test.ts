// A-D4-4: CSV dosya adı tarihi Europe/Istanbul (UTC+3) gününe göre; UTC günü TR 00-03 arası bir önceki günü verirdi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istanbulTarihi } from '../../src/istanbulTarih.ts';

test('istanbulTarihi: UTC 21:30 (TR ertesi gün 00:30) ertesi günü verir; UTC günü ise bir önceki günü verirdi', () => {
  const d = new Date('2026-11-01T21:30:00Z');
  assert.equal(d.toISOString().slice(0, 10), '2026-11-01'); // eski davranış (yanlış gün)
  assert.equal(istanbulTarihi(d), '2026-11-02');
});

test('istanbulTarihi: gün ortası, yıl sonu sınırı, biçim YYYY-AA-GG', () => {
  assert.equal(istanbulTarihi(new Date('2026-06-15T09:00:00Z')), '2026-06-15');
  assert.equal(istanbulTarihi(new Date('2026-12-31T21:00:00Z')), '2027-01-01');
  assert.equal(istanbulTarihi(new Date('2026-12-31T20:59:00Z')), '2026-12-31');
  assert.match(istanbulTarihi(new Date()), /^\d{4}-\d{2}-\d{2}$/);
});

import { readFileSync } from 'node:fs';
import { csvDosyaAdi } from '../../src/istanbulTarih.ts';

test('csvDosyaAdi: UTC 22:30 -> ertesi gün (Europe/Istanbul); csv.ts dosya adını bundan üretir, UTC dilimi kullanmaz', () => {
  assert.equal(csvDosyaAdi('islemler', new Date('2026-11-01T22:30:00Z')), 'fagent-islemler-2026-11-02.csv');
  assert.equal(csvDosyaAdi('varliklar', new Date('2026-11-01T20:30:00Z')), 'fagent-varliklar-2026-11-01.csv');
  const kod = readFileSync('src/csv.ts', 'utf8');
  assert.match(kod, /csvDosyaAdi\('varliklar'\)/);
  assert.match(kod, /csvDosyaAdi\('islemler'\)/);
  assert.doesNotMatch(kod, /toISOString\(\)\.slice/);
});
