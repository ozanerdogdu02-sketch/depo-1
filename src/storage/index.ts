// Depolama katmanı girişi. Tarayıcıda: IndexedDB asıl, localStorage yedek.
// BAĞLAMA DURUMU (P3 bağlama adımı yapıldı): uygulamaya IndexedDB AYNASI olarak bağlıdır (src/mirror.ts,
// src/main.tsx). TEK GERÇEK KAYNAK: localStorage ESAS; IndexedDB yalnızca doğrulanmış ayna. Açılış kuralları,
// silme işareti ve write-through: ./mirror.ts. createBrowserStore() (yedekli depo) uygulamada KULLANILMAZ;
// asıl okumanın IndexedDB'ye geçişi ayrı bir adımdır (o zaman yedekli depo ve kirli-anahtar kuralı devreye girer).
// Göç hedefi doğrudan createIdbStore() olmalıdır; yedekli depo hedef OLAMAZ.
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
export type { MigrateReport, MigrateEntry, MigrateStatus, RollbackResult } from './migrate.ts';
export { validateTxnExtras } from './txnFields.ts';
export type { TxnExtras, TxnExtrasResult } from './txnFields.ts';
export { toRecord, mergeRecord, fromRecord, isNewerSchema, UPGRADE_STEPS, CURRENT_RECORD_SCHEMA } from './schema.ts';
export { bootMirror, clearMirror, runResetClear, saveRecovery, createMirrorWriter, MIRROR_CLEARED_KEY, RECOVERY_IDB_PREFIX, CORRUPT_NOTE_PREFIX, corruptNoteKey } from './mirror.ts';
export type { BootReport, BootEntry, BootAction, MirrorWriter, MirrorStatus } from './mirror.ts';

export function createBrowserStore(onFallback?: (n: FallbackNotice) => void) {
  const idbFactory = typeof indexedDB === 'undefined' ? undefined : indexedDB;
  const ls = typeof localStorage === 'undefined' ? undefined : localStorage;
  return createResilientStore(createIdbStore(idbFactory), createLocalStore(ls), onFallback);
}
