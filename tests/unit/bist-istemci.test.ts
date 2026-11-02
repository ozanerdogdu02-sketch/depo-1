// Birim testler: src/kaynaklar/bist.ts. Sahte fetch; yanıt biçimi sunucunun süzdüğü biçimin TAKLİDİDİR (SENTETİK; gerçek bülten değil).
// Semboller uydurmadır (ORNKA vb.). Bülten biçimi DOĞRULANMADI; gerçek Borsa İstanbul yanıtıyla denenmedi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  bistOku, bistSuz, bistMakullukUygula, makulMu, fiyatSec, bistGuncelMi, bistVeriMi, beklenenBultenTarihi,
} from '../../src/kaynaklar/bist.ts';
import type { BistVeri } from '../../src/kaynaklar/bist.ts';
import { createCalistirici } from '../../src/kaynaklar/kayit.ts';
import { createLocalStore } from '../../src/storage/local.ts';
import type { StorageLike } from '../../src/storage/local.ts';
import { ONBELLEK_ANAHTARLARI } from '../../src/kaynaklar/onbellek.ts';
import { kaynakDurumMetni } from '../../src/kaynaklar/tip.ts';
import { beklenenBultenTarihi as sunucuBeklenen } from '../../netlify/functions/bist.mjs';
import { BACKED_UP_KEYS } from '../../src/backup.ts';

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const orta = () => {
  const ls = new MemStorage();
  const depo = createLocalStore(ls);
  let simdi = Date.parse('2026-10-29T17:00:00Z');
  const c = createCalistirici({ depo, simdi: () => simdi, bekle: async () => {}, devreKesiciMs: 900_000 });
  return { ls, depo, c, ilerlet: (ms: number) => { simdi += ms; } };
};
const yanit = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const sunucu = (tarih = '2026-10-29', satirlar: Array<[string, number]> = [['ORNKA', 12.5], ['ORNKB', 100], ['ORNKC', 7.25]], beklenen = '2026-10-29') =>
  ({ tarih, beklenen, satirlar: satirlar.map(([kod, kapanis]) => ({ kod, kapanis })) });

test('ağ isteği PARAMETRESİZ: adres tam "/api/bist", init yalnız signal; portföy sembolü ağa girmez, süzme tarayıcıda', async () => {
  const { c, depo } = orta();
  const cagrilar: Array<{ url: string; init: Record<string, unknown> | undefined }> = [];
  const s = await bistOku({ calistirici: c, depo, fetchFn: async (url, init) => { cagrilar.push({ url, init: init as Record<string, unknown> }); return yanit(200, sunucu()); } });
  assert.equal(cagrilar.length, 1);
  assert.equal(cagrilar[0].url, '/api/bist');
  assert.deepEqual(Object.keys(cagrilar[0].init ?? {}), ['signal']);
  assert.ok(!cagrilar[0].url.includes('?'));
  assert.deepEqual([s.durum, s.donem], ['guncel', '29.10.2026']);
  const portfoy = ['ornkb', ' ORNKZ ', 'ORNKB'];
  const satirlar = bistSuz(s.veri!, portfoy);
  assert.deepEqual(satirlar.map(x => [x.kod, x.durum, x.kapanis]), [['ORNKB', 'var', 100], ['ORNKZ', 'veri_yok', undefined]]);
  assert.equal(satirlar[1].not, 'Bültende bulunamadı.');
  assert.ok(!JSON.stringify(cagrilar).includes('ORNKB') && !JSON.stringify(cagrilar).includes('ORNKZ'));
  assert.equal(cagrilar.length, 1);
});

