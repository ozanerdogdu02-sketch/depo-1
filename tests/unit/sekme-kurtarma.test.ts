// A8 (sekmeler arası eşitleme) ve A6 (kurtarma rafı) birim testleri. Gerçek storage olayı yok: olay SAHTE nesneyle verilir;
// gerçek iki sekmeli Chromium kanıtı tests/e2e/fagent-sekme-e2e.mjs. IndexedDB yok: bellek içi KvStore taklidi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore, saveRecovery, clearMirror, resetMarkerActive, isEmptyPortfolioRaw, MIRROR_CLEARED_KEY, RECOVERY_IDB_PREFIX, ok } from '../../src/storage/index.ts';
import type { KvStore, StorageLike, Result } from '../../src/storage/index.ts';

// ---- Taklitler ----
class MemStorage implements StorageLike {
  m = new Map<string, string>();
  failSet: string | null = null;
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) {
    if (this.failSet) { const e = new Error('dolu'); e.name = this.failSet; throw e; }
    this.m.set(k, v);
  }
  removeItem(k: string) { this.m.delete(k); }
}
function memKv(): KvStore & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    kind: 'memory', m,
    async get(k) { return ok(m.get(k)); },
    async set(k, v) { m.set(k, v); return ok(undefined); },
    async addIfAbsent(k, v) { if (m.has(k)) return ok(false); m.set(k, v); return ok(true); },
    async delete(k) { m.delete(k); return ok(undefined); },
    async deleteIfEquals(k, e) { if (m.get(k) !== e) return ok(false); m.delete(k); return ok(true); },
    async list(p = '') { return ok([...m.keys()].filter(k => k.startsWith(p)).sort()); },
  };
}
const val = <T>(r: Result<T>): T => { assert.ok(r.ok, r.ok ? '' : r.error.message); return r.value; };

const PK = 'fagent.portfolio.v1';
const TK = 'fagent.tax.v1';
const ls = new MemStorage();
(globalThis as unknown as { localStorage: unknown }).localStorage = ls;

const { handleTabEvent, getLayerEpoch, createForeignPreserver, createForeignResetGate } = await import('../../src/sekmeSenkron.ts');
const store = await import('../../src/store.ts');
const yd = await import('../../src/yazmaDurumu.ts');
const { snapshotUserData } = await import('../../src/backup.ts');
const k = await import('../../src/kurtarma.ts');

function deps(preserveOk = true) {
  const calls = { reload: 0, preserved: [] as [string, string][], start: 0, end: 0 };
  return {
    calls,
    d: {
      reloadPortfolio: () => { calls.reload++; store.reloadPortfolioFromDisk(); },
      preserveForeign: async (key: string, v: string) => { calls.preserved.push([key, v]); return preserveOk; },
      resetMarked: () => resetMarkerActive(ls.getItem(MIRROR_CLEARED_KEY)),
      diskValue: (key: string) => ls.getItem(key),
      foreignResetStart: () => { calls.start++; },
      foreignResetEnd: () => { calls.end++; },
    },
  };
}
const portfoy = (...adlar: string[]) => JSON.stringify({
  onboarded: true, realizedPnl: 0, txns: [],
  holdings: adlar.map((n, i) => ({ id: `x${i}`, name: n, type: 'hisse', amount: 100, costBasis: 100 })),
});
// Test temizliği: portföy anahtarını diskten kaldırır, bekleyenleri ve bildirimleri sıfırlar, belleği (lastRaw dahil) diskle eşitler.
const sifirlaDurum = () => { yd.removeLocal(PK); yd.clearPendingWrites(); store.reloadPortfolioFromDisk(); yd.removeLocal(PK); };
const adlar = () => store.getPortfolio().holdings.map(h => h.name);

// ---- A8 ----
test('A8: başka sekme portföyü değiştirince bellek diskten yüklenir; sonraki işlem o kaydı EZMEZ', () => {
  const { d, calls } = deps();
  store.actions.startEmpty();
  store.actions.addHolding('BIZIM', 'hisse', 100);
  // Başka sekme araya yazdı (disk: BIZIM + DIGER)
  ls.m.set(PK, portfoy('BIZIM', 'DIGER'));
  const out = handleTabEvent({ key: PK, newValue: ls.m.get(PK)! }, d);
  assert.deepEqual(out.reloaded, [PK]);
  assert.equal(calls.reload, 1);
  assert.deepEqual(adlar(), ['BIZIM', 'DIGER']);
  store.actions.addHolding('UCUNCU', 'hisse', 100);
  assert.deepEqual(JSON.parse(ls.m.get(PK)!).holdings.map((h: { name: string }) => h.name), ['BIZIM', 'DIGER', 'UCUNCU']);
});

test('A8: olay eşitlemeden ÖNCE gelen eski bellekle yazım (kanıt: işleyici yokken diğer sekmenin kaydı ezilir)', () => {
  store.actions.startEmpty();
  store.actions.addHolding('A', 'hisse', 100);
  ls.m.set(PK, portfoy('A', 'DIGER')); // başka sekme yazdı, bu sekme işleyiciyi çağırmadı
  store.actions.addHolding('B', 'hisse', 100);
  assert.ok(!ls.m.get(PK)!.includes('DIGER'), 'işleyici yoksa diğer sekmenin kaydı kaybolur (kontrol grubu)');
});

test('A8: diğer katman ve ilgisiz anahtar: katman sayacı artar, ilgisiz anahtar yok sayılır, key=null tüm katmanları kapsar', () => {
  const { d, calls } = deps();
  const e0 = getLayerEpoch();
  const yok = handleTabEvent({ key: 'fagent.baska.v1', newValue: 'x' }, d);
  assert.deepEqual([yok.reloaded, yok.layers, yok.conflicts, yok.discarded], [[], [], [], []]);
  assert.equal(getLayerEpoch(), e0);
  const o = handleTabEvent({ key: TK, newValue: '{"fon":9}' }, d);
  assert.deepEqual(o.layers, [TK]);
  assert.equal(getLayerEpoch(), e0 + 1);
  assert.equal(calls.reload, 0);
  const all = handleTabEvent({ key: null, newValue: null }, d);
  assert.equal(all.reloaded.length, 1);
  assert.equal(all.layers.length, 4);
});

