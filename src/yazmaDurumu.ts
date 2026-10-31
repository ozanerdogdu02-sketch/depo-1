// localStorage yazma durumu — "kaydedilmedi" (kirli) izleme. Saf: React, DOM, ağ yok.
//
// NEDEN VAR (veri yolculuğu sahne A7): setItem kota dolunca (QuotaExceededError) ya da özel
// gezintide hata fırlatır. Daha önce portföy commit'i bunu yakalamıyordu (bellek güncellenir,
// dinleyiciler çalışmaz, hata yukarı kaçar); diğer katmanlar ya hiç yakalamıyor ya da sessizce
// yutuyordu. Şimdi tüm kullanıcı katmanları yazmayı BURADAN yapar:
//   * başarılı → anahtar "kirli" listesinden çıkar;
//   * başarısız → değer BELLEKTE tutulur (bekleyen), anahtar kirli işaretlenir, arayüz uyarır.
// localStorage ESAS kaynak kalır: yazılamayan değer IndexedDB aynasına YAZILMAZ (açılışta
// localStorage kazanır, ayna değeri kurtarma kopyasına düşerdi; ayrıca ayna localStorage'ın
// "o anki halini" yansıtır). Bekleyen değer yalnızca (a) bir sonraki başarılı yazımda diske
// iner, (b) yedek dosyasına girer (snapshotUserData bekleyeni önceler) — kullanıcı sayfayı
// yenilemeden yedek alabilsin diye.
// Yalnızca anahtar ADI tutulur ve bildirilir; içerik log'a/telemetriye gitmez.

const pending = new Map<string, string>();
// 'Silinmeli' işareti: eskiden hiç olmayan katmanın yeni (yanlış) değeri diskten SİLİNEMEDİ. Okuyucular null görür,
// yedek o anahtarı taşımaz, ayna o anahtara dokunmaz, uyarı kartı çıkar.
const deleted = new Set<string>();
const listeners = new Set<() => void>();
let dirtyKeys: readonly string[] = [];
// ---- Sekmeler arası durum bildirimleri (veri yolculuğu sahne A8) ----
// (1) ÇAKIŞMA: bu sekmede kaydedilmemiş (bekleyen) değer varken BAŞKA bir sekme aynı anahtarı değiştirdi. Bekleyen değer
//     ezilmez. Diğer sekmenin sürümü kurtarma alanına GÜVENLE alınana kadar anahtar için yazım BEKLETİLİR (hold): bekleyen
//     değer, diskteki öteki sürümün üstüne yazılmaz. Kopyalama başarılı olursa bekletme kalkar; başarısızsa sürer.
//     Çakışma, bekleyen çözülünce (yazım başarılı, silme, geri yükleme) kendiliğinden kalkar.
// (2) SİLME KAZANIR: başka sekmede SIFIRLA/çıkış yapıldı; bu sekmenin bekleyen değeri ATILIR (diske/aynaya geri yazılmaz) ve
//     kullanıcıya söylenir. Sayfa yenilenene ya da bu anahtar için SIFIRLA yapılana dek bildirim durur.
// (3) ÜZERİNE YAZMA: eski bellekle yapılan bir yazım, diskteki (başka sekmeden gelmiş) farklı sürümün üstüne yazdı (olay
//     gecikmesi); önceki sürümün kurtarma alanına kopyalanıp kopyalanmadığı bildirilir.
// Yalnızca anahtar ADI tutulur; içerik log'a gitmez.
const conflicts = new Map<string, 'bekle' | 'kopyalandi'>();
const holds = new Set<string>();
// Bekletmedeki anahtar için öteki sekmenin sürümü (kopya yeniden denenebilsin diye bellekte tutulur) ve yeniden deneme alıcısı.
const holdValues = new Map<string, string>();
const retrying = new Set<string>();
type HoldRetry = (key: string, foreignValue: string) => Promise<boolean>;
let holdRetry: HoldRetry | undefined;
export function setHoldRetry(fn: HoldRetry | undefined): void { holdRetry = fn; }
const discarded = new Set<string>();
const overwritten = new Map<string, boolean>();
let conflictKeys: readonly string[] = [];
let noticeText = '';

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

function composeNotice(): string {
  const parts: string[] = [];
  const cs = [...conflicts.values()];
  if (cs.includes('bekle')) parts.push(TAB_CONFLICT_BEKLEMEDE);
  if (cs.includes('kopyalandi')) parts.push(TAB_CONFLICT_KOPYALANDI);
  if (discarded.size > 0) parts.push(TAB_RESET_DISCARDED_MESSAGE);
  const ow = [...overwritten.values()];
  if (ow.includes(true)) parts.push(TAB_OVERWRITE_COPIED_MESSAGE);
  if (ow.includes(false)) parts.push(TAB_OVERWRITE_NOT_COPIED_MESSAGE);
  return parts.join(' ');
}

