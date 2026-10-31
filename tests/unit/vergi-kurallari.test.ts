// Birim testler: tarih aralıklı vergi kuralları (src/config/tax_rules.json, src/vergiKurallari.ts).
// Fixture oranları ÖRNEKTİR, gerçek mevzuat değildir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dogrula, yukle, gecerliKural, varsayilanOranlar, gecerliTarihMi, bugunkuVarsayilanOranlar } from '../../src/vergiKurallari.ts';
import type { VergiKuralDosyasi, VergiKurali } from '../../src/vergiKurallari.ts';
import { DEFAULT_TAX_RATES, UNVERIFIED_TAX, VERGI_KURALLARI, varsayilanVergiOranlari, stopajAciklamasi } from '../../src/config/varsayilanlar.ts';

// Eski gömülü sabitler (taşıma öncesi, git: varsayilanlar.ts) — eşdeğerlik referansı.
const ESKI_ORANLAR = { fon: 17.5, mevduat: 17.5, hisse: 0, kripto: 0, altin: 0, doviz: 0, tahvil: 0, bes: 0, gayrimenkul: 0 };
const ESKI_UNVERIFIED = ['kripto', 'altin', 'doviz', 'tahvil', 'bes', 'gayrimenkul'];

const k = (p: Partial<VergiKurali>): VergiKurali => ({ id: 'a', varlikTuru: 'fon', oranPct: 10, baslangic: null, bitis: null, kaynak: null, dogrulandi: false, oranBilinmiyor: false, not: '', ...p });
const dosya = (...kurallar: VergiKurali[]): VergiKuralDosyasi => ({ surum: 1, kurallar });

test('eşdeğerlik: bugünün tarihi için eski sabitlerle birebir aynı (değer, anahtar sırası, UNVERIFIED sırası)', () => {
  assert.deepEqual(DEFAULT_TAX_RATES, ESKI_ORANLAR);
  assert.deepEqual(Object.keys(DEFAULT_TAX_RATES), Object.keys(ESKI_ORANLAR));
  assert.deepEqual(UNVERIFIED_TAX, ESKI_UNVERIFIED);
});

test('eşdeğerlik: yeni açık uçlu kural tarih fark etmeksizin (2026-05-01 ve sonrası) aynı oranı verir', () => {
  for (const t of ['2026-05-01', '2026-10-31', '2030-01-01', '2099-12-31']) {
    assert.deepEqual(varsayilanOranlar(VERGI_KURALLARI, Object.keys(ESKI_ORANLAR), t).oranlar, ESKI_ORANLAR, t);
  }
});

test('gerçek kural dosyası geçerli; her kural dogrulandi:false; bilinmeyen kaynak null', () => {
  const ham = JSON.parse(readFileSync(new URL('../../src/config/tax_rules.json', import.meta.url), 'utf8'));
  assert.deepEqual(dogrula(ham, Object.keys(ESKI_ORANLAR)), []);
  for (const r of ham.kurallar) {
    assert.equal(r.dogrulandi, false, r.id);
    assert.ok(r.kaynak === null || typeof r.kaynak === 'string');
    assert.ok(/TODO\(muhasebe\)|doğrulanmadı|doğrulanmadığı/.test(r.not), `${r.id}: not doğrulama durumunu söylemeli`);
  }
});

test('fon 2026-05-01 öncesi: kural yok (uydurulmaz), oran 0 ve bilinmiyor sayılır', () => {
  assert.equal(gecerliKural(VERGI_KURALLARI, 'fon', '2026-04-30'), undefined);
  assert.equal(gecerliKural(VERGI_KURALLARI, 'fon', '2026-05-01')?.oranPct, 17.5);
  const r = varsayilanOranlar(VERGI_KURALLARI, ['fon'] as const, '2026-04-30');
  assert.equal(r.oranlar.fon, 0);
  assert.deepEqual(r.bilinmeyen, ['fon']);
});

test('tarih seçimi: sınır günleri (bitis dahil, ertesi gün yeni kural)', () => {
  const d = yukle(dosya(
    k({ id: 'x1', oranPct: 15, bitis: '2026-04-30' }),
    k({ id: 'x2', oranPct: 17.5, baslangic: '2026-05-01', bitis: '2027-12-31' }),
    k({ id: 'x3', oranPct: 20, baslangic: '2028-01-01' }),
  ));
  assert.equal(gecerliKural(d, 'fon', '2000-01-01')?.id, 'x1');
  assert.equal(gecerliKural(d, 'fon', '2026-04-30')?.id, 'x1');
  assert.equal(gecerliKural(d, 'fon', '2026-05-01')?.id, 'x2');
  assert.equal(gecerliKural(d, 'fon', '2027-12-31')?.id, 'x2');
  assert.equal(gecerliKural(d, 'fon', '2028-01-01')?.id, 'x3');
  assert.equal(gecerliKural(d, 'fon', '2099-01-01')?.id, 'x3');
  assert.equal(gecerliKural(d, 'hisse', '2026-06-01'), undefined);
  assert.equal(gecerliKural(d, 'fon', 'bozuk'), undefined);
});

