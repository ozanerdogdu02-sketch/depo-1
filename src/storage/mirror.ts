// IndexedDB DOĞRULANMIŞ DAYANIKLI AYNA (P3 bağlama adımı). SAF: window yok; depolar parametre olarak girer.
//
// TEK GERÇEK KAYNAK (bu adım): localStorage ESAS'tır (senkron okuma, yedek, bulut, mevcut e2e onu görür).
// IndexedDB yalnızca AYNA'dır; asıl okuma geçişi ayrı bir adımdır. İki kopya hiçbir zaman sessizce ezilmez.
//
// AÇILIŞ KURALLARI (bootMirror), anahtar başına (l = localStorage, i = IndexedDB):
//   l yok,  i yok            -> 'yok'
//   l var,  i yok            -> i'ye KOPYALA                          ('kopyalandi')
//   l var,  i var, l == i    -> bir şey yapma                         ('esit')
//   l var,  i var, l != i    -> HİÇBİRİ ezilmez; l esas kalır; i'nin değeri kurtarma kopyasına alınır ('farkli')
//   l yok,  i var:
//       beş katmanın HİÇBİRİ l'de yoksa (tarayıcı depolamayı sildi) -> i'den GERİ YÜKLE ('geri-yuklendi')
//       başka katman l'de varsa (kısmi durum; kullanıcı/test bilerek sildi) -> geri yükleme YOK, i'nin değeri
//       kurtarma kopyasına alınır ('ls-eksik-korundu')
//   herhangi bir okuma/yazma hatası -> o anahtar 'hata'; localStorage'a dokunulmaz.
//   SİLME İŞARETİ bulunduysa (clearedFirst): ayna silme başarılı da olsa başarısız da olsa GERİ YÜKLEME HİÇ YAPILMAZ.
//       Silme başarısızsa aynada kalan eski değer ('silinemedi') ne geri yüklenir ne kurtarma kaydına kopyalanır;
//       işaret kalır, sonraki açılış silmeyi yeniden dener.
//   Açılış terk edildiyse (abandoned: zaman aşımı) her IndexedDB/localStorage yazımından önce kontrol edilir.
// Kurtarma kopyası: IndexedDB'de `fagent.recovery.idb.<anahtar>[.<zaman>]` (BACKED_UP_KEYS'te DEĞİL: yedeğe ve buluta gitmez).
//
// SİLME (SIFIRLA/çıkış): localStorage'a SENKRON silme işareti (MIRROR_CLEARED_KEY) konur, sonra IndexedDB
// ayna asenkron silinir (clearMirror). Silme bitmeden sayfa yenilenirse açılış işareti görür ve geri
// yüklemek yerine aynayı siler: silinen veri geri gelmez.
import type { KvStore, StorageError } from './types.ts';

export const MIRROR_CLEARED_KEY = 'fagent.mirror.cleared.v1';
export const RECOVERY_IDB_PREFIX = 'fagent.recovery.idb.';
// localStorage'da büyük (256 KB üstü) bozuk ham değer için src/recovery.ts bu anahtarı yazar: `<önek><anahtar>.not`.
// Not varken ayna yazıcısı, aynadaki (aynı bozuk) değeri ezmeden önce kurtarma kaydına alır (src/recovery.ts ile aynı önek).
export const CORRUPT_NOTE_PREFIX = 'fagent.recovery.corrupt.';
export const corruptNoteKey = (key: string) => `${CORRUPT_NOTE_PREFIX}${key}.not`;

export type BootAction = 'yok' | 'kopyalandi' | 'esit' | 'farkli' | 'geri-yuklendi' | 'ls-eksik-korundu' | 'silinemedi' | 'terk-edildi' | 'hata';
export interface BootEntry { key: string; action: BootAction; error?: StorageError; recoveryKey?: string }
export interface BootReport {
  entries: BootEntry[];
  ok: boolean;               // hiç 'hata' yok
  clearedFirst: boolean;     // silme işareti bulundu, ayna önce silindi
  clearError?: StorageError;
}

// Kurtarma kayıtları: `fagent.recovery.idb.<anahtar>` (ilk) ve `...<anahtar>.<zaman>` (sonrakiler).
// Anahtar başına en çok MAX_RECOVERY_PER_KEY kayıt; aynı DEĞER ikinci kez yazılmaz (hepsinde değer bazlı kontrol);
// sınır aşılırsa en eski silinir (sıra: ilk kayıt, sonra artan zaman).
export const MAX_RECOVERY_PER_KEY = 3;

