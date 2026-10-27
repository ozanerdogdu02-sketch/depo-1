// Yedekli depo: asıl depo (IndexedDB) hata verirse localStorage'a düşer.
// Sessiz değil: her düşüş onFallback ile bildirilir, lastDegraded() son hatayı tutar.
//
// Kurallar:
//  * Asıl depo başarılıysa yedeğe BAKILMAZ (iki kopya arasında sessiz seçim yapılmaz) — tek istisna "kirli" anahtar.
//  * YAZMA yedeğe yalnız geçici/ortam hatasında düşer: unavailable, io, quota. 'version' (veritabanı daha
//    yeni) ve 'blocked' (başka sekme yükseltmeyi tutuyor) hatasında yazma yedeğe DÜŞMEZ, hata çağırana döner:
//    asıl depo düzelince yedekteki eski kopya yeni kaydı ezmesin.
//  * Yedeğe yazılan anahtar "kirli" işaretlenir (bellekte, bu örnek ömrünce). Kirli anahtar okunurken önce
//    YEDEK kullanılır (asıl depodaki değer eskidir). Asıl depoya sonraki yazma başarılı olursa kirlilik kalkar.
//  * Okuma her hatada yedeğe düşebilir (bildirimle). 'corrupt' düşüş sebebi değildir; olduğu gibi döner.
//  * DELETE yedeğe DÜŞMEZ (IndexedDB'den silinemeyen kaydın aynası silinirse iki kopya tutarsızlaşır); asıl
//    depoda silme BAŞARILIYSA ve anahtar kirliyse yedekteki kopya da silinir (silinen veri geri gelmesin).
//  * lastDegraded(): "şu an bozuk" göstergesi. Asıl depo başarılı olunca ve kirli anahtar kalmayınca temizlenir.
// Bu depo göç HEDEFİ olamaz (migrateKeys reddeder): hedef doğrudan IndexedDB olmalı.
import type { KvStore, Result, StorageError, FallbackNotice } from './types.ts';

export type ResilientStore = KvStore & { lastDegraded(): StorageError | undefined; dirtyKeys(): string[] };

// Yazmanın yedeğe düşebildiği hata kodları.
const WRITE_FALLBACK = new Set(['unavailable', 'io', 'quota']);

export function createResilientStore(
  primary: KvStore,
  fallback: KvStore,
  onFallback: (n: FallbackNotice) => void = () => {},
): ResilientStore {
  let last: StorageError | undefined;
  const dirty = new Set<string>();

  const primaryOk = () => { if (dirty.size === 0) last = undefined; };

  async function read(key: string): Promise<Result<string | undefined>> {
    if (dirty.has(key)) {
      const f = await fallback.get(key);
      if (f.ok) return f; // kirli: yedekteki daha yeni
      // yedek okunamadı: asıl depodaki (eski) değere düşmek yerine hata dön
      return f;
    }
    const r = await primary.get(key);
    if (r.ok) { primaryOk(); return r; }
    if (r.error.code === 'corrupt') return r;
    last = r.error;
    onFallback({ op: 'get', key, error: r.error });
    return fallback.get(key);
  }

  async function write(op: 'set' | 'addIfAbsent', key: string, value: string): Promise<Result<void | boolean>> {
    const r = op === 'set' ? await primary.set(key, value) : await primary.addIfAbsent(key, value);
    if (r.ok) { dirty.delete(key); primaryOk(); return r; }
    if (r.error.code === 'corrupt') return r;
    last = r.error;
    if (!WRITE_FALLBACK.has(r.error.code)) return r; // version/blocked: yedeğe yazma
    onFallback({ op: 'set', key, error: r.error });
    const f = op === 'set' ? await fallback.set(key, value) : await fallback.addIfAbsent(key, value);
    if (f.ok) dirty.add(key);
    return f;
  }

  return {
    kind: 'resilient',
    lastDegraded: () => last,
    dirtyKeys: () => [...dirty].sort(),
    get: key => read(key),
    set: (key, value) => write('set', key, value) as Promise<Result<void>>,
    addIfAbsent: (key, value) => write('addIfAbsent', key, value) as Promise<Result<boolean>>,
    deleteIfEquals: async (key, expected) => {
      const r = await primary.deleteIfEquals(key, expected);
      if (!r.ok) { last = r.error; return r; }
      if (r.value && dirty.has(key)) { await fallback.delete(key); dirty.delete(key); }
      primaryOk();
      return r;
    },
    delete: async key => {
      const r = await primary.delete(key);
      if (!r.ok) { last = r.error; return r; }
      if (dirty.has(key)) {
        const f = await fallback.delete(key);
        if (!f.ok) { last = f.error; return f; } // yedek silinemedi: anahtar kirli kalır, hata görünür
        dirty.delete(key);
      }
      primaryOk();
      return r;
    },
    list: async prefix => {
      const r = await primary.list(prefix);
      if (r.ok) {
        primaryOk();
        if (dirty.size === 0) return r;
        const extra = [...dirty].filter(k => k.startsWith(prefix ?? ''));
        return { ok: true, value: [...new Set([...r.value, ...extra])].sort() };
      }
      last = r.error;
      onFallback({ op: 'list', error: r.error });
      return fallback.list(prefix);
    },
  };
}
