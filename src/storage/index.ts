// Depolama katmanı girişi. Tarayıcıda: IndexedDB asıl, localStorage yedek.
// Bu katman henüz store.ts'e BAĞLI DEĞİL (P3 sonraki adım: write-through + açılış göçü).
//
// BAĞLAMA ADIMI İÇİN UZLAŞTIRMA NOTU (D3 — kod yok, tasarım hatırlatması):
//   * Göç hedefi doğrudan createIdbStore() olmalı; createBrowserStore() (yedekli) hedef OLAMAZ.
//   * Açılışta iki kopya da doluysa ve farklıysa (migrateKeys 'cakisma') hangisinin esas
//     alınacağı kuralı (plan §3: ayna hash'i ile "son yazılan ayna" karşılaştırması) bağlama
//     adımında yazılır ve test edilir; o zamana dek yerel kopya ESAS, IndexedDB'dekine dokunulmaz.
//   * Ayna (localStorage) dışarıdan düzenlenebilir (yedekten geri yükleme, e2e page.evaluate,
//     eski sekme): her açılışta içeri alınmalı, aksi halde geri yüklenen veri eski kopyayla ezilir.
//   * SIFIRLA / çıkışta (localData.ts) IndexedDB kayıtları da silinmeli; yoksa silinen veri geri gelir.
//   * Yazma sırası: önce IndexedDB, sonra ayna; IndexedDB yazımı başarısızsa kullanıcıya bildirilir.
import { createIdbStore } from './idb.ts';
import { createLocalStore } from './local.ts';
import { createResilientStore } from './resilient.ts';
import type { FallbackNotice } from './types.ts';

export * from './types.ts';
export { createIdbStore, openDb } from './idb.ts';
export { createLocalStore } from './local.ts';
export type { StorageLike } from './local.ts';
export { createResilientStore } from './resilient.ts';
export type { ResilientStore } from './resilient.ts';
export { migrateKeys } from './migrate.ts';
export type { MigrateReport, MigrateEntry, MigrateStatus } from './migrate.ts';
export { validateTxnExtras } from './txnFields.ts';
export type { TxnExtras, TxnExtrasResult } from './txnFields.ts';
export { toRecord, mergeRecord, fromRecord, UPGRADE_STEPS, CURRENT_RECORD_SCHEMA } from './schema.ts';

export function createBrowserStore(onFallback?: (n: FallbackNotice) => void) {
  const idbFactory = typeof indexedDB === 'undefined' ? undefined : indexedDB;
  const ls = typeof localStorage === 'undefined' ? undefined : localStorage;
  return createResilientStore(createIdbStore(idbFactory), createLocalStore(ls), onFallback);
}
