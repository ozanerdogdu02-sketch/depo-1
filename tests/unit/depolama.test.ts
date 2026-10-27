// Depolama katmanı birim testleri. IndexedDB Node'da yok: aşağıdaki taklit YALNIZCA test içindir
// (bağımlılık yok). Gerçek tarayıcı IndexedDB'sine karşı doğrulanmadı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdbStore, createLocalStore, createResilientStore, migrateKeys, fromRecord, toRecord, mergeRecord, validateTxnExtras, UPGRADE_STEPS, isNewerSchema, bootMirror, clearMirror, createMirrorWriter, MIRROR_CLEARED_KEY, RECOVERY_IDB_PREFIX, runResetClear, saveRecovery, corruptNoteKey, CORRUPT_NOTE_PREFIX } from '../../src/storage/index.ts';
import { preserveCorruptRaw, clearRecoveryKeys, setOversizeSink, MAX_RAW_COPY, RECOVERY_PREFIX } from '../../src/recovery.ts';
import type { KvStore, StorageLike, Result } from '../../src/storage/index.ts';
import { xirrOf } from '../../src/analytics.ts';
import { totalValue } from '../../src/store.ts';
import type { PortfolioState, Txn } from '../../src/store.ts';

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

interface FakeOpts { failOpen?: boolean; blocked?: boolean; failOps?: boolean; failName?: string; versionError?: boolean; blockedThenOpen?: boolean }
function fakeIdb(opts: FakeOpts = {}) {
  const dbs = new Map<string, { version: number; stores: Map<string, Map<string, unknown>> }>();
  const opened: { closed: boolean; fireVersionChange(): void; fireClose(): void }[] = [];
  const later = (fn: () => void) => setTimeout(fn, 0);
  const mkReq = <T>(exec: () => T, tx?: { pend: number; fin: () => void; error: unknown; aborted: boolean; abort: () => void }) => {
    const r: Record<string, unknown> = { result: undefined, error: null, onsuccess: null, onerror: null };
    if (tx) tx.pend++;
    later(() => {
      try {
        if (opts.failOps) throw Object.assign(new Error('io'), { name: opts.failName ?? 'UnknownError' });
        r.result = exec();
        (r.onsuccess as (() => void) | null)?.();
      } catch (e) {
        r.error = e;
        let prevented = false;
        (r.onerror as ((ev: unknown) => void) | null)?.({ preventDefault: () => { prevented = true; }, stopPropagation: () => {} });
        if (tx && !prevented) { tx.error = e; tx.aborted = true; tx.abort(); }
      }
      if (tx && --tx.pend === 0 && !tx.aborted) later(tx.fin);
    });
    return r as unknown as IDBRequest;
  };
  const factory = {
    open(name: string, version: number) {
      const r: Record<string, unknown> = { result: undefined, error: null };
      later(() => {
        if (opts.failOpen) { r.error = new Error('açılamadı'); (r.onerror as () => void)(); return; }
        if (opts.versionError) { r.error = Object.assign(new Error('v'), { name: 'VersionError' }); (r.onerror as () => void)(); return; }
        let rec = dbs.get(name);
        const old = rec?.version ?? 0;
        if (!rec) { rec = { version: 0, stores: new Map() }; dbs.set(name, rec); }
        const handle = { closed: false, fireVersionChange() { (db as { onversionchange?: () => void }).onversionchange?.(); }, fireClose() { (db as { onclose?: () => void }).onclose?.(); } };
        opened.push(handle);
        const db = {
          close: () => { handle.closed = true; },
          objectStoreNames: { contains: (n: string) => rec!.stores.has(n) },
          createObjectStore: (n: string) => { rec!.stores.set(n, new Map()); },
          transaction: (n: string) => {
            if (handle.closed) throw Object.assign(new Error('kapalı'), { name: 'InvalidStateError' });
            const data = rec!.stores.get(n)!;
            const tx: Record<string, unknown> = { pend: 0, error: null, aborted: false, oncomplete: null, onerror: null, onabort: null };
            tx.fin = () => (tx.oncomplete as () => void)?.();
            tx.abort = () => (tx.onabort as () => void)?.();
            tx.objectStore = () => ({
              get: (k: string) => mkReq(() => structuredClone(data.get(k)), tx as never),
              put: (v: { key: string }) => mkReq(() => { data.set(v.key, structuredClone(v)); return v.key; }, tx as never),
              add: (v: { key: string }) => mkReq(() => {
                if (data.has(v.key)) throw Object.assign(new Error('var'), { name: 'ConstraintError' });
                data.set(v.key, structuredClone(v)); return v.key;
              }, tx as never),
              delete: (k: string) => mkReq(() => { data.delete(k); }, tx as never),
              getAllKeys: () => mkReq(() => [...data.keys()], tx as never),
            });
            return tx;
          },
        };
        r.result = db;
        if (old < version) {
          (r.onupgradeneeded as ((e: unknown) => void) | undefined)?.({ oldVersion: old });
          rec.version = version;
        }
        if (opts.blocked || opts.blockedThenOpen) {
          (r.onblocked as () => void)();
          if (opts.blockedThenOpen) later(() => (r.onsuccess as () => void)());
          return;
        }
        (r.onsuccess as () => void)();
      });
      return r as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
  return { factory, dbs, opened };
}

const val = <T>(r: Result<T>): T => { assert.ok(r.ok, JSON.stringify(r)); return (r as { value: T }).value; };

// ---- IndexedDB sarmalayıcı ----
test('idb: set/get/delete/list ve önek süzme', async () => {
  const { factory } = fakeIdb();
  const s = createIdbStore(factory);
  assert.equal(val(await s.get('fagent.a')), undefined);
  val(await s.set('fagent.a', '{"x":1}'));
  val(await s.set('fagent.b', 'b'));
  val(await s.set('baska', 'c'));
  assert.equal(val(await s.get('fagent.a')), '{"x":1}');
  assert.deepEqual(val(await s.list('fagent.')), ['fagent.a', 'fagent.b']);
  assert.equal(val(await s.list()).length, 3);
  val(await s.delete('fagent.a'));
  assert.equal(val(await s.get('fagent.a')), undefined);
});

test('idb: veri yeni örnekte (yenileme benzetimi) durur; sürüm göçü mağazayı bir kez kurar', async () => {
  const { factory, dbs } = fakeIdb();
  val(await createIdbStore(factory).set('k', 'v'));
  assert.equal(val(await createIdbStore(factory).get('k')), 'v');
  assert.equal(dbs.get('fagent')!.version, 1);
});

test('idb: sürüm adımı idempotent (mağaza varsa yeniden oluşturmaz)', () => {
  let created = 0;
  const db = { objectStoreNames: { contains: () => true }, createObjectStore: () => { created++; } } as unknown as IDBDatabase;
  UPGRADE_STEPS[1](db, 'kv');
  assert.equal(created, 0);
});

test('idb: açılamıyor/engelli/yok -> tipli hata, throw yok', async () => {
  assert.deepEqual((await createIdbStore(undefined).get('k') as { error: { code: string } }).error.code, 'unavailable');
  const f = await createIdbStore(fakeIdb({ failOpen: true }).factory).set('k', 'v');
  assert.ok(!f.ok && f.error.code === 'unavailable');
  const b = await createIdbStore(fakeIdb({ blocked: true }).factory).get('k');
  assert.ok(!b.ok && b.error.code === 'blocked');
  const o = await createIdbStore(fakeIdb({ failOps: true }).factory).get('k');
  assert.ok(!o.ok && o.error.code === 'io');
});

test('kayıt biçimi: v0 düz metin, v0 {key,value}, gelecek sürüm REDDEDİLİR; bozuk -> null', () => {
  assert.equal(fromRecord('ham'), 'ham');
  assert.equal(fromRecord({ key: 'k', value: 'v' }), 'v');
  assert.equal(fromRecord({ ...toRecord('k', 'v', 1), schema: 99 }), null); // Y2: daha yeni şema reddedilir
  assert.equal(isNewerSchema({ schema: 2 }), true);
  assert.equal(isNewerSchema({ schema: 1 }), false);
  assert.equal(fromRecord(null), null);
  assert.equal(fromRecord({ key: 'k', value: 5 }), null);
});

test('idb: bozuk kayıt -> corrupt, kayıt silinmez', async () => {
  const { factory, dbs } = fakeIdb();
  const s = createIdbStore(factory);
  val(await s.set('k', 'v'));
  dbs.get('fagent')!.stores.get('kv')!.set('k', { key: 'k', value: 42 });
  const r = await s.get('k');
  assert.ok(!r.ok && r.error.code === 'corrupt');
  assert.ok(dbs.get('fagent')!.stores.get('kv')!.has('k'));
});

// ---- localStorage ----
test('local: kota hatası quota koduyla döner; depolama yoksa unavailable', async () => {
  const ms = new MemStorage();
  const s = createLocalStore(ms);
  val(await s.set('a', '1'));
  ms.failSet = 'QuotaExceededError';
  const r = await s.set('b', '2');
  assert.ok(!r.ok && r.error.code === 'quota');
  const n = await createLocalStore(undefined).get('a');
  assert.ok(!n.ok && n.error.code === 'unavailable');
});

// ---- Düşüş (yedek) yolu ----
test('resilient: asıl depo bozukken localStorage kullanılır ve bildirilir', async () => {
  const ms = new MemStorage();
  const notes: string[] = [];
  const s = createResilientStore(createIdbStore(fakeIdb({ failOpen: true }).factory), createLocalStore(ms), n => notes.push(n.op + ':' + n.error.code));
  val(await s.set('k', 'v'));
  assert.equal(ms.getItem('k'), 'v');
  assert.equal(val(await s.get('k')), 'v');
  assert.deepEqual(notes, ['set:unavailable']); // kirli anahtar yedekten okunur (asıl depoya bakılmaz)
  assert.deepEqual(s.dirtyKeys(), ['k']);
  assert.equal(s.lastDegraded()?.code, 'unavailable');
});

test('resilient: asıl depo sağlamken yedeğe bakılmaz; bozuk kayıt yedeğe düşürmez', async () => {
  const ms = new MemStorage();
  ms.m.set('k', 'eski-ayna');
  const { factory, dbs } = fakeIdb();
  const s = createResilientStore(createIdbStore(factory), createLocalStore(ms));
  assert.equal(val(await s.get('k')), undefined);
  val(await s.set('k', 'yeni'));
  assert.equal(val(await s.get('k')), 'yeni');
  assert.equal(ms.getItem('k'), 'eski-ayna');
  assert.equal(s.lastDegraded(), undefined);
  dbs.get('fagent')!.stores.get('kv')!.set('k', { key: 'k', value: 1 });
  const r = await s.get('k');
  assert.ok(!r.ok && r.error.code === 'corrupt');
});

test('resilient: iki depo da bozuksa hata çağırana döner (yutulmaz)', async () => {
  const s = createResilientStore(createIdbStore(undefined), createLocalStore(undefined));
  const r = await s.set('k', 'v');
  assert.ok(!r.ok && r.error.code === 'unavailable');
});

// ---- Göç ----
const KEYS = ['fagent.portfolio.v1', 'fagent.agent.memory.v1', 'fagent.agent.training.v1', 'fagent.tax.v1', 'fagent.target.v1'] as const;

const OLD_PORTFOLIO = JSON.stringify({
  onboarded: true,
  holdings: [{ id: 'h1722000000000', name: 'Fon A', type: 'fon', amount: 1100, costBasis: 1000 }],
  txns: [{ id: 't1', date: '2025-01-10', holdingId: 'h1722000000000', holdingName: 'Fon A', kind: 'alis', amount: 1000, commission: 5 }],
  realizedPnl: 0,
});

test('göç: kopyalar, doğrular, kaynağı SİLMEZ; ikinci koşu idempotent', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  ms.m.set(KEYS[3], '{"fon":17.5}');
  const src = createLocalStore(ms);
  const dst = createIdbStore(fakeIdb().factory);

  const r1 = await migrateKeys(src, dst, KEYS);
  assert.ok(r1.ok);
  assert.deepEqual(r1.entries.map(e => e.status), ['kopyalandi', 'kaynakta-yok', 'kaynakta-yok', 'kopyalandi', 'kaynakta-yok']);
  assert.equal(val(await dst.get(KEYS[0])), OLD_PORTFOLIO); // bire bir
  assert.equal(ms.getItem(KEYS[0]), OLD_PORTFOLIO);          // ayna korunur
  assert.equal(ms.getItem(KEYS[3]), '{"fon":17.5}');

  const r2 = await migrateKeys(src, dst, KEYS);
  assert.deepEqual(r2.entries.map(e => e.status), ['zaten', 'kaynakta-yok', 'kaynakta-yok', 'zaten', 'kaynakta-yok']);
  assert.equal(ms.length, 2);
});

test('göç: hedefte farklı değer varsa ÜSTÜNE YAZILMAZ (cakisma)', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  const dst = createIdbStore(fakeIdb().factory);
  val(await dst.set(KEYS[0], '{"baska":true}'));
  const r = await migrateKeys(createLocalStore(ms), dst, [KEYS[0]]);
  assert.equal(r.entries[0].status, 'cakisma');
  assert.equal(val(await dst.get(KEYS[0])), '{"baska":true}');
  assert.equal(ms.getItem(KEYS[0]), OLD_PORTFOLIO);
});