test('önbellek: fagent.kaynak.bist.v1; TTL içinde ağa gidilmez; anahtar yedek/buluta girmez', async () => {
  const { ls, c, depo, ilerlet } = orta();
  let n = 0;
  const fetchFn = async () => { n++; return yanit(200, sunucu()); };
  await bistOku({ calistirici: c, depo, fetchFn });
  assert.ok(ls.m.has('fagent.kaynak.bist.v1'));
  assert.equal(ONBELLEK_ANAHTARLARI.bistKapanis, 'fagent.kaynak.bist.v1');
  ilerlet(59 * 60_000);
  await bistOku({ calistirici: c, depo, fetchFn });
  assert.equal(n, 1);
  ilerlet(2 * 60_000);
  await bistOku({ calistirici: c, depo, fetchFn });
  assert.equal(n, 2);
  assert.ok(!(BACKED_UP_KEYS as readonly string[]).some(k => k.includes('kaynak')));
});

test('durumlar: 503 kapali -> yapılandırılmamış metni; 502 ulasilamadi (eski varsa etiketli); kaynak_reddetti yeniden denenmez; okunamadi -> veri_yok', async () => {
  const a = orta();
  let n = 0;
  const k = await bistOku({ calistirici: a.c, depo: a.depo, fetchFn: async () => { n++; return yanit(503, { error: 'kapali' }); } });
  assert.deepEqual([k.durum, k.hata, n], ['kapali', 'kapali', 1]);
  assert.equal(kaynakDurumMetni(k), 'Veri kaynağı yapılandırılmamış (Borsa İstanbul: bu kaynak sunucuda etkin değil).');
  const b = orta();
  const u = await bistOku({ calistirici: b.c, depo: b.depo, fetchFn: async () => { throw new TypeError('ağ'); } });
  assert.deepEqual([u.durum, kaynakDurumMetni(u)], ['ulasilamadi', "Borsa İstanbul'a ulaşılamadı."]);
  const c2 = orta();
  await bistOku({ calistirici: c2.c, depo: c2.depo, fetchFn: async () => yanit(200, sunucu()) });
  c2.ilerlet(2 * 3600_000);
  const e = await bistOku({ calistirici: c2.c, depo: c2.depo, fetchFn: async () => yanit(502, { error: 'ulasilamadi' }) });
  assert.equal(e.durum, 'eski');
  const d = orta();
  let m = 0;
  const r = await bistOku({ calistirici: d.c, depo: d.depo, fetchFn: async () => { m++; return yanit(502, { error: 'kaynak_reddetti' }); } });
  assert.deepEqual([r.hata, m], ['kaynak_reddetti', 1]);
  // üretimde bülten biçimi doğrulanmadığı için sunucu okunamadi döner -> veri_yok, sayı yok
  const f = orta();
  let q = 0;
  const v = await bistOku({ calistirici: f.c, depo: f.depo, fetchFn: async () => { q++; return yanit(502, { error: 'okunamadi', bicim: 'pdf', neden: 'bicim_dogrulanmadi' }); } });
  assert.deepEqual([v.durum, v.veri, q], ['veri_yok', undefined, 1]);
  assert.equal(kaynakDurumMetni(v), "Borsa İstanbul'dan gelen değer okunamadı; gösterilmiyor.");
});

test('şema bozuk yanıt -> veri_yok: kötü kod, sıfır/negatif/dizgi fiyat, tarih biçimi, eksik alan', async () => {
  for (const govde of [
    { foo: 1 }, sunucu('29.10.2026'), { ...sunucu(), satirlar: 'x' },
    sunucu('2026-10-29', [['<b>', 1]]), sunucu('2026-10-29', [['ORNKA', 0]]), sunucu('2026-10-29', [['ORNKA', -3]]),
    { tarih: '2026-10-29', beklenen: '2026-10-29', satirlar: [{ kod: 'ORNKA', kapanis: '12' }] },
  ]) {
    const { c, depo } = orta();
    const s = await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(200, govde) });
    assert.deepEqual([s.durum, s.veri], ['veri_yok', undefined], JSON.stringify(govde));
  }
});

/* ── ±%20 makullük ── */

