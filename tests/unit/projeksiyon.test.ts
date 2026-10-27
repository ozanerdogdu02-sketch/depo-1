// Birim testler: src/projection.ts (saf). Tutarlar ve oranlar fixture'dır; tahmin ya da gerçek veri değildir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aylikOran, sonDeger, enflasyonCarpani, reelDeger, projeksiyonYollari, senaryoSonucu,
  stopajSonrasiDeger, turAgirliklari, hedefeUlasmaSuresi, getiriEnflasyonTablosu, siraRiski,
  birlestirKaynak, enflasyonEtiketi, yilSinirla, oranSinirla,
} from '../../src/projection.ts';
import { afterTaxOf } from '../../src/analytics.ts';
import type { PortfolioState, Holding } from '../../src/store.ts';
import { DEFAULT_TAX_RATES, SCENARIO_DEFAULT_RATES_PCT } from '../../src/config/varsayilanlar.ts';

const yakin = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

/* ── Taşıma öncesi App.tsx hesabının BİREBİR kopyası (eşdeğerlik kanıtı) ── */
function eskiProjectFinalValue(start: number, monthly: number, annualPct: number, years: number): number {
  const monthlyRate = Math.pow(1 + annualPct / 100, 1 / 12) - 1;
  let value = start;
  for (let m = 1; m <= years * 12; m++) value = value * (1 + monthlyRate) + monthly;
  return value;
}
function eskiData(start: number, monthly: number, rates: { dusuk: number; orta: number; yuksek: number }, years: number) {
  const monthlyRates = {
    dusuk: Math.pow(1 + rates.dusuk / 100, 1 / 12) - 1,
    orta: Math.pow(1 + rates.orta / 100, 1 / 12) - 1,
    yuksek: Math.pow(1 + rates.yuksek / 100, 1 / 12) - 1,
  };
  const points: { yil: string; dusuk: number; orta: number; yuksek: number }[] = [];
  let vLow = start, vMid = start, vHigh = start;
  for (let m = 0; m <= years * 12; m++) {
    if (m > 0) {
      vLow = vLow * (1 + monthlyRates.dusuk) + monthly;
      vMid = vMid * (1 + monthlyRates.orta) + monthly;
      vHigh = vHigh * (1 + monthlyRates.yuksek) + monthly;
    }
    if (m % 12 === 0) points.push({ yil: `${m / 12}. yıl`, dusuk: Math.round(vLow), orta: Math.round(vMid), yuksek: Math.round(vHigh) });
  }
  return points;
}

test('eşdeğerlik: sonDeger + reelDeger eski hesapla BİREBİR (Object.is) aynı', () => {
  const girdiler: [number, number, number, number, number][] = [
    [0, 5000, 35, 10, 30], [123456.78, 5000, 20, 10, 30], [100000, 0, 50, 30, 29.73],
    [100000, 2500.5, 0, 7, 0], [999999, 100, 200, 1, 200], [50000, 5000, 35, 25, 17.5],
  ];
  for (const [b, k, r, y, e] of girdiler) {
    const eski = eskiProjectFinalValue(b, k, r, y);
    assert.ok(Object.is(sonDeger(b, k, r, y), eski));
    assert.ok(Object.is(reelDeger(eski, e, y), eski / Math.pow(1 + e / 100, y)));
  }
});

test('eşdeğerlik: projeksiyonYollari grafik verisi eski hesapla aynı', () => {
  for (const [b, k, y] of [[0, 5000, 10], [123456.78, 5000, 30], [100000, 0, 1]] as const) {
    const yeni = projeksiyonYollari({ baslangic: b, aylikKatki: k, getiriPct: SCENARIO_DEFAULT_RATES_PCT, yil: y })
      .map(p => ({ ...p, yil: `${p.yil}. yıl` }));
    assert.deepEqual(yeni, eskiData(b, k, SCENARIO_DEFAULT_RATES_PCT, y));
  }
});

