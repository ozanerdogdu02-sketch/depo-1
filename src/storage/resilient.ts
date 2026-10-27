// Yedekli depo: asıl depo (IndexedDB) hata verirse localStorage'a düşer.
// Sessiz değil: her düşüş onFallback ile bildirilir, lastDegraded() son hatayı tutar.
// Kural: asıl depo başarılıysa yedeğe BAKILMAZ (iki kopya arasında sessiz seçim yapılmaz);
// asıl depo hata verirse yazma YEDEĞE gider, okuma YEDEKTEN yapılır.
// 'corrupt' (kayıt var ama bozuk) düşüş sebebi değildir; çağırana olduğu gibi döner.
// DELETE yedeğe DÜŞMEZ: IndexedDB'den silinemeyen kaydın localStorage aynası silinirse iki kopya
// tutarsızlaşır ve kullanıcının göremediği bir kayıt geri gelebilir; hata olduğu gibi döner.
// Bu depo göç HEDEFİ olamaz (migrateKeys reddeder): hedef doğrudan IndexedDB olmalı.
import type { KvStore, Result, StorageError, FallbackNotice } from './types.ts';

export type ResilientStore = KvStore & { lastDegraded(): StorageError | undefined };

export function createResilientStore(
  primary: KvStore,
  fallback: KvStore,
  onFallback: (n: FallbackNotice) => void = () => {},
): ResilientStore {
  let last: StorageError | undefined;

  async function via<T>(op: FallbackNotice['op'], key: string | undefined,
    a: () => Promise<Result<T>>, b: () => Promise<Result<T>>): Promise<Result<T>> {
    const r = await a();
    if (r.ok || r.error.code === 'corrupt') return r;
    last = r.error;
    onFallback({ op, key, error: r.error });
    return b();
  }

  return {
    kind: 'resilient',
    lastDegraded: () => last,
    get: key => via('get', key, () => primary.get(key), () => fallback.get(key)),
    set: (key, value) => via('set', key, () => primary.set(key, value), () => fallback.set(key, value)),
    addIfAbsent: (key, value) => via('set', key, () => primary.addIfAbsent(key, value), () => fallback.addIfAbsent(key, value)),
    deleteIfEquals: async (key, expected) => {
      const r = await primary.deleteIfEquals(key, expected);
      if (!r.ok) last = r.error;
      return r;
    },
    delete: async key => {
      const r = await primary.delete(key);
      if (!r.ok) last = r.error;
      return r;
    },
    list: prefix => via('list', undefined, () => primary.list(prefix), () => fallback.list(prefix)),
  };
}
