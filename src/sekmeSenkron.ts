// Sekmeler arası eşitleme (veri yolculuğu sahne A8). localStorage ESAS kaynak kalır; bu modül yalnızca
// "başka sekme diski değiştirdi" bilgisini (window 'storage' olayı) bu sekmenin BELLEĞİNE taşır.
//
// NEDEN: store.ts durumu bellekte tutar ve her işlemde TÜM durumu diske yazar. Başka sekme araya yazdıysa eski bellek
// diskteki yeni veriyi sessizce ezerdi (son yazan kazanır). Şimdi:
//   * başka sekme bir katmanı değiştirirse (BACKED_UP_KEYS) bu sekme o katmanı diskten yeniden yükler;
//   * bu sekmede KAYDEDİLMEMİŞ (A7 bekleyen) değer varsa ÇAKIŞMA: bekleyen değer ezilmez; diğer sekmenin değeri kurtarma
//     alanına alınır. Kurtarma alanına GÜVENLE alınamazsa bu sekmenin bekleyen değeri diskteki öteki değerin üstüne
//     YAZILMAZ (anahtar için yazım bekletilir, uyarı sürer). Arayüz mevcut uyarı kartında bildirir;
//   * başka sekme SIFIRLA/çıkış yaptıysa (katmanlar silinir + MIRROR_CLEARED_KEY işareti) SİLME KAZANIR: bu sekmenin
//     bekleyen değeri de atılır, bellek diskten (boş) yeniden yüklenir, silme bitene kadar ayna yazıcısı durdurulur;
//     kullanıcıya söylenir. Silinen veri geri yazılmaz.
// Olay yalnızca DİĞER belgelerde tetiklenir (kendi yazımımız olay üretmez). Anahtar ADI dışında içerik log'a gitmez.
//
// Saf karar mantığı deps ile enjekte edilir (birim testte window/IndexedDB yok); tarayıcı bağı installTabSync'tedir.
import { useSyncExternalStore } from 'react';
import { BACKED_UP_KEYS } from './backup.ts';
import { getUnsavedKeys, markTabConflict, resolveTabConflict, discardPendingBySiblingReset, setHoldRetry } from './yazmaDurumu.ts';
import { MIRROR_CLEARED_KEY, saveRecovery, resetMarkerActive, isEmptyLayerValue } from './storage/mirror.ts';
import type { KvStore } from './storage/types.ts';

const PORTFOLIO_KEY = 'fagent.portfolio.v1';

export interface TabEventLike { key: string | null; newValue: string | null }

export interface TabSyncDeps {
  reloadPortfolio(): void;                        // store.ts reloadPortfolioFromDisk
  preserveForeign(key: string, value: string): Promise<boolean>; // çakışmada diğer sekmenin değerini kurtarma alanına al; true = GÜVENLE alındı
  resetMarked(): boolean;                         // silme işareti ETKİN mi (canlı okuma; damga + süre sınırı)
  diskValue(key: string): string | null;          // anahtarın diskteki güncel ham değeri (canlı okuma)
  foreignResetStart(): void;                      // bu sekmenin ayna yazıcısını durdur
  foreignResetEnd(): void;                        // silme bitti (işaret kalktı): yazıcıyı sürdür
}

export interface TabOutcome {
  reloaded: string[]; layers: string[]; conflicts: string[];
  discarded: string[];       // SİLME KAZANIR: bekleyen değeri atılan anahtarlar
  settled: Promise<void>;    // çakışmada kurtarma kopyası sonuçlanınca çözülür (testler bekler)
}

// Diğer katmanlar (vergi, hedef, ajan belleği, öğretilen bilgi) her okumada diskten okur; yalnız ekrandaki React
// durumlarının tazelenmesi gerekir: bu sayaç artınca ilgili bileşenler yeniden okur (useLayerEpoch).
let epoch = 0;
const epochListeners = new Set<() => void>();
export function getLayerEpoch(): number { return epoch; }
export function subscribeLayerEpoch(fn: () => void): () => void {
  epochListeners.add(fn);
  return () => epochListeners.delete(fn);
}
export function useLayerEpoch(): number {
  return useSyncExternalStore(subscribeLayerEpoch, getLayerEpoch);
}
export function bumpLayerEpoch(): void {
  epoch++;
  epochListeners.forEach(fn => { try { fn(); } catch { /* dinleyici hatası eşitlemeyi bozmasın */ } });
}

const ALL_KEYS: readonly string[] = BACKED_UP_KEYS;

// Silme kazanır: verilen anahtarların bekleyen değeri atılır, bellek diskten (boş) yüklenir.
function applyForeignReset(keys: readonly string[], deps: TabSyncDeps, out: TabOutcome): void {
  const dropped = discardPendingBySiblingReset(keys);
  out.discarded.push(...dropped);
  for (const key of keys) {
    if (key === PORTFOLIO_KEY) { deps.reloadPortfolio(); out.reloaded.push(key); } else if (!out.layers.includes(key)) out.layers.push(key);
  }
}