test('aylikOran: %20 yıllık → 12 ay sonra tam %20; %0 → 0', () => {
  yakin(Math.pow(1 + aylikOran(20), 12), 1.2, 1e-12);
  assert.equal(aylikOran(0), 0);
});

test('sonDeger: 100.000 TL, %20, katkısız, 1 yıl → 120.000', () => {
  yakin(sonDeger(100000, 0, 20, 1), 120000, 1e-6);
});

test('sonDeger: %0 getiri → başlangıç + katkılar; 0 yıl → başlangıç; negatif getiri azaltır', () => {
  assert.equal(sonDeger(100000, 1000, 0, 2), 124000);
  assert.equal(sonDeger(100000, 1000, 20, 0), 100000);
  yakin(sonDeger(100000, 0, -10, 1), 90000, 1e-6);
  assert.ok(sonDeger(100000, 0, -10, 3) < 100000);
});

test('enflasyonCarpani / reelDeger: %25, 2 yıl → 1,5625; 120.000 → 76.800', () => {
  yakin(enflasyonCarpani(25, 2), 1.5625, 1e-12);
  yakin(reelDeger(120000, 25, 2), 76800, 1e-6);
});

test('reelDeger: enflasyon 0 → nominal; 0 yıl → nominal', () => {
  assert.equal(reelDeger(120000, 0, 10), 120000);
  assert.equal(reelDeger(120000, 50, 0), 120000);
});

test('projeksiyonYollari: 0. yıl başlangıç, nokta sayısı yıl+1; 0 yıl tek nokta', () => {
  const y = projeksiyonYollari({ baslangic: 100000, aylikKatki: 0, getiriPct: { dusuk: 0, orta: 20, yuksek: 50 }, yil: 1 });
  assert.equal(y.length, 2);
  assert.deepEqual(y[0], { yil: 0, dusuk: 100000, orta: 100000, yuksek: 100000 });
  assert.deepEqual(y[1], { yil: 1, dusuk: 100000, orta: 120000, yuksek: 150000 });
  const s = projeksiyonYollari({ baslangic: 5, aylikKatki: 1, getiriPct: { dusuk: 1, orta: 2, yuksek: 3 }, yil: 0 });
  assert.equal(s.length, 1);
});

test('senaryoSonucu: değerler ve kaynak etiketleri', () => {
  const s = senaryoSonucu({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 25 });
  yakin(s.nominal.deger, 120000);
  yakin(s.reel.deger, 120000 / 1.25);
  assert.equal(s.yatirilan.deger, 100000);
  assert.equal(s.yatirilan.kaynak, 'kullanici');
  assert.equal(s.nominal.kaynak, 'varsayim'); // getiri varsayılan: kaynaksız varsayım
  const k = senaryoSonucu({ baslangic: 1, aylikKatki: 1, yil: 1, getiriPct: 1, enflasyonPct: 1,
    kaynaklar: { getiri: 'kullanici', enflasyon: 'resmi' } });
  assert.equal(k.nominal.kaynak, 'kullanici');
  assert.equal(k.reel.kaynak, 'kullanici');
});

test('birlestirKaynak / enflasyonEtiketi', () => {
  assert.equal(birlestirKaynak('resmi', 'resmi'), 'resmi');
  assert.equal(birlestirKaynak('resmi', 'kullanici'), 'kullanici');
  assert.equal(birlestirKaynak('kullanici', 'varsayim', 'resmi'), 'varsayim');
  assert.equal(birlestirKaynak(), 'varsayim');
  assert.equal(enflasyonEtiketi('evds'), 'resmi');
  assert.equal(enflasyonEtiketi('kullanici'), 'kullanici');
  assert.equal(enflasyonEtiketi('varsayim'), 'varsayim');
});

