// Birim testler: src/kaynaklar/* (tip, önbellek, çalıştırıcı, TCMB bağdaştırıcısı).
// Tüm EVDS yanıtları SENTETİK fixture'dır (gerçek EVDS yanıtı değil); kur alan tablosu test içinde verilir.
// Gerçek ağda doğrulanmadı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  kaynakDurumMetni, onbellekGecerli, yenidenDenemeBekleme, devreAcikMi, formatTarih, formatTarihSaat, yapilandirmaHatasi,
} from '../../src/kaynaklar/tip.ts';
import type { KaynakSonucu } from '../../src/kaynaklar/tip.ts';
import { createCalistirici, kaynaklariBagimsizCagir } from '../../src/kaynaklar/kayit.ts';
import type { GetirSonucu, KaynakTanimi } from '../../src/kaynaklar/kayit.ts';
import { onbellekOku, onbellekYaz } from '../../src/kaynaklar/onbellek.ts';
import {
  tufeAyristir, kurAyristir, yanitHatasi, tufeOku, kurOku, eskiTufeOnbelleginiTasi, ESKI_TUFE_ANAHTARI, KUR_ALANLARI,
} from '../../src/kaynaklar/tcmb.ts';
import { createLocalStore } from '../../src/storage/local.ts';
import type { StorageLike } from '../../src/storage/local.ts';
import { ONBELLEK_ANAHTARLARI } from '../../src/kaynaklar/onbellek.ts';
import { fetchInflationPct } from '../../src/evds.ts';

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const yerel = (y: number, a: number, g: number, sa = 0, dk = 0) => new Date(y, a - 1, g, sa, dk);

/* ── tip.ts: durum metni (5 durum) ── */

test('durum metni: guncel -> kaynak, dönem, alındı', () => {
  const s: KaynakSonucu<number> = { kaynak: 'tcmb', durum: 'guncel', veri: 1, donem: '09-2026', alindi: yerel(2026, 10, 27, 14, 5).toISOString() };
  assert.equal(kaynakDurumMetni(s), 'Kaynak: TCMB (EVDS üzerinden) · dönem 09-2026 · alındı 27.10.2026 14:05');
});

test('durum metni: eski -> etiketli anılır, hesaplarda KULLANILMADIĞI ve varsayımın kullanıldığı söylenir', () => {
  const s: KaynakSonucu<number> = { kaynak: 'tcmb', durum: 'eski', veri: 1, donem: '09-2026', alindi: yerel(2026, 10, 26, 9, 0).toISOString(), hata: 'ulasilamadi' };
  assert.equal(kaynakDurumMetni(s), "TCMB'ye (EVDS üzerinden) şu an ulaşılamıyor. Son bilinen değer (dönem 09-2026, alındı 26.10.2026) hesaplarda kullanılmıyor; hesaplar varsayımla yapılıyor (varsayım).");
  const m = kaynakDurumMetni(s);
  assert.ok(m.includes('hesaplarda kullanılmıyor') && m.includes('(varsayım)') && !m.includes('gösteriliyor'));
});

test('durum metni: ulasilamadi (+ çağıranın varsayım cümlesi)', () => {
  const s: KaynakSonucu<number> = { kaynak: 'tcmb', durum: 'ulasilamadi', hata: 'ulasilamadi' };
  assert.equal(kaynakDurumMetni(s), "TCMB'ye (EVDS üzerinden) ulaşılamadı.");
  assert.equal(kaynakDurumMetni(s, { varsayim: 'Enflasyon için varsayım kullanılıyor: %30 (doğrulanmadı).' }),
    "TCMB'ye (EVDS üzerinden) ulaşılamadı. Enflasyon için varsayım kullanılıyor: %30 (doğrulanmadı).");
});

test('durum metni: kapali -> veri kaynağı yapılandırılmamış (anahtar / seri)', () => {
  assert.equal(kaynakDurumMetni({ kaynak: 'tcmb', durum: 'kapali', hata: 'anahtar_yok' }),
    'Veri kaynağı yapılandırılmamış (TCMB (EVDS üzerinden): sunucu anahtarı tanımlı değil).');
  assert.equal(kaynakDurumMetni({ kaynak: 'tcmb', durum: 'kapali', hata: 'seri_dogrulanmadi' }),
    'Veri kaynağı yapılandırılmamış (TCMB (EVDS üzerinden): sunucuda bu seri henüz tanımlı değil).');
});

test('durum metni: veri_yok (mantık dışı) -> gösterilmiyor', () => {
  assert.equal(kaynakDurumMetni({ kaynak: 'tcmb', durum: 'veri_yok', hata: 'mantik_disi' }),
    "TCMB'den (EVDS üzerinden) gelen değer okunamadı; gösterilmiyor.");
});