test('A8: bu sekmede KAYDEDİLMEMİŞ değer varken çakışma: ezilmez, yüklenmez, yedekte kalır, diğer değer kurtarmaya gider; kopya başarılıysa metin "kopyalandı" der', async () => {
  const { d, calls } = deps(true);
  store.actions.startEmpty();
  ls.failSet = 'QuotaExceededError';
  store.actions.addHolding('BEKLEYEN', 'hisse', 100); // diske yazılamadı
  ls.failSet = null;
  assert.deepEqual([...yd.getUnsavedKeys()], [PK]);
  const diger = portfoy('DIGER');
  ls.m.set(PK, diger);
  const out = handleTabEvent({ key: PK, newValue: diger }, d);
  assert.deepEqual(out.conflicts, [PK]);
  assert.equal(yd.getTabNotice(), yd.TAB_CONFLICT_BEKLEMEDE, 'kopya sonuçlanana kadar yazım bekletilir');
  await out.settled;
  assert.equal(calls.reload, 0, 'bekleyen değer varken diskten yükleme YAPILMAZ');
  assert.deepEqual(adlar(), ['BEKLEYEN']);
  assert.deepEqual([...yd.getTabConflictKeys()], [PK]);
  assert.deepEqual(calls.preserved, [[PK, diger]]);
  assert.equal(yd.getTabNotice(), yd.TAB_CONFLICT_KOPYALANDI);
  assert.ok(!/otomatik silinmedi/.test(yd.getTabNotice()), 'olmayan güvence verilmez');
  assert.ok(JSON.parse(snapshotUserData()[PK]).holdings.some((h: { name: string }) => h.name === 'BEKLEYEN'), 'yedek bekleyen değeri taşır');
  // bekleyen çözülünce çakışma kalkar
  store.actions.addHolding('SONRA', 'hisse', 100);
  assert.deepEqual([...yd.getUnsavedKeys()], []);
  assert.deepEqual([...yd.getTabConflictKeys()], []);
  assert.equal(yd.getTabNotice(), '');
});

test('UYUM: çakışmada öteki sürüm kurtarma alanına ALINAMADIYSA bekleyen değer diskteki sürümün ÜSTÜNE YAZILMAZ; kota açılsa bile', async () => {
  const { d } = deps(false);
  store.actions.startEmpty();
  ls.failSet = 'QuotaExceededError';
  store.actions.addHolding('BEKLEYEN', 'hisse', 100);
  ls.failSet = null;
  const diger = portfoy('DIGER');
  ls.m.set(PK, diger);
  const out = handleTabEvent({ key: PK, newValue: diger }, d);
  await out.settled;
  assert.equal(yd.getTabNotice(), yd.TAB_CONFLICT_BEKLEMEDE);
  store.actions.addHolding('YENI', 'hisse', 100); // kota açık: koruma olmasa yazılırdı
  assert.equal(ls.m.get(PK), diger, 'disk öteki sekmenin sürümünde kaldı');
  assert.deepEqual([...yd.getUnsavedKeys()], [PK], 'değişiklik bekletiliyor (uyarı sürer)');
  assert.ok(JSON.parse(snapshotUserData()[PK]).holdings.some((h: { name: string }) => h.name === 'YENI'), 'yedek en güncel hali taşır');
  sifirlaDurum();
  store.actions.startEmpty();
});

test('O1 SİLME KAZANIR: başka sekmede SIFIRLA sürerken bu sekmenin bekleyen değeri atılır; sonraki yazım eski veriyi geri getirmez; bildirim', () => {
  const { d, calls } = deps();
  store.actions.startEmpty();
  store.actions.addHolding('ESKI', 'hisse', 100);
  ls.failSet = 'QuotaExceededError';
  store.actions.addHolding('BEKLEYEN', 'hisse', 100);
  ls.failSet = null;
  assert.deepEqual([...yd.getUnsavedKeys()], [PK]);
  // diğer sekme SIFIRLA: boş portföy + silme işareti
  ls.m.set(PK, JSON.stringify({ onboarded: false, holdings: [], txns: [], realizedPnl: 0 }));
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now()));
  const out = handleTabEvent({ key: PK, newValue: ls.m.get(PK)! }, d);
  assert.deepEqual(out.discarded, [PK]);
  assert.ok(calls.start >= 1);
  assert.deepEqual([...yd.getUnsavedKeys()], []);
  assert.deepEqual(adlar(), []);
  assert.equal(yd.getTabNotice(), yd.TAB_RESET_DISCARDED_MESSAGE);
  assert.match(yd.getTabNotice(), /silindi.*de silindi/);
  assert.deepEqual([...yd.getTabConflictKeys()], []);
  ls.m.delete(MIRROR_CLEARED_KEY);
  handleTabEvent({ key: MIRROR_CLEARED_KEY, newValue: null }, d);
  store.actions.startEmpty();
  store.actions.addHolding('YENI', 'hisse', 100);
  const disk = ls.m.get(PK)!;
  assert.ok(!disk.includes('BEKLEYEN') && !disk.includes('ESKI'));
  assert.ok(!snapshotUserData()[PK]?.includes('BEKLEYEN'), 'yedeğe de sızmaz');
  sifirlaDurum();
});

test('O1: işaret olayı katman olaylarından SONRA gelirse de bekleyen değer atılır; başka katmanda (vergi) da; anahtar silinmişse (newValue=null) da', () => {
  const { d } = deps();
  ls.failSet = 'QuotaExceededError';
  yd.writeLocal(TK, '{"fon":50}');
  ls.failSet = null;
  assert.deepEqual([...yd.getUnsavedKeys()], [TK]);
  const e0 = getLayerEpoch();
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now()));
  const o = handleTabEvent({ key: MIRROR_CLEARED_KEY, newValue: ls.m.get(MIRROR_CLEARED_KEY)! }, d);
  assert.deepEqual(o.discarded, [TK]);
  assert.deepEqual([...yd.getUnsavedKeys()], []);
  assert.equal(getLayerEpoch(), e0 + 1);
  ls.m.delete(MIRROR_CLEARED_KEY);
  // newValue=null (başka sekmede anahtar silindi, işaret yok): silme yine kazanır
  yd.removeLocal(TK);
  ls.failSet = 'QuotaExceededError';
  yd.writeLocal(TK, '{"fon":51}');
  ls.failSet = null;
  const o2 = handleTabEvent({ key: TK, newValue: null }, d);
  assert.deepEqual(o2.discarded, [TK]);
  yd.removeLocal(TK);
});

