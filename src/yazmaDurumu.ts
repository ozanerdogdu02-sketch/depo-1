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

function refresh(): void {
  const next = [...new Set([...pending.keys(), ...deleted])].sort();
  const same = next.length === dirtyKeys.length && next.every((k, i) => k === dirtyKeys[i]);
  if (same) return;
  dirtyKeys = next;
  listeners.forEach(fn => { try { fn(); } catch { /* dinleyici hatası yazmayı bozmasın */ } });
}

// Yazar; başarıyı döner. ASLA fırlatmaz.
export function writeLocal(key: string, value: string): boolean {
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