function memStore(kind: KvStore['kind'] = 'memory', mangle = (v: string) => v) {
  const m = new Map<string, string>();
  const okv = <T>(value: T): Result<T> => ({ ok: true, value });
  const store: KvStore = {
    kind,
    get: async k => okv(m.get(k)),
    set: async (k, v) => { m.set(k, mangle(v)); return okv(undefined); },
    addIfAbsent: async (k, v) => { if (m.has(k)) return okv(false); m.set(k, mangle(v)); return okv(true); },
    delete: async k => { m.delete(k); return okv(undefined); },
    deleteIfEquals: async (k, e) => { if (m.get(k) !== e) return okv(false); m.delete(k); return okv(true); },
    list: async () => okv([...m.keys()]),
  };
  return { m, store };
}

test('göç: doğrulama başarısızsa hata raporlanır; başkasının/bozuk değerine dokunulmaz, kaynak durur', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  const { m, store } = memStore('memory', v => v + 'X');
  const r = await migrateKeys(createLocalStore(ms), store, [KEYS[0]]);
  assert.ok(!r.ok);
  assert.equal(r.entries[0].error?.code, 'verify');
  assert.equal(m.get(KEYS[0]), OLD_PORTFOLIO + 'X'); // kendi değerimiz değil: silinmedi
  assert.equal(ms.getItem(KEYS[0]), OLD_PORTFOLIO);
  const r2 = await migrateKeys(createLocalStore(ms), store, [KEYS[0]]);
  assert.equal(r2.entries[0].status, 'cakisma'); // sessiz değil: sonraki koşuda görünür
});

test('göç: okuma-doğrulama geçici hata verirse kendi yazdığı kopya geri alınır', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  const { m, store } = memStore();
  let reads = 0;
  const flaky: KvStore = { ...store, get: async k => (++reads === 1 ? { ok: false, error: { code: 'io', message: 'x' } } : store.get(k)) };
  const r = await migrateKeys(createLocalStore(ms), flaky, [KEYS[0]]);
  assert.ok(!r.ok);
  assert.equal(r.entries[0].error?.code, 'io');
  assert.equal(m.has(KEYS[0]), false);
  assert.equal(ms.getItem(KEYS[0]), OLD_PORTFOLIO);
});

test('göç O1: yedekli (resilient) depo hedef olamaz; hiçbir şey yazılmaz', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  const ls2 = new MemStorage();
  const res = createResilientStore(createIdbStore(fakeIdb().factory), createLocalStore(ls2));
  const r = await migrateKeys(createLocalStore(ms), res, KEYS);
  assert.ok(!r.ok);
  assert.equal(r.entries.length, 0);
  assert.equal(r.error?.code, 'unavailable');
  assert.equal(ls2.length, 0);
});

test('resilient O1: delete yedeğe DÜŞMEZ, hata olduğu gibi döner; aynalar tutarlı kalır', async () => {
  const ls = new MemStorage();
  ls.m.set('k', 'ayna');
  const { factory } = fakeIdb({ failOpen: true });
  const notes: string[] = [];
  const s = createResilientStore(createIdbStore(factory), createLocalStore(ls), n => notes.push(n.op));
  const r = await s.delete('k');
  assert.ok(!r.ok && r.error.code === 'unavailable');
  assert.equal(ls.getItem('k'), 'ayna');
  assert.deepEqual(notes, []);
});

test('göç O2: addIfAbsent mevcut kaydı ezmez (ConstraintError -> false); iki eşzamanlı göçte ilk yazan kalır', async () => {
  const { factory } = fakeIdb();
  const s = createIdbStore(factory);
  assert.equal(val(await s.addIfAbsent('k', 'A')), true);
  assert.equal(val(await s.addIfAbsent('k', 'B')), false);
  assert.equal(val(await s.get('k')), 'A');
  const ms1 = new MemStorage(); ms1.m.set(KEYS[0], 'S1');
  const ms2 = new MemStorage(); ms2.m.set(KEYS[0], 'S2');
  const dst = createIdbStore(fakeIdb().factory);
  const [a, b] = await Promise.all([
    migrateKeys(createLocalStore(ms1), dst, [KEYS[0]]),
    migrateKeys(createLocalStore(ms2), dst, [KEYS[0]]),
  ]);
  assert.deepEqual([a.entries[0].status, b.entries[0].status].sort(), ['cakisma', 'kopyalandi']);
  assert.equal(val(await dst.get(KEYS[0])), 'S1');
});