test('O3: olay gecikmesi — eski bellekle yazım diskteki FARKLI sürümü ezmeden önce kurtarma alanına bildirilir; eşitken bildirilmez', () => {
  const got: [string, string][] = [];
  store.setDivergenceSink((k, raw) => { got.push([k, raw]); return true; });
  try {
    store.actions.startEmpty();
    store.actions.addHolding('A', 'hisse', 100);
    assert.deepEqual(got, [], 'disk bellekle uyumluyken bildirim yok');
    const yabanci = portfoy('A', 'YABANCI');
    ls.m.set(PK, yabanci); // başka sekme yazdı, olay henüz işlenmedi
    store.actions.addHolding('B', 'hisse', 100);
    assert.deepEqual(got, [[PK, yabanci]], 'ezilen sürüm sink\'e verildi');
    store.actions.addHolding('C', 'hisse', 100);
    assert.equal(got.length, 1, 'yazımdan sonra disk yeniden bellekle uyumlu');
  } finally { store.setDivergenceSink(undefined); }
});

test('O3: fark varken SIFIRLA işareti de diskteyse işlem yazılmaz (silme kazanır), bellek diskten yüklenir, bildirim', () => {
  store.actions.startEmpty();
  store.actions.addHolding('A', 'hisse', 100);
  ls.m.set(PK, JSON.stringify({ onboarded: false, holdings: [], txns: [], realizedPnl: 0 }));
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now()));
  store.actions.addHolding('B', 'hisse', 100);
  assert.deepEqual(adlar(), []);
  assert.ok(!ls.m.get(PK)!.includes('"B"'));
  assert.equal(yd.getTabNotice(), yd.TAB_RESET_DISCARDED_MESSAGE);
  ls.m.delete(MIRROR_CLEARED_KEY);
  sifirlaDurum();
  store.actions.startEmpty();
});

test('D5: createForeignPreserver — silme işaretinde çalışmaz; çağrılar tek kuyrukta sırayla; yarışta alınan kayıt geri silinir', async () => {
  const idb = memKv();
  let marked = false;
  const sira: string[] = [];
  const orig = idb.addIfAbsent.bind(idb);
  idb.addIfAbsent = async (k, v) => { sira.push(v); await new Promise(r => setTimeout(r, v === 'ilk' ? 20 : 0)); return orig(k, v); };
  const pres = createForeignPreserver(() => idb, () => marked);
  const [a, b] = await Promise.all([pres(PK, 'ilk'), pres(PK, 'ikinci')]);
  assert.deepEqual([a, b], [true, true]);
  assert.deepEqual(sira, ['ilk', 'ikinci'], 'sıralı işlendi (iç içe geçmedi)');
  marked = true;
  assert.equal(await pres(PK, 'ucuncu'), false);
  assert.ok(![...idb.m.values()].includes('ucuncu'), 'silme sürerken kayıt alınmadı');
  marked = false;
  const racing = createForeignPreserver(() => idb, (() => { let n = 0; return () => ++n >= 2; })());
  assert.equal(await racing(PK, 'yaris'), false);
  assert.ok(![...idb.m.values()].includes('yaris'), 'yarışta alınan kayıt geri silindi');
  assert.equal(await createForeignPreserver(() => undefined, () => false)(PK, 'x'), false, 'IndexedDB yoksa false');
});

test('D6: createForeignResetGate — bu sekmenin KENDİ silmesi sürerken bitiş olayı yazıcıyı sürdürmez', () => {
  const log: string[] = [];
  const w = { pause: () => log.push('pause'), resume: () => log.push('resume'), request: () => log.push('request') };
  let own = true;
  const g = createForeignResetGate(w, () => own);
  g.start(); g.end();
  assert.deepEqual(log, ['pause'], 'kendi silmesi sürerken resume/request yok');
  own = false; g.end();
  assert.deepEqual(log, ['pause', 'resume', 'request']);
});

test('A8: bekleyeni olmayan anahtarda markTabConflict işaretlemez', () => {
  assert.equal(yd.markTabConflict(TK), false);
  assert.deepEqual([...yd.getTabConflictKeys()], []);
});

test('A8: başka sekmede SIFIRLA: işaret varsa yazıcı durdurulur, bellek boşalır, sonraki işlem eski veriyi geri YAZMAZ; işaret kalkınca yazıcı sürer', () => {
  const { d, calls } = deps();
  store.actions.startEmpty();
  store.actions.addHolding('ESKI1', 'hisse', 100);
  store.actions.addHolding('ESKI2', 'hisse', 100);
  // Diğer sekme SIFIRLA: katmanlar silinir, boş portföy yazılır, silme işareti konur (olaylar bu sırayla gelir)
  ls.m.set(PK, JSON.stringify({ onboarded: false, holdings: [], txns: [], realizedPnl: 0 }));
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now()));
  handleTabEvent({ key: PK, newValue: ls.m.get(PK)! }, d);
  assert.ok(calls.start >= 1, 'işaret diskte olduğu için yazıcı hemen durdurulur');
  assert.deepEqual(adlar(), []);
  assert.equal(store.getPortfolio().onboarded, false);
  handleTabEvent({ key: MIRROR_CLEARED_KEY, newValue: ls.m.get(MIRROR_CLEARED_KEY)! }, d);
  ls.m.delete(MIRROR_CLEARED_KEY);
  handleTabEvent({ key: MIRROR_CLEARED_KEY, newValue: null }, d);
  assert.equal(calls.end, 1);
  store.actions.startEmpty();
  store.actions.addHolding('YENI', 'hisse', 100);
  assert.deepEqual(JSON.parse(ls.m.get(PK)!).holdings.map((h: { name: string }) => h.name), ['YENI']);
  assert.ok(!ls.m.get(PK)!.includes('ESKI'));
});