test('makulMu: ±%20 sınırı dahil, dışı reddedilir; önceki yoksa karşılaştırılamaz -> kabul', () => {
  assert.equal(makulMu(120, 100), true);
  assert.equal(makulMu(80, 100), true);
  assert.equal(makulMu(120.01, 100), false);
  assert.equal(makulMu(79.9, 100), false);
  assert.equal(makulMu(1000, undefined), true);
  assert.equal(makulMu(5, 0), false);
});

test('makullük: önceki bültene göre ±%20 dışı kod gösterilmez (veri_yok + not); diğer kodlar etkilenmez', async () => {
  const { c, depo, ilerlet } = orta();
  await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(200, sunucu('2026-10-28', [['ORNKA', 10], ['ORNKB', 100]], '2026-10-28')) });
  ilerlet(26 * 3600_000);
  const s = await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(200, sunucu('2026-10-29', [['ORNKA', 13], ['ORNKB', 110], ['ORNKC', 5]])) });
  assert.equal(s.durum, 'guncel');
  assert.deepEqual(s.veri!.kapanislar, { ORNKB: 110, ORNKC: 5 });
  assert.deepEqual(s.veri!.mantikDisi, ['ORNKA']);
  const [a, b] = bistSuz(s.veri!, ['ORNKA', 'ORNKB']);
  assert.deepEqual([a.durum, a.kapanis, a.not], ['veri_yok', undefined, 'Önceki kapanışa göre ±%20 dışında; gösterilmiyor.']);
  assert.deepEqual([b.durum, b.kapanis], ['var', 110]);
});

test('makullük: hepsi dışındaysa tablo veri_yok (mantik_disi); aynı bülten tekrar çekilince reddedilen kod sonradan kabul EDİLMEZ', async () => {
  const { c, depo, ilerlet } = orta();
  await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(200, sunucu('2026-10-28', [['ORNKA', 10]], '2026-10-28')) });
  ilerlet(26 * 3600_000);
  const s = await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(200, sunucu('2026-10-29', [['ORNKA', 50]])) });
  assert.deepEqual([s.durum, s.hata, s.veri?.kapanislar], ['eski', 'mantik_disi', { ORNKA: 10 }]); // önbellekte eski değer var: etiketli eski
  const t = orta();
  await bistOku({ calistirici: t.c, depo: t.depo, fetchFn: async () => yanit(200, sunucu('2026-10-28', [['ORNKA', 10]], '2026-10-28')) });
  t.ilerlet(26 * 3600_000);
  const ilk = bistMakullukUygula({ tarih: '2026-10-29', beklenen: '2026-10-29', kapanislar: { ORNKA: 50, ORNKB: 5 } }, { tarih: '2026-10-28', beklenen: '2026-10-28', kapanislar: { ORNKA: 10 } });
  assert.deepEqual([ilk.kapanislar, ilk.mantikDisi], [{ ORNKB: 5 }, ['ORNKA']]);
  const tekrar = bistMakullukUygula({ tarih: '2026-10-29', beklenen: '2026-10-29', kapanislar: { ORNKA: 50, ORNKB: 5 } }, ilk);
  assert.deepEqual([tekrar.kapanislar, tekrar.mantikDisi], [{ ORNKB: 5 }, ['ORNKA']]);
  const bos = orta();
  const hepsi = await bistOku({ calistirici: bos.c, depo: bos.depo, fetchFn: async () => yanit(200, sunucu('2026-10-29', [])) });
  assert.deepEqual([hepsi.durum, hepsi.hata], ['veri_yok', 'okunamadi']);
});

const SIMDI = Date.parse('2026-10-29T17:00:00Z'); // Perşembe 20:00 TSİ