test('idb O2: deleteIfEquals yalnız beklenen değerde siler', async () => {
  const s = createIdbStore(fakeIdb().factory);
  val(await s.set('k', 'A'));
  assert.equal(val(await s.deleteIfEquals('k', 'B')), false);
  assert.equal(val(await s.get('k')), 'A');
  assert.equal(val(await s.deleteIfEquals('k', 'A')), true);
  assert.equal(val(await s.get('k')), undefined);
});

test('idb D1: versionchange bağlantıyı kapatır ve sonraki işlem yeniden açar; blocked sonrası geç açılış kapatılır', async () => {
  const f = fakeIdb();
  const s = createIdbStore(f.factory);
  val(await s.set('k', 'v'));
  f.opened[0].fireVersionChange();
  assert.equal(f.opened[0].closed, true);
  assert.equal(val(await s.get('k')), 'v');
  assert.equal(f.opened.length, 2);

  const g = fakeIdb({ blockedThenOpen: true });
  const r = await createIdbStore(g.factory).get('k');
  assert.ok(!r.ok && r.error.code === 'blocked');
  await new Promise(res => setTimeout(res, 10));
  assert.equal(g.opened[0].closed, true);
});

test('idb D2: kota hatası quota koduyla eşlenir; işlenmemiş reddedilme oluşmaz', async () => {
  let unhandled = 0;
  const h = () => { unhandled++; };
  process.on('unhandledRejection', h);
  const s = createIdbStore(fakeIdb({ failOps: true, failName: 'QuotaExceededError' }).factory);
  const r = await s.set('k', 'v');
  assert.ok(!r.ok && r.error.code === 'quota');
  await new Promise(res => setTimeout(res, 10));
  process.off('unhandledRejection', h);
  assert.equal(unhandled, 0);
});

test('idb D4: VersionError ayrı kodla raporlanır', async () => {
  const r = await createIdbStore(fakeIdb({ versionError: true }).factory).get('k');
  assert.ok(!r.ok && r.error.code === 'version');
});

test('idb Y2: daha yeni şemalı kayda set yazmaz (version), get okumaz (version); kayıt DEĞİŞMEZ', async () => {
  const { factory, dbs } = fakeIdb();
  const s = createIdbStore(factory);
  val(await s.set('k', 'v1'));
  const yeni = { key: 'k', value: 'v1', updatedAt: 1, schema: 2, ek: { gelecek: true } };
  dbs.get('fagent')!.stores.get('kv')!.set('k', yeni);
  const w = await s.set('k', 'v2');
  assert.ok(!w.ok && w.error.code === 'version');
  const g = await s.get('k');
  assert.ok(!g.ok && g.error.code === 'version');
  assert.deepEqual(dbs.get('fagent')!.stores.get('kv')!.get('k'), yeni);
  assert.equal(mergeRecord(undefined, 'a', 'b', 5).schema, 1);
});

test('D5 validateTxnExtras: geçerli, eksik (eski kayıt) ve geçersiz girdiler', () => {
  assert.deepEqual(validateTxnExtras({}), { ok: true, value: {} });
  assert.deepEqual(validateTxnExtras({ quantity: 2.5, unitPrice: 100, currency: 'USD' }), { ok: true, value: { quantity: 2.5, unitPrice: 100, currency: 'USD' } });
  for (const bad of [{ quantity: NaN }, { quantity: Infinity }, { unitPrice: '5' }, { quantity: -1 }, { unitPrice: 1e16 },
    { currency: 'usd' }, { currency: 'US' }, { currency: 'USDX' }, { currency: 5 }, null, [], 'x']) {
    assert.equal(validateTxnExtras(bad).ok, false, JSON.stringify(bad));
  }
  const r = validateTxnExtras({ quantity: NaN, currency: 'x' });
  assert.ok(!r.ok && r.errors.length === 2);
});

test('göç: bir anahtarın hatası diğerlerini durdurmaz; hedef kapalıysa hepsi hata olarak raporlanır', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  ms.m.set(KEYS[1], '{}');
  const r = await migrateKeys(createLocalStore(ms), createIdbStore(fakeIdb({ failOpen: true }).factory), KEYS.slice(0, 2));
  assert.ok(!r.ok);
  assert.deepEqual(r.entries.map(e => e.status), ['hata', 'hata']);
  assert.equal(ms.length, 2);
});

// ---- Txn ekleme: isteğe bağlı alanlar ----
test('Txn: yeni alanlar isteğe bağlı; eski kayıt geçerli ve hesap sonucu aynı', () => {
  const eski: Txn = JSON.parse(OLD_PORTFOLIO).txns[0];
  assert.equal(eski.quantity, undefined);
  assert.equal(eski.unitPrice, undefined);
  assert.equal(eski.currency, undefined);

  const yeni: Txn = { ...eski, quantity: 10, unitPrice: 100, currency: 'TRY' };
  const mk = (t: Txn): PortfolioState => ({
    onboarded: true, realizedPnl: 0,
    holdings: [{ id: 'h1722000000000', name: 'Fon A', type: 'fon', amount: 1100, costBasis: 1000 }],
    txns: [t],
  });
  const today = new Date(2026, 0, 10);
  assert.equal(totalValue(mk(eski)), totalValue(mk(yeni)));
  const a = xirrOf(mk(eski), today);
  assert.ok(a);
  assert.deepEqual(xirrOf(mk(yeni), today), a);
});

test('Txn: eski JSON yeni alanlar eklenmiş haliyle gidiş-dönüşte alanları korur', () => {
  const t: Txn = { id: 't', date: '2025-01-01', holdingId: 'h', holdingName: 'x', kind: 'alis', amount: 10, quantity: 2, unitPrice: 5, currency: 'USD' };
  assert.deepEqual(JSON.parse(JSON.stringify(t)), t);
});

// ======== P3 bağlama: Y1-Y5 ========
test('Y1: version/blocked hatasında YAZMA yedeğe düşmez; hata döner, yedeğe yazılmaz', async () => {
  for (const f of [fakeIdb({ versionError: true }), fakeIdb({ blocked: true })]) {
    const ms = new MemStorage();
    const s = createResilientStore(createIdbStore(f.factory), createLocalStore(ms));
    const r = await s.set('k', 'v');
    assert.ok(!r.ok && (r.error.code === 'version' || r.error.code === 'blocked'));
    assert.equal(ms.length, 0);
    assert.deepEqual(s.dirtyKeys(), []);
    const a = await s.addIfAbsent('k', 'v');
    assert.ok(!a.ok);
    assert.equal(ms.length, 0);
  }
});

test('Y1: io/quota hatasında yedeğe yazılır, anahtar KİRLİ; okuma önce yedeği kullanır; asıl depo düzelince kirlilik kalkar', async () => {
  const ms = new MemStorage();
  const prim = fakeIdb();
  const base = createIdbStore(prim.factory);
  val(await base.set('k', 'ESKI'));
  let failNow: string | null = 'QuotaExceededError';
  const flaky: KvStore = { ...base, kind: 'indexeddb',
    set: async (k, v) => (failNow ? { ok: false, error: { code: failNow === 'QuotaExceededError' ? 'quota' : 'io', message: 'x' } } : base.set(k, v)) };
  const notes: string[] = [];
  const s = createResilientStore(flaky, createLocalStore(ms), n => notes.push(n.op + ':' + n.error.code));
  val(await s.set('k', 'YENI'));
  assert.equal(ms.getItem('k'), 'YENI');
  assert.deepEqual(s.dirtyKeys(), ['k']);
  assert.equal(val(await s.get('k')), 'YENI'); // asıl depodaki ESKI değil
  assert.deepEqual(val(await s.list('k')), ['k']);
  // Y4: kirli anahtar varken lastDegraded temizlenmez
  assert.equal(s.lastDegraded()?.code, 'quota');
  failNow = null;
  val(await s.set('k', 'YENI2'));
  assert.deepEqual(s.dirtyKeys(), []);
  assert.equal(val(await s.get('k')), 'YENI2');
  assert.equal(val(await base.get('k')), 'YENI2');
  assert.equal(s.lastDegraded(), undefined); // Y4: asıl depo başarılı + kirli yok -> temizlendi
  assert.deepEqual(notes, ['set:quota']);
});

test('Y1: kirli anahtarın silinmesi yedek kopyayı da siler (silinen veri geri gelmez)', async () => {
  const ms = new MemStorage();
  const base = createIdbStore(fakeIdb().factory);
  const flaky: KvStore = { ...base, set: async () => ({ ok: false, error: { code: 'io', message: 'x' } }) };
  const s = createResilientStore(flaky, createLocalStore(ms));
  val(await s.set('k', 'v'));
  assert.equal(ms.getItem('k'), 'v');
  val(await s.delete('k'));
  assert.equal(ms.getItem('k'), null);
  assert.deepEqual(s.dirtyKeys(), []);
  assert.equal(val(await s.get('k')), undefined);
});

