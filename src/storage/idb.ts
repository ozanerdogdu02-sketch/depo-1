// İnce IndexedDB sarmalayıcı (bağımlılık yok). Tek nesne deposu 'kv': { key, value(metin), updatedAt, schema }.
// IDBFactory parametre olarak girer (tarayıcıda indexedDB, testte taklit).
// Sürüm göçü: onupgradeneeded → UPGRADE_STEPS (schema.ts, SAF adımlar).
import { ok, fail, DB_NAME, STORE_NAME, SCHEMA_VERSION } from './types.ts';
import type { KvStore, Result, StorageErrorCode } from './types.ts';
import { UPGRADE_STEPS, mergeRecord, toRecord, fromRecord } from './schema.ts';

function mapErr(e: unknown, what: string): Result<never> {
  const name = (e as { name?: string } | null)?.name ?? '';
  const code: StorageErrorCode = name === 'QuotaExceededError' ? 'quota' : name === 'VersionError' ? 'version' : 'io';
  return fail(code, `IndexedDB ${what} hatası${name ? ` (${name})` : ''}`, e);
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('istek hatası'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('işlem hatası'));
    tx.onabort = () => reject(tx.error ?? new Error('işlem iptal edildi'));
  });
}

// onClose: başka sekme sürüm yükseltmek isteyip bağlantı kapatıldığında çağrılır (önbelleği sıfırlamak için).
export function openDb(factory: IDBFactory | undefined | null, name = DB_NAME, onClose: () => void = () => {}): Promise<Result<IDBDatabase>> {
  if (!factory) return Promise.resolve(fail('unavailable', 'IndexedDB kullanılamıyor'));
  return new Promise(resolve => {
    let settled = false;
    const settle = (r: Result<IDBDatabase>) => { if (!settled) { settled = true; resolve(r); } };
    let r: IDBOpenDBRequest;
    try { r = factory.open(name, SCHEMA_VERSION); } catch (e) { settle(fail('unavailable', 'IndexedDB açılamadı', e)); return; }
    r.onupgradeneeded = ev => {
      const db = r.result;
      const old = (ev as IDBVersionChangeEvent).oldVersion;
      try {
        for (let v = old + 1; v <= SCHEMA_VERSION; v++) UPGRADE_STEPS[v]?.(db, STORE_NAME);
      } catch (e) {
        try { r.transaction?.abort(); } catch { /* zaten iptal */ }
        settle(fail('io', 'IndexedDB sürüm göçü başarısız', e));
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      if (settled) { try { db.close(); } catch { /* yok */ } return; } // blocked sonrası geç gelen açılış: sızdırma
      db.onversionchange = () => { try { db.close(); } catch { /* yok */ } onClose(); };
      settle(ok(db));
    };
    r.onerror = () => {
      const n = (r.error as { name?: string } | null)?.name;
      settle(n === 'VersionError'
        ? fail('version', 'Veritabanı bu sürümden daha yeni; veriye dokunulmadı', r.error)
        : fail('unavailable', 'IndexedDB açılamadı', r.error));
    };
    r.onblocked = () => settle(fail('blocked', 'IndexedDB başka bir sekme tarafından engellendi'));
  });
}

export function createIdbStore(factory: IDBFactory | undefined | null, name = DB_NAME): KvStore {
  let dbP: Promise<Result<IDBDatabase>> | undefined;
  const db = () => (dbP ??= openDb(factory, name, () => { dbP = undefined; }));

  async function run<T>(mode: IDBTransactionMode, what: string, fn: (s: IDBObjectStore) => Promise<T> | T): Promise<Result<T>> {
    const d = await db();
    if (!d.ok) { dbP = undefined; return d; }
    let tx: IDBTransaction | undefined;
    try {
      tx = d.value.transaction(STORE_NAME, mode);
      const done = txDone(tx);
      done.catch(() => {}); // fn önce hata verirse işlenmemiş reddedilme olmasın; hata aşağıda ele alınır
      const out = await fn(tx.objectStore(STORE_NAME));
      await done;
      return ok(out);
    } catch (e) {
      // tx.error öncelikli (kota gibi asıl neden işlem düzeyinde olabilir)
      return mapErr(tx?.error ?? e, what);
    }
  }

  return {
    kind: 'indexeddb',
    async get(key) {
      const r = await run('readonly', 'okuma', async s => {
        const rec: unknown = await req(s.get(key));
        return rec === undefined ? undefined : fromRecord(rec);
      });
      if (r.ok && r.value === null) return fail('corrupt', `Kayıt biçimi bozuk: ${key}`);
      return r as Result<string | undefined>;
    },
    set: (key, value) => run('readwrite', 'yazma', async s => {
      // Aynı işlemde mevcut kaydı oku: daha yeni şemalı kaydın alanları düşürülmesin.
      const existing: unknown = await req(s.get(key));
      await req(s.put(mergeRecord(existing, key, value, Date.now())));
    }),
    // Tek readwrite işleminde add: kayıt varsa ConstraintError -> false (DEĞİŞTİRİLMEZ).
    addIfAbsent: (key, value) => run('readwrite', 'yazma', s => new Promise<boolean>((resolve, reject) => {
      const r = s.add(toRecord(key, value, Date.now()));
      r.onsuccess = () => resolve(true);
      r.onerror = ev => {
        if ((r.error as { name?: string } | null)?.name === 'ConstraintError') {
          ev?.preventDefault?.(); ev?.stopPropagation?.(); // işlemi iptal ettirme
          resolve(false);
        } else reject(r.error ?? new Error('istek hatası'));
      };
    })),
    delete: key => run('readwrite', 'silme', async s => { await req(s.delete(key)); }),
    deleteIfEquals: (key, expected) => run('readwrite', 'silme', async s => {
      const rec: unknown = await req(s.get(key));
      if (rec === undefined || fromRecord(rec) !== expected) return false;
      await req(s.delete(key));
      return true;
    }),
    list: (prefix = '') => run('readonly', 'listeleme', async s => {
      const keys = (await req(s.getAllKeys())).map(String).filter(k => k.startsWith(prefix));
      return keys.sort();
    }),
  };
}