// ---- A6 ----
const LS = createLocalStore(ls);
const stores = () => ({ ls: LS, idb: memKv() });

test('A6: listRecoveries — tür, anahtar, tarih (yalnız addan çıkarılabiliyorsa), boyut', async () => {
  const d = stores();
  ls.m.clear();
  ls.m.set(`fagent.recovery.corrupt.${PK}`, '{bozuk');
  ls.m.set(`fagent.recovery.corrupt.${PK}.2`, '{bozuk2');
  ls.m.set(`fagent.recovery.corrupt.${TK}.not`, 'ham değer 300000 karakter');
  d.idb.m.set(`${RECOVERY_IDB_PREFIX}${PK}`, '{"a":1}');
  d.idb.m.set(`${RECOVERY_IDB_PREFIX}${PK}.1700000000000`, '{"a":22}');
  d.idb.m.set(`${RECOVERY_IDB_PREFIX}bozuk.${TK}`, 'X'.repeat(10));
  const l = val(await k.listRecoveries(d));
  const byId = (id: string) => l.find(x => x.id === id)!;
  assert.equal(l.length, 6);
  assert.deepEqual([byId(`ls:fagent.recovery.corrupt.${PK}`).tur, byId(`ls:fagent.recovery.corrupt.${PK}.2`).anahtar], ['bozuk', PK]);
  const not = byId(`ls:fagent.recovery.corrupt.${TK}.not`);
  assert.deepEqual([not.tur, not.anahtar, not.hamDegerVar], ['buyuk', TK, false]);
  const ek = byId(`idb:${RECOVERY_IDB_PREFIX}${PK}.1700000000000`);
  assert.deepEqual([ek.tur, ek.tarih, ek.boyut], ['farklilik', new Date(1700000000000).toISOString(), 8]);
  assert.equal(byId(`idb:${RECOVERY_IDB_PREFIX}${PK}`).tarih, undefined, 'tarih uydurulmaz');
  const bk = byId(`idb:${RECOVERY_IDB_PREFIX}bozuk.${TK}`);
  assert.deepEqual([bk.tur, bk.anahtar, bk.boyut, bk.hamDegerVar], ['buyuk', TK, 10, true]);
});

test('A6: ayrıştırılabilir kurtarma kaydı geri yüklenir; mevcut değer rafa alınır; kayıt silinmez; sonrası çağrılır', async () => {
  const d = stores();
  ls.m.clear(); yd.clearPendingWrites();
  const eski = portfoy('MEVCUT');
  const kurtarilan = portfoy('KURTARILAN');
  ls.m.set(PK, eski);
  ls.m.set(`fagent.recovery.corrupt.${PK}`, kurtarilan);
  const cagri: string[] = [];
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${PK}`, { sonrasi: a => cagri.push(a) });
  assert.deepEqual(r, { ok: true, anahtar: PK, oncekiKorundu: true });
  assert.equal(ls.m.get(PK), kurtarilan);
  assert.deepEqual(cagri, [PK]);
  assert.equal(ls.m.get(`fagent.recovery.corrupt.${PK}`), kurtarilan, 'kurtarma kaydı geri yüklemede silinmez');
  assert.deepEqual([...d.idb.m.values()], [eski], 'önceki değer IndexedDB rafına alındı (geri yükleme geri alınabilir)');
});

test('A6: ayrıştırılamayan kayıt yazılmaz; ham metin yedek dosyası biçiminde aynen döner', async () => {
  const d = stores();
  ls.m.clear();
  ls.m.set(PK, portfoy('MEVCUT'));
  const ham = '{"holdings":[{"id":"x"';
  ls.m.set(`fagent.recovery.corrupt.${PK}`, ham);
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${PK}`);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.neden, 'ayristirilamadi');
  assert.equal(ls.m.get(PK), portfoy('MEVCUT'), 'disk değişmedi');
  const f = JSON.parse(r.disaAktarim!.icerik);
  assert.equal(f.fagentBackup, 1);
  assert.equal(f.data[PK], ham, 'ham metin değiştirilmeden taşınır');
  assert.match(r.disaAktarim!.dosyaAdi, /^fagent-kurtarma-.*\.json$/);
  assert.equal(d.idb.m.size, 0);
});

test('A6: JSON ama katman biçiminde değil -> gecersiz-bicim + dışa aktarım; yalnız-not; desteklenmeyen anahtar; bulunamadı', async () => {
  const d = stores();
  ls.m.clear();
  ls.m.set(`fagent.recovery.corrupt.${PK}`, '{"holdings":"dizi degil"}');
  const a = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${PK}`);
  assert.ok(!a.ok && a.neden === 'gecersiz-bicim' && a.disaAktarim);
  ls.m.set(`fagent.recovery.corrupt.${TK}.not`, 'not');
  const b = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}.not`);
  assert.ok(!b.ok && b.neden === 'yalniz-not');
  ls.m.set('fagent.recovery.corrupt.fagent.baska.v1', '{}');
  const c = await k.restoreRecovery(d, 'ls:fagent.recovery.corrupt.fagent.baska.v1');
  assert.ok(!c.ok && c.neden === 'desteklenmiyor');
  const e = await k.restoreRecovery(d, 'ls:yok');
  assert.ok(!e.ok && e.neden === 'bulunamadi');
});

test('A6: bekleyen (kaydedilmemiş) değer varken geri yükleme reddedilir', async () => {
  const d = stores();
  ls.m.clear();
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":10}');
  yd.markPending(TK, '{"fon":11}');
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  assert.ok(!r.ok && r.neden === 'bekleyen-var');
  yd.clearPendingWrites();
});