test('Y4: lastDegraded asıl depo başarılı olunca temizlenir', async () => {
  const ms = new MemStorage();
  const base = createIdbStore(fakeIdb().factory);
  let bad = true;
  const flaky: KvStore = { ...base, get: async k => (bad ? { ok: false, error: { code: 'io', message: 'x' } } : base.get(k)) };
  const s = createResilientStore(flaky, createLocalStore(ms));
  await s.get('k');
  assert.equal(s.lastDegraded()?.code, 'io');
  bad = false;
  await s.get('k');
  assert.equal(s.lastDegraded(), undefined);
});

test('Y3: db.onclose önbelleği sıfırlar; InvalidStateError (kapalı bağlantı) bir kez yeniden açıp dener', async () => {
  const f = fakeIdb();
  const s = createIdbStore(f.factory);
  val(await s.set('k', 'v'));
  f.opened[0].fireClose();
  assert.equal(val(await s.get('k')), 'v');
  assert.equal(f.opened.length, 2); // onclose -> yeniden açıldı

  // onclose hiç gelmedi ama bağlantı kapalı: transaction() InvalidStateError -> sıfırla + yeniden dene
  const g = fakeIdb();
  const t = createIdbStore(g.factory);
  val(await t.set('k', 'v'));
  (g.opened[0] as unknown as { closed: boolean }).closed = true;
  assert.equal(val(await t.get('k')), 'v');
  assert.equal(g.opened.length, 2);
});

test('Y5: göç geri alma sonucu rapora yansır (geri-alindi / degisti / basarisiz / yapilmadi)', async () => {
  const mk = async (rbBehavior: 'ok-true' | 'ok-false' | 'err') => {
    const ms = new MemStorage();
    ms.m.set(KEYS[0], OLD_PORTFOLIO);
    const { store } = memStore();
    let reads = 0;
    const t: KvStore = { ...store,
      get: async k => (++reads === 1 ? { ok: false, error: { code: 'io', message: 'x' } } : store.get(k)),
      deleteIfEquals: async (k, e) => rbBehavior === 'err' ? { ok: false, error: { code: 'io', message: 'rb' } } : rbBehavior === 'ok-true' ? store.deleteIfEquals(k, e) : { ok: true, value: false } };
    return (await migrateKeys(createLocalStore(ms), t, [KEYS[0]])).entries[0];
  };
  assert.equal((await mk('ok-true')).rollback, 'geri-alindi');
  assert.equal((await mk('ok-false')).rollback, 'degisti');
  const e = await mk('err');
  assert.equal(e.rollback, 'basarisiz');
  assert.equal(e.rollbackError?.code, 'io');
  // okuma başarılı ama eşleşmedi: geri alma denenmedi
  const ms = new MemStorage(); ms.m.set(KEYS[0], OLD_PORTFOLIO);
  const { store } = memStore('memory', v => v + 'X');
  assert.equal((await migrateKeys(createLocalStore(ms), store, [KEYS[0]])).entries[0].rollback, 'yapilmadi');
});

// ======== P3 bağlama: açılış kuralları (localStorage esas, IndexedDB ayna) ========
const PK = KEYS as readonly string[];
const mkBoot = () => {
  const ms = new MemStorage();
  const { factory, dbs } = fakeIdb();
  return { ms, ls: createLocalStore(ms), idb: createIdbStore(factory), dbs };
};
const actionOf = (r: Awaited<ReturnType<typeof bootMirror>>, k: string) => r.entries.find(e => e.key === k)!.action;

test('açılış: l var / i yok -> kopyalanır; ikinci açılışta esit', async () => {
  const { ms, ls, idb } = mkBoot();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  const r = await bootMirror(ls, idb, PK);
  assert.equal(actionOf(r, KEYS[0]), 'kopyalandi');
  assert.equal(actionOf(r, KEYS[1]), 'yok');
  assert.equal(val(await idb.get(KEYS[0])), OLD_PORTFOLIO);
  assert.equal(actionOf(await bootMirror(ls, idb, PK), KEYS[0]), 'esit');
  assert.ok(r.ok);
});

test('açılış: localStorage tamamen boş + IndexedDB dolu -> TÜM katmanlar geri yüklenir ve doğrulanır', async () => {
  const { ms, ls, idb } = mkBoot();
  val(await idb.set(KEYS[0], OLD_PORTFOLIO));
  val(await idb.set(KEYS[3], '{"fon":17.5}'));
  const r = await bootMirror(ls, idb, PK);
  assert.equal(actionOf(r, KEYS[0]), 'geri-yuklendi');
  assert.equal(actionOf(r, KEYS[3]), 'geri-yuklendi');
  assert.equal(ms.getItem(KEYS[0]), OLD_PORTFOLIO);
  assert.equal(ms.getItem(KEYS[3]), '{"fon":17.5}');
});

test('açılış: ikisi de var ve farklı -> HİÇBİRİ ezilmez; l esas; IndexedDB değeri kurtarma kaydına alınır', async () => {
  const { ms, ls, idb } = mkBoot();
  ms.m.set(KEYS[0], 'LS-DEGER');
  val(await idb.set(KEYS[0], 'IDB-DEGER'));
  const r = await bootMirror(ls, idb, PK);
  assert.equal(actionOf(r, KEYS[0]), 'farkli');
  assert.equal(ms.getItem(KEYS[0]), 'LS-DEGER');
  assert.equal(val(await idb.get(KEYS[0])), 'IDB-DEGER');
  assert.equal(val(await idb.get(RECOVERY_IDB_PREFIX + KEYS[0])), 'IDB-DEGER');
  // tekrar açılış: aynı kurtarma kopyası çoğalmaz
  await bootMirror(ls, idb, PK);
  assert.equal(val(await idb.list(RECOVERY_IDB_PREFIX)).length, 1);
  // farklı eski kopya varken yeni farklı değer: eski kurtarma kaydı ezilmez
  val(await idb.set(KEYS[0], 'IDB-DEGER-2'));
  await bootMirror(ls, idb, PK);
  assert.equal(val(await idb.get(RECOVERY_IDB_PREFIX + KEYS[0])), 'IDB-DEGER');
  assert.equal(val(await idb.list(RECOVERY_IDB_PREFIX)).length, 2);
});

test('açılış: kısmi durum (l bazı katmanlarda var, birinde yok, i dolu) -> geri yükleme YOK, kopya korunur', async () => {
  const { ms, ls, idb } = mkBoot();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  val(await idb.set(KEYS[0], OLD_PORTFOLIO));
  val(await idb.set(KEYS[2], '[{"q":"a"}]'));
  const r = await bootMirror(ls, idb, PK);
  assert.equal(actionOf(r, KEYS[2]), 'ls-eksik-korundu');
  assert.equal(ms.getItem(KEYS[2]), null);
  assert.equal(val(await idb.get(RECOVERY_IDB_PREFIX + KEYS[2])), '[{"q":"a"}]');
});

test('açılış: IndexedDB kapalı/hatalı -> anahtarlar hata, localStorage DOKUNULMAZ, throw yok', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  const r = await bootMirror(createLocalStore(ms), createIdbStore(fakeIdb({ failOpen: true }).factory), PK);
  assert.ok(!r.ok);
  assert.ok(r.entries.every(e => e.action === 'hata'));
  assert.equal(ms.getItem(KEYS[0]), OLD_PORTFOLIO);
});

test('açılış: bozuk (corrupt) IndexedDB kaydı localStorage esas olarak raporlanır, l değişmez', async () => {
  const { ms, ls, idb, dbs } = mkBoot();
  ms.m.set(KEYS[0], OLD_PORTFOLIO);
  val(await idb.set(KEYS[0], 'x'));
  dbs.get('fagent')!.stores.get('kv')!.set(KEYS[0], { key: KEYS[0], value: 7 });
  const r = await bootMirror(ls, idb, PK);
  assert.equal(actionOf(r, KEYS[0]), 'hata');
  assert.equal(r.entries[0].error?.code, 'corrupt');
  assert.equal(ms.getItem(KEYS[0]), OLD_PORTFOLIO);
});

test('açılış: terk edilmiş (zaman aşımı) açılış localStorage\'a geri yükleme YAZMAZ', async () => {
  const { ms, ls, idb } = mkBoot();
  val(await idb.set(KEYS[0], OLD_PORTFOLIO));
  const r = await bootMirror(ls, idb, PK, { abandoned: () => true });
  assert.equal(actionOf(r, KEYS[0]), 'terk-edildi'); // ne geri yükleme ne kurtarma yazımı
  assert.equal(ms.length, 0);
  assert.deepEqual(val(await idb.list(RECOVERY_IDB_PREFIX)), []);
});

