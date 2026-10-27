// Yerel depolama katmanı: ortak tipler. SAF: React, window, ağ yok; yalnızca tip ve sabit.
// Hatalar fırlatılmaz ve yutulmaz: her işlem tipli bir sonuç döner (Result).

export type StorageErrorCode =
  | 'unavailable'  // IndexedDB/localStorage yok ya da açılamadı (gizli sekme, politika)
  | 'blocked'      // başka sekme eski sürümü açık tutuyor, sürüm yükseltmesi bekliyor
  | 'quota'        // kota doldu
  | 'io'           // okuma/yazma sırasında beklenmeyen hata
  | 'version'      // veritabanı bu kodun bildiğinden DAHA YENİ sürümde (VersionError); veriye dokunulmaz
  | 'corrupt'      // kayıt beklenen biçimde değil
  | 'verify';      // yazılan değer geri okununca eşleşmedi

export interface StorageError {
  code: StorageErrorCode;
  message: string;
  cause?: unknown;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: StorageError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: StorageErrorCode, message: string, cause?: unknown): Result<never> =>
  ({ ok: false, error: { code, message, cause } });

// Değerler METİN olarak saklanır: localStorage'daki JSON ile birebir aynı dize. Böylece
// uyumluluk aynası ve bütünlük doğrulaması karşılaştırmaya iner (bkz. migrate.ts).
export interface KvStore {
  readonly kind: 'indexeddb' | 'localstorage' | 'resilient' | 'memory';
  get(key: string): Promise<Result<string | undefined>>;
  set(key: string, value: string): Promise<Result<void>>;
  // Tek işlemde "yoksa yaz": true = yazıldı, false = kayıt zaten vardı (DEĞİŞTİRİLMEDİ). Göç bunu kullanır.
  addIfAbsent(key: string, value: string): Promise<Result<boolean>>;
  delete(key: string): Promise<Result<void>>;
  // Tek işlemde "değer hâlâ `expected` ise sil": true = silindi. Göçün geri alması yalnız kendi yazdığını siler.
  deleteIfEquals(key: string, expected: string): Promise<Result<boolean>>;
  list(prefix?: string): Promise<Result<string[]>>;
}

// Dışarıdaki depo sarmalayıcıları için: asıl depo hata verdiğinde yedeğe düşüldüyse
// çağırana bildirilir (sessiz değil).
export interface FallbackNotice {
  op: 'get' | 'set' | 'delete' | 'list';
  key?: string;
  error: StorageError;
}

export const DB_NAME = 'fagent';
export const STORE_NAME = 'kv';
// Şema sürümü: IndexedDB sürüm numarası ile aynıdır. Yeni sürüm = migrate.ts → UPGRADE_STEPS'e adım.
export const SCHEMA_VERSION = 1;