test('stopajSonrasiDeger: tamamı fon, %17,5; 100.000 → 120.000 (kazanç 20.000, vergi 3.500)', () => {
  const r = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 30, agirliklar: { fon: 1 } });
  yakin(r.brut.deger, 120000);
  yakin(r.kazanc.deger, 20000);
  yakin(r.vergi.deger, 3500);
  yakin(r.net.deger, 116500);
  assert.equal(r.agirlikliOranPct.deger, 17.5);
  assert.equal(r.dogrulanmadi, false);
  assert.equal(r.vergi.kaynak, 'varsayim');
});

test('stopajSonrasiDeger: karışım ağırlıklı oran; doğrulanmamış tür işaretlenir; zarar/sıfır kazançta vergi 0', () => {
  const k = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 30, agirliklar: { fon: 50, kripto: 50 } });
  assert.equal(k.agirlikliOranPct.deger, 8.75);
  assert.equal(k.dogrulanmadi, true);
  const z = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: -10, enflasyonPct: 30, agirliklar: { fon: 1 } });
  assert.equal(z.vergi.deger, 0);
  assert.equal(z.net.deger, z.brut.deger);
  const s = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 0, enflasyonPct: 30, agirliklar: { fon: 1 } });
  assert.equal(s.vergi.deger, 0);
});

test('stopajSonrasiDeger: ağırlık yok → oran 0 ama dogrulanmadi=true; kullanıcı oranı etiketi', () => {
  const r = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 30, agirliklar: {} });
  assert.equal(r.vergi.deger, 0);
  assert.equal(r.dogrulanmadi, true);
  const o = { ...DEFAULT_TAX_RATES, fon: 10 };
  const u = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 30, agirliklar: { fon: 1 }, oranlar: o, oranKaynagi: 'kullanici' });
  yakin(u.vergi.deger, 2000);
  assert.equal(u.agirlikliOranPct.kaynak, 'kullanici');
});

test('stopajSonrasiDeger: analytics.afterTaxOf ile aynı vergi (tek fon kalemi)', () => {
  const r = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 30, agirliklar: { fon: 1 } });
  const hold = { id: 'x', name: 'x', type: 'fon', amount: r.brut.deger, costBasis: 100000 } as Holding;
  const s = { holdings: [hold], txns: [], realizedPnl: 0 } as unknown as PortfolioState;
  yakin(afterTaxOf(s, 30)!.tax, r.vergi.deger, 1e-6);
});

test('turAgirliklari: tutar toplamı, geçersiz tutarlar atlanır', () => {
  assert.deepEqual(turAgirliklari([
    { type: 'fon', amount: 10 }, { type: 'fon', amount: 5 }, { type: 'hisse', amount: 0 },
    { type: 'kripto', amount: -3 }, { type: 'doviz', amount: NaN },
  ]), { fon: 15 });
});

test('hedefeUlasmaSuresi: hedef boş → null', () => {
  const g = { baslangic: 1000, aylikKatki: 100, getiriPct: 20 };
  assert.equal(hedefeUlasmaSuresi(g), null);
  assert.equal(hedefeUlasmaSuresi({ ...g, hedef: null }), null);
  assert.equal(hedefeUlasmaSuresi({ ...g, hedef: 0 }), null);
  assert.equal(hedefeUlasmaSuresi({ ...g, hedef: NaN }), null);
});

test('hedefeUlasmaSuresi: %0 getiri, 100 katkı → 1000 TL’den 2000 TL’ye 10 ay; başlangıçta ulaşılmışsa 0', () => {
  const r = hedefeUlasmaSuresi({ baslangic: 1000, aylikKatki: 100, getiriPct: 0, hedef: 2000 })!;
  assert.equal(r.ulasilabilir, true);
  assert.equal(r.ay!.deger, 10);
  assert.equal(r.ay!.kaynak, 'varsayim');
  assert.equal(hedefeUlasmaSuresi({ baslangic: 5000, aylikKatki: 0, getiriPct: 0, hedef: 2000 })!.ay!.deger, 0);
});