function refresh(): void {
  const next = [...new Set([...pending.keys(), ...deleted])].sort();
  for (const k of [...conflicts.keys()]) if (!pending.has(k) && !deleted.has(k)) { conflicts.delete(k); holds.delete(k); }
  for (const k of [...holds]) if (!pending.has(k) && !deleted.has(k)) holds.delete(k);
  for (const k of [...holdValues.keys()]) if (!holds.has(k)) holdValues.delete(k);
  const nextConflicts = [...conflicts.keys()].sort();
  const nextNotice = composeNotice();
  if (sameList(next, dirtyKeys) && sameList(nextConflicts, conflictKeys) && nextNotice === noticeText) return;
  dirtyKeys = next;
  conflictKeys = nextConflicts;
  noticeText = nextNotice;
  listeners.forEach(fn => { try { fn(); } catch { /* dinleyici hatası yazmayı bozmasın */ } });
}

// Bekletmedeki anahtar yeniden yazılmak istendi: öteki sekmenin sürümünün kurtarma alanına kopyası YENİDEN denenir.
// Başarılıysa bekletme kalkar ve en güncel bekleyen değer yazılır; başarısızsa (ör. IndexedDB hiç yok) bekletme sürer.
function retryHold(key: string): void {
  const v = holdValues.get(key);
  if (!holdRetry || v === undefined || retrying.has(key)) return;
  retrying.add(key);
  void holdRetry(key, v).catch(() => false).then(ok => {
    retrying.delete(key);
    if (!ok || !holds.has(key)) return;
    resolveTabConflict(key, true);
    const latest = pending.get(key);
    if (latest !== undefined) writeLocal(key, latest);
  });
}

// Yazar; başarıyı döner. ASLA fırlatmaz.
export function writeLocal(key: string, value: string): boolean {
  if (holds.has(key)) {
    // Çakışma: öteki sekmenin sürümü kurtarma alanına alınamadı; bekleyen değer diskteki sürümün üstüne YAZILMAZ.
    pending.set(key, value);
    refresh();
    retryHold(key);
    return false;
  }
  try {
    localStorage.setItem(key, value);
    pending.delete(key);
    deleted.delete(key);
    refresh();
    return true;
  } catch {
    pending.set(key, value);
    refresh();
    return false;
  }
}

// Kaldırma da bekleyen değeri düşürür (SIFIRLA sonrası eski değer yedeğe sızmasın).
export function removeLocal(key: string): void {
  pending.delete(key);
  deleted.delete(key);
  conflicts.delete(key); holds.delete(key); discarded.delete(key); overwritten.delete(key);
  try { localStorage.removeItem(key); } catch { /* yok */ }
  refresh();
}

// Diske yazılamamış anahtarın bellekteki değeri (yoksa undefined).
export function getPendingWrite(key: string): string | undefined {
  return pending.get(key);
}

// Okuma noktası: bekleyen değer varsa o, 'silinmeli' ise null, yoksa localStorage.
export function readLocal(key: string): string | null {
  if (deleted.has(key)) return null;
  const p = pending.get(key);
  if (p !== undefined) return p;
  return localStorage.getItem(key);
}

// Başka bir yol (geri yükleme, bulut çekme) katmanları diske yazdıysa bekleyenler geçersizdir.
// `keys` verilirse yalnız o anahtarların bekleyeni temizlenir (portfolioOnly kipi diğerlerine dokunmaz).
export function clearPendingWrites(keys?: readonly string[]): void {
  if (pending.size === 0 && deleted.size === 0) return;
  if (keys) for (const k of keys) { pending.delete(k); deleted.delete(k); } else { pending.clear(); deleted.clear(); }
  refresh();
}

// Geri yükleme rollback'i başarısız olduğunda geri alınamayan katmanın ESKİ durumunu tutar: eski değer varsa
// bekleyen olarak (uyarı kartı çıkar, yedek eski değeri taşır, okuyucular onu okur); eskiden yoksa (null)
// 'silinmeli' işareti konur (yeni değer diskte kaldı ama kullanıcı verisi sayılmaz).
export function markPending(key: string, value: string | null): void {
  if (value === null) { pending.delete(key); deleted.add(key); } else { deleted.delete(key); pending.set(key, value); }
  refresh();
}

// Koruma bağlantısı (ayna): kirli anahtar kümesi değiştikçe protect(key,on) çağrılır. Abonelikten HEMEN sonra bir kez
// eşitlenir (bağlanmadan önce oluşmuş kirli anahtarlar da korunur). Dönen işlev bağı keser ve korumaları kaldırır.
export function bindUnsavedGuard(protect: (key: string, on: boolean) => void): () => void {
  let guarded = new Set<string>();
  const sync = () => {
    const now = new Set(getUnsavedKeys());
    for (const k of now) if (!guarded.has(k)) protect(k, true);
    for (const k of guarded) if (!now.has(k)) protect(k, false);
    guarded = now;
  };
  const off = subscribeUnsaved(sync);
  sync();
  return () => { off(); for (const k of guarded) protect(k, false); guarded = new Set(); };
}