test('silme işareti: yarım kalan SIFIRLA sonrası açılış aynayı siler, GERİ YÜKLEMEZ; işaret kalkar', async () => {
  const { ms, ls, idb } = mkBoot();
  val(await idb.set(KEYS[0], OLD_PORTFOLIO));
  val(await idb.set(RECOVERY_IDB_PREFIX + KEYS[0], 'eski'));
  ms.m.set(MIRROR_CLEARED_KEY, '1');
  const r = await bootMirror(ls, idb, PK);
  assert.equal(r.clearedFirst, true);
  assert.equal(ms.getItem(KEYS[0]), null);
  assert.equal(val(await idb.get(KEYS[0])), undefined);
  assert.deepEqual(val(await idb.list(RECOVERY_IDB_PREFIX)), []);
  assert.equal(ms.getItem(MIRROR_CLEARED_KEY), null);
  assert.ok(r.ok);
});

test('silme işareti: silme başarısızsa işaret KALIR (sonraki açılış tekrar dener) ve geri yükleme yapılmaz', async () => {
  const ms = new MemStorage();
  ms.m.set(MIRROR_CLEARED_KEY, '1');
  const base = createIdbStore(fakeIdb().factory);
  val(await base.set(KEYS[0], OLD_PORTFOLIO));
  const bad: KvStore = { ...base, delete: async () => ({ ok: false, error: { code: 'io', message: 'x' } }) };
  const c = await clearMirror(createLocalStore(ms), bad, PK);
  assert.ok(!c.ok);
  assert.equal(ms.getItem(MIRROR_CLEARED_KEY), '1');
});

// ---- Write-through ----
test('ayna yazıcı: localStorage\'ın son hali yazılır ve doğrulanır; yok -> silinir; istekler birleşir', async () => {
  const { ms, ls, idb } = mkBoot();
  const w = createMirrorWriter(ls, idb, PK);
  ms.m.set(KEYS[0], 'a');
  w.request([KEYS[0]]);
  ms.m.set(KEYS[0], 'b'); // aynı anahtarın ikinci isteği: son hal yazılır
  w.request([KEYS[0]]);
  await w.flush();
  assert.equal(val(await idb.get(KEYS[0])), 'b');
  assert.equal(w.status().lastError, undefined);
  ms.m.delete(KEYS[0]);
  w.request();
  await w.flush();
  assert.equal(val(await idb.get(KEYS[0])), undefined);
  assert.ok(w.status().writes >= 2);
});

test('ayna yazıcı: IndexedDB hatası uygulamayı bozmaz (throw yok), status.lastError dolar; disable sonrası yazmaz', async () => {
  const { ms, ls } = mkBoot();
  const idb = createIdbStore(fakeIdb({ failOpen: true }).factory);
  const w = createMirrorWriter(ls, idb, PK);
  ms.m.set(KEYS[0], 'a');
  w.request();
  await w.flush();
  assert.equal(w.status().lastError?.code, 'unavailable');
  assert.ok(w.status().failures > 0);
  assert.equal(ms.getItem(KEYS[0]), 'a');
  const g = mkBoot();
  const w2 = createMirrorWriter(g.ls, g.idb, PK);
  w2.disable();
  g.ms.m.set(KEYS[0], 'a');
  w2.request();
  await w2.flush();
  assert.equal(val(await g.idb.get(KEYS[0])), undefined);
});

test('ayna yazıcı: doğrulama uyuşmazlığı verify hatası olarak görünür', async () => {
  const { ms, ls } = mkBoot();
  const { store } = memStore('indexeddb', v => v + 'X');
  const w = createMirrorWriter(ls, store, PK);
  ms.m.set(KEYS[0], 'a');
  w.request([KEYS[0]]);
  await w.flush();
  assert.equal(w.status().lastError?.code, 'verify');
});

// ---- Bozuk kayıt kurtarma (recovery.ts) ----
function installFakeLocalStorage() {
  const data: Record<string, string> = {};
  const ls = new Proxy(data, {
    get: (t, p) => p === 'getItem' ? (k: string) => (k in t ? t[k] : null)
      : p === 'setItem' ? (k: string, v: string) => { t[k] = v; }
      : p === 'removeItem' ? (k: string) => { delete t[k]; }
      : (t as Record<string | symbol, unknown>)[p],
    ownKeys: t => Reflect.ownKeys(t),
    getOwnPropertyDescriptor: (t, p) => Reflect.getOwnPropertyDescriptor(t, p),
  });
  (globalThis as unknown as { localStorage: unknown }).localStorage = ls;
  return data;
}