test('hedefeUlasmaSuresi: ulaşılamaz (katkısız, negatif getiri) → ay null; reel karşılaştırma süreyi uzatır', () => {
  const u = hedefeUlasmaSuresi({ baslangic: 1000, aylikKatki: 0, getiriPct: -5, hedef: 2000, azamiYil: 10 })!;
  assert.equal(u.ulasilabilir, false);
  assert.equal(u.ay, null);
  const n = hedefeUlasmaSuresi({ baslangic: 1000, aylikKatki: 100, getiriPct: 0, hedef: 2000 })!;
  const r = hedefeUlasmaSuresi({ baslangic: 1000, aylikKatki: 100, getiriPct: 0, hedef: 2000, enflasyonPct: 30 })!;
  assert.ok(r.ay === null || r.ay.deger > n.ay!.deger);
});

test('getiriEnflasyonTablosu: 3×3, köşe hücreler elle hesapla uyumlu', () => {
  const t = getiriEnflasyonTablosu({
    baslangic: 100000, aylikKatki: 0, yil: 1,
    getiriPct: { dusuk: 0, orta: 20, yuksek: 50 }, enflasyonPct: 30,
  });
  assert.equal(t.length, 3);
  assert.ok(t.every(s => s.hucreler.length === 3));
  assert.deepEqual(t[0].hucreler.map(h => h.enflasyonPct), [20, 30, 40]);
  yakin(t[0].hucreler[0].reel.deger, 100000 / 1.2);   // düşük getiri, en düşük enflasyon
  yakin(t[2].hucreler[2].reel.deger, 150000 / 1.4);   // yüksek getiri, en yüksek enflasyon
  yakin(t[1].hucreler[1].reel.deger, 120000 / 1.3);   // orta/orta
  assert.equal(t[1].hucreler[1].reel.kaynak, 'varsayim');
});

test('getiriEnflasyonTablosu: enflasyon 0 → alt sütun 0’a kısılır; kaynak etiketi kullanıcı', () => {
  const t = getiriEnflasyonTablosu({
    baslangic: 100, aylikKatki: 0, yil: 1, getiriPct: { dusuk: 1, orta: 2, yuksek: 3 }, enflasyonPct: 5,
    getiriKaynagi: 'kullanici', kaynaklar: { enflasyon: 'kullanici' },
  });
  assert.deepEqual(t[0].hucreler.map(h => h.enflasyonPct), [0, 5, 15]);
  assert.equal(t[0].hucreler[0].reel.kaynak, 'kullanici');
});

test('siraRiski: aynı ortalama, ters sıra; katkı varken iki sıra farklı sonuç verir', () => {
  const r = siraRiski({ baslangic: 100000, aylikKatki: 5000, yil: 10, ortalamaPct: 30, sapmaPP: 15 });
  assert.deepEqual(r.kotuYillarBasta, [15, 15, 15, 15, 15, 45, 45, 45, 45, 45]);
  assert.deepEqual(r.kotuYillarSonda, [45, 45, 45, 45, 45, 15, 15, 15, 15, 15]);
  const ort = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.equal(ort(r.kotuYillarBasta), 30);
  assert.equal(ort(r.kotuYillarSonda), 30);
  assert.ok(r.fark.deger < 0);
  assert.ok(r.basta.deger > r.sonda.deger);
  yakin(r.fark.deger, r.sonda.deger - r.basta.deger, 1e-6);
  assert.equal(r.basta.kaynak, 'varsayim');
  // deterministik
  assert.deepEqual(siraRiski({ baslangic: 100000, aylikKatki: 5000, yil: 10, ortalamaPct: 30, sapmaPP: 15 }), r);
});