function recoverySlots(all: string[], key: string): string[] {
  const base = RECOVERY_IDB_PREFIX + key;
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.(\\d+))?$');
  return all.filter(k => re.test(k)).sort((x, y) => {
    const nx = x === base ? -1 : Number(x.slice(base.length + 1));
    const ny = y === base ? -1 : Number(y.slice(base.length + 1));
    return nx - ny;
  });
}

export async function saveRecovery(idb: KvStore, key: string, value: string): Promise<{ key?: string; error?: StorageError }> {
  const base = RECOVERY_IDB_PREFIX + key;
  const l = await idb.list(base);
  if (!l.ok) return { error: l.error };
  const slots = recoverySlots(l.value, key);
  for (const sl of slots) {
    const cur = await idb.get(sl);
    if (cur.ok && cur.value === value) return { key: sl }; // aynı değer zaten kurtarma kaydında
  }
  let target = base;
  if (slots.length > 0) {
    const maxSuffix = Math.max(0, ...slots.map(sl => (sl === base ? 0 : Number(sl.slice(base.length + 1)))));
    target = `${base}.${Math.max(Date.now(), maxSuffix + 1)}`;
  }
  const a = await idb.addIfAbsent(target, value);
  if (!a.ok) return { error: a.error };
  if (!a.value) return { error: { code: 'io', message: 'Kurtarma kaydı anahtarı çakıştı' } };
  // üst sınır: en eskiler silinir (yeni yazılan her zaman en son)
  const all = [...slots, target];
  for (const old of all.slice(0, Math.max(0, all.length - MAX_RECOVERY_PER_KEY))) {
    const d = await idb.delete(old);
    if (!d.ok) {
      // Sınır korunamıyor: yeni kaydı geri al (eski kayıtlar durur), hata dön -> çağıran ezme/silme yapmaz.
      await idb.delete(target);
      return { error: d.error };
    }
  }
  return { key: target };
}

// Aynayı (anahtarlar + kurtarma kopyaları) siler; hepsi başarılıysa silme işaretini kaldırır.
export async function clearMirror(ls: KvStore, idb: KvStore, keys: readonly string[]): Promise<{ ok: boolean; error?: StorageError }> {
  let firstErr: StorageError | undefined;
  const note = (e: StorageError) => { firstErr ??= e; };
  const rec = await idb.list(RECOVERY_IDB_PREFIX);
  if (!rec.ok) note(rec.error);
  for (const k of [...keys, ...(rec.ok ? rec.value : [])]) {
    const d = await idb.delete(k);
    if (!d.ok) note(d.error);
  }
  if (firstErr) return { ok: false, error: firstErr };
  // İkinci tur: temizlik sırasında (başka sekmenin yazıcısı) yeni kurtarma kaydı eklenmişse onları da sil.
  const rec2 = await idb.list(RECOVERY_IDB_PREFIX);
  if (!rec2.ok) return { ok: false, error: rec2.error };
  for (const k of rec2.value) {
    const d = await idb.delete(k);
    if (!d.ok) return { ok: false, error: d.error };
  }
  const t = await ls.delete(MIRROR_CLEARED_KEY);
  return t.ok ? { ok: true } : { ok: false, error: t.error };
}

