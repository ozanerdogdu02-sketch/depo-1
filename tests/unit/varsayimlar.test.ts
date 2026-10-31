// Birim testler: tarih aralıklı piyasa varsayımları (src/config/varsayimlar.json, src/varsayimlar.ts).
// Fixture değerleri ÖRNEKTİR, gerçek piyasa verisi değildir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dogrulaVarsayim, yukleVarsayim, gecerliVarsayim, varsayimDegeri } from '../../src/varsayimlar.ts';
import type { Varsayim, VarsayimDosyasi } from '../../src/varsayimlar.ts';
import * as V from '../../src/config/varsayilanlar.ts';
import { bugunkuVarsayilanOranlar } from '../../src/vergiKurallari.ts';

const v = (p: Partial<Varsayim>): Varsayim => ({ id: 'a', anahtar: 'x', deger: 1, birim: 'yillik_yuzde', baslangic: null, bitis: null, kaynak: null, dogrulandi: false, not: '', ...p });
const dosya = (...varsayimlar: Varsayim[]): VarsayimDosyasi => ({ surum: 1, varsayimlar });

test('eşdeğerlik: bugün için eski sabitlerle birebir aynı (sabit görüntü ve çağrı anı işlevleri)', () => {
  assert.equal(V.VARSAYILAN_ENFLASYON_PCT, 30);
  assert.equal(V.DEFAULT_DEPOSIT_RATE_PCT, 45);
  assert.equal(V.DEFAULT_RISK_FREE_PCT, 45);
  assert.deepEqual(V.SCENARIO_DEFAULT_RATES_PCT, { dusuk: 20, orta: 35, yuksek: 50 });
  assert.equal(V.SIRA_RISKI_SAPMA_PP, 15);
  assert.equal(V.varsayilanEnflasyonPct(), 30);
  assert.equal(V.varsayilanMevduatFaizPct(), 45);
  assert.equal(V.varsayilanRisksizFaizPct(), 45);
  assert.deepEqual(V.senaryoVarsayilanGetirileriPct(), { dusuk: 20, orta: 35, yuksek: 50 });
  assert.equal(V.siraRiskiSapmaPP(), 15);
  assert.equal(V.DRIFT_ABSOLUTE_BAND_PP, 5);
  assert.equal(V.DRIFT_RELATIVE_BAND, 0.25);
  assert.deepEqual(V.varsayilanVergiOranlari(), V.DEFAULT_TAX_RATES);
  assert.deepEqual(V.dogrulanamayanTurler(), V.UNVERIFIED_TAX);
});

test('gerçek varsayım dosyası geçerli; hepsi dogrulandi:false ve not taşıyor', () => {
  const ham = JSON.parse(readFileSync(new URL('../../src/config/varsayimlar.json', import.meta.url), 'utf8'));
  assert.deepEqual(dogrulaVarsayim(ham), []);
  assert.equal(ham.varsayimlar.length, 7);
  for (const r of ham.varsayimlar) {
    assert.equal(r.dogrulandi, false, r.id);
    assert.ok(r.kaynak === null || typeof r.kaynak === 'string');
    assert.ok(/TODO\(muhasebe\)|vergi\/mevzuat iddiası taşımaz/.test(r.not), `${r.id}: not işareti`);
  }
});

test('tarih seçimi: sınır günleri ve kayıt olmayan tarih', () => {
  const d = yukleVarsayim(dosya(
    v({ id: 'a1', deger: 10, bitis: '2026-12-31' }),
    v({ id: 'a2', deger: 20, baslangic: '2027-01-01', bitis: '2027-12-31' }),
  ));
  assert.equal(varsayimDegeri(d, 'x', '2026-12-31'), 10);
  assert.equal(varsayimDegeri(d, 'x', '2027-01-01'), 20);
  assert.equal(varsayimDegeri(d, 'x', '2027-12-31'), 20);
  assert.equal(varsayimDegeri(d, 'x', '2028-01-01'), undefined); // uydurma yok
  assert.equal(gecerliVarsayim(d, 'y', '2027-01-01'), undefined);
  assert.equal(varsayimDegeri(d, 'x', 'bozuk'), undefined);
});