test('recovery: bozuk ham değer kopyalanır, aynı değer çoğalmaz, farklı değerler ayrı yuvaya, en çok 5; clearRecoveryKeys temizler', () => {
  const d = installFakeLocalStorage();
  try {
    preserveCorruptRaw('fagent.portfolio.v1', '{bozuk');
    preserveCorruptRaw('fagent.portfolio.v1', '{bozuk');
    assert.equal(d['fagent.recovery.corrupt.fagent.portfolio.v1'], '{bozuk');
    assert.equal(Object.keys(d).length, 1);
    for (let i = 0; i < 8; i++) preserveCorruptRaw('fagent.portfolio.v1', '{b' + i);
    assert.equal(Object.keys(d).filter(k => k.startsWith('fagent.recovery.')).length, 5);
    d['fagent.portfolio.v1'] = 'kalir';
    clearRecoveryKeys();
    assert.deepEqual(Object.keys(d), ['fagent.portfolio.v1']);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('store.load: bozuk JSON ve yanlış biçim EMPTY döner ama ham değer kurtarma anahtarına kopyalanır', async () => {
  const d = installFakeLocalStorage();
  try {
    d['fagent.portfolio.v1'] = '{"holdings": [bozuk';
    await import('../../src/store.ts?bozuk-json');
    assert.equal(d['fagent.recovery.corrupt.fagent.portfolio.v1'], '{"holdings": [bozuk');
    assert.equal(d['fagent.portfolio.v1'], '{"holdings": [bozuk'); // kendiliğinden ezilmez
    d['fagent.portfolio.v1'] = '{"holdings": 5, "txns": []}';
    await import('../../src/store.ts?yanlis-bicim');
    assert.equal(d['fagent.recovery.corrupt.fagent.portfolio.v1.2'], '{"holdings": 5, "txns": []}');
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

// ======== Güvenlik/uyum turu: bootMirror üzerinden düzeltme testleri ========
const failingDelete = (base: KvStore): KvStore => ({ ...base, delete: async () => ({ ok: false, error: { code: 'io', message: 'silme hatası' } }) });
const recoveryCount = async (idb: KvStore, key: string) =>
  val(await idb.list(RECOVERY_IDB_PREFIX + key)).length;

test('YÜKSEK-1: silme işareti var + IndexedDB silmesi io hatası + localStorage boş -> GERİ YÜKLEME YOK, kurtarma kopyası YOK, işaret kalır', async () => {
  const ms = new MemStorage();
  const base = createIdbStore(fakeIdb().factory);
  val(await base.set(KEYS[0], 'ESKI-HESAP-PORTFOY'));
  val(await base.set(KEYS[3], '{"fon":17.5}'));
  ms.m.set(MIRROR_CLEARED_KEY, '1');
  const r = await bootMirror(createLocalStore(ms), failingDelete(base), PK);
  assert.equal(r.clearedFirst, true);
  assert.equal(r.clearError?.code, 'io');
  assert.equal(ms.getItem(KEYS[0]), null);
  assert.equal(ms.getItem(KEYS[3]), null);
  assert.equal(actionOf(r, KEYS[0]), 'silinemedi');
  assert.equal(ms.getItem(MIRROR_CLEARED_KEY), '1'); // sonraki açılış tekrar dener
  assert.deepEqual(val(await base.list(RECOVERY_IDB_PREFIX)), []); // silinmek istenen veri kurtarma kaydına çevrilmedi
  assert.ok(!r.ok);
  // silme sonra düzelirse: ayna temizlenir, hâlâ geri yükleme yok
  const r2 = await bootMirror(createLocalStore(ms), base, PK);
  assert.equal(r2.clearError, undefined);
  assert.equal(ms.getItem(KEYS[0]), null);
  assert.equal(val(await base.get(KEYS[0])), undefined);
  assert.equal(ms.getItem(MIRROR_CLEARED_KEY), null);
});

test('YÜKSEK-1: işaret + silme BAŞARILI -> geri yükleme de yok (clearedFirst her durumda)', async () => {
  const ms = new MemStorage();
  const idb = createIdbStore(fakeIdb().factory);
  val(await idb.set(KEYS[0], 'ESKI'));
  ms.m.set(MIRROR_CLEARED_KEY, '1');
  const r = await bootMirror(createLocalStore(ms), idb, PK);
  assert.ok(r.ok && r.clearedFirst);
  assert.equal(ms.getItem(KEYS[0]), null);
});

test('ORTA-2: IndexedDB değeri her açılışta değişse bile anahtar başına kurtarma kaydı en çok 3; en eskisi silinir', async () => {
  const { ms, ls, idb } = mkBoot();
  ms.m.set(KEYS[3], 'L');
  for (let n = 1; n <= 4; n++) {
    val(await idb.set(KEYS[3], 'I' + n));
    const r = await bootMirror(ls, idb, PK);
    assert.equal(actionOf(r, KEYS[3]), 'farkli');
    assert.ok((await recoveryCount(idb, KEYS[3])) <= 3, `açılış ${n}`);
  }
  assert.equal(await recoveryCount(idb, KEYS[3]), 3);
  const vals: string[] = [];
  for (const k of val(await idb.list(RECOVERY_IDB_PREFIX + KEYS[3]))) vals.push(val(await idb.get(k)) as string);
  assert.deepEqual(vals.sort(), ['I2', 'I3', 'I4']); // I1 (en eski) silindi
});

test('ORTA-2: değişiklik yokken tekrarlanan açılışlar kopya çoğaltmaz (değer bazlı, tüm kayıtlar taranır)', async () => {
  const { ms, ls, idb } = mkBoot();
  ms.m.set(KEYS[3], 'L');
  val(await idb.set(RECOVERY_IDB_PREFIX + KEYS[3], 'ESKI'));
  val(await idb.set(KEYS[3], 'I2'));
  for (let n = 0; n < 4; n++) { await bootMirror(ls, idb, PK); await new Promise(r => setTimeout(r, 3)); val(await idb.set(KEYS[3], 'I2')); }
  assert.equal(await recoveryCount(idb, KEYS[3]), 2);
  // eski ilk kayıttaki değer yeniden farklı çıkarsa yeni kayıt açılmaz
  val(await idb.set(KEYS[3], 'ESKI'));
  await bootMirror(ls, idb, PK);
  assert.equal(await recoveryCount(idb, KEYS[3]), 2);
});

test('ORTA-2: kurtarma kaydı alındıktan sonra ayna yazıcısı anahtarı localStorage ile eşitler (açılış sonrası request)', async () => {
  const { ms, ls, idb } = mkBoot();
  ms.m.set(KEYS[0], 'LS');
  val(await idb.set(KEYS[0], 'IDB'));
  const r = await bootMirror(ls, idb, PK);
  const w = createMirrorWriter(ls, idb, PK);
  w.request(r.entries.filter(e => e.action === 'farkli' && e.recoveryKey).map(e => e.key));
  await w.flush();
  assert.equal(val(await idb.get(KEYS[0])), 'LS');
  assert.equal(val(await idb.get(RECOVERY_IDB_PREFIX + KEYS[0])), 'IDB');
});

test('ORTA-3: ayna yazıcısı localStorage\'da olmayan anahtarı silmeden ÖNCE IndexedDB değerini kurtarma kaydına alır', async () => {
  const { ls, idb } = mkBoot();
  val(await idb.set(KEYS[2], '[{"q":"onemli"}]'));
  const w = createMirrorWriter(ls, idb, PK);
  w.request([KEYS[2]]);
  await w.flush();
  assert.equal(val(await idb.get(KEYS[2])), undefined);
  assert.equal(val(await idb.get(RECOVERY_IDB_PREFIX + KEYS[2])), '[{"q":"onemli"}]');
  // kurtarma yazılamazsa silinmez
  const { ls: ls2, idb: idb2 } = mkBoot();
  val(await idb2.set(KEYS[2], 'X'));
  const bad: KvStore = { ...idb2, addIfAbsent: async () => ({ ok: false, error: { code: 'quota', message: 'dolu' } }) };
  const w2 = createMirrorWriter(ls2, bad, PK);
  w2.request([KEYS[2]]);
  await w2.flush();
  assert.equal(val(await idb2.get(KEYS[2])), 'X');
  assert.equal(w2.status().lastError?.code, 'quota');
});

test('ORTA-3: applyUserData replace kipinde yazım yarıda kalırsa (yazilamadi) ayna bildirimi ATILMAZ; başarılıda atılır', async () => {
  const store: Record<string, string> = { 'fagent.tax.v1': '{"fon":10}' };
  let failSet = true;
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { if (failSet) { const e = new Error('dolu'); e.name = 'QuotaExceededError'; throw e; } store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  try {
    const { applyUserData, subscribeUserDataWrites } = await import('../../src/backup.ts');
    let fired = 0;
    const off = subscribeUserDataWrites(() => { fired++; });
    const bad = applyUserData({ 'fagent.target.v1': '{"fon":40}' }, { mode: 'replace' });
    assert.deepEqual(bad, { ok: false, reason: 'yazilamadi' });
    assert.equal(fired, 0);
    failSet = false;
    const good = applyUserData({ 'fagent.target.v1': '{"fon":40}' }, { mode: 'replace' });
    assert.equal(good.ok, true);
    assert.equal(fired, 1);
    off();
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('DÜŞÜK-5: açılış terk edilince (abandoned) bootMirror hiçbir IndexedDB/localStorage yazımı yapmaz', async () => {
  const ms = new MemStorage();
  ms.m.set(KEYS[0], 'LS');
  ms.m.set(KEYS[1], 'LS2');
  const base = createIdbStore(fakeIdb().factory);
  val(await base.set(KEYS[3], 'IDB-FARKLI'));
  ms.m.set(KEYS[3], 'LS-FARKLI');
  let gone = false;
  let sets = 0;
  const idb: KvStore = { ...base,
    get: async k => { const r = await base.get(k); gone = true; return r; }, // ilk okumadan sonra zaman aşımı
    set: async (k, v) => { sets++; return base.set(k, v); },
    addIfAbsent: async (k, v) => { sets++; return base.addIfAbsent(k, v); } };
  const r = await bootMirror(createLocalStore(ms), idb, PK, { abandoned: () => gone });
  assert.equal(sets, 0);
  assert.ok(r.entries.some(e => e.action === 'terk-edildi'));
  assert.deepEqual(val(await base.list(RECOVERY_IDB_PREFIX)), []);
  assert.equal(val(await base.get(KEYS[0])), undefined);
});

test('DÜŞÜK-6: 256 KB üstü bozuk ham değer kopyalanmaz (yalnızca uzunluk notu); sınırdaki kopyalanır; SIFIRLA notu da siler', async () => {
  const d = installFakeLocalStorage();
  try {
    const { MAX_RAW_COPY } = await import('../../src/recovery.ts');
    const big = '{' + 'x'.repeat(MAX_RAW_COPY + 10);
    preserveCorruptRaw('fagent.portfolio.v1', big);
    preserveCorruptRaw('fagent.portfolio.v1', big);
    const keys = Object.keys(d);
    assert.deepEqual(keys, ['fagent.recovery.corrupt.fagent.portfolio.v1.not']);
    assert.ok(d[keys[0]].includes(String(big.length)));
    assert.ok(!Object.values(d).some(v => v.length > 1000));
    preserveCorruptRaw('fagent.tax.v1', '{' + 'y'.repeat(MAX_RAW_COPY - 5));
    assert.ok(Object.keys(d).includes('fagent.recovery.corrupt.fagent.tax.v1'));
    clearRecoveryKeys();
    assert.deepEqual(Object.keys(d), []);
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

// ======== 3. tur: O-1, D-1, kurtarma silme sonucu ========
const recoveryValues = async (idb: KvStore, key: string) => {
  const out: string[] = [];
  for (const k of val(await idb.list(RECOVERY_IDB_PREFIX + key))) out.push(val(await idb.get(k)) as string);
  return out;
};

test('sabit uyumu: recovery.ts öneki ile storage/mirror.ts not öneki aynı', () => {
  assert.equal(CORRUPT_NOTE_PREFIX, RECOVERY_PREFIX + 'corrupt.');
});

test('O-1: 256 KB üstü bozuk ham değer localStorage\'a KOPYALANMAZ (yalnız not), alıcıya (IndexedDB kurtarma) verilir', () => {
  const d = installFakeLocalStorage();
  try {
    const got: [string, number][] = [];
    setOversizeSink((k, raw) => { got.push([k, raw.length]); });
    const big = '{' + 'z'.repeat(MAX_RAW_COPY + 5);
    preserveCorruptRaw(KEYS[0], big);
    assert.deepEqual(got, [[KEYS[0], big.length]]);
    assert.deepEqual(Object.keys(d), [corruptNoteKey(KEYS[0])]);
    assert.ok(!Object.values(d).some(v => v.length > 1000));
    // alıcı fırlatsa da uygulama bozulmaz, not kalır
    setOversizeSink(() => { throw new Error('x'); });
    preserveCorruptRaw(KEYS[0], big);
    assert.ok(corruptNoteKey(KEYS[0]) in d);
  } finally {
    setOversizeSink(undefined);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('O-1: 256 KB üstü bozuk değer + ilk geçerli kayıttan sonra ham değer kurtarma kaydında HÂLÂ var (alıcı yok, yalnız not + ayna)', async () => {
  const { ms, ls, idb } = mkBoot();
  const big = '{' + 'q'.repeat(MAX_RAW_COPY + 100);
  ms.m.set(KEYS[0], big);                       // bozuk ham değer localStorage'da
  const boot = await bootMirror(ls, idb, PK);   // ayna kopyası alır (kopyalandi)
  assert.equal(actionOf(boot, KEYS[0]), 'kopyalandi');
  ms.m.set(corruptNoteKey(KEYS[0]), 'ham değer büyük'); // preserveCorruptRaw'ın yazdığı not
  // uygulama ilk geçerli kaydı yazar: iki kopya (ls + ayna) birden ezilmek ÜZERE
  ms.m.set(KEYS[0], '{"onboarded":true,"holdings":[],"txns":[],"realizedPnl":0}');
  const w = createMirrorWriter(ls, idb, PK);
  w.request([KEYS[0]]);
  await w.flush();
  assert.equal(val(await idb.get(KEYS[0])), ms.getItem(KEYS[0])); // ayna güncel
  assert.ok((await recoveryValues(idb, KEYS[0])).includes(big)); // ham değer HÂLÂ bir kopyada
  assert.equal(ms.getItem(corruptNoteKey(KEYS[0])), null);       // not görevini yaptı
  // sonraki yazımlar kurtarma kaydını çoğaltmaz / döndürmez
  for (let n = 0; n < 5; n++) { ms.m.set(KEYS[0], `{"onboarded":true,"n":${n}}`); w.request([KEYS[0]]); await w.flush(); }
  assert.ok((await recoveryValues(idb, KEYS[0])).includes(big));
  assert.equal((await recoveryValues(idb, KEYS[0])).length, 1);
});

test('O-1: kurtarma kaydı garanti edilemezse ayna aynadaki bozuk değeri EZMEZ (anahtarda ilerlemez)', async () => {
  const { ms, ls, idb } = mkBoot();
  const big = '{' + 'q'.repeat(MAX_RAW_COPY + 100);
  val(await idb.set(KEYS[0], big));
  ms.m.set(corruptNoteKey(KEYS[0]), 'not');
  ms.m.set(KEYS[0], '{"yeni":true}');
  const bad: KvStore = { ...idb, addIfAbsent: async () => ({ ok: false, error: { code: 'quota', message: 'dolu' } }) };
  const w = createMirrorWriter(ls, bad, PK);
  w.request([KEYS[0]]);
  await w.flush();
  assert.equal(val(await idb.get(KEYS[0])), big);                  // ezilmedi
  assert.equal(w.status().lastError?.code, 'quota');
  assert.equal(ms.getItem(corruptNoteKey(KEYS[0])), 'not');        // not kaldı: sonra yeniden denenir
});

test('O-1: alıcı (IndexedDB kurtarma) başarılıysa ham değer kayıtta, ls\'te yalnız not; ilk kayıttan sonra da korunur', async () => {
  const d = installFakeLocalStorage();
  try {
    const { ls, idb } = mkBoot();
    const big = '{' + 'k'.repeat(MAX_RAW_COPY + 1);
    setOversizeSink((key, raw) => { void saveRecovery(idb, key, raw); });
    preserveCorruptRaw(KEYS[0], big);
    await new Promise(r => setTimeout(r, 30));
    assert.ok((await recoveryValues(idb, KEYS[0])).includes(big));
    assert.ok(!Object.values(d).includes(big));
    void ls;
  } finally {
    setOversizeSink(undefined);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test('D-1: SIFIRLA silmesi başarısızsa yazıcı KAPANIR, yeniden istek yapılmaz, kurtarma kaydı oluşmaz', async () => {
  const { ms, ls, idb: base } = mkBoot();
  val(await base.set(KEYS[0], 'ESKI-VERI'));
  val(await base.set(KEYS[2], 'ESKI-OGRETI'));
  ms.m.set(MIRROR_CLEARED_KEY, '1');
  const bad = failingDelete(base);
  const w = createMirrorWriter(ls, bad, PK);
  w.request([KEYS[2]]);                            // bekleyen iş (ls'te yok -> silme yolu)
  const c = await runResetClear(w, ls, bad, PK);
  assert.ok(!c.ok);
  assert.equal(w.status().enabled, false);
  w.request();                                     // kapalı yazıcı hiçbir şey yapmaz
  await w.flush();
  assert.deepEqual(val(await base.list(RECOVERY_IDB_PREFIX)), []);
  assert.equal(val(await base.get(KEYS[0])), 'ESKI-VERI'); // silinemedi: yerinde, ama geri yüklenmez (açılış kuralı)
  assert.equal(ms.getItem(MIRROR_CLEARED_KEY), '1');
});

test('D-1: SIFIRLA silmesi başarılıysa yazıcı açık kalır ve localStorage ile yeniden eşitler', async () => {
  const { ms, ls, idb } = mkBoot();
  val(await idb.set(KEYS[0], 'ESKI'));
  ms.m.set(MIRROR_CLEARED_KEY, '1');
  ms.m.set(KEYS[0], 'YENI');
  const w = createMirrorWriter(ls, idb, PK);
  const c = await runResetClear(w, ls, idb, PK);
  assert.ok(c.ok);
  await w.flush();
  assert.equal(w.status().enabled, true);
  assert.equal(val(await idb.get(KEYS[0])), 'YENI');
  assert.deepEqual(val(await idb.list(RECOVERY_IDB_PREFIX)), []);
});

test('Küçük: kurtarma kaydı silme sonucu denetlenir; eski kayıt silinemezse sınır aşılmaz (yeni kayıt geri alınır, hata döner)', async () => {
  const { idb } = mkBoot();
  const base = RECOVERY_IDB_PREFIX + KEYS[3];
  val(await idb.set(base, 'A'));
  val(await idb.set(base + '.100', 'B'));
  val(await idb.set(base + '.200', 'C'));
  const flaky: KvStore = { ...idb, delete: async k => (k === base ? { ok: false, error: { code: 'io', message: 'x' } } : idb.delete(k)) };
  const r = await saveRecovery(flaky, KEYS[3], 'D');
  assert.equal(r.error?.code, 'io');
  assert.equal(val(await idb.list(base)).length, 3);
  assert.ok(!(await recoveryValues(idb, KEYS[3])).includes('D'));
  // silme çalışınca normal akış
  const ok2 = await saveRecovery(idb, KEYS[3], 'D');
  assert.ok(ok2.key);
  assert.equal(val(await idb.list(base)).length, 3);
  assert.deepEqual((await recoveryValues(idb, KEYS[3])).sort(), ['B', 'C', 'D']);
});

// ======== 4. tur: O-A, O-B, D-a, D-d, D-f ========
function delayMem(delay = 0) {
  const m = new Map<string, string>();
  const d = () => new Promise(r => setTimeout(r, delay));
  const okv = <T>(value: T): Result<T> => ({ ok: true, value });
  const store: KvStore & { m: Map<string, string> } = {
    kind: 'memory', m,
    get: async k => { await d(); return okv(m.get(k)); },
    set: async (k, v) => { await d(); m.set(k, v); return okv(undefined); },
    addIfAbsent: async (k, v) => { await d(); if (m.has(k)) return okv(false); m.set(k, v); return okv(true); },
    delete: async k => { await d(); m.delete(k); return okv(undefined); },
    deleteIfEquals: async (k, e) => { await d(); if (m.get(k) === e) { m.delete(k); return okv(true); } return okv(false); },
    list: async (p = '') => { await d(); return okv([...m.keys()].filter(k => k.startsWith(p)).sort()); },
  };
  return store;
}
const K3 = ['a', 'b', 'c'];

for (const step of [0, 1, 2, 3, 5, 8, 13]) {
  test(`O-B: KOŞAN iş sırasında SIFIRLA (pause, ${step} ms sonra) -> silinen veri kurtarma kaydında KALMAZ`, async () => {
    const ls = delayMem(0), idb = delayMem(1);
    idb.m.set('a', 'OLD-A'); idb.m.set('b', 'OLD-B');
    ls.m.set(MIRROR_CLEARED_KEY, '1'); // clearMirrorForReset işareti önce senkron koyar
    const w = createMirrorWriter(ls, idb, K3);
    w.request(); // ls boş -> silme/kurtarma yolu
    await new Promise(r => setTimeout(r, step));
    const c = await runResetClear(w, ls, idb, K3);
    assert.ok(c.ok);
    await w.flush();
    assert.deepEqual([...idb.m.keys()], []);
  });
}

test('O-B: başka sekmenin yazıcısı SIFIRLA ile yarışırsa (silme işareti var) kurtarma kaydı oluşmaz / geri silinir', async () => {
  for (const delayB of [0, 1, 2, 4]) {
    const ls = delayMem(0), idb = delayMem(1);
    idb.m.set('a', 'OLD-A');
    ls.m.set(MIRROR_CLEARED_KEY, '1');
    const wA = createMirrorWriter(ls, idb, K3);
    const wB = createMirrorWriter(ls, idb, K3);
    const p = runResetClear(wA, ls, idb, K3);
    await new Promise(r => setTimeout(r, delayB));
    wB.request();
    await p; await wB.flush(); await wA.flush();
    assert.deepEqual([...idb.m.keys()].filter(k => k.startsWith(RECOVERY_IDB_PREFIX)), [], `gecikme ${delayB}`);
    assert.equal(idb.m.has('a'), false);
  }
});

test('O-B: silme işareti varken yazıcı localStorage\'da olmayan anahtar için kurtarma kaydı ALMAZ; işaret araya girerse alınan kayıt geri silinir', async () => {
  const ls = delayMem(0), idb = delayMem(0);
  idb.m.set('a', 'OLD');
  ls.m.set(MIRROR_CLEARED_KEY, '1');
  const w = createMirrorWriter(ls, idb, K3);
  w.request(['a']); await w.flush();
  assert.deepEqual([...idb.m.keys()], ['a']); // dokunulmadı: silmeyi clearMirror yapar
  // işaret kurtarma kaydı alınırken konursa: kayıt geri silinir
  ls.m.delete(MIRROR_CLEARED_KEY);
  const racing: KvStore = { ...idb, addIfAbsent: async (k, v) => { const r = await idb.addIfAbsent(k, v); ls.m.set(MIRROR_CLEARED_KEY, '1'); return r; } };
  const w2 = createMirrorWriter(ls, racing, K3);
  w2.request(['a']); await w2.flush();
  assert.deepEqual([...idb.m.keys()].filter(k => k.startsWith(RECOVERY_IDB_PREFIX)), []);
});

test('O-B: clearMirror ikinci tur — temizlik sırasında eklenen kurtarma kaydı da silinir', async () => {
  const ls = delayMem(0), idb = delayMem(0);
  idb.m.set('a', 'X');
  let injected = false;
  const sneaky: KvStore = { ...idb, list: async p => {
    const r = await idb.list(p);
    if (!injected && p === RECOVERY_IDB_PREFIX) { injected = true; idb.m.set(RECOVERY_IDB_PREFIX + 'a', 'GEC-GELEN'); } // listeden sonra eklenir
    return r;
  } };
  const c = await clearMirror(ls, sneaky, K3);
  assert.ok(c.ok);
  assert.deepEqual([...idb.m.keys()], []);
});

test('D-a: not yalnızca kurtarma kaydı BAŞARIYLA alındıktan sonra silinir (IndexedDB\'de anahtar yokken not kalır; sonra bozuk değer kurtarılır)', async () => {
  const ls = delayMem(0), idb = delayMem(0);
  ls.m.set('a', 'RAW-BOZUK'); ls.m.set(corruptNoteKey('a'), 'not');
  const w = createMirrorWriter(ls, idb, ['a']);
  w.request(['a']); await w.flush();
  assert.equal(idb.m.get('a'), 'RAW-BOZUK');
  assert.ok(ls.m.has(corruptNoteKey('a'))); // alınamadı -> not durur
  ls.m.set('a', 'NEW'); w.request(['a']); await w.flush();
  assert.equal(idb.m.get('a'), 'NEW');
  assert.ok([...idb.m.entries()].some(([k, v]) => k.startsWith(RECOVERY_IDB_PREFIX) && v === 'RAW-BOZUK'));
  assert.ok(!ls.m.has(corruptNoteKey('a')));
  // kurtarma kaydı alınamazsa not da kalır
  const ls2 = delayMem(0), idb2 = delayMem(0);
  idb2.m.set('a', 'R2'); ls2.m.set('a', 'N2'); ls2.m.set(corruptNoteKey('a'), 'not');
  const bad: KvStore = { ...idb2, addIfAbsent: async () => ({ ok: false, error: { code: 'quota', message: 'dolu' } }) };
  const w2 = createMirrorWriter(ls2, bad, ['a']);
  w2.request(['a']); await w2.flush();
  assert.ok(ls2.m.has(corruptNoteKey('a')));
  assert.equal(idb2.m.get('a'), 'R2');
});

function quotaLocalStorage(failNotes: boolean) {
  const data: Record<string, string> = {};
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { if (failNotes) { const e = new Error('dolu'); e.name = 'QuotaExceededError'; throw e; } data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
  };
  return data;
}

test('O-A: localStorage kotası dolu (not yazılamıyor) olsa da alıcı ÇAĞRILIR ve IndexedDB kurtarma kaydı oluşur', async () => {
  quotaLocalStorage(true);
  try {
    const idb = delayMem(0);
    const calls: string[] = [];
    setOversizeSink(async (k, raw) => { calls.push(k); return !(await saveRecovery(idb, k, raw)).error; }, () => {});
    const big = '{' + 'o'.repeat(MAX_RAW_COPY + 3);
    preserveCorruptRaw(KEYS[0], big);
    await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(calls, [KEYS[0]]);
    assert.ok([...idb.m.values()].includes(big));
  } finally { setOversizeSink(undefined); delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('O-A: not yazılamıyor VE kurtarma kaydı alınamıyorsa anahtar KORUMALI; ayna bozuk değeri ezmez; sonradan alınırsa koruma kalkar', async () => {
  quotaLocalStorage(true);
  try {
    const events: [string, boolean][] = [];
    let okNow = false;
    setOversizeSink(async () => okNow, (k, on) => events.push([k, on]));
    preserveCorruptRaw(KEYS[0], '{' + 'p'.repeat(MAX_RAW_COPY + 3));
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(events, [[KEYS[0], true]]); // korumalı kaldı (kayıt alınamadı)

    // yazıcı tarafı: korumalı anahtara yazmaz / silmez
    const ls = delayMem(0), idb = delayMem(0);
    const BAD = 'BOZUK-BUYUK';
    idb.m.set(KEYS[0], BAD);
    ls.m.set(KEYS[0], '{"kucuk":true}'); // küçük yeni değer bozuğun yerine geçti
    const w = createMirrorWriter(ls, idb, PK);
    w.protect(KEYS[0], true);
    w.request([KEYS[0]]); await w.flush();
    assert.equal(idb.m.get(KEYS[0]), BAD);
    ls.m.delete(KEYS[0]);
    w.request([KEYS[0]]); await w.flush();
    assert.equal(idb.m.get(KEYS[0]), BAD); // silmeye de gitmez
    w.protect(KEYS[0], false);             // kayıt alındı -> koruma kalkar, ayna eşitlenir
    await w.flush();
    assert.equal(idb.m.has(KEYS[0]), false);
  } finally { setOversizeSink(undefined); delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('O-A: alıcı başarılıysa koruma kalkar (kota dolu olsa bile)', async () => {
  quotaLocalStorage(true);
  try {
    const events: [string, boolean][] = [];
    setOversizeSink(async () => true, (k, on) => events.push([k, on]));
    preserveCorruptRaw(KEYS[2], '{' + 'r'.repeat(MAX_RAW_COPY + 3));
    await new Promise(r => setTimeout(r, 10));
    assert.deepEqual(events, [[KEYS[2], true], [KEYS[2], false]]);
  } finally { setOversizeSink(undefined); delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('D-d: alıcı anahtar+ham değer başına oturumda BİR kez çalışır (tekrarlanan load/okuma liste+okuma yapmaz); farklı değerde yeniden', () => {
  const d = installFakeLocalStorage();
  try {
    let calls = 0;
    setOversizeSink(() => { calls++; return true; });
    const big = '{' + 's'.repeat(MAX_RAW_COPY + 3);
    for (let i = 0; i < 20; i++) preserveCorruptRaw(KEYS[3], big);
    assert.equal(calls, 1);
    preserveCorruptRaw(KEYS[3], big + 'x');
    assert.equal(calls, 2);
    assert.ok(corruptNoteKey(KEYS[3]) in d);
  } finally { setOversizeSink(undefined); delete (globalThis as { localStorage?: unknown }).localStorage; }
});

test('D-f: not metni durumu doğru anlatır — "yazıldı" demez, "henüz alınmadı (alınınca silinir)" der', () => {
  const d = installFakeLocalStorage();
  try {
    setOversizeSink(undefined);
    preserveCorruptRaw(KEYS[1], '{' + 't'.repeat(MAX_RAW_COPY + 3));
    const note = d[corruptNoteKey(KEYS[1])];
    assert.ok(note.includes('henüz alınmadı'));
    assert.ok(!/kurtarma kaydına yazılır|yazıldı/.test(note));
  } finally { setOversizeSink(undefined); delete (globalThis as { localStorage?: unknown }).localStorage; }
});