export async function bootMirror(
  ls: KvStore,
  idb: KvStore,
  keys: readonly string[],
  opts: { abandoned?: () => boolean } = {},
): Promise<BootReport> {
  const entries: BootEntry[] = [];
  let clearedFirst = false;
  let clearError: StorageError | undefined;
  const gone = () => opts.abandoned?.() === true;

  const mark = await ls.get(MIRROR_CLEARED_KEY);
  if (mark.ok && mark.value !== undefined) {
    clearedFirst = true;
    const c = gone() ? { ok: false as const, error: { code: 'unavailable' as const, message: 'Açılış terk edildi' } } : await clearMirror(ls, idb, keys);
    if (!c.ok) clearError = c.error;
  }

  // Önce hepsini oku (lsAny kararı tüm anahtarların ilk durumuna göre verilir).
  const lv = new Map<string, string | undefined>();
  const iv = new Map<string, string | undefined>();
  const errs = new Map<string, StorageError>();
  for (const key of keys) {
    const l = await ls.get(key);
    if (!l.ok) { errs.set(key, l.error); continue; }
    const i = await idb.get(key);
    if (!i.ok) { errs.set(key, i.error); continue; }
    lv.set(key, l.value);
    iv.set(key, i.value);
  }
  const lsAny = keys.some(k => lv.get(k) !== undefined) || errs.size > 0; // belirsizse (okuma hatası) geri yükleme YAPMA

  for (const key of keys) {
    const err = errs.get(key);
    if (err) { entries.push({ key, action: 'hata', error: err }); continue; }
    const l = lv.get(key);
    const i = iv.get(key);
    if (l === undefined && i === undefined) { entries.push({ key, action: 'yok' }); continue; }
    if (l !== undefined && i === undefined) {
      if (gone()) { entries.push({ key, action: 'terk-edildi' }); continue; }
      const w = await idb.set(key, l);
      entries.push(w.ok ? { key, action: 'kopyalandi' } : { key, action: 'hata', error: w.error });
      continue;
    }
    if (l === i) { entries.push({ key, action: 'esit' }); continue; }
    const iVal = i as string;
    // Silme işareti bulundu: ne geri yükle ne kurtarma kopyası al (kullanıcı bu veriyi silmek istedi).
    if (clearedFirst) { entries.push({ key, action: 'silinemedi' }); continue; }
    if (gone()) { entries.push({ key, action: 'terk-edildi' }); continue; }
    if (l === undefined && !lsAny) {
      const w = await ls.set(key, iVal);
      const back = w.ok ? await ls.get(key) : w;
      if (w.ok && back.ok && back.value === iVal) entries.push({ key, action: 'geri-yuklendi' });
      else entries.push({ key, action: 'hata', error: !w.ok ? w.error : !back.ok ? back.error : { code: 'verify', message: 'Geri yüklenen değer geri okununca eşleşmedi' } });
      continue;
    }
    if (gone()) { entries.push({ key, action: 'terk-edildi' }); continue; }
    const rc = await saveRecovery(idb, key, iVal);
    if (rc.error) entries.push({ key, action: 'hata', error: rc.error });
    else entries.push({ key, action: l === undefined ? 'ls-eksik-korundu' : 'farkli', recoveryKey: rc.key });
  }
  return { entries, ok: !clearError && entries.every(e => e.action !== 'hata'), clearedFirst, ...(clearError ? { clearError } : {}) };
}

// ---- Write-through ----
export interface MirrorStatus {
  enabled: boolean;
  pending: number;
  lastError?: StorageError;   // son başarısız yazma/silme/doğrulama (başarılı yazmadan sonra temizlenir)
  writes: number;
  failures: number;
}
export interface MirrorWriter {
  request(keys?: readonly string[]): void;  // senkron çağrılır; yazma asenkron ve sıralı
  flush(): Promise<void>;                   // bekleyen tüm yazmaların bitmesini bekler
  status(): MirrorStatus;
  disable(): void;                          // oturum boyunca ayna yazmayı kapat (açılış zaman aşımı vb.)
  clearPending(): void;                     // SIFIRLA: kuyruktaki yazmaları at
  protect(key: string, on: boolean): void;  // korumalı anahtar: kurtarma kaydı alınana dek aynaya yazılmaz/silinmez
  pause(): void;                            // SIFIRLA: koşan iş bir sonraki adımda durur (kurtarma/yazma/silme yapmaz)
  resume(): void;
}