test('A6: kota hatası -> yazilamadi + rollback tamam; önceki değer yerinde', async () => {
  const d = stores();
  ls.m.clear(); yd.clearPendingWrites();
  ls.m.set(TK, '{"fon":1}');
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":2}');
  // IndexedDB rafı yazılır (idb), localStorage yazımı dolu
  ls.failSet = 'QuotaExceededError';
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  ls.failSet = null;
  assert.ok(!r.ok && r.neden === 'yazilamadi' && r.rollback === 'tamam');
  assert.equal(ls.m.get(TK), '{"fon":1}');
});

test('A6 D-b: bozuk kovadaki kayıt, sık değişen farklılık kayıtlarıyla dışarı itilmez; kovaların sınırı ayrı', async () => {
  const idb = memKv();
  assert.ok(!(await saveRecovery(idb, PK, 'BOZUK-HAM', 'bozuk')).error);
  for (let i = 0; i < 8; i++) assert.ok(!(await saveRecovery(idb, PK, `FARK-${i}`)).error);
  const l = val(await k.listRecoveries({ ls: LS, idb }));
  const idbL = l.filter(x => x.kaynak === 'indexedDB');
  assert.equal(idbL.filter(x => x.tur === 'farklilik').length, 3, 'farklılık kovası en çok 3');
  const bozuk = idbL.filter(x => x.tur === 'buyuk');
  assert.equal(bozuk.length, 1, 'bozuk kova korundu');
  assert.equal(val(await k.readRecovery({ ls: LS, idb }, bozuk[0].id)), 'BOZUK-HAM');
  // bozuk kovanın kendi sınırı da 3
  for (let i = 0; i < 5; i++) await saveRecovery(idb, PK, `B-${i}`, 'bozuk');
  assert.equal(val(await k.listRecoveries({ ls: LS, idb })).filter(x => x.tur === 'buyuk').length, 3);
});

test('A6: exportRecovery — yedek dosyası biçimi, ham metin aynen', async () => {
  const d = stores();
  ls.m.clear();
  ls.m.set(`fagent.recovery.corrupt.${TK}`, 'bozuk{');
  const e = val(await k.exportRecovery(d, `ls:fagent.recovery.corrupt.${TK}`, new Date('2026-10-31T00:00:00Z')));
  const f = JSON.parse(e.icerik);
  assert.equal(f.createdAt, '2026-10-31T00:00:00.000Z');
  assert.equal(f.data[TK], 'bozuk{');
  const yok = await k.exportRecovery(d, 'ls:yok');
  assert.equal(yok.ok, false);
});

// ---- A6 düzeltme turu ----
const geriOnek = `${RECOVERY_IDB_PREFIX}geri.`;

test('O2: 3 kayıt dolu kovada EN ESKİ kayıt geri yüklenir + kota hatası -> kayıt rafta DURUR (üst sınır onu silemez)', async () => {
  const d = stores();
  ls.m.clear(); yd.clearPendingWrites();
  const [e, o, y] = ['{"fon":1}', '{"fon":2}', '{"fon":3}'];
  d.idb.m.set(`${geriOnek}${TK}`, e);
  d.idb.m.set(`${geriOnek}${TK}.1700000000001`, o);
  d.idb.m.set(`${geriOnek}${TK}.1700000000002`, y);
  ls.m.set(TK, '{"fon":99}');
  ls.failSet = 'QuotaExceededError';
  const r = await k.restoreRecovery(d, `idb:${geriOnek}${TK}`); // en eski, kovası dolu
  ls.failSet = null;
  assert.ok(!r.ok && r.neden === 'yazilamadi');
  assert.equal(d.idb.m.get(`${geriOnek}${TK}`), e, 'geri yüklenmek istenen kayıt hâlâ rafta');
  assert.equal(ls.m.get(TK), '{"fon":99}');
});

test('O2: saveRecovery koru -> korunan en eski kayıt silinmez, bir sonraki silinir; korunacak yer yoksa hata + yeni kayıt geri alınır', async () => {
  const idb = memKv();
  const base = `${RECOVERY_IDB_PREFIX}${PK}`;
  idb.m.set(base, 'a'); idb.m.set(`${base}.1700000000001`, 'b'); idb.m.set(`${base}.1700000000002`, 'c');
  assert.ok(!(await saveRecovery(idb, PK, 'd', 'farkli', [base])).error);
  assert.equal(idb.m.get(base), 'a', 'korunan duruyor');
  assert.ok(!idb.m.has(`${base}.1700000000001`), 'korunmayan en eski silindi');
  const full = memKv();
  full.m.set(base, 'a'); full.m.set(`${base}.1700000000001`, 'b'); full.m.set(`${base}.1700000000002`, 'c');
  const r = await saveRecovery(full, PK, 'd', 'farkli', [...full.m.keys()]);
  assert.ok(r.error);
  assert.equal(full.m.size, 3, 'hepsi korunuyorsa yeni kayıt geri alındı');
});

test('O2: mevcut değer ayrı "geri" kovasına alınır ve tür "onceki" listelenir; farklılık kayıtlarını itmez', async () => {
  const d = stores();
  ls.m.clear(); yd.clearPendingWrites();
  for (let i = 0; i < 3; i++) d.idb.m.set(`${RECOVERY_IDB_PREFIX}${TK}${i ? '.17000000000' + i : ''}`, `{"fon":${i}}`);
  ls.m.set(TK, '{"fon":50}');
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":7}');
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  assert.ok(r.ok && r.oncekiKorundu);
  const l = val(await k.listRecoveries(d));
  assert.equal(l.filter(x => x.tur === 'farklilik').length, 3, 'farklılık kovası etkilenmedi');
  assert.deepEqual(l.filter(x => x.tur === 'onceki').map(x => x.boyut), ['{"fon":50}'.length]);
});

test('D1: bekleyen-var kontrolü yazımdan HEMEN önce yeniden yapılır (await sırasında bekleyen oluşursa yazılmaz)', async () => {
  const d = { ...stores(), ls: { ...LS } as KvStore }; // LS'yi kalıcı değiştirmemek için kopya
  ls.m.clear(); yd.clearPendingWrites();
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":10}');
  ls.m.set(TK, '{"fon":1}');
  const asil = d.ls.get.bind(d.ls);
  d.ls.get = async (key: string) => { const r = await asil(key); if (key === TK) yd.markPending(TK, '{"fon":2}'); return r; }; // mevcut değer okunurken bekleyen oluştu
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  assert.ok(!r.ok && r.neden === 'bekleyen-var');
  assert.equal(ls.m.get(TK), '{"fon":1}');
  yd.clearPendingWrites();
});

