// IndexedDB aynası — tarayıcı bağlantısı. Mantık src/storage/mirror.ts'tedir (saf, birim testli).
//
// TEK GERÇEK KAYNAK (P3 bağlama adımı): localStorage ESAS'tır. store.ts load() ve diğer katmanlar onu
// SENKRON okur; yedek (backup.ts) ve bulut (cloud.ts) onu görür. IndexedDB yalnızca AYNA'dır:
//   * yazma: katman değişince localStorage'ın o anki hali IndexedDB'ye yazılır ve geri okunup doğrulanır;
//   * açılış: bootStorage() React'ten ÖNCE koşar (kurallar src/storage/mirror.ts başında);
//   * silme: SIFIRLA/çıkış clearMirrorForReset() ile iki katmanı da siler.
// IndexedDB'den asıl okumaya geçiş AYRI bir adımdır (plan: docs/veri-akisi/mevcut-durum-ve-plan.md).
// Bu modül store.ts'i İÇE AKTARMAZ (store.ts modül yüklenirken load() koşar; önce açılış bitmeli).
import { BACKED_UP_KEYS } from './backup';
import {
  bootMirror, runResetClear, saveRecovery, corruptNoteKey, createIdbStore, createLocalStore, createMirrorWriter, MIRROR_CLEARED_KEY, resetMarkerActive,
} from './storage';
import { setOversizeSink } from './recovery';
import { bindUnsavedGuard } from './yazmaDurumu';
import { createForeignPreserver, createForeignResetGate } from './sekmeSenkron';
import { SIFIRLA_ISARETI_OMRU_MS } from './config/varsayilanlar';
import type { BootReport, KvStore, MirrorStatus, MirrorWriter } from './storage';

export type StorageState = 'baslamadi' | 'hazir' | 'kullanilamiyor' | 'zaman-asimi' | 'hatali';
export interface StorageSnapshot {
  state: StorageState;
  boot?: BootReport;
  mirror?: MirrorStatus;
  note?: string;
}

let state: StorageState = 'baslamadi';
let bootReport: BootReport | undefined;
let note: string | undefined;
let writer: MirrorWriter | undefined;
let idbStore: KvStore | undefined;
let lsStore: KvStore | undefined;

const KEYS: readonly string[] = BACKED_UP_KEYS;

function stores(): { ls: KvStore; idb: KvStore } | undefined {
  try {
    if (typeof indexedDB === 'undefined' || typeof localStorage === 'undefined') return undefined;
    lsStore ??= createLocalStore(localStorage);
    idbStore ??= createIdbStore(indexedDB);
    return { ls: lsStore, idb: idbStore };
  } catch { return undefined; }
}

// Açılış: render'dan ÖNCE await edilir. Zaman aşımında uygulama yine açılır; o oturumda ayna kapalı kalır
// (gecikmeli açılış localStorage'a hiçbir şey yazmaz, aynayı da bozmaz).
export async function bootStorage(timeoutMs = 2500): Promise<StorageSnapshot> {
  const s = stores();
  if (!s) { state = 'kullanilamiyor'; note = 'IndexedDB ya da localStorage yok'; return getStorageSnapshot(); }
  let abandoned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const w = createMirrorWriter(s.ls, s.idb, KEYS);
  // abandoned zamanlayıcı geri çağrısında atanır: Promise.race sonucu işlenmeden önce de bootMirror'ın yazımları durur.
  const timeout = new Promise<'timeout'>(res => { timer = setTimeout(() => { abandoned = true; w.disable(); res('timeout'); }, timeoutMs); });
  try {
    const r = await Promise.race([bootMirror(s.ls, s.idb, KEYS, { abandoned: () => abandoned }), timeout]);
    if (r === 'timeout') {
      state = 'zaman-asimi'; note = `Açılış ${timeoutMs} ms içinde bitmedi; ayna bu oturumda kapalı`;
    } else {
      bootReport = r; writer = w; state = 'hazir';
      // Diske yazılamayan (bekleyen) anahtarlar için ayna korumalıdır: localStorage'ın o anki (eski ya da karışık)
      // hali IndexedDB'deki son sağlam kopyanın üstüne yazılmaz. Bekleyen çözülünce koruma kalkar ve ayna eşitlenir.
      bindUnsavedGuard((key, on) => w.protect(key, on, 'bekleyen'));
      // 256 KB üstü bozuk ham değer: localStorage'a değil IndexedDB kurtarma kaydına yazılır; başarılıysa not kalkar.
      setOversizeSink(async (key, raw) => {
        try {
          const rc = await saveRecovery(s.idb, key, raw, 'bozuk'); // ayrı kova: farklılık kayıtları bozuk değeri itemez (A6 D-b)
          if (rc.error) return false;
          await s.ls.delete(corruptNoteKey(key)); // not yalnızca kayıt BAŞARIYLA alındıktan sonra silinir
          return true;
        } catch { return false; }
      }, (key, on) => w.protect(key, on, 'kurtarma'));
      if (r.clearError || r.entries.some(e => e.action === 'silinemedi')) {
        // Aynadaki silme başarısız: silme işareti kalır (sonraki açılış yeniden dener); bu oturumda ayna yazmaz,
        // böylece silinmek istenen eski veri kurtarma kopyasına çevrilmez.
        w.disable(); note = 'Aynadaki silme tamamlanamadı; ayna bu oturumda kapalı, sonraki açılışta yeniden denenir';
      } else {
        // Kurtarma kaydı alınan anahtarlar için ayna localStorage ile eşitlenir (l esas).
        const synced = r.entries.filter(e => (e.action === 'farkli' || e.action === 'ls-eksik-korundu') && e.recoveryKey).map(e => e.key);
        if (synced.length) w.request(synced);
      }
      const diffs = r.entries.filter(e => e.action === 'farkli' || e.action === 'ls-eksik-korundu').map(e => e.key);
      const errs = r.entries.filter(e => e.action === 'hata').map(e => `${e.key}:${e.error?.code}`);
      // Konsola YALNIZCA anahtar adı ve hata kodu yazılır; kullanıcı verisi içeriği asla.
      if (diffs.length) console.warn('FAGENT depolama: localStorage ile IndexedDB kopyası farklı (localStorage esas, diğer kopya kurtarma kaydında):', diffs.join(', '));
      if (errs.length) console.warn('FAGENT depolama: ayna hatası:', errs.join(', '));
      if (r.entries.some(e => e.action === 'geri-yuklendi')) console.warn('FAGENT depolama: localStorage boştu, veri IndexedDB aynasından geri yüklendi');
    }
  } catch (e) {
    state = 'hatali'; note = 'Açılış beklenmedik hata verdi'; w.disable(); void e;
  } finally {
    if (timer) clearTimeout(timer);
  }
  return getStorageSnapshot();
}

