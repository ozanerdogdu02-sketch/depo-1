// Birim testler: src/kaynaklar/kap.ts (istemci bağdaştırıcısı). Sahte fetch; fikstür KÜTÜPHANE KODUNDAN TÜRETİLDİ,
// gerçek KAP yanıtıyla doğrulanmadı. Sunucunun süzdüğü yanıt biçimi taklit edilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kapOku, kapSuz, kapBaglanti, kapYanitHatasi, kapVeriMi } from '../../src/kaynaklar/kap.ts';
import type { KapBildirim } from '../../src/kaynaklar/kap.ts';
import { kapAyristir } from '../../netlify/functions/kap.mjs';
import { createCalistirici } from '../../src/kaynaklar/kayit.ts';
import { createLocalStore } from '../../src/storage/local.ts';
import type { StorageLike } from '../../src/storage/local.ts';
import { ONBELLEK_ANAHTARLARI } from '../../src/kaynaklar/onbellek.ts';
import { kaynakDurumMetni } from '../../src/kaynaklar/tip.ts';
import { BACKED_UP_KEYS } from '../../src/backup.ts';
import trTarih from '../fixtures/kap/kap-ornek-tr-tarih.mjs';
import isoTarih from '../fixtures/kap/kap-ornek-iso-tarih.mjs';

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
  let simdi = Date.parse('2026-10-28T12:00:00Z');
  const c = createCalistirici({ depo: createLocalStore(ls), simdi: () => simdi, bekle: async () => {}, devreKesiciMs: 900_000 });
  return { ls, c, ilerlet: (ms: number) => { simdi += ms; } };
};
const yanit = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const sunucuYaniti = () => {
  const a = kapAyristir([...trTarih, ...isoTarih]);
  assert.ok(a.ok);
  return { items: a.items, pencere: ['2026-10-27', '2026-10-28'] };
};

test('U3: istek PARAMETRESİZ — adres tam "/api/kap", init yalnız signal; portföy sembolü ağa girmez, süzme tarayıcıda', async () => {
  const { c } = orta();
  const portfoy = ['ORNKA', 'ORNKE'];
  const cagrilar: Array<{ url: string; init: Record<string, unknown> | undefined }> = [];
  const s = await kapOku({ calistirici: c, fetchFn: async (url, init) => { cagrilar.push({ url, init: init as Record<string, unknown> }); return yanit(200, sunucuYaniti()); } });
  assert.equal(cagrilar.length, 1);
  assert.equal(cagrilar[0].url, '/api/kap');
  assert.deepEqual(Object.keys(cagrilar[0].init ?? {}), ['signal']); // method/body/headers yok
  assert.ok(!cagrilar[0].url.includes('?'));
  for (const sembol of portfoy) assert.ok(!JSON.stringify(cagrilar).includes(sembol), sembol);
  assert.deepEqual([s.durum, s.donem], ['guncel', '27.10.2026–28.10.2026']);
  const suzulen = kapSuz(s.veri!, portfoy);
  assert.deepEqual(suzulen.map(b => b.no), [1000010, 1000009, 1000003]);
  assert.equal(cagrilar.length, 1); // süzme ek istek yapmaz
});

test('kapSuz: büyük/küçük harf ve boşluk toleranslı; boş portföy -> boş liste; bağlantı istemcide kurulur', async () => {
  const { c } = orta();
  const s = await kapOku({ calistirici: c, fetchFn: async () => yanit(200, sunucuYaniti()) });
  assert.deepEqual(kapSuz(s.veri!, [' ornkb ']).map(b => b.no), [1000002]);
  assert.deepEqual(kapSuz(s.veri!, []), []);
  assert.deepEqual(kapSuz(s.veri!, ['YOKKOD']), []);
  assert.equal(kapBaglanti(1000003), 'https://www.kap.org.tr/tr/Bildirim/1000003');
});

test('önbellek: başarı fagent.kaynak.kap.v1 anahtarına yazılır, TTL içinde ikinci çağrı ağa gitmez; anahtar yedek/bulut listesinde DEĞİL', async () => {
  const { ls, c, ilerlet } = orta();
  let n = 0;
  const fetchFn = async () => { n++; return yanit(200, sunucuYaniti()); };
  await kapOku({ calistirici: c, fetchFn });
  assert.ok(ls.m.has('fagent.kaynak.kap.v1'));
  assert.equal(ONBELLEK_ANAHTARLARI.kapBildirimler, 'fagent.kaynak.kap.v1');
  ilerlet(14 * 60_000);
  await kapOku({ calistirici: c, fetchFn });
  assert.equal(n, 1);
  ilerlet(2 * 60_000);
  await kapOku({ calistirici: c, fetchFn });
  assert.equal(n, 2);
  assert.ok(!(BACKED_UP_KEYS as readonly string[]).some(k => k.includes('kaynak')));
});