test('durum metni: yasak kalıp yok (öneri/tavsiye/emir/tahmin)', () => {
  const durumlar: KaynakSonucu<number>[] = [
    { kaynak: 'tcmb', durum: 'guncel', veri: 1, donem: '09-2026', alindi: new Date().toISOString() },
    { kaynak: 'tcmb', durum: 'eski', veri: 1, donem: '09-2026', alindi: new Date().toISOString() },
    { kaynak: 'tcmb', durum: 'ulasilamadi' }, { kaynak: 'tcmb', durum: 'kapali', hata: 'anahtar_yok' },
    { kaynak: 'tcmb', durum: 'veri_yok' }, { kaynak: 'coingecko', durum: 'ulasilamadi' }, { kaynak: 'frankfurter', durum: 'eski', veri: 1 },
  ];
  for (const d of durumlar) {
    const m = kaynakDurumMetni(d).toLocaleLowerCase('tr-TR');
    assert.ok(!/öneri|tavsiye|malısın|tahmin|garanti|kesin/.test(m), m);
  }
});

test('durum metni: eksik alanlarda bozulmaz; guncel ama veri yok -> gösterilmiyor', () => {
  assert.equal(kaynakDurumMetni({ kaynak: 'tcmb', durum: 'guncel', veri: 1 }), 'Kaynak: TCMB (EVDS üzerinden)');
  assert.equal(kaynakDurumMetni({ kaynak: 'tcmb', durum: 'guncel' }), "TCMB'den (EVDS üzerinden) değer okunamadı; gösterilmiyor.");
  assert.equal(kaynakDurumMetni({ kaynak: 'tcmb', durum: 'eski' }), "TCMB'ye (EVDS üzerinden) ulaşılamadı.");
  assert.equal(formatTarih('bozuk'), '');
  assert.equal(formatTarihSaat(undefined), '');
});

/* ── tip.ts: TTL, geri çekilme, devre kesici ── */

test('onbellekGecerli: sınırlar ve gelecekteki damga', () => {
  const t0 = Date.parse('2026-10-27T12:00:00Z');
  assert.equal(onbellekGecerli(new Date(t0).toISOString(), t0 + 1000, 5000), true);
  assert.equal(onbellekGecerli(new Date(t0).toISOString(), t0 + 5000, 5000), true);
  assert.equal(onbellekGecerli(new Date(t0).toISOString(), t0 + 5001, 5000), false);
  assert.equal(onbellekGecerli(new Date(t0 + 9000).toISOString(), t0, 5000), false);
  assert.equal(onbellekGecerli(undefined, t0, 5000), false);
  assert.equal(onbellekGecerli('bozuk', t0, 5000), false);
});

test('yenidenDenemeBekleme: tek yeniden deneme (1 sn), sonra tükendi', () => {
  assert.equal(yenidenDenemeBekleme(0), 1000);
  assert.equal(yenidenDenemeBekleme(1), undefined);
});

test('devreAcikMi: açılış öncesi, süre içi, süre sonrası', () => {
  assert.equal(devreAcikMi(undefined, 1000, 900_000), false);
  assert.equal(devreAcikMi(1000, 1000 + 899_999, 900_000), true);
  assert.equal(devreAcikMi(1000, 1000 + 900_000, 900_000), false);
  assert.equal(yapilandirmaHatasi('anahtar_yok'), true);
  assert.equal(yapilandirmaHatasi('ulasilamadi'), false);
});

/* ── çalıştırıcı: önbellek, yeniden deneme, devre kesici, izolasyon ── */

function tanimUret(getir: KaynakTanimi<number>['getir'], anahtar = 'fagent.test.a'): KaynakTanimi<number> {
  return { kaynak: 'tcmb', anahtar, ttlMs: 1000, getir, dogrula: (v): v is number => typeof v === 'number' };
}
const orta = () => {
  const ls = new MemStorage();
  let simdi = Date.parse('2026-10-27T12:00:00Z');
  const bekler: number[] = [];
  const c = createCalistirici({ depo: createLocalStore(ls), simdi: () => simdi, bekle: async ms => { bekler.push(ms); }, devreKesiciMs: 900_000 });
  return { ls, c, bekler, ilerlet: (ms: number) => { simdi += ms; } };
};

test('çalıştırıcı: başarı önbelleğe yazar; TTL içinde ikinci çağrı ağa gitmez', async () => {
  const { c, ilerlet } = orta();
  let n = 0;
  const t = tanimUret(async () => { n++; return { ok: true, veri: 42, donem: '09-2026' } as GetirSonucu<number>; });
  const a = await c.calistir(t);
  assert.deepEqual([a.durum, a.veri, a.donem], ['guncel', 42, '09-2026']);
  ilerlet(500);
  const b = await c.calistir(t);
  assert.equal(b.durum, 'guncel');
  assert.equal(n, 1);
  assert.equal(b.alindi, a.alindi);
});