// localStorage'ın o andaki değeri IndexedDB'ye yazılır (var -> set, yok -> delete), yazılan değer geri okunup
// DOĞRULANIR. Aynı anahtarın birden çok isteği birleşir (son hal yazılır). Hata uygulamayı bozmaz; status()'a düşer.
export function createMirrorWriter(ls: KvStore, idb: KvStore, allKeys: readonly string[]): MirrorWriter {
  let enabled = true;
  let paused = false;
  const protectedKeys = new Set<string>();
  const stop = () => !enabled || paused;
  const pending = new Set<string>();
  let running: Promise<void> | undefined;
  const st: MirrorStatus = { enabled: true, pending: 0, writes: 0, failures: 0 };

  const fail1 = (e: StorageError) => { st.lastError = e; st.failures++; };

  const resetMarked = async () => { const m = await ls.get(MIRROR_CLEARED_KEY); return m.ok && m.value !== undefined; };

  async function one(key: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (stop() || protectedKeys.has(key)) return;
      const l = await ls.get(key);
      if (!l.ok) { fail1(l.error); return; }
      if (l.value === undefined) {
        // localStorage'da olmayan anahtar silinmeden önce aynadaki değer kurtarma kaydına alınır (güvenli taraf).
        // SIFIRLA/çıkışta bu kayıtlar clearMirror ile zaten silinir.
        // SIFIRLA yarışı (başka sekme): silme işareti varken kurtarma kaydı ALINMAZ; alındıysa geri silinir.
        if (await resetMarked()) return;
        const cur = await idb.get(key);
        if (stop()) return;
        if (cur.ok && cur.value !== undefined) {
          const rc = await saveRecovery(idb, key, cur.value);
          if (rc.error) { fail1(rc.error); return; }
          if (await resetMarked()) { if (rc.key) await idb.delete(rc.key); return; }
        } else if (!cur.ok && cur.error.code !== 'corrupt') { fail1(cur.error); return; }
        if (stop()) return;
        const d = await idb.delete(key);
        if (!d.ok) { fail1(d.error); return; }
        await ls.delete(corruptNoteKey(key));
        st.writes++; st.lastError = undefined;
        // silme sırasında localStorage'a yazıldıysa tekrar bak
        const again = await ls.get(key);
        if (again.ok && again.value === undefined) return;
        continue;
      }
      // Büyük bozuk ham değer notu varsa: aynadaki (aynı bozuk) değer ezilmeden ÖNCE kurtarma kaydına alınır.
      // Kayıt garanti edilemezse (hata) ayna o anahtarda ilerlemez, mevcut değer yerinde kalır.
      if (stop()) return;
      const note = await ls.get(corruptNoteKey(key));
      if (note.ok && note.value !== undefined) {
        const cur = await idb.get(key);
        if (!cur.ok && cur.error.code !== 'corrupt') { fail1(cur.error); return; }
        if (cur.ok && cur.value !== undefined && cur.value !== l.value) {
          const rc = await saveRecovery(idb, key, cur.value);
          if (rc.error) { fail1(rc.error); return; }
          await ls.delete(corruptNoteKey(key)); // not yalnızca kurtarma kaydı BAŞARIYLA alındıktan sonra silinir
        }
      }
      if (stop()) return;
      const w = await idb.set(key, l.value);
      if (!w.ok) { fail1(w.error); return; }
      const back = await idb.get(key);
      if (!back.ok) { fail1(back.error); return; }
      if (back.value !== l.value) {
        // başka sekme aynı anda yazmış olabilir: bir kez daha dene, hâlâ farklıysa doğrulama hatası
        const again = await ls.get(key);
        if (again.ok && again.value !== l.value) continue;
        fail1({ code: 'verify', message: `Ayna doğrulaması eşleşmedi: ${key}` });
        return;
      }
      st.writes++; st.lastError = undefined;
      const after = await ls.get(key);
      if (after.ok && after.value !== l.value) continue; // yazarken değişti: yeniden
      return;
    }
  }

  async function drain(): Promise<void> {
    while (pending.size > 0) {
      const key = pending.values().next().value as string;
      pending.delete(key);
      if (!enabled) continue;
      try { await one(key); } catch (e) { fail1({ code: 'io', message: 'Ayna yazma beklenmedik hata', cause: e }); }
    }
  }

  const start = () => {
    running = drain().finally(() => { running = undefined; if (pending.size > 0 && enabled) start(); });
  };

  return {
    request(keys = allKeys) {
      if (!enabled) return;
      for (const k of keys) pending.add(k);
      if (!running) start();
    },
    async flush() {
      while (running) await running;
    },
    status: () => ({ ...st, enabled, pending: pending.size }),
    disable() { enabled = false; pending.clear(); },
    clearPending() { pending.clear(); },
    protect(key, on) { if (on) protectedKeys.add(key); else { protectedKeys.delete(key); if (enabled && !paused) { pending.add(key); if (!running) start(); } } },
    pause() { paused = true; pending.clear(); },
    resume() { paused = false; },
  };
}

// SIFIRLA/çıkış silmesinin asenkron gövdesi: bekleyen yazmaları at, koşan yazmayı bitir, aynayı sil.
// Silme BAŞARISIZSA yazıcı kapatılır ve yeniden istek YAPILMAZ (silinmek istenen veri kurtarma kaydına dönüşmesin;
// işaret kalır, sonraki açılış yeniden dener). Başarılıysa yazıcı localStorage ile yeniden eşitlenir.
export async function runResetClear(
  writer: MirrorWriter | undefined, ls: KvStore, idb: KvStore, keys: readonly string[],
): Promise<{ ok: boolean; error?: StorageError }> {
  writer?.pause();       // koşan iş bir sonraki adımda durur: silinecek veri kurtarma kaydına çevrilmesin
  await writer?.flush();
  const c = await clearMirror(ls, idb, keys);
  if (!c.ok) { writer?.disable(); return c; }
  writer?.resume();
  writer?.request();
  return c;
}
