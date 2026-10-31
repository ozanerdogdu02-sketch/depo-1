// Birim testler: kullanıcının stopaj oranı katmanı (src/taxRates.ts). localStorage sahtedir.
// Oranlar ÖRNEKTİR; "ileri tarihli kural" varsayılan tablo parametresiyle simüle edilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'fagent.tax.v1';
const bugun = {} as Record<string, number>;
function kur(baslangic: Record<string, string> = {}) {
  const store: Record<string, string> = { ...baslangic };
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  return store;
}
const bitir = () => { delete (globalThis as { localStorage?: unknown }).localStorage; };

async function yukle() {
  const t = await import('../../src/taxRates.ts');
  const { varsayilanVergiOranlari } = await import('../../src/config/varsayilanlar.ts');
  Object.assign(bugun, varsayilanVergiOranlari());
  return { ...t, bugun: { ...varsayilanVergiOranlari() } as ReturnType<typeof varsayilanVergiOranlari> };
}

test('O1: yalnız değiştirilen sınıf saklanır; varsayılana eşit değer kayıttan silinir', async () => {
  const st = kur();
  try {
    const m = await yukle();
    m.setTaxRate('hisse', 5);
    assert.deepEqual(JSON.parse(st[KEY]), { hisse: 5 });
    m.setTaxRate('hisse', m.bugun.hisse); // varsayılana geri dön
    assert.equal(st[KEY], undefined);
  } finally { bitir(); }
});

test('O1: ileri tarihli yeni kural + başka sınıfı düzenlemiş kullanıcı -> yeni kural görünür, kullanıcının oranı korunur', async () => {
  const st = kur();
  try {
    const m = await yukle();
    m.setTaxRate('kripto', 10); // kullanıcı yalnız kripto'yu değiştirdi
    const yeni = { ...m.bugun, fon: 20 }; // ileride fon kuralı %20'ye çıktı
    const r = m.getTaxRates(yeni);
    assert.equal(r.fon, 20, 'dokunulmamış sınıf yeni kuralı görür');
    assert.equal(r.kripto, 10, 'kullanıcının oranı korunur');
    assert.equal(m.isCustomRate('fon', r, yeni), false);
    assert.equal(m.isCustomRate('kripto', r, yeni), true);
    assert.deepEqual(JSON.parse(st[KEY]), { kripto: 10 });
  } finally { bitir(); }
});

test('O1: eski dolu tablo kaydı göç eder; kullanıcının değiştirdiği değer korunur, varsayılana eşitler çıkar', async () => {
  const m0 = await yukle();
  const eskiTablo = { ...m0.bugun, kripto: 12 }; // eski sürüm tüm tabloyu yazardı
  const st = kur({ [KEY]: JSON.stringify(eskiTablo) });
  try {
    const m = await yukle();
    const r = m.getTaxRates();
    assert.deepEqual(r, { ...m.bugun, kripto: 12 });
    assert.deepEqual(JSON.parse(st[KEY]), { kripto: 12 }); // diske de sadeleşti
    const yeni = { ...m.bugun, fon: 20 };
    assert.equal(m.getTaxRates(yeni).fon, 20);
    assert.equal(m.getTaxRates(yeni).kripto, 12);
  } finally { bitir(); }
});

test('O1: hiç değiştirilmemiş eski tam tablo tamamen silinir; bozuk kayıt varsayılana düşer, fırlatmaz', async () => {
  const m0 = await yukle();
  const st = kur({ [KEY]: JSON.stringify(m0.bugun) });
  try {
    const m = await yukle();
    assert.deepEqual(m.getTaxRates(), m.bugun);
    assert.equal(st[KEY], undefined);
    st[KEY] = '{bozuk';
    assert.deepEqual(m.getTaxRates(), m.bugun);
    st[KEY] = JSON.stringify({ fon: -5, hisse: 'x', kripto: 101, altin: 7 }); // geçersizler yok sayılır
    assert.deepEqual(m.getTaxRates(), { ...m.bugun, altin: 7 });
  } finally { bitir(); }
});

test('D5 (davranış): kullanıcı oranı varsayılanı ezer, resetTaxRates kaydı siler, 0-100 dışı clamp edilir', async () => {
  const st = kur();
  try {
    const m = await yukle();
    assert.equal(m.setTaxRate('fon', 20).fon, 20);
    assert.equal(m.getTaxRates().fon, 20);
    assert.equal(m.isCustomRate('fon', m.getTaxRates()), true);
    assert.equal(m.setTaxRate('fon', 500).fon, 100);
    assert.equal(m.setTaxRate('fon', -3).fon, 0);
    assert.equal(m.setTaxRate('fon', NaN).fon, 0);
    m.resetTaxRates();
    assert.equal(st[KEY], undefined);
    assert.deepEqual(m.getTaxRates(), m.bugun);
  } finally { bitir(); }
});