test('çalıştırıcı: TTL dolunca kaynağa gider; ulaşılamazsa SİLMEDEN son bilinen değeri (eski) verir', async () => {
  const { c, ilerlet, ls } = orta();
  let basarili = true;
  const t = tanimUret(async () => basarili ? { ok: true, veri: 7, donem: 'D1' } : { ok: false, hata: 'kaynak_hatasi', yenidenDene: false });
  await c.calistir(t);
  ilerlet(2000);
  basarili = false;
  const s = await c.calistir(t);
  assert.deepEqual([s.durum, s.veri, s.donem, s.hata], ['eski', 7, 'D1', 'kaynak_hatasi']);
  assert.ok(ls.getItem('fagent.test.a'), 'önbellek silinmedi');
});

test('çalıştırıcı: önbellek yok + ulaşılamadı -> ulasilamadi, veri yok (uydurma yok)', async () => {
  const { c } = orta();
  const s = await c.calistir(tanimUret(async () => ({ ok: false, hata: 'kaynak_hatasi', yenidenDene: false })));
  assert.deepEqual([s.durum, s.veri], ['ulasilamadi', undefined]);
});

test('çalıştırıcı: yapılandırma hatası yeniden denenmez, devre açmaz, durum kapali', async () => {
  const { c, bekler } = orta();
  let n = 0;
  const t = tanimUret(async () => { n++; return { ok: false, hata: 'anahtar_yok', yenidenDene: false }; });
  const s = await c.calistir(t);
  assert.deepEqual([s.durum, s.hata, n, bekler.length], ['kapali', 'anahtar_yok', 1, 0]);
  await c.calistir(t);
  assert.equal(n, 2, 'devre açılmadı');
});

test('çalıştırıcı: geçici hata 1 kez yeniden denenir (1 sn), sonra devre kesici 15 dk açar', async () => {
  const { c, bekler, ilerlet } = orta();
  let n = 0;
  const t = tanimUret(async () => { n++; return { ok: false, hata: 'ulasilamadi', yenidenDene: true }; });
  const s = await c.calistir(t);
  assert.equal(s.durum, 'ulasilamadi');
  assert.equal(n, 2, 'ilk deneme + 1 yeniden deneme');
  assert.deepEqual(bekler, [1000]);
  await c.calistir(t);
  assert.equal(n, 2, 'devre açıkken kaynağa gidilmedi');
  ilerlet(900_001);
  await c.calistir(t);
  assert.equal(n, 4, 'devre süresi dolunca yeniden denendi');
});

test('çalıştırıcı: yeniden denemede başarı devre kesiciyi açmaz', async () => {
  const { c } = orta();
  let n = 0;
  const t = tanimUret(async () => (++n < 2 ? { ok: false, hata: 'zaman_asimi', yenidenDene: true } : { ok: true, veri: 5 }));
  const s = await c.calistir(t);
  assert.deepEqual([s.durum, s.veri, n], ['guncel', 5, 2]);
});

test('çalıştırıcı: getir fırlatırsa hata fırlatmaz (ulasilamadi)', async () => {
  const { c } = orta();
  const s = await c.calistir(tanimUret(async () => { throw new Error('ağ'); }));
  assert.equal(s.durum, 'ulasilamadi');
});

test('çalıştırıcı: zaman aşımı -> zaman_asimi hatası, istek iptal sinyali alır', async () => {
  const c = createCalistirici({ zamanAsimiMs: 20, bekle: async () => {} });
  let iptal = false;
  const t = tanimUret(sinyal => new Promise((_, red) => { sinyal.addEventListener('abort', () => { iptal = true; red(new Error('iptal')); }); }));
  const s = await c.calistir(t);
  assert.equal(s.hata, 'zaman_asimi');
  assert.equal(iptal, true);
});

test('çalıştırıcı: dış sinyal iptal edilmişse ağa gitmez ve devre açmaz', async () => {
  const { c } = orta();
  const ac = new AbortController(); ac.abort();
  let n = 0;
  const t = tanimUret(async () => { n++; return { ok: true, veri: 1 }; });
  const s = await c.calistir(t, { signal: ac.signal });
  assert.deepEqual([s.durum, n], ['ulasilamadi', 0]);
  const s2 = await c.calistir(t);
  assert.deepEqual([s2.durum, n], ['guncel', 1]);
});