test('siraRiski: katkısızken sıra fark yaratmaz; sapma 0 → sabit getiriyle aynı; 0 yıl → başlangıç', () => {
  const k = siraRiski({ baslangic: 100000, aylikKatki: 0, yil: 6, ortalamaPct: 20, sapmaPP: 10 });
  yakin(k.fark.deger, 0, 1e-6);
  const s = siraRiski({ baslangic: 100000, aylikKatki: 1000, yil: 5, ortalamaPct: 20, sapmaPP: 0 });
  yakin(s.basta.deger, sonDeger(100000, 1000, 20, 5), 1e-6);
  const z = siraRiski({ baslangic: 777, aylikKatki: 1000, yil: 0, ortalamaPct: 20 });
  assert.equal(z.basta.deger, 777);
  assert.deepEqual(z.kotuYillarBasta, []);
});

test('siraRiski: tek sayıda yılda ortadaki yıl ortalama; negatif ortalama ve büyük sapma −99’a kısılır; varsayılan sapma "varsayim"', () => {
  const t = siraRiski({ baslangic: 1000, aylikKatki: 10, yil: 3, ortalamaPct: 10, sapmaPP: 5 });
  assert.deepEqual(t.kotuYillarBasta, [5, 10, 15]);
  const n = siraRiski({ baslangic: 1000, aylikKatki: 10, yil: 2, ortalamaPct: -50, sapmaPP: 80 });
  assert.equal(n.sapmaPP, 49);
  assert.ok(n.kotuYillarBasta.every(x => x >= -99));
  const v = siraRiski({ baslangic: 1000, aylikKatki: 10, yil: 2, ortalamaPct: 20, kaynaklar: { getiri: 'kullanici' } });
  assert.equal(v.fark.kaynak, 'varsayim');
  const u = siraRiski({ baslangic: 1000, aylikKatki: 10, yil: 2, ortalamaPct: 20, sapmaPP: 5, kaynaklar: { getiri: 'kullanici' } });
  assert.equal(u.fark.kaynak, 'kullanici');
});

/* ── Girdi sınırları (güvenlik turu) ── */
const sonlu = (x: number) => Number.isFinite(x);

test('sınır: ekran aralığında (1–30 yıl, 0–200 oran) eski hesapla Object.is eşdeğer', () => {
  for (let y = 1; y <= 30; y += 1) {
    for (const r of [0, 1, 20, 35, 50, 99.5, 200]) {
      assert.ok(Object.is(sonDeger(12345.67, 5000, r, y), eskiProjectFinalValue(12345.67, 5000, r, y)));
      assert.ok(Object.is(reelDeger(1e6, r, y), 1e6 / Math.pow(1 + r / 100, y)));
    }
  }
});

test('sınır: yilSinirla / oranSinirla', () => {
  assert.equal(yilSinirla(NaN), 0);
  assert.equal(yilSinirla(Infinity), 0);
  assert.equal(yilSinirla(-Infinity), 0);
  assert.equal(yilSinirla(1e9), 100);
  assert.equal(yilSinirla(-5), 0);
  assert.equal(yilSinirla(7.9), 7);
  assert.equal(oranSinirla(NaN), 0);
  assert.equal(oranSinirla(Infinity), 0);
  assert.equal(oranSinirla(-150), -99);
  assert.equal(oranSinirla(-100), -99);
  assert.equal(oranSinirla(5000), 1000);
  assert.equal(oranSinirla(35), 35);
});

test('sınır: Infinity/NaN/1e9 yıl → sonlu sonuç, döngü 100 yılda biter', () => {
  for (const y of [Infinity, NaN, 1e9, -Infinity]) {
    assert.ok(sonlu(sonDeger(1000, 100, 20, y)));
    assert.ok(sonlu(reelDeger(1000, 30, y)));
    const yol = projeksiyonYollari({ baslangic: 1, aylikKatki: 1, getiriPct: { dusuk: 1, orta: 2, yuksek: 3 }, yil: y });
    assert.ok(yol.length >= 1 && yol.length <= 101);
    const s = senaryoSonucu({ baslangic: 1, aylikKatki: 1, yil: y, getiriPct: 5, enflasyonPct: 5 });
    assert.ok(sonlu(s.nominal.deger) && sonlu(s.reel.deger) && sonlu(s.yatirilan.deger));
  }
  assert.equal(sonDeger(1000, 100, 20, Infinity), 1000); // sonlu değil → 0 yıl
  assert.equal(projeksiyonYollari({ baslangic: 1, aylikKatki: 1, getiriPct: { dusuk: 1, orta: 2, yuksek: 3 }, yil: 1e9 }).length, 101);
});