test('D2: silme işareti varken (başta ya da beklemeler sırasında) restoreRecovery sifirlama-suruyor döner, yazmaz', async () => {
  const d = { ...stores(), ls: { ...LS } as KvStore }; // LS'yi kalıcı değiştirmemek için kopya
  ls.m.clear(); yd.clearPendingWrites();
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":10}');
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now()));
  const a = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  assert.ok(!a.ok && a.neden === 'sifirlama-suruyor');
  ls.m.delete(MIRROR_CLEARED_KEY);
  ls.m.set(TK, '{"fon":1}');
  const asil = d.ls.get.bind(d.ls);
  d.ls.get = async (key: string) => { const r = await asil(key); if (key === TK) ls.m.set(MIRROR_CLEARED_KEY, String(Date.now())); return r; }; // beklemeler sırasında başka sekme SIFIRLA başlattı
  const b = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  assert.ok(!b.ok && b.neden === 'sifirlama-suruyor');
  assert.equal(ls.m.get(TK), '{"fon":1}');
  ls.m.delete(MIRROR_CLEARED_KEY);
});

test('D3: restoreRecovery bellek tazelemesini kendisi yapar (portföy diskten yüklenir; diğer katmanda sayaç artar); sonrasi yalnız ek', async () => {
  const d = stores();
  ls.m.clear(); yd.clearPendingWrites(); store.reloadPortfolioFromDisk(); // test ortamında localStorage elle boşaltıldı: bellek de eşitlenir (D-d)
  store.actions.startEmpty();
  store.actions.addHolding('ESKIBELLEK', 'hisse', 100);
  ls.m.set(`fagent.recovery.corrupt.${PK}`, portfoy('KURTARILAN'));
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${PK}`); // sonrasi VERİLMEDİ
  assert.ok(r.ok);
  assert.deepEqual(adlar(), ['KURTARILAN']);
  const e0 = getLayerEpoch();
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":10}');
  assert.ok((await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`)).ok);
  assert.equal(getLayerEpoch(), e0 + 1);
  sifirlaDurum(); yd.removeLocal(TK);
});

test('D4: readRecovery yalnız kurtarma öneklerini okur (kullanıcı katmanı ya da başka anahtar okunamaz)', async () => {
  const d = stores();
  ls.m.clear();
  ls.m.set(PK, portfoy('GIZLI'));
  d.idb.m.set('baska', 'x');
  for (const id of [`ls:${PK}`, 'ls:baska', 'idb:baska', `idb:${PK}`, 'bilinmeyen']) {
    assert.equal((await k.readRecovery(d, id)).ok, false, id);
  }
  ls.m.set(`fagent.recovery.corrupt.${TK}`, 'ham');
  assert.equal(val(await k.readRecovery(d, `ls:fagent.recovery.corrupt.${TK}`)), 'ham');
});

test('D7: clearMirror sonrası bozuk, geri ve farklılık kovaları DAHİL kurtarma rafı boş', async () => {
  const idb = memKv();
  await saveRecovery(idb, PK, 'f1');
  await saveRecovery(idb, PK, 'b1', 'bozuk');
  await saveRecovery(idb, PK, 'g1', 'geri');
  idb.m.set(PK, 'ayna');
  assert.equal(idb.m.size, 4);
  const r = await clearMirror(LS, idb, [PK]);
  assert.ok(r.ok);
  assert.deepEqual(val(await idb.list(RECOVERY_IDB_PREFIX)), []);
  assert.equal(val(await k.listRecoveries({ ls: LS, idb })).filter(x => x.kaynak === 'indexedDB').length, 0);
});

// ---- Son tur: O-a, D-a, D-b, D-c, D-d ----
const { backupMod } = { backupMod: await import('../../src/backup.ts') };
const EMPTYP = JSON.stringify({ onboarded: false, holdings: [], txns: [], realizedPnl: 0 });
const bekle = () => new Promise(r => setTimeout(r, 15));

test('O-a: resetMarkerActive — damga + süre sınırı; eski biçimli/okunamayan değer etkin SAYILMAZ; null/undefined değil', () => {
  const now = 1_800_000_000_000;
  assert.equal(resetMarkerActive(String(now - 1000), now), true);
  assert.equal(resetMarkerActive(String(now - 31_000), now), false, '30 sn sonra etkisiz');
  assert.equal(resetMarkerActive(String(now + 5000), now), true, 'küçük saat sapması etkin');
  assert.equal(resetMarkerActive('1', now), false, 'eski biçimli/okunamayan');
  assert.equal(resetMarkerActive('abc', now), false);
  assert.equal(resetMarkerActive(null, now), false);
  assert.equal(resetMarkerActive(undefined, now), false);
  assert.equal(isEmptyPortfolioRaw(EMPTYP), true);
  assert.equal(isEmptyPortfolioRaw(null), true);
  assert.equal(isEmptyPortfolioRaw(portfoy('A')), false);
  assert.equal(isEmptyPortfolioRaw(JSON.stringify({ onboarded: true, holdings: [], txns: [], realizedPnl: 0 })), false, 'Kendi paramı gireceğim durumu boş SAYILMAZ');
  assert.equal(isEmptyPortfolioRaw('{bozuk'), false);
});

test('O-a: TAKILI (süresi geçmiş) işaret + sıradan yabancı yazım -> bekleyen değer atılmaz, çakışma sayılır, yanlış "silindi" bildirimi yok', async () => {
  const { d, calls } = deps(true);
  store.actions.startEmpty();
  ls.failSet = 'QuotaExceededError';
  store.actions.addHolding('BEKLEYEN', 'hisse', 100);
  ls.failSet = null;
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now() - 120_000)); // takılı işaret
  const diger = portfoy('DIGER');
  ls.m.set(PK, diger);
  const out = handleTabEvent({ key: PK, newValue: diger }, d);
  await out.settled;
  assert.deepEqual(out.discarded, []);
  assert.deepEqual(out.conflicts, [PK]);
  assert.equal(calls.start, 0, 'takılı işaret yazıcıyı durdurmaz');
  assert.ok(!yd.getTabNotice().includes('veriler silindi'), 'yanlış bildirim yok');
  assert.deepEqual(adlar(), ['BEKLEYEN']);
  ls.m.delete(MIRROR_CLEARED_KEY); sifirlaDurum();
  store.actions.startEmpty();
});