test('çalıştırıcı: bozuk önbellek kaydı yok sayılır (silinmez), başarılı okuma üzerine yazar', async () => {
  const { c, ls } = orta();
  ls.setItem('fagent.test.a', '{bozuk');
  const s = await c.calistir(tanimUret(async () => ({ ok: true, veri: 3 })));
  assert.equal(s.durum, 'guncel');
  assert.notEqual(ls.getItem('fagent.test.a'), '{bozuk');
});

test('önbellek: yanlış kaynak / yanlış sürüm / geçersiz veri okunmaz; depo yoksa güvenli', async () => {
  const ls = new MemStorage();
  const depo = createLocalStore(ls);
  const sayi = (v: unknown): v is number => typeof v === 'number';
  assert.equal(await onbellekYaz(depo, 'k', { surum: 1, kaynak: 'tcmb', alindi: '2026-10-27T12:00:00.000Z', veri: 1 }), true);
  assert.equal((await onbellekOku(depo, 'k', 'tcmb', sayi))?.veri, 1);
  assert.equal(await onbellekOku(depo, 'k', 'coingecko', sayi), undefined);
  ls.setItem('k', JSON.stringify({ surum: 2, kaynak: 'tcmb', alindi: '2026-10-27T12:00:00.000Z', veri: 1 }));
  assert.equal(await onbellekOku(depo, 'k', 'tcmb', sayi), undefined);
  ls.setItem('k', JSON.stringify({ surum: 1, kaynak: 'tcmb', alindi: 'bozuk', veri: 1 }));
  assert.equal(await onbellekOku(depo, 'k', 'tcmb', sayi), undefined);
  assert.equal(await onbellekOku(undefined, 'k', 'tcmb', sayi), undefined);
  assert.equal(await onbellekYaz(undefined, 'k', { surum: 1, kaynak: 'tcmb', alindi: 'x', veri: 1 }), false);
});

test('kayıt defteri: bir kaynak reddetse bile diğerleri sonuç verir', async () => {
  const r = await kaynaklariBagimsizCagir({
    a: { kaynak: 'tcmb', calistir: async () => ({ kaynak: 'tcmb', durum: 'guncel', veri: 1 }) },
    b: { kaynak: 'coingecko', calistir: async () => { throw new Error('beklenmedik'); } },
  });
  assert.equal(r.a.durum, 'guncel');
  assert.deepEqual([r.b.kaynak, r.b.durum], ['coingecko', 'ulasilamadi']);
});

/* ── tcmb.ts: ayrıştırma ── */

// 14 ardışık ay: 08-2025 ... 09-2026 (gerçek ay etiketleri; yıllık değişim 09-2025 -> 09-2026).
const TUFE_SIMDI = Date.parse('2026-10-27T12:00:00Z');
const tufeEtiket = (i: number) => { const t = 2025 * 12 + 7 + i; return `${String((t % 12) + 1).padStart(2, '0')}-${Math.floor(t / 12)}`; };
function tufeSatirlari(from = 1000, to = 1450) {
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < 14; i++) {
    const v = i === 0 ? from * 0.98 : i === 1 ? from : from + ((to - from) * (i - 1)) / 12;
    items.push({ Tarih: tufeEtiket(i), TP_FG_J0: v.toFixed(2), UNIXTIME: { $numberLong: '0' } });
  }
  return items;
}

test('tufeAyristir: endeksten yıllık değişim (1000 -> 1450 = %45,0), dönem son satır', () => {
  const r = tufeAyristir(tufeSatirlari(), TUFE_SIMDI);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.veri.annualPct, 45); assert.equal(r.donem, '09-2026'); }
});

test('tufeAyristir: eksik seri / sıfır taban -> okunamadi; akıl dışı -> mantik_disi', () => {
  assert.deepEqual(tufeAyristir([{ Tarih: '01-2026', TP_FG_J0: '1000' }]), { ok: false, hata: 'okunamadi' });
  assert.deepEqual(tufeAyristir(undefined), { ok: false, hata: 'okunamadi' });
  assert.deepEqual(tufeAyristir(tufeSatirlari(1000, 900000), TUFE_SIMDI), { ok: false, hata: 'mantik_disi' });
  assert.deepEqual(tufeAyristir(tufeSatirlari(1000, 100), TUFE_SIMDI), { ok: false, hata: 'mantik_disi' });
});

test('tufeAyristir: boş/metin değerli satırlar ayıklanır, virgüllü ondalık okunur', () => {
  const it = tufeSatirlari();
  it.push({ Tarih: '10-2026', TP_FG_J0: null }, { Tarih: '11-2026', TP_FG_J0: '' });
  const r = tufeAyristir(it, TUFE_SIMDI);
  assert.ok(r.ok && r.donem === '09-2026');
  const virgul = tufeSatirlari().map(x => ({ ...x, TP_FG_J0: String(x.TP_FG_J0).replace('.', ',') }));
  const r2 = tufeAyristir(virgul, TUFE_SIMDI);
  assert.ok(r2.ok && r2.veri.annualPct === 45);
});