// Katman değişince çağrılır (store aboneliği + backup.ts yazma bildirimi). Senkron, hata atmaz.
export function requestMirror(): void {
  try { writer?.request(); } catch { /* ayna uygulamayı bozmaz */ }
}

// SIFIRLA / çıkış: localStorage'a SENKRON silme işareti, sonra IndexedDB aynası asenkron silinir.
// Sayfa silme bitmeden yenilenirse açılış işareti görür ve aynayı siler (geri yüklemez).
export function clearMirrorForReset(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    // Ayna hiç kurulmamışsa da işaret konur: IndexedDB'de önceki oturumdan kalmış kopya olabilir.
    localStorage.setItem(MIRROR_CLEARED_KEY, String(Date.now()));
  } catch { /* kota: işaret konamadı, aşağıdaki asenkron silme yine denenir */ }
  const s = stores();
  if (!s) return;
  writer?.clearPending();
  // Yazma kuyruğunun arkasına girmeden doğrudan sil; writer bu sırada boştur (clearPending) ya da
  // koşan tek yazma localStorage'ın son halini (SIFIRLA sonrası) yazar ve ardından silme gelir.
  const run = async () => {
    // Silme başarısızsa yazıcı kapanır, yeniden istek yapılmaz (bkz. runResetClear).
    await runResetClear(writer, s.ls, s.idb, KEYS);
  };
  clearingActive = true;
  clearing = run().catch(() => { /* işaret localStorage'da kaldı: sonraki açılış tekrar dener */ }).finally(() => { clearingActive = false; });
}
let clearing: Promise<void> | undefined;
let clearingActive = false; // bu sekmenin KENDİ SIFIRLA/çıkış silmesi sürüyor

// ---- Sekmeler arası (A8): src/sekmeSenkron.ts bu işlevleri enjekte eder ----
// Başka sekmede SIFIRLA/çıkış sürerken bu sekmenin yazıcısı durur: silinen veri (ya da boş durumun kurtarma kaydı) aynaya yazılmaz.
// Bitince yazıcı sürer ve localStorage'ın o anki hali (boş) ile eşitlenir; bu sekmenin KENDİ silmesi (clearMirrorForReset) hâlâ
// sürüyorsa devam ETMEZ (runResetClear bitince kendisi sürdürür). Mantık: src/sekmeSenkron.ts createForeignResetGate.
// İşaret takılırsa (öteki sekmenin silmesi hata aldı) yazıcı sonsuza dek durmaz: süre dolunca otomatik sürer (kapıdaki zamanlayıcı).
// Açılıştaki temizlik (bootMirror) işaret varken her açılışta silmeyi yeniden dener.
const foreignGate = createForeignResetGate(
  { pause: () => writer?.pause(), resume: () => writer?.resume(), request: () => writer?.request() },
  () => clearingActive, () => isResetMarked(), SIFIRLA_ISARETI_OMRU_MS + 1000,
);
export function pauseMirrorForForeignReset(): void { foreignGate.start(); }
export function resumeMirrorAfterForeignReset(): void { foreignGate.end(); }
// Kurtarma alanına kopya: tek kuyruk, silme işaretinde çalışmaz (src/sekmeSenkron.ts createForeignPreserver). true = kayıt alındı.
export const preserveForeignValue = createForeignPreserver(() => stores()?.idb, () => isResetMarked());
// Silme işareti ETKİN mi (canlı okuma; damga + süre sınırı: resetMarkerActive). Takılı eski işaret etkin sayılmaz.
export function isResetMarked(): boolean {
  try { return typeof localStorage !== 'undefined' && resetMarkerActive(localStorage.getItem(MIRROR_CLEARED_KEY)); } catch { return false; }
}

export function getStorageSnapshot(): StorageSnapshot {
  return { state, boot: bootReport, mirror: writer?.status(), note };
}

// Test/teşhis için: bekleyen ayna yazmaları ve silme bitsin.
export async function flushMirror(): Promise<void> {
  await writer?.flush();
  await clearing;
}

// Kurtarma rafı işlevleri (src/kurtarma.ts) için tarayıcı depoları. IndexedDB yoksa yalnız localStorage rafı döner.
export function getRecoveryStores(): { ls: KvStore; idb?: KvStore } | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    lsStore ??= createLocalStore(localStorage);
    if (typeof indexedDB !== 'undefined') idbStore ??= createIdbStore(indexedDB);
    return { ls: lsStore, ...(idbStore ? { idb: idbStore } : {}) };
  } catch { return undefined; }
}