test('O-a: TAZE işaret olsa bile DOLU yabancı yazım silme sayılmaz (yalnız boş değer silme)', async () => {
  const { d } = deps(true);
  store.actions.startEmpty();
  ls.failSet = 'QuotaExceededError';
  store.actions.addHolding('BEKLEYEN', 'hisse', 100);
  ls.failSet = null;
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now()));
  const diger = portfoy('DIGER');
  ls.m.set(PK, diger);
  const out = handleTabEvent({ key: PK, newValue: diger }, d);
  await out.settled;
  assert.deepEqual(out.discarded, []);
  assert.deepEqual(out.conflicts, [PK]);
  // işaret olayı da geldiğinde: disk dolu -> bekleyen atılmaz
  const o2 = handleTabEvent({ key: MIRROR_CLEARED_KEY, newValue: ls.m.get(MIRROR_CLEARED_KEY)! }, d);
  assert.deepEqual(o2.discarded, []);
  assert.deepEqual(adlar(), ['BEKLEYEN']);
  ls.m.delete(MIRROR_CLEARED_KEY); sifirlaDurum();
  store.actions.startEmpty();
});

test('O-a: takılı işaretle kullanıcının kendi işlemi YAZILIR (commit atmaz), yanlış bildirim yok; eski işaret olayı yok sayılır', () => {
  const { d, calls } = deps();
  store.actions.startEmpty();
  store.actions.addHolding('A', 'hisse', 100);
  ls.m.set(MIRROR_CLEARED_KEY, String(Date.now() - 120_000));
  ls.m.set(PK, portfoy('A', 'YABANCI')); // sıradan yabancı yazım, olay gecikti
  const got: string[] = [];
  store.setDivergenceSink((_k, raw) => { got.push(raw); return true; });
  try { store.actions.addHolding('B', 'hisse', 100); } finally { store.setDivergenceSink(undefined); }
  assert.ok(ls.m.get(PK)!.includes('"B"') || ls.m.get(PK)!.includes('B'), 'kullanıcı işlemi yazıldı');
  assert.deepEqual(adlar().includes('B'), true);
  assert.equal(got.length, 1, 'ezilen sürüm kurtarmaya verildi');
  assert.ok(!yd.getTabNotice().includes('veriler silindi'));
  handleTabEvent({ key: MIRROR_CLEARED_KEY, newValue: ls.m.get(MIRROR_CLEARED_KEY)! }, d);
  assert.equal(calls.start, 0, 'süresi geçmiş işaret olayı yazıcıyı durdurmaz');
  ls.m.delete(MIRROR_CLEARED_KEY);
  store.actions.startEmpty();
});

test('O-a: createForeignResetGate zamanlayıcı — işaret takılırsa süre dolunca yazıcı sürer; hâlâ etkinse sürmez; bitiş olayı zamanlayıcıyı iptal eder', () => {
  const log: string[] = [];
  const w = { pause: () => log.push('pause'), resume: () => log.push('resume'), request: () => log.push('request') };
  const timers: { fn: () => void; ms: number; iptal?: boolean }[] = [];
  const timer = { set: (fn: () => void, ms: number) => { const t = { fn, ms }; timers.push(t); return t; }, clear: (h: unknown) => { (h as { iptal?: boolean }).iptal = true; } };
  let aktif = true;
  const g = createForeignResetGate(w, () => false, () => aktif, 31_000, timer);
  g.start();
  assert.deepEqual([log, timers[0].ms], [['pause'], 31_000]);
  timers[0].fn(); // süre doldu, işaret hâlâ etkin (taze)
  assert.deepEqual(log, ['pause']);
  g.start(); aktif = false;
  timers[1].fn(); // süre doldu, işaret etkin değil -> sürdür
  assert.deepEqual(log, ['pause', 'pause', 'resume', 'request']);
  g.start(); g.end();
  assert.equal(timers[2].iptal, true);
});

test('D-a: restoreBackup başarılıysa kanca portföyü diskten tazeler; kendi yazımız "yabancı" sanılmaz (kancasız sanılırdı)', () => {
  const bak = backupMod;
  const kur = (hook: boolean) => {
    bak.setAfterApplyHook(hook ? (keys => { if (keys.includes(PK)) store.reloadPortfolioFromDisk(); }) : undefined);
    store.actions.startEmpty();
    store.actions.addHolding('ESKI', 'hisse', 100);
    const got: string[] = [];
    store.setDivergenceSink((_k, raw) => { got.push(raw); return true; });
    const r = bak.restoreBackup(JSON.stringify({ fagentBackup: 1, createdAt: '2026-10-31T00:00:00Z', data: { [PK]: portfoy('GERIYUKLENEN') } }));
    assert.ok(r.ok);
    const bellek = adlar();
    store.actions.addHolding('SONRA', 'hisse', 100);
    store.setDivergenceSink(undefined);
    return { got, bellek };
  };
  const kancali = kur(true);
  assert.deepEqual(kancali.bellek, ['GERIYUKLENEN']);
  assert.deepEqual(kancali.got, [], 'kendi geri yüklememiz yabancı yazım sayılmadı');
  const kancasiz = kur(false);
  assert.equal(kancasiz.got.length, 1, 'kontrol grubu: kanca yokken yanlış alarm');
  bak.setAfterApplyHook(undefined);
  store.actions.startEmpty();
});