test('U2: sunucu 503 kapali -> durum kapali, yeniden deneme yok, "yapılandırılmamış" metni', async () => {
  const { c } = orta();
  let n = 0;
  const s = await kapOku({ calistirici: c, fetchFn: async () => { n++; return yanit(503, { error: 'kapali' }); } });
  assert.deepEqual([s.durum, s.hata, s.veri, n], ['kapali', 'kapali', undefined, 1]);
  assert.equal(kaynakDurumMetni(s), 'Veri kaynağı yapılandırılmamış (KAP: bu kaynak sunucuda etkin değil).');
});

test('ulaşılamadı: 502 / ağ hatası -> "KAP\'a ulaşılamadı."; önbellek varsa eski (etiketli, hesaplarda kullanılmaz)', async () => {
  const a = orta();
  const x = await kapOku({ calistirici: a.c, fetchFn: async () => { throw new TypeError('ağ'); } });
  assert.deepEqual([x.durum, kaynakDurumMetni(x)], ['ulasilamadi', "KAP'a ulaşılamadı."]);
  const b = orta();
  await kapOku({ calistirici: b.c, fetchFn: async () => yanit(200, sunucuYaniti()) });
  b.ilerlet(16 * 60_000);
  const e = await kapOku({ calistirici: b.c, fetchFn: async () => yanit(502, { error: 'ulasilamadi' }) });
  assert.equal(e.durum, 'eski');
  assert.equal(e.veri?.bildirimler.length, 5);
});

test('duvar/4xx (kaynak_reddetti) yeniden denenmez ve engel aşılmaz; 429 sinir_asildi yeniden denenmez', async () => {
  const a = orta();
  let n = 0;
  const r = await kapOku({ calistirici: a.c, fetchFn: async () => { n++; return yanit(502, { error: 'kaynak_reddetti' }); } });
  assert.deepEqual([r.durum, r.hata, n], ['ulasilamadi', 'kaynak_reddetti', 1]);
  const b = orta();
  let m = 0;
  const t = await kapOku({ calistirici: b.c, fetchFn: async () => { m++; return yanit(429, { error: 'sinir_asildi' }); } });
  assert.deepEqual([t.hata, m], ['sinir_asildi', 1]);
  assert.deepEqual(kapYanitHatasi(502, { error: 'zaman_asimi' }), { hata: 'zaman_asimi', yenidenDene: true });
});

test('şema tutmayan / bozuk yanıt -> veri_yok, uydurma satır yok, yeniden denenmez', async () => {
  for (const govde of [
    { items: 'x' }, { items: [{ no: 1 }] }, { foo: 1 },
    { items: [{ no: 1, zaman: '28.10.2026', kodlar: [], unvan: '', baslik: 'x' }] }, // tarih biçimi sunucu biçimi değil
    { items: [{ no: 1, zaman: '2026-10-28T10:00:00+03:00', kodlar: ['<b>'], unvan: '', baslik: 'x' }] },
  ]) {
    const { c } = orta();
    let n = 0;
    const s = await kapOku({ calistirici: c, fetchFn: async () => { n++; return yanit(200, govde); } });
    assert.deepEqual([s.durum, s.veri, n], ['veri_yok', undefined, 1], JSON.stringify(govde));
  }
  const { c } = orta();
  const h = await kapOku({ calistirici: c, fetchFn: async () => new Response('<html>duvar</html>', { status: 200 }) });
  assert.equal(h.durum, 'veri_yok');
  assert.equal(kaynakDurumMetni(h), "KAP'tan gelen değer okunamadı; gösterilmiyor.");
});

test('boş liste geçerli (o pencerede bildirim yok); kapVeriMi önbellek doğrulaması', async () => {
  const { c } = orta();
  const s = await kapOku({ calistirici: c, fetchFn: async () => yanit(200, { items: [], pencere: ['2026-10-27', '2026-10-28'] }) });
  assert.deepEqual([s.durum, s.veri?.bildirimler.length], ['guncel', 0]);
  assert.equal(kapVeriMi({ bildirimler: [] }), true);
  assert.equal(kapVeriMi({ bildirimler: [{ no: 1 }] as unknown as KapBildirim[] }), false);
  assert.equal(kapVeriMi(null), false);
});

test('kesildi işareti korunur', async () => {
  const { c } = orta();
  const s = await kapOku({ calistirici: c, fetchFn: async () => yanit(200, { ...sunucuYaniti(), kesildi: true }) });
  assert.equal(s.veri?.kesildi, true);
});

test('kaynak kodu: KAP istemcisi portföy/store içe aktarmaz, TODO(hukuk) işareti var', () => {
  const kod = readFileSync(new URL('../../src/kaynaklar/kap.ts', import.meta.url), 'utf8');
  assert.ok(kod.includes('TODO(hukuk)'));
  assert.ok(!/from '\.\.\/(store|backup|cloud|localData)/.test(kod));
});
