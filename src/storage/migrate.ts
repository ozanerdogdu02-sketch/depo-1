// localStorage → yeni depo göçü. Kurallar:
//   1. ÖNCE KOPYALA, geri oku, bire bir karşılaştır (doğrula). Eski anahtar ASLA silinmez
//      (uyumluluk aynası: mevcut e2e ve bulut/yedek kodu localStorage'a bakmaya devam eder).
//   2. İdempotent: ikinci koşuda hedefte aynı değer varsa dokunulmaz ('zaten').
//   3. Hedefte FARKLI değer varsa ÜSTÜNE YAZILMAZ ('cakisma'). Kontrol+yazma TEK işlemde
//      (addIfAbsent) yapılır; iki sekme aynı anda göç etse de biri diğerini ezemez.
//   4. Bir anahtarın hatası diğerlerini durdurmaz; hepsi raporda görünür.
//   5. Hedef yedekli (resilient) depo OLAMAZ: yazma sessizce localStorage'a düşerse "göç"
//      kaynağı kendine kopyalamış olurdu. Hedef doğrudan IndexedDB deposu olmalı.
import type { KvStore, StorageError } from './types.ts';

export type MigrateStatus = 'kopyalandi' | 'zaten' | 'kaynakta-yok' | 'cakisma' | 'hata';

export interface MigrateEntry { key: string; status: MigrateStatus; error?: StorageError }
export interface MigrateReport { entries: MigrateEntry[]; ok: boolean; error?: StorageError }

export async function migrateKeys(source: KvStore, target: KvStore, keys: readonly string[]): Promise<MigrateReport> {
  if (target.kind === 'resilient') {
    return { entries: [], ok: false, error: { code: 'unavailable', message: 'Göç hedefi yedekli depo olamaz; doğrudan IndexedDB deposu verilmeli' } };
  }
  const entries: MigrateEntry[] = [];
  for (const key of keys) {
    const src = await source.get(key);
    if (!src.ok) { entries.push({ key, status: 'hata', error: src.error }); continue; }
    if (src.value === undefined) { entries.push({ key, status: 'kaynakta-yok' }); continue; }

    const add = await target.addIfAbsent(key, src.value);
    if (!add.ok) { entries.push({ key, status: 'hata', error: add.error }); continue; }
    if (!add.value) {
      const cur = await target.get(key);
      if (!cur.ok) { entries.push({ key, status: 'hata', error: cur.error }); continue; }
      entries.push({ key, status: cur.value === src.value ? 'zaten' : 'cakisma' });
      continue;
    }

    const back = await target.get(key);
    if (back.ok && back.value === src.value) { entries.push({ key, status: 'kopyalandi' }); continue; }
    // Doğrulama başarısız. Geri alma YALNIZCA kendi yazdığımız değer hâlâ duruyorsa (tek işlemde
    // karşılaştır+sil): okuma geçici hata verdiyse yarım kopya temizlenir; hedefte BAŞKA bir değer
    // varsa (bozulma ya da başka sekmenin yazısı) ona dokunulmaz, hata raporlanır. Kaynak zaten
    // dokunulmamış; sonraki koşuda o anahtar 'cakisma' olarak görünür.
    if (!back.ok) await target.deleteIfEquals(key, src.value);
    entries.push({ key, status: 'hata', error: back.ok
      ? { code: 'verify', message: 'Yazılan değer geri okununca eşleşmedi' }
      : back.error });
  }
  return { entries, ok: entries.every(e => e.status !== 'hata') };
}