test('sınır: hedefeUlasmaSuresi azamiYil Infinity/1e9/NaN sonlu sürede biter', () => {
  for (const a of [Infinity, 1e9, NaN]) {
    const r = hedefeUlasmaSuresi({ baslangic: 1000, aylikKatki: 0, getiriPct: -5, hedef: 2000, azamiYil: a })!;
    assert.equal(r.ulasilabilir, false);
  }
  const b = hedefeUlasmaSuresi({ baslangic: 1000, aylikKatki: 100, getiriPct: 0, hedef: 1e9, azamiYil: 1e9 })!;
  assert.equal(b.ulasilabilir, false); // 100 yıl × 12 × 100 = 120.000 < 1e9
});

test('sınır: getiri -150 → -99’a kısılır, NaN/Infinity üretmez; -100 enflasyon sonsuz bölme üretmez', () => {
  const v = sonDeger(1000, 0, -150, 3);
  assert.ok(sonlu(v) && v > 0 && v < 1);
  assert.equal(v, sonDeger(1000, 0, -99, 3));
  assert.ok(sonlu(reelDeger(1000, -100, 5)));
  assert.equal(reelDeger(1000, -100, 5), reelDeger(1000, -99, 5));
  assert.equal(sonDeger(1000, 0, NaN, 2), 1000);
  assert.equal(enflasyonCarpani(Infinity, 3), 1);
  const t = getiriEnflasyonTablosu({ baslangic: 1000, aylikKatki: 10, yil: 5,
    getiriPct: { dusuk: -150, orta: NaN, yuksek: 5000 }, enflasyonPct: -100 });
  assert.ok(t.every(s => s.hucreler.every(h => sonlu(h.reel.deger) && sonlu(h.enflasyonPct))));
  const sr = siraRiski({ baslangic: 1000, aylikKatki: 10, yil: 1e9, ortalamaPct: -150, sapmaPP: Infinity });
  assert.equal(sr.kotuYillarBasta.length, 100);
  assert.ok(sonlu(sr.basta.deger) && sonlu(sr.fark.deger) && sr.kotuYillarBasta.every(x => x >= -99));
  const sy = siraRiski({ baslangic: 1000, aylikKatki: 10, yil: NaN, ortalamaPct: NaN });
  assert.deepEqual(sy.kotuYillarBasta, []);
});

test('sınır: stopajSonrasiDeger Infinity/NaN/negatif ağırlığı süzer', () => {
  const r = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 30,
    agirliklar: { fon: Infinity, hisse: NaN, kripto: -5 } });
  assert.ok(sonlu(r.vergi.deger) && sonlu(r.net.deger) && sonlu(r.agirlikliOranPct.deger));
  assert.equal(r.vergi.deger, 0);
  assert.equal(r.dogrulanmadi, true); // geçerli ağırlık yok
  const k = stopajSonrasiDeger({ baslangic: 100000, aylikKatki: 0, yil: 1, getiriPct: 20, enflasyonPct: 30,
    agirliklar: { fon: 1, hisse: Infinity } });
  assert.equal(k.agirlikliOranPct.deger, 17.5); // Infinity yok sayıldı
  assert.equal(k.dogrulanmadi, false);
  const t = stopajSonrasiDeger({ baslangic: NaN, aylikKatki: Infinity, yil: 1, getiriPct: 20, enflasyonPct: 30, agirliklar: { fon: 1 } });
  assert.ok(sonlu(t.brut.deger));
});