test('eski bülten (beklenen tarihten eski) güncel sayılmaz, etiketlenir ve HESABA GİRMEZ', async () => {
  const { c, depo } = orta();
  const s = await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(200, sunucu('2026-10-28', [['ORNKA', 10]], '2026-10-29')) });
  assert.equal(bistGuncelMi(s.veri!, SIMDI), false);
  const [x] = bistSuz(s.veri!, ['ORNKA'], { simdi: SIMDI });
  assert.deepEqual([x.durum, x.guncelMi, x.tarih], ['var', false, '2026-10-28']);
  const f = fiyatSec({ bist: x });
  assert.deepEqual([f.kaynak, f.fiyat, f.bistAday, f.bistAdayEski], ['yok', undefined, 10, true]);
  assert.deepEqual(fiyatSec({ elle: 9, bist: x }), { kaynak: 'elle', fiyat: 9, bistAday: 10, bistAdayEski: true });
});

test('B12-2a: günler sonra önbellekten okunan kayıt güncel SAYILMAZ (güncellik şu anki zamana göre)', async () => {
  const veri: BistVeri = { tarih: '2026-10-29', beklenen: '2026-10-29', kapanislar: { ORNKA: 10 } };
  assert.equal(bistGuncelMi(veri, SIMDI), true);
  const gunlerSonra = SIMDI + 5 * 86_400_000;
  assert.equal(bistGuncelMi(veri, gunlerSonra), false);
  assert.equal(bistSuz(veri, ['ORNKA'], { simdi: SIMDI })[0].guncelMi, true);
  const [x] = bistSuz(veri, ['ORNKA'], { simdi: gunlerSonra });
  assert.equal(x.guncelMi, false);
  assert.equal(fiyatSec({ bist: x }).kaynak, 'yok');
  // Hafta sonu: Cuma bülteni hâlâ güncel
  assert.equal(bistGuncelMi({ ...veri, tarih: '2026-10-30' }, Date.parse('2026-10-31T09:00:00Z')), true);
});

test('B12-2b: çalıştırıcı durum:eski döndürürse (taze bülten tarihli olsa bile) fiyatSec hesaba SOKMAZ; elle fiyat korunur', async () => {
  const { c, depo, ilerlet } = orta();
  await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(200, sunucu()) });
  ilerlet(2 * 3600_000); // TTL (1 sa) doldu
  const s = await bistOku({ calistirici: c, depo, fetchFn: async () => yanit(502, { error: 'ulasilamadi' }) });
  assert.equal(s.durum, 'eski');
  const [x] = bistSuz(s.veri!, ['ORNKA'], { eski: s.durum === 'eski', simdi: SIMDI });
  assert.equal(x.guncelMi, false);
  const f = fiyatSec({ bist: x });
  assert.deepEqual([f.kaynak, f.fiyat, f.bistAday, f.bistAdayEski], ['yok', undefined, 12.5, true]);
  assert.deepEqual(fiyatSec({ elle: 11, bist: x }), { kaynak: 'elle', fiyat: 11, bistAday: 12.5, bistAdayEski: true });
  // taze durumla karşılaştırma: eski bayrağı olmadan aynı veri hesaba girerdi
  assert.equal(fiyatSec({ bist: bistSuz(s.veri!, ['ORNKA'], { simdi: SIMDI })[0] }).kaynak, 'bist');
});

test('istemci ve sunucu beklenenBultenTarihi aynı sonucu verir (hafta içi/sonu, 19:30 sınırı)', () => {
  for (let t = Date.parse('2026-10-26T00:00:00Z'); t < Date.parse('2026-11-09T00:00:00Z'); t += 15 * 60_000) {
    assert.equal(beklenenBultenTarihi(t), sunucuBeklenen(t), new Date(t).toISOString());
  }
});

/* ── fiyat önceliği: elle > BİST ── */

test('fiyatSec: elle girilen fiyat BİST ile EZİLMEZ; fark yalnız bistAday olarak bildirilir', () => {
  const bist = { kod: 'ORNKA', durum: 'var' as const, kapanis: 13, tarih: '2026-10-29', guncelMi: true };
  assert.deepEqual(fiyatSec({ elle: 12, bist }), { kaynak: 'elle', fiyat: 12, bistAday: 13 });
  assert.deepEqual(fiyatSec({ elle: 13, bist }), { kaynak: 'elle', fiyat: 13 });           // aynıysa aday yok
  assert.deepEqual(fiyatSec({ elle: 12 }), { kaynak: 'elle', fiyat: 12 });
  const girdi = { elle: 12, bist };
  const kopya = JSON.stringify(girdi);
  fiyatSec(girdi);
  assert.equal(JSON.stringify(girdi), kopya); // girdiyi değiştirmez
});