// Başka sekme, bu sekmede bekleyen (kaydedilmemiş) bir anahtarı değiştirdi: çakışma işaretle ve yazımı BEKLET. Bekleyen
// değere dokunmaz. Anahtarın bekleyeni yoksa (çakışma değil) false döner ve hiçbir şey işaretlenmez.
export function markTabConflict(key: string, foreignValue?: string): boolean {
  if (!pending.has(key) && !deleted.has(key)) return false;
  conflicts.set(key, 'bekle');
  holds.add(key);
  if (foreignValue !== undefined) holdValues.set(key, foreignValue);
  refresh();
  return true;
}

// Öteki sekmenin sürümünün kurtarma alanına alınması sonuçlandı: başarılıysa yazım bekletmesi kalkar (bekleyen değer
// hâlâ pending; sonraki yazımda diske iner), başarısızsa bekletme SÜRER.
export function resolveTabConflict(key: string, kopyalandi: boolean): void {
  if (!conflicts.has(key)) return;
  if (kopyalandi) { conflicts.set(key, 'kopyalandi'); holds.delete(key); }
  refresh();
}

// SİLME KAZANIR: başka sekmede SIFIRLA/çıkış yapıldı. Verilen anahtarların bekleyen/'silinmeli' durumu atılır
// (diske DOKUNULMAZ: o zaten silinmiş/boşaltılmıştır). Atılan anahtarları döner.
export function discardPendingBySiblingReset(keys: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    if (!pending.has(k) && !deleted.has(k)) continue;
    pending.delete(k); deleted.delete(k); conflicts.delete(k); holds.delete(k);
    discarded.add(k);
    out.push(k);
  }
  if (out.length > 0) refresh();
  return out;
}

// Başka sekmede SIFIRLA sürerken bu sekmede yapılan işlem yazılmadan atıldı (silme kazanır): kullanıcıya bildirilir.
export function noteDiscardedBySiblingReset(key: string): void {
  discarded.add(key);
  refresh();
}

// Eski bellekle yapılan yazım diskteki farklı sürümün üstüne yazdı (store.ts commit); kurtarma kopyası alındı mı?
export function markTabOverwrite(key: string, kopyalandi: boolean): void {
  overwritten.set(key, kopyalandi);
  refresh();
}

// Çakışmalı anahtarlar — useSyncExternalStore için kararlı referans (subscribeUnsaved ile aynı abonelik).
export function getTabConflictKeys(): readonly string[] {
  return conflictKeys;
}

// Sekmeler arası bildirim metni ('' = yok) — useSyncExternalStore için kararlı (dize değeri).
export function getTabNotice(): string {
  return noticeText;
}

// Kirli (diske yazılamamış) anahtarlar — useSyncExternalStore için kararlı referans.
export function getUnsavedKeys(): readonly string[] {
  return dirtyKeys;
}

export function subscribeUnsaved(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Kullanıcıya görünen tek metin kaynağı (arayüz ve testler buradan okur).
export const UNSAVED_MESSAGE =
  'Son değişiklik tarayıcıya kaydedilemedi; tarayıcı depolama kotası dolu olabilir. Değişiklik şu an yalnızca bu açık sayfada duruyor ve sayfa yenilenirse kaybolur. Yedek dosyası, Panel sekmesindeki "Veri Yedeği" kartından indirilebilir.';

// Sekmeler arası bildirim metinleri (A8): yalnızca olanı söyler. Çakışma metinleri UNSAVED_MESSAGE'ın (yedeğin nereden
// indirileceğini söyler) ARDINA eklenir.
const TAB_CONFLICT_ORTAK = 'Başka bir sekmede aynı veri değiştirildi; bu sekmede ise henüz kaydedilmemiş bir değişiklik var.';
export const TAB_CONFLICT_KOPYALANDI =
  `${TAB_CONFLICT_ORTAK} Diğer sekmenin sürümü bu tarayıcıdaki kurtarma alanına kopyalandı; bu sekmedeki değişiklik açık sayfada duruyor ve yedek dosyasına giriyor.`;
export const TAB_CONFLICT_BEKLEMEDE =
  `${TAB_CONFLICT_ORTAK} Diğer sekmenin sürümü kurtarma alanına kopyalanamadığı için bu sekmedeki değişiklik diske yazılmıyor; açık sayfada duruyor ve yedek dosyasına giriyor.`;
export const TAB_RESET_DISCARDED_MESSAGE =
  'Başka bir sekmede veriler silindi; bu sekmedeki kaydedilmemiş değişiklik de silindi.';
export const TAB_OVERWRITE_COPIED_MESSAGE =
  'Başka bir sekmede yapılan değişiklik, bu sekmedeki işlemle üzerine yazıldı; önceki sürüm bu tarayıcıdaki kurtarma alanına kopyalandı.';
export const TAB_OVERWRITE_NOT_COPIED_MESSAGE =
  'Başka bir sekmede yapılan değişiklik, bu sekmedeki işlemle üzerine yazıldı; önceki sürüm kurtarma alanına kopyalanamadı. Yedek dosyası, Panel sekmesindeki "Veri Yedeği" kartından indirilebilir.';