test('D-b (KVKK): kopya alınırken SIFIRLA tamamlanırsa (işaret kalktı, kaynak silindi) yazılan "geri" kaydı SİLİNİR, hiçbir şey yazılmaz', async () => {
  const d = stores();
  ls.m.clear(); yd.clearPendingWrites();
  ls.m.set(TK, '{"fon":1}');
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":10}');
  const orig = d.idb.addIfAbsent.bind(d.idb);
  d.idb.addIfAbsent = async (key, v) => { // 'geri' kaydı yazılırken başka sekmede SIFIRLA bitti
    const r = await orig(key, v);
    ls.m.delete(TK); ls.m.delete(`fagent.recovery.corrupt.${TK}`); ls.m.delete(MIRROR_CLEARED_KEY);
    return r;
  };
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  assert.ok(!r.ok && r.neden === 'sifirlama-suruyor');
  assert.deepEqual([...d.idb.m.keys()].filter(x => x.includes('geri.')), [], 'silinen kullanıcı verisinin kopyası rafta kalmadı');
  assert.equal(ls.m.get(TK), undefined, 'geri yükleme sıfırlanan veriyi diriltmedi');
});

test('D-b: yalnız katmanın değeri başka yerden değişirse "durum-degisti" döner, kayıt geri alınır', async () => {
  const d = stores();
  ls.m.clear(); yd.clearPendingWrites();
  ls.m.set(TK, '{"fon":1}');
  ls.m.set(`fagent.recovery.corrupt.${TK}`, '{"fon":10}');
  const orig = d.idb.addIfAbsent.bind(d.idb);
  d.idb.addIfAbsent = async (key, v) => { const r = await orig(key, v); ls.m.set(TK, '{"fon":2}'); return r; };
  const r = await k.restoreRecovery(d, `ls:fagent.recovery.corrupt.${TK}`);
  assert.ok(!r.ok && r.neden === 'durum-degisti');
  assert.deepEqual([...d.idb.m.keys()], []);
  assert.equal(ls.m.get(TK), '{"fon":2}');
});

test('D-c: bekletmede sonraki yazımda kopya YENİDEN denenir; başarılıysa bekletme kalkar ve en güncel değer yazılır; başarısızsa (IndexedDB yok) sürer', async () => {
  sifirlaDurum();
  let preserveOk = false;
  const calls: string[] = [];
  const d = { ...deps().d, preserveForeign: async (_k: string, v: string) => { calls.push(v); return preserveOk; } };
  store.actions.startEmpty();
  ls.failSet = 'QuotaExceededError';
  store.actions.addHolding('BEKLEYEN', 'hisse', 100);
  ls.failSet = null;
  const diger = portfoy('DIGER');
  ls.m.set(PK, diger);
  await handleTabEvent({ key: PK, newValue: diger }, d).settled;
  assert.equal(yd.getTabNotice(), yd.TAB_CONFLICT_BEKLEMEDE);
  store.actions.addHolding('IKI', 'hisse', 100); // yazım denemesi -> kopya yeniden denenir, hâlâ başarısız
  await bekle();
  assert.equal(calls.length, 2, 'yeniden denendi');
  assert.equal(ls.m.get(PK), diger, 'başarısızken diske yazılmadı');
  assert.equal(yd.getTabNotice(), yd.TAB_CONFLICT_BEKLEMEDE);
  preserveOk = true; // IndexedDB düzeldi
  store.actions.addHolding('UC', 'hisse', 100);
  await bekle();
  assert.deepEqual([...yd.getUnsavedKeys()], [], 'bekletme kalktı, değer yazıldı');
  const disk = JSON.parse(ls.m.get(PK)!).holdings.map((h: { name: string }) => h.name);
  assert.deepEqual(disk, ['BEKLEYEN', 'IKI', 'UC'], 'en güncel bekleyen değer diske indi');
  assert.equal(yd.getTabNotice(), '');
  sifirlaDurum(); store.actions.startEmpty();
});

test('D-d: disk EMPTY\'ye (boş portföy durumu) ya da anahtarsız hale dönmüşse ve son bilinen değer doluysa bu SİLME sayılır: eski bellekten geri yazılmaz (işaret olmasa da)', () => {
  sifirlaDurum();
  for (const bosDeger of [EMPTYP, null as string | null]) {
    store.actions.startEmpty();
    store.actions.addHolding('ESKI', 'hisse', 100);
    if (bosDeger === null) ls.m.delete(PK); else ls.m.set(PK, bosDeger);
    ls.m.delete(MIRROR_CLEARED_KEY);
    store.actions.addHolding('GERIYAZILMAMALI', 'hisse', 100);
    const disk = ls.m.get(PK) ?? '';
    assert.ok(!disk.includes('ESKI') && !disk.includes('GERIYAZILMAMALI'), `disk geri doldurulmadı (${bosDeger === null ? 'anahtar yok' : 'EMPTY'})`);
    assert.deepEqual(adlar(), []);
    assert.equal(yd.getTabNotice(), yd.TAB_RESET_DISCARDED_MESSAGE);
    sifirlaDurum();
  }
  // kontrol: kendi SIFIRLA'mız bu yola girmez
  store.actions.startEmpty();
  store.actions.addHolding('K', 'hisse', 100);
  store.actions.reset();
  store.actions.startEmpty();
  store.actions.addHolding('SONRAKI', 'hisse', 100);
  assert.deepEqual(adlar(), ['SONRAKI']);
  assert.equal(yd.getTabNotice(), '');
});

test('D-d: bekleyen (kendi kaydedilmemiş) değer varsa boş disk başka sekmeden gelmiş sayılmaz (başarısız geri yüklemenin rollback durumu)', () => {
  sifirlaDurum();
  store.actions.startEmpty();
  store.actions.addHolding('ESKI', 'hisse', 100);
  ls.failSet = 'QuotaExceededError';
  store.actions.addHolding('BEKLEYEN', 'hisse', 100); // bekleyen
  ls.failSet = null;
  ls.m.delete(PK); // rollback eksik kaldı: disk boş
  store.actions.addHolding('SONRAKI', 'hisse', 100);
  assert.deepEqual(adlar(), ['ESKI', 'BEKLEYEN', 'SONRAKI'], 'kullanıcının işlemi atılmadı');
  assert.equal(yd.getTabNotice(), '');
  sifirlaDurum();
});