test('fiyatSec: elle yok / geçersizse makul BİST kullanılır; BİST de yoksa kaynak yok + not (sayı uydurulmaz)', () => {
  const bist = { kod: 'ORNKA', durum: 'var' as const, kapanis: 13, tarih: '2026-10-29', guncelMi: true };
  assert.deepEqual(fiyatSec({ bist }), { kaynak: 'bist', fiyat: 13, donem: '2026-10-29', eski: false });
  for (const elle of [0, -1, NaN, Infinity]) assert.equal(fiyatSec({ elle, bist }).kaynak, 'bist', String(elle));
  const yok = fiyatSec({ bist: { kod: 'ORNKA', durum: 'veri_yok', not: 'Önceki kapanışa göre ±%20 dışında; gösterilmiyor.' } });
  assert.deepEqual([yok.kaynak, yok.fiyat, yok.not], ['yok', undefined, 'Önceki kapanışa göre ±%20 dışında; gösterilmiyor.']);
  assert.equal(fiyatSec({}).kaynak, 'yok');
  assert.equal(fiyatSec({ bist: { kod: 'ORNKA', durum: 'var', kapanis: 0 } }).kaynak, 'yok');
});

test('bistVeriMi önbellek doğrulaması; kaynak kodunda portföy/store içe aktarımı yok, TODO(hukuk) var', () => {
  const iyi: BistVeri = { tarih: '2026-10-29', beklenen: '2026-10-29', kapanislar: { ORNKA: 1 } };
  assert.equal(bistVeriMi(iyi), true);
  for (const kotu of [null, {}, { ...iyi, kapanislar: { 'x y': 1 } }, { ...iyi, kapanislar: { ORNKA: -1 } }, { ...iyi, tarih: 'dun' }, { ...iyi, mantikDisi: ['<b>'] }]) assert.equal(bistVeriMi(kotu), false);
  const kod = readFileSync(new URL('../../src/kaynaklar/bist.ts', import.meta.url), 'utf8');
  assert.ok(kod.includes('TODO(hukuk)'));
  assert.ok(!/from '\.\.\/(store|backup|cloud|localData)/.test(kod));
});

test('R2: guncelMi alanı yoksa (bilinmiyor) fiyatSec BİST kapanışını hesaba SOKMAZ', () => {
  const f = fiyatSec({ bist: { kod: 'ORNKA', durum: 'var', kapanis: 5 } });
  assert.deepEqual([f.kaynak, f.fiyat, f.bistAday, f.bistAdayEski], ['yok', undefined, 5, true]);
  assert.equal(fiyatSec({ elle: 4, bist: { kod: 'ORNKA', durum: 'var', kapanis: 5 } }).fiyat, 4);
});

test('R3: cihaz saati geride iken sunucunun beklediği tarihten eski bülten güncel sayılmaz', () => {
  const veri: BistVeri = { tarih: '2026-10-28', beklenen: '2026-10-29', kapanislar: { ORNKA: 10 } };
  const geriSaat = Date.parse('2026-10-28T12:00:00Z'); // cihaz saati: beklenen tarih 2026-10-27
  assert.equal(beklenenBultenTarihi(geriSaat), '2026-10-27');
  assert.equal(bistGuncelMi(veri, geriSaat), false);
  assert.equal(bistSuz(veri, ['ORNKA'], { simdi: geriSaat })[0].guncelMi, false);
  assert.equal(bistGuncelMi({ ...veri, tarih: '2026-10-29' }, geriSaat), true);
});
