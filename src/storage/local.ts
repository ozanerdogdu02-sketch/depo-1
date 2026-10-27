// localStorage üzerinde KvStore. Depolama nesnesi parametre olarak girer (testte taklit verilir).
import { ok, fail } from './types.ts';
import type { KvStore, Result } from './types.ts';

export interface StorageLike {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function toError(e: unknown, op: string): Result<never> {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return fail('quota', `localStorage kotası doldu (${op})`, e);
  return fail('io', `localStorage ${op} hatası`, e);
}

export function createLocalStore(storage: StorageLike | undefined | null): KvStore {
  const none = () => fail('unavailable', 'localStorage kullanılamıyor');
  return {
    kind: 'localstorage',
    async get(key) {
      if (!storage) return none();
      try { const v = storage.getItem(key); return ok(v === null ? undefined : v); } catch (e) { return toError(e, 'okuma'); }
    },
    async set(key, value) {
      if (!storage) return none();
      try { storage.setItem(key, value); return ok(undefined); } catch (e) { return toError(e, 'yazma'); }
    },
    async addIfAbsent(key, value) {
      if (!storage) return none();
      try {
        // Eşzamanlı blok: get+set arasında başka kod araya giremez (JS tek iş parçacığı).
        if (storage.getItem(key) !== null) return ok(false);
        storage.setItem(key, value);
        return ok(true);
      } catch (e) { return toError(e, 'yazma'); }
    },
    async delete(key) {
      if (!storage) return none();
      try { storage.removeItem(key); return ok(undefined); } catch (e) { return toError(e, 'silme'); }
    },
    async deleteIfEquals(key, expected) {
      if (!storage) return none();
      try {
        if (storage.getItem(key) !== expected) return ok(false);
        storage.removeItem(key);
        return ok(true);
      } catch (e) { return toError(e, 'silme'); }
    },
    async list(prefix = '') {
      if (!storage) return none();
      try {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k !== null && k.startsWith(prefix)) keys.push(k);
        }
        return ok(keys.sort());
      } catch (e) { return toError(e, 'listeleme'); }
    },
  };
}