test('doğrulama: çakışma, boşluk, bozuk dosya', () => {
  assert.ok(dogrulaVarsayim(dosya(v({ id: 'a', bitis: '2026-06-30' }), v({ id: 'b', baslangic: '2026-06-30' }))).some(m => m.includes('çakış')));
  assert.ok(dogrulaVarsayim(dosya(v({ id: 'a', bitis: '2026-06-29' }), v({ id: 'b', baslangic: '2026-07-02' }))).some(m => m.includes('boşluk')));
  assert.deepEqual(dogrulaVarsayim(dosya(v({ id: 'a', bitis: '2026-06-30' }), v({ id: 'b', baslangic: '2026-07-01' }))), []);
  assert.deepEqual(dogrulaVarsayim(dosya(v({ id: 'a' }), v({ id: 'b', anahtar: 'y' }))), []);
  assert.ok(dogrulaVarsayim(null).length);
  assert.ok(dogrulaVarsayim({ surum: 2, varsayimlar: [] }).some(m => m.includes('sürüm')));
  assert.ok(dogrulaVarsayim({ surum: 1 }).some(m => m.includes('dizi')));
  assert.ok(dogrulaVarsayim(dosya(v({ deger: NaN }))).length);
  assert.ok(dogrulaVarsayim(dosya(v({ deger: '3' as unknown as number }))).length);
  assert.ok(dogrulaVarsayim(dosya(v({ baslangic: '2026-02-30' }))).length);
  assert.ok(dogrulaVarsayim(dosya(v({ id: 'a' }), v({ id: 'a', anahtar: 'y' }))).some(m => m.includes('yinelenen')));
  assert.ok(dogrulaVarsayim(dosya(v({ dogrulandi: 1 as unknown as boolean }))).length);
  assert.ok(dogrulaVarsayim(dosya(v({})), ['x', 'z']).some(m => m.startsWith('z')));
  assert.throws(() => yukleVarsayim({ surum: 1, varsayimlar: 'x' }), /geçersiz/);
});

test('gece yarısı: çağrı anı yardımcısı tarih değişince yeniden seçer (önbellek tarihe bağlı)', () => {
  const d = { surum: 1, kurallar: [
    { id: 'f1', varlikTuru: 'fon', oranPct: 15, baslangic: null, bitis: '2026-04-30', kaynak: null, dogrulandi: false, oranBilinmiyor: false, not: '' },
    { id: 'f2', varlikTuru: 'fon', oranPct: 17.5, baslangic: '2026-05-01', bitis: null, kaynak: null, dogrulandi: false, oranBilinmiyor: false, not: '' },
  ] };
  assert.equal(bugunkuVarsayilanOranlar(d, ['fon'] as const, '2026-04-30').oranlar.fon, 15);
  assert.equal(bugunkuVarsayilanOranlar(d, ['fon'] as const, '2026-05-01').oranlar.fon, 17.5);
  assert.equal(bugunkuVarsayilanOranlar(d, ['fon'] as const, '2026-04-30').oranlar.fon, 15);
});

test('kaynak etiketi ve öncelik: inflation.ts etiketi ve EVDS/kullanıcı önceliği kaynakta aynen duruyor', () => {
  const src = readFileSync(new URL('../../src/inflation.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("varsayım (TÜİK Eylül 2026 yıllık TÜFE ≈ %29,73, haber kaynaklı, doğrulanmadı; elle güncellenir)"));
  assert.ok(src.includes("source: 'kullanici'") && src.includes("source: 'varsayim'"));
});

test('D3: yüzde/puan değerleri (-100, 1000] dışında reddedilir; sınır değerleri', () => {
  assert.ok(dogrulaVarsayim(dosya(v({ deger: -100 }))).some(m => m.includes('aralığı dışında')));
  assert.ok(dogrulaVarsayim(dosya(v({ deger: 1000.01 }))).some(m => m.includes('aralığı dışında')));
  assert.ok(dogrulaVarsayim(dosya(v({ deger: 4500 }))).length);
  assert.deepEqual(dogrulaVarsayim(dosya(v({ deger: -99.9 }))), []);
  assert.deepEqual(dogrulaVarsayim(dosya(v({ deger: 1000 }))), []);
  assert.deepEqual(dogrulaVarsayim(dosya(v({ deger: 5000, birim: 'adet' }))), []); // yüzde olmayan birim sınırlanmaz
});

test('varsayimDetay: kayıt varsa geriDusuldu false; bitmiş aralıkta en yakın geçmiş, yoksa ilk kayıt, bayrak true', () => {
  const d = yukleVarsayim({ surum: 1, varsayimlar: [
    v({ id: 'a1', anahtar: 'enflasyon_pct', deger: 10, bitis: '2026-12-31' }),
    v({ id: 'a2', anahtar: 'enflasyon_pct', deger: 20, baslangic: '2027-01-01', bitis: '2027-12-31' }),
  ] });
  assert.deepEqual(V.varsayimDetay('enflasyon_pct', '2027-06-01', d), { deger: 20, geriDusuldu: false });
  assert.deepEqual(V.varsayimDetay('enflasyon_pct', '2028-06-01', d), { deger: 20, geriDusuldu: true });
  const sonra = yukleVarsayim({ surum: 1, varsayimlar: [v({ id: 'b', anahtar: 'enflasyon_pct', deger: 7, baslangic: '2030-01-01' })] });
  assert.deepEqual(V.varsayimDetay('enflasyon_pct', '2026-01-01', sonra), { deger: 7, geriDusuldu: true });
  assert.equal(V.varsayimDetay('enflasyon_pct').geriDusuldu, false); // gerçek dosya bugün açık uçlu
});