test('tufeAyristir (A-D3-1): tam seri; ortada eksik ay yıllık değeri KAYDIRMAZ', () => {
  const tam = tufeAyristir(tufeSatirlari(), TUFE_SIMDI);
  assert.ok(tam.ok && tam.veri.annualPct === 45);
  const ortada = tufeSatirlari().filter((_, i) => i !== 6); // 02-2026 yok; son ile geçen yılın aynı ayı (09-2025) duruyor
  const r = tufeAyristir(ortada, TUFE_SIMDI);
  assert.ok(r.ok, 'ortadaki eksik ay okunabilir seriyi bozmaz');
  if (r.ok) { assert.equal(r.veri.annualPct, 45); assert.equal(r.donem, '09-2026'); }
});

test('tufeAyristir (A-D3-1): geçen yılın aynı ayı yoksa (baştaki eksik) okunamadi, 14 aya bölüp etiketlemez', () => {
  const bas = tufeSatirlari().filter((_, i) => i !== 1); // 09-2025 yok
  assert.deepEqual(tufeAyristir(bas, TUFE_SIMDI), { ok: false, hata: 'okunamadi' });
  const bos = tufeSatirlari().map((x, i) => i === 1 ? { ...x, TP_FG_J0: null } : x);
  assert.deepEqual(tufeAyristir(bos, TUFE_SIMDI), { ok: false, hata: 'okunamadi' });
  const bozukEtiket = tufeSatirlari().map(x => ({ ...x, Tarih: 'bozuk' }));
  assert.deepEqual(tufeAyristir(bozukEtiket, TUFE_SIMDI), { ok: false, hata: 'okunamadi' });
});

