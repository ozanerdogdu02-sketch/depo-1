// Depolama katmanı birim testleri. IndexedDB Node'da yok: aşağıdaki taklit YALNIZCA test içindir
// (bağımlılık yok). Gerçek tarayıcı IndexedDB'sine karşı doğrulanmadı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdbStore, createLocalStore, createResilientStore, migrateKeys, fromRecord, toRecord, mergeRecord, validateTxnExtras, UPGRADE_STEPS } from '../../src/storage/index.ts';
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
  const opened: { closed: boolean; fireVersionChange(): void }[] = [];
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
        const handle = { closed: false, fireVersionChange() { (db as { onversionchange?: () => void }).onversionchange?.(); } };
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

test('kayıt biçimi: v0 düz metin, v0 {key,value}, gelecek sürüm okunur; bozuk -> null', () => {
  assert.equal(fromRecord('ham'), 'ham');
  assert.equal(fromRecord({ key: 'k', value: 'v' }), 'v');
  assert.equal(fromRecord({ ...toRecord('k', 'v', 1), schema: 99 }), 'v');
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
  assert.deepEqual(notes, ['set:unavailable', 'get:unavailable']);
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

test('idb D4: daha yeni şemalı kaydın alanları set ile düşürülmez, schema numarası korunur', async () => {
  const { factory, dbs } = fakeIdb();
  const s = createIdbStore(factory);
  val(await s.set('k', 'v1'));
  dbs.get('fagent')!.stores.get('kv')!.set('k', { key: 'k', value: 'v1', updatedAt: 1, schema: 2, ek: { gelecek: true } });
  val(await s.set('k', 'v2'));
  const rec = dbs.get('fagent')!.stores.get('kv')!.get('k') as Record<string, unknown>;
  assert.equal(rec.value, 'v2');
  assert.equal(rec.schema, 2);
  assert.deepEqual(rec.ek, { gelecek: true });
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