export function handleTabEvent(ev: TabEventLike, deps: TabSyncDeps): TabOutcome {
  const out: TabOutcome = { reloaded: [], layers: [], conflicts: [], discarded: [], settled: Promise.resolve() };
  if (ev.key === MIRROR_CLEARED_KEY) {
    // Silme işareti kondu = başka sekmede SIFIRLA/çıkış başladı; kalktı = silme bitti. Süresi geçmiş/okunamayan işaret yok sayılır.
    if (ev.newValue !== null) {
      if (!resetMarkerActive(ev.newValue)) return out;
      deps.foreignResetStart();
      // Katman olayları işaretten ÖNCE gelmiş olabilir. Kalan bekleyenler YALNIZ diskteki değer gerçekten boşsa atılır
      // (silme kazanır); sıradan yabancı yazımla dolu bir değer silme sayılmaz.
      applyForeignReset(ALL_KEYS.filter(k => getUnsavedKeys().includes(k) && isEmptyLayerValue(k, deps.diskValue(k))), deps, out);
      if (out.layers.length > 0) bumpLayerEpoch();
    } else deps.foreignResetEnd();
    return out;
  }
  // key === null: başka sekme localStorage.clear() yaptı -> tüm katmanlar silinmiş sayılır.
  const keys: readonly string[] = ev.key === null ? ALL_KEYS : ALL_KEYS.includes(ev.key) ? [ev.key] : [];
  if (keys.length === 0) return out;
  // SİLME KAZANIR yalnız değer gerçekten boşsa (anahtar silindi / boş portföy durumu) ya da clear() ise; işaretin varlığı tek başına yetmez.
  const silme = (key: string) => ev.key === null || isEmptyLayerValue(key, ev.newValue);
  // Etkin işaret + silme ise yazıcı hemen durdurulur (katman olayları işaretten önce gelebilir).
  if (deps.resetMarked() && keys.some(silme)) deps.foreignResetStart();
  const dirty = new Set(getUnsavedKeys());
  const waits: Promise<void>[] = [];
  for (const key of keys) {
    if (dirty.has(key)) {
      if (silme(key)) { applyForeignReset([key], deps, out); continue; } // SİLME KAZANIR
      // Bu sekmede kaydedilmemiş değer var: ezme, yükleme yapma; bekleyen değer yedekte ve bellekte kalır.
      // Öteki sekmenin değeri kurtarma alanına güvenle alınamazsa bekleyen değer diske YAZILMAZ (yazım bekletilir);
      // sonraki yazımda kopya yeniden denenir (yazmaDurumu setHoldRetry).
      const v = ev.newValue as string;
      markTabConflict(key, v);
      setHoldRetry(deps.preserveForeign);
      out.conflicts.push(key);
      waits.push(deps.preserveForeign(key, v).catch(() => false).then(ok => resolveTabConflict(key, ok)));
      continue;
    }
    if (key === PORTFOLIO_KEY) { deps.reloadPortfolio(); out.reloaded.push(key); } else out.layers.push(key);
  }
  if (out.layers.length > 0) bumpLayerEpoch();
  out.settled = Promise.all(waits).then(() => undefined);
  return out;
}

// Tarayıcı bağı: main.tsx çağırır (store dinamik içe aktarıldıktan sonra). Dönen işlev dinleyiciyi kaldırır.
export function installTabSync(deps: TabSyncDeps): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    // Yalnız localStorage; sessionStorage olayları ilgisiz.
    try { if (e.storageArea && e.storageArea !== window.localStorage) return; } catch { return; }
    try { handleTabEvent({ key: e.key, newValue: e.newValue }, deps); } catch { /* eşitleme hatası uygulamayı bozmaz */ }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

// ---- Saf yardımcılar (src/mirror.ts bunları tarayıcı depolarıyla bağlar; birim testlenir) ----

// Kurtarma alanına kopya (çakışma ve olay gecikmesi): çağrılar TEK KUYRUKTA sırayla işlenir; silme işareti varken (SIFIRLA/çıkış
// sürüyor) HİÇ çalışmaz ve false döner. true = kayıt IndexedDB'ye gerçekten alındı. Asla fırlatmaz.
export function createForeignPreserver(getIdb: () => KvStore | undefined, isResetMarked: () => boolean): (key: string, value: string) => Promise<boolean> {
  let queue: Promise<unknown> = Promise.resolve();
  return (key, value) => {
    const run = async (): Promise<boolean> => {
      try {
        if (isResetMarked()) return false;
        const idb = getIdb();
        if (!idb) return false;
        const r = await saveRecovery(idb, key, value, 'geri');
        if (isResetMarked()) { if (r.key) await idb.delete(r.key); return false; } // yarış: silme başladı, kayıt geri alınır
        return !r.error && r.key !== undefined;
      } catch { return false; }
    };
    const p = queue.then(run, run);
    queue = p.catch(() => undefined);
    return p;
  };
}

// Başka sekmedeki SIFIRLA için ayna yazıcısı kapısı: başlayınca durdurur; bitince, bu sekmenin KENDİ silmesi sürmüyorsa sürdürür.
// İşaret takılırsa (öteki sekmenin silmesi hata aldı) bitiş olayı hiç gelmez: bu yüzden başlangıçta bir zamanlayıcı kurulur;
// süre dolunca işaret hâlâ ETKİN değilse (süresi geçmiş ya da kalkmış) yazıcı sürdürülür. timer enjekte edilebilir (birim test).
export function createForeignResetGate(
  w: { pause(): void; resume(): void; request(): void } | undefined,
  isOwnClearing: () => boolean,
  markerActive: () => boolean = () => false,
  maxWaitMs = 0,
  timer: { set(fn: () => void, ms: number): unknown; clear(h: unknown): void } = {
    set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>),
  },
): { start(): void; end(): void } {
  let handle: unknown;
  const end = () => {
    if (handle !== undefined) { timer.clear(handle); handle = undefined; }
    if (isOwnClearing()) return;
    try { w?.resume(); w?.request(); } catch { /* yok */ }
  };
  return {
    start() {
      try { w?.pause(); } catch { /* yok */ }
      if (maxWaitMs > 0) {
        if (handle !== undefined) timer.clear(handle);
        handle = timer.set(() => { handle = undefined; if (!markerActive()) end(); }, maxWaitMs);
      }
    },
    end,
  };
}