test('tufeAyristir (G1): "YYYY-M", "YYYY-MM" ve "AA-YYYY" etiketleri okunur; dönem etiketi tek biçime (AA-YYYY) çevrilir', () => {
  const bicim = (f: (y: number, m: number) => string) => tufeSatirlari().map((x, i) => {
    const t = 2025 * 12 + 7 + i;
    return { ...x, Tarih: f(Math.floor(t / 12), (t % 12) + 1) };
  });
  for (const f of [(y: number, m: number) => `${y}-${m}`, (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`, (y: number, m: number) => `${String(m).padStart(2, '0')}-${y}`, (y: number, m: number) => `${m}-${y}`]) {
    const r = tufeAyristir(bicim(f), TUFE_SIMDI);
    assert.ok(r.ok, `okunmalı: ${bicim(f)[13].Tarih}`);
    if (r.ok) { assert.equal(r.veri.annualPct, 45); assert.equal(r.donem, '09-2026'); }
  }
  // ay sınırı 1-12; bozuk etiketli satır OKUNMAZ (atlanır: dönem o satıra kayamaz, bir önceki aya düşer)
  for (const kotu of ['2026-0', '2026-13', '13-2026', '0-2026', '2026/9', '9-26']) {
    const r = tufeAyristir(tufeSatirlari().map((x, i) => i === 13 ? { ...x, Tarih: kotu } : x), TUFE_SIMDI);
    assert.ok(r.ok && r.donem === '08-2026', kotu);
  }
});

test('tufeAyristir (A-D3-2): son dönem bugünden 3 aydan eskiyse veri yok sayılır; 3 ay sınırı geçerli', () => {
  assert.deepEqual(tufeAyristir(tufeSatirlari(), Date.parse('2026-12-10T12:00:00Z')), { ok: true, veri: { annualPct: 45 }, donem: '09-2026' });
  assert.deepEqual(tufeAyristir(tufeSatirlari(), Date.parse('2027-01-10T12:00:00Z')), { ok: false, hata: 'mantik_disi' });
});

test('tufeOku (A-D3-3): önbellekteki akıl dışı değer guncel sayılmaz', async () => {
  const { c } = orta();
  const bozuk = JSON.stringify({ surum: 1, kaynak: 'tcmb', donem: '09-2026', alindi: new Date(TUFE_SIMDI).toISOString(), veri: { annualPct: 99999 } });
  const ls = new MemStorage();
  ls.setItem(ONBELLEK_ANAHTARLARI.tcmbTufe, bozuk);
  const c2 = createCalistirici({ depo: createLocalStore(ls), simdi: () => TUFE_SIMDI, bekle: async () => {} });
  const s = await tufeOku({ calistirici: c2, fetchFn: async () => yanit(502, {}), simdiMs: TUFE_SIMDI });
  assert.notEqual(s.durum, 'guncel');
  assert.equal(s.veri, undefined);
  void c;
});

test('eskiTufeOnbelleginiTasi (A-D3-3): akıl dışı eski değer taşınmaz', async () => {
  const ls = new MemStorage();
  ls.setItem(ESKI_TUFE_ANAHTARI, JSON.stringify({ reading: { annualPct: 99999, periodLabel: '09-2026' }, storedAt: TUFE_SIMDI }));
  assert.equal(await eskiTufeOnbelleginiTasi(createLocalStore(ls)), 'taninmadi');
  assert.equal(ls.getItem(ONBELLEK_ANAHTARLARI.tcmbTufe), null);
});

// SENTETİK kur alan tablosu (gerçek EVDS seri kodu değildir).
const SENTETIK_ALANLAR = { SENTETIK_USD_A: { para: 'USD', tur: 'alis' as const }, SENTETIK_USD_S: { para: 'USD', tur: 'satis' as const } };

test('kurAyristir: her para için son gözlem; boş günler atlanır', () => {
  const r = kurAyristir([
    { Tarih: '20-10-2026', SENTETIK_USD_A: '40,00', SENTETIK_USD_S: '40,10' },
    { Tarih: '21-10-2026', SENTETIK_USD_A: null, SENTETIK_USD_S: null },
    { Tarih: '22-10-2026', SENTETIK_USD_A: '41,00', SENTETIK_USD_S: '41,10' },
  ], SENTETIK_ALANLAR);
  assert.ok(r.ok);
  if (r.ok) { assert.deepEqual(r.veri, { USD: { alis: 41, satis: 41.1 } }); assert.equal(r.donem, '22-10-2026'); }
});

test('kurAyristir: günlük sapma eşiği dışı -> mantik_disi; alan tablosu boş -> okunamadi', () => {
  const sapma = [{ Tarih: '1', SENTETIK_USD_A: '40' }, { Tarih: '2', SENTETIK_USD_A: '60' }];
  assert.deepEqual(kurAyristir(sapma, SENTETIK_ALANLAR), { ok: false, hata: 'mantik_disi' });
  assert.deepEqual(kurAyristir([{ Tarih: '1', SENTETIK_USD_A: '40' }], {}), { ok: false, hata: 'okunamadi' });
  assert.deepEqual(kurAyristir([{ Tarih: '1', BASKA: '40' }], SENTETIK_ALANLAR), { ok: false, hata: 'okunamadi' });
  assert.deepEqual(kurAyristir([{ Tarih: '1', SENTETIK_USD_A: '-3' }], SENTETIK_ALANLAR), { ok: false, hata: 'okunamadi' });
});

test('kur alan tablosu: doğrulanmadığı için BOŞ (uydurma seri kodu yok)', () => {
  assert.deepEqual(KUR_ALANLARI, {});
});

test('yanitHatasi: 503 anahtar_yok/seri_dogrulanmadi yeniden denenmez; 502 denenir; 429/4xx denenmez', () => {
  assert.deepEqual(yanitHatasi(503, { error: 'anahtar_yok' }), { hata: 'anahtar_yok', yenidenDene: false });
  assert.deepEqual(yanitHatasi(503, { error: 'seri_dogrulanmadi' }), { hata: 'seri_dogrulanmadi', yenidenDene: false });
  assert.deepEqual(yanitHatasi(502, {}), { hata: 'ulasilamadi', yenidenDene: true });
  assert.deepEqual(yanitHatasi(502, null), { hata: 'ulasilamadi', yenidenDene: true });
  assert.deepEqual(yanitHatasi(502, { error: 'zaman_asimi' }), { hata: 'zaman_asimi', yenidenDene: true });
  assert.deepEqual(yanitHatasi(502, { error: 'kaynak_hatasi' }), { hata: 'kaynak_hatasi', yenidenDene: true });
  assert.deepEqual(yanitHatasi(502, { error: 'okunamadi' }), { hata: 'okunamadi', yenidenDene: false });
  assert.deepEqual(yanitHatasi(502, { error: 'kaynak_reddetti' }), { hata: 'kaynak_hatasi', yenidenDene: false });
  assert.deepEqual(yanitHatasi(429, {}), { hata: 'sinir_asildi', yenidenDene: false });
  assert.deepEqual(yanitHatasi(400, { error: 'gecersiz_seri' }), { hata: 'kaynak_hatasi', yenidenDene: false });
});

/* ── tcmb.ts: sahte fetch ile uçtan uca (bağdaştırıcı) ── */

const yanit = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

test('tufeOku: istek yalnız seri taşır (tarih, portföy, sembol yok); başarıda guncel + önbellek', async () => {
  const { c } = orta();
  const urller: string[] = [];
  const s = await tufeOku({ calistirici: c, fetchFn: async u => { urller.push(u); return yanit(200, { items: tufeSatirlari() }); }, simdiMs: TUFE_SIMDI });
  assert.deepEqual([s.durum, s.veri?.annualPct, s.donem], ['guncel', 45, '09-2026']);
  assert.equal(urller.length, 1);
  assert.equal(urller[0], '/api/evds?series=TP.FG.J0');
});

test('tufeOku: 503 anahtar_yok -> kapali; 502 -> ulasilamadi (yeniden denemeli); ağ kopması -> ulasilamadi', async () => {
  const a = orta();
  const k = await tufeOku({ calistirici: a.c, fetchFn: async () => yanit(503, { error: 'anahtar_yok' }) });
  assert.deepEqual([k.durum, k.hata], ['kapali', 'anahtar_yok']);
  const b = orta();
  let n = 0;
  const u = await tufeOku({ calistirici: b.c, fetchFn: async () => { n++; return yanit(502, {}); } });
  assert.deepEqual([u.durum, n], ['ulasilamadi', 2]);
  const d = orta();
  const x = await tufeOku({ calistirici: d.c, fetchFn: async () => { throw new TypeError('ağ'); } });
  assert.equal(x.durum, 'ulasilamadi');
});

test('tufeOku: akıl dışı / eksik yanıt -> veri_yok (uydurma sayı yok), yeniden denenmez', async () => {
  const a = orta();
  let n = 0;
  const s = await tufeOku({ calistirici: a.c, fetchFn: async () => { n++; return yanit(200, { items: tufeSatirlari(1000, 900000) }); }, simdiMs: TUFE_SIMDI });
  assert.deepEqual([s.durum, s.hata, s.veri, n], ['veri_yok', 'mantik_disi', undefined, 1]);
  const b = orta();
  const e = await tufeOku({ calistirici: b.c, fetchFn: async () => yanit(200, { items: [{ Tarih: '01-2026', TP_FG_J0: '1000' }] }) });
  assert.equal(e.durum, 'veri_yok');
  const g = orta();
  const j = await tufeOku({ calistirici: g.c, fetchFn: async () => new Response('html', { status: 200 }) });
  assert.equal(j.durum, 'veri_yok');
});

test('tufeOku: TTL sonrası kaynak çökerse eski + dönem + alındı', async () => {
  const { c, ilerlet } = orta();
  await tufeOku({ calistirici: c, fetchFn: async () => yanit(200, { items: tufeSatirlari() }), simdiMs: TUFE_SIMDI });
  ilerlet(13 * 60 * 60 * 1000);
  const s = await tufeOku({ calistirici: c, fetchFn: async () => yanit(502, {}) });
  assert.deepEqual([s.durum, s.veri?.annualPct, s.donem], ['eski', 45, '09-2026']);
  assert.ok(kaynakDurumMetni(s).includes('Son bilinen değer (dönem 09-2026'));
});

test('kurOku: tablo=kur isteği sembol/portföy taşımaz; sunucu seri_dogrulanmadi derse kapali', async () => {
  const { c } = orta();
  const urller: string[] = [];
  const s = await kurOku({ calistirici: c, fetchFn: async u => { urller.push(u); return yanit(503, { error: 'seri_dogrulanmadi' }); } });
  assert.deepEqual([s.durum, s.hata], ['kapali', 'seri_dogrulanmadi']);
  assert.equal(urller[0], '/api/evds?tablo=kur');
});

test('kurOku: (sentetik alan tablosuyla) başarı -> guncel kur tablosu', async () => {
  const { c } = orta();
  const s = await kurOku({
    calistirici: c, kurAlanlari: SENTETIK_ALANLAR,
    fetchFn: async () => yanit(200, { items: [{ Tarih: '22-10-2026', SENTETIK_USD_A: '41,00', SENTETIK_USD_S: '41,10' }] }),
  });
  assert.deepEqual([s.durum, s.veri, s.donem], ['guncel', { USD: { alis: 41, satis: 41.1 } }, '22-10-2026']);
});

/* ── göç: eski önbellek ── */

test('göç: eski fagent.evds.v1 yeni biçime taşınır, eski anahtar yalnız kopyadan sonra silinir', async () => {
  const ls = new MemStorage();
  const depo = createLocalStore(ls);
  const storedAt = Date.parse('2026-10-27T10:00:00Z');
  ls.setItem(ESKI_TUFE_ANAHTARI, JSON.stringify({ reading: { annualPct: 31.2, periodLabel: '09-2026', fetchedAt: 'x' }, storedAt }));
  assert.equal(await eskiTufeOnbelleginiTasi(depo), 'tasindi');
  assert.equal(ls.getItem(ESKI_TUFE_ANAHTARI), null);
  const k = JSON.parse(ls.getItem(ONBELLEK_ANAHTARLARI.tcmbTufe)!);
  assert.deepEqual([k.surum, k.kaynak, k.donem, k.alindi, k.veri], [1, 'tcmb', '09-2026', new Date(storedAt).toISOString(), { annualPct: 31.2 }]);
});

test('göç: tanınmayan eski kayıt dokunulmadan kalır; yeni anahtar varsa ezilmez; kayıt yoksa yok', async () => {
  const ls = new MemStorage();
  const depo = createLocalStore(ls);
  assert.equal(await eskiTufeOnbelleginiTasi(depo), 'yok');
  assert.equal(await eskiTufeOnbelleginiTasi(undefined), 'yok');
  ls.setItem(ESKI_TUFE_ANAHTARI, JSON.stringify({ at: 1, v: 40 })); // auth e2e'nin tohumladığı biçim
  assert.equal(await eskiTufeOnbelleginiTasi(depo), 'taninmadi');
  assert.equal(ls.getItem(ESKI_TUFE_ANAHTARI), JSON.stringify({ at: 1, v: 40 }));
  ls.setItem(ESKI_TUFE_ANAHTARI, JSON.stringify({ reading: { annualPct: 10, periodLabel: 'A' }, storedAt: 1 }));
  ls.setItem(ONBELLEK_ANAHTARLARI.tcmbTufe, 'MEVCUT');
  assert.equal(await eskiTufeOnbelleginiTasi(depo), 'mevcut');
  assert.equal(ls.getItem(ONBELLEK_ANAHTARLARI.tcmbTufe), 'MEVCUT');
  assert.ok(ls.getItem(ESKI_TUFE_ANAHTARI), 'eski kayıt silinmedi');
});

/* ── evds.ts: mevcut imza korunur ── */

test('fetchInflationPct: hata fırlatmaz; localStorage/ağ yoksa undefined', async () => {
  const eskiFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError('ağ yok'); }) as typeof fetch;
  try {
    const ac = new AbortController(); ac.abort(); // yeniden deneme beklemesine girmesin
    assert.equal(await fetchInflationPct(ac.signal), undefined);
  } finally { globalThis.fetch = eskiFetch; }
});

/* ── O2 (istemci): devre kesici yalnız gerçek yukarı akış arızasında ── */

test('O2: sunucu "kaynak_reddetti" (yukarı akış 4xx) dönerse yeniden deneme ve 15 dk devre kesici YOK', async () => {
  const { c, bekler } = orta();
  let n = 0;
  const f = async () => { n++; return yanit(502, { error: 'kaynak_reddetti' }); };
  const s = await tufeOku({ calistirici: c, fetchFn: f });
  assert.deepEqual([s.durum, s.hata, n, bekler.length], ['ulasilamadi', 'kaynak_hatasi', 1, 0]);
  await tufeOku({ calistirici: c, fetchFn: f });
  assert.equal(n, 2, 'devre açılmadı, kaynağa tekrar gidildi');
});

/* ── D4: önbellek kur kaydında alt alanlar sonlu sayı olmalı ── */

test('D4/Y3: kur önbelleğinde boş nesne ya da alis/satis sayı değilse kayıt yok sayılır ve kaynağa gidilir', async () => {
  const { c, ls } = orta();
  const kayit = (veri: unknown) => JSON.stringify({ surum: 1, kaynak: 'tcmb', donem: 'D', alindi: '2026-10-27T12:00:00.000Z', veri });
  let n = 0;
  const f = async () => { n++; return yanit(503, { error: 'seri_dogrulanmadi' }); };
  for (const bozuk of [{}, { USD: { alis: 'x' } }, { USD: { alis: -1 } }, { USD: 5 }, { USD: [1] }, [1], { USD: { satis: null } }]) {
    ls.setItem(ONBELLEK_ANAHTARLARI.tcmbKur, kayit(bozuk));
    const s = await kurOku({ calistirici: c, fetchFn: f });
    assert.equal(s.durum, 'kapali', JSON.stringify(bozuk));
  }
  assert.equal(n, 7, 'her bozuk kayıtta (boş nesne dâhil) kaynağa gidildi');
  ls.setItem(ONBELLEK_ANAHTARLARI.tcmbKur, kayit({ USD: { alis: 41, satis: 41.1 } }));
  const iyi = await kurOku({ calistirici: c, fetchFn: f });
  assert.deepEqual([iyi.durum, n], ['guncel', 7]);
});