test('doğrulama: çakışma ve boşluk tespit edilir', () => {
  const cakisma = dogrula(dosya(k({ id: 'a', bitis: '2026-06-30' }), k({ id: 'b', baslangic: '2026-06-30' })));
  assert.ok(cakisma.some(m => m.includes('çakış')), cakisma.join('|'));
  const bosluk = dogrula(dosya(k({ id: 'a', bitis: '2026-06-29' }), k({ id: 'b', baslangic: '2026-07-02' })));
  assert.ok(bosluk.some(m => m.includes('boşluk')), bosluk.join('|'));
  const ok = dogrula(dosya(k({ id: 'a', bitis: '2026-06-30' }), k({ id: 'b', baslangic: '2026-07-01' })));
  assert.deepEqual(ok, []);
  // ay sonu geçişi: 28 Şubat 2027 -> 1 Mart
  assert.deepEqual(dogrula(dosya(k({ id: 'a', bitis: '2027-02-28' }), k({ id: 'b', baslangic: '2027-03-01' }))), []);
  // iki açık uçlu kural (null bitis) çakışmadır
  assert.ok(dogrula(dosya(k({ id: 'a' }), k({ id: 'b', baslangic: '2026-01-01' }))).length > 0);
  // farklı türlerin aralıkları birbirini etkilemez
  assert.deepEqual(dogrula(dosya(k({ id: 'a' }), k({ id: 'b', varlikTuru: 'hisse' }))), []);
});

test('doğrulama: bozuk dosya ve alanlar', () => {
  assert.ok(dogrula(null).length);
  assert.ok(dogrula([]).length);
  assert.ok(dogrula({ surum: 2, kurallar: [] }).some(m => m.includes('sürüm')));
  assert.ok(dogrula({ surum: 1 }).some(m => m.includes('dizi')));
  assert.ok(dogrula({ surum: 1, kurallar: [null] }).length);
  assert.ok(dogrula(dosya(k({ oranPct: -1 }))).length);
  assert.ok(dogrula(dosya(k({ oranPct: 101 }))).length);
  assert.ok(dogrula(dosya(k({ oranPct: NaN }))).length);
  assert.ok(dogrula(dosya(k({ baslangic: '2026-02-30' }))).length);
  assert.ok(dogrula(dosya(k({ baslangic: '2026-07-01', bitis: '2026-06-01' }))).some(m => m.includes('>')));
  assert.ok(dogrula(dosya(k({ id: 'a' }), k({ id: 'a', varlikTuru: 'hisse' }))).some(m => m.includes('yinelenen')));
  assert.ok(dogrula(dosya(k({ dogrulandi: 'evet' as unknown as boolean }))).length);
  assert.ok(dogrula(dosya(k({ kaynak: 5 as unknown as string }))).length);
  assert.ok(dogrula(dosya(k()), ['fon', 'hisse']).some(m => m.startsWith('hisse')));
  assert.throws(() => yukle({ surum: 1, kurallar: 'x' }), /geçersiz/);
});

test('gecerliTarihMi', () => {
  assert.equal(gecerliTarihMi('2028-02-29'), true);
  assert.equal(gecerliTarihMi('2027-02-29'), false);
  assert.equal(gecerliTarihMi('2026-1-1'), false);
  assert.equal(gecerliTarihMi(20260101), false);
});

test('D1/D2: önbellek dosya referansına bağlı ve dondurulmuş', () => {
  const a = yukle(dosya(k({ id: 'a', oranPct: 10 })));
  const b = yukle(dosya(k({ id: 'b', oranPct: 99 })));
  assert.equal(bugunkuVarsayilanOranlar(a, ['fon'] as const, '2030-01-01').oranlar.fon, 10);
  assert.equal(bugunkuVarsayilanOranlar(b, ['fon'] as const, '2030-01-01').oranlar.fon, 99); // aynı tarih/tür, farklı dosya
  const r = bugunkuVarsayilanOranlar(a, ['fon'] as const, '2030-01-01');
  assert.throws(() => { (r.oranlar as Record<string, number>).fon = 1; }, TypeError);
  assert.throws(() => { r.bilinmeyen.push('fon'); }, TypeError);
  assert.equal(bugunkuVarsayilanOranlar(a, ['fon'] as const, '2030-01-01').oranlar.fon, 10);
  assert.throws(() => { (varsayilanVergiOranlari() as Record<string, number>).fon = 1; }, TypeError);
});

test('ekran/ajan dayanak metni: bugün eski sabit metinle birebir aynı (türetilmiş)', () => {
  const m = stopajAciklamasi('2026-10-31');
  const app = `Oranlar ${m.dayanak}'na göre varsayılmıştır (${m.ozet}).`;
  assert.equal(app, "Oranlar 27.03.2026 tarihli 11107 sayılı Cumhurbaşkanı Kararı'na göre varsayılmıştır (fon ve 6 aya kadar vadeli TL mevduat %17,5; BIST pay senedi alım-satımında stopaj yok).");
  const ajan = `Oranlar ${m.dayanak}'na göre VARSAYILMIŞTIR (${m.ozet}). `;
  assert.equal(ajan, "Oranlar 27.03.2026 tarihli 11107 sayılı Cumhurbaşkanı Kararı'na göre VARSAYILMIŞTIR (fon ve 6 aya kadar vadeli TL mevduat %17,5; BIST pay senedi alım-satımında stopaj yok). ");
  assert.equal(stopajAciklamasi('2026-04-30').dayanak, null); // fon kuralı yok: dayanak uydurulmaz
});
