// Şema sürümü ve kayıt biçimi. SAF: IDB'ye dokunmaz (yalnızca tip), Node'da doğrudan sınanır.
//
// Kayıt zarfı (v1): { key, value: metin, updatedAt: ms, schema: 1 }.
// v0 = zarfsız: değer doğrudan metin ya da { key, value } (sürüm alanı yok) → v1'e çıkarılır.

export interface KvRecord { key: string; value: string; updatedAt: number; schema: number }

export const CURRENT_RECORD_SCHEMA = 1;

export function toRecord(key: string, value: string, updatedAt: number): KvRecord {
  return { key, value, updatedAt, schema: CURRENT_RECORD_SCHEMA };
}

// Yazarken: mevcut kayıt DAHA YENİ şemadan ise (schema > güncel) onun bilinmeyen alanları ve
// sürüm numarası korunur; yalnızca key/value/updatedAt güncellenir. Aksi halde eski kod yeni
// sürümün alanlarını `schema:1` ile geri yazıp düşürürdü.
export function mergeRecord(existing: unknown, key: string, value: string, updatedAt: number): KvRecord {
  if (typeof existing === 'object' && existing !== null) {
    const sch = (existing as { schema?: unknown }).schema;
    if (typeof sch === 'number' && sch > CURRENT_RECORD_SCHEMA) {
      return { ...(existing as Record<string, unknown>), key, value, updatedAt, schema: sch } as KvRecord;
    }
  }
  return toRecord(key, value, updatedAt);
}

// Eski/bilinmeyen biçimden metin değeri çıkarır; tanınmazsa null (çağıran 'corrupt' döner,
// kayıt SİLİNMEZ). Gelecekteki sürümden gelen kayıt (schema > güncel) da okunur: value metinse.
export function fromRecord(raw: unknown): string | null {
  if (typeof raw === 'string') return raw; // v0: zarfsız düz metin
  if (typeof raw === 'object' && raw !== null && typeof (raw as { value?: unknown }).value === 'string') {
    return (raw as { value: string }).value;
  }
  return null;
}

// Sürüm adımları: IndexedDB sürümü v'ye çıkarken çalışır. Adımlar yalnızca EKLER, veri silmez.
// Yeni sürüm: SCHEMA_VERSION'ı artır (types.ts) ve buraya UPGRADE_STEPS[n] ekle.
export const UPGRADE_STEPS: Record<number, (db: IDBDatabase, store: string) => void> = {
  1: (db, store) => {
    if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'key' });
  },
};
