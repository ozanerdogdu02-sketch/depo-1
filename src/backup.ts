// Tam veri yedeği — dışa/geri al.
//
// NEDEN VAR: FAGENT'ın verisi varsayılan olarak yalnızca tarayıcının localStorage'ında durur
// (hesap açılırsa ayrıca kullanıcının kendi RLS korumalı bulut satırına eşitlenir — bkz.
// cloud.ts; hesap opsiyoneldir). Bu bilinçli bir tasarım (gizlilik) ama tek bir yan etkisi var:
// tarayıcının site verisi tamamen temizlenirse, gizli sekmede çalışılırsa ya da cihaz değişirse HER ŞEY gider.
// Mevcut CSV dışa aktarma yalnızca VARLIKLARI kurtarıyordu; işlem geçmişi, öğretilen bilgiler,
// stopaj oranları ve hedef dağılım kapsam dışıydı (CSV'nin içe aktarması da yalnızca varlık
// alıyor). Bu modül beş katmanın tamamını tek dosyada taşır ve geri yükleyebilir.
//
// GÜVENLİK: geri yüklerken dosyadaki anahtarlar BEYAZ LİSTEDEN geçirilir. Bir yedek dosyası
// dışarıdan gelebilir; içindeki rastgele anahtarları localStorage'a yazmak, saldırganın
// uygulamanın durumunu belirlemesine izin vermek olurdu.

import { YEDEK_DOSYA_MAX_BOYUT } from './config/varsayilanlar.ts';
import { portfoyMetniGecerli } from './portfoySema.ts';
import { readLocal, clearPendingWrites, markPending } from './yazmaDurumu.ts';

const BACKUP_VERSION = 1;
const META_KEY = 'fagent.backup.v1';

// Yedeklenen katmanlar. Önbellekler (ör. fagent.cryptomarket.cache.v2) BİLEREK dışarıda:
// yeniden üretilebilirler ve yedeği şişirirler.
//
// DİKKAT — BURAYA EKLENEN ANAHTAR BULUTA DA GİDER: bu liste aynı zamanda hesap açan
// kullanıcının bulut senkronunun (cloud.ts) beyaz listesidir. Yeni bir anahtar eklersen
// gizlilik metnini (README, Hesap ekranı, ajan metinleri) ve aydınlatma metnini güncelle.
// Önbellekler, yedek meta verisi ve bulut
// sahiplik işareti BİLEREK bu listede değildir.
export const BACKED_UP_KEYS = [
  'fagent.portfolio.v1',      // portföy + işlem geçmişi
  'fagent.agent.memory.v1',   // ajanın kullanım/tercih belleği
  'fagent.agent.training.v1', // kullanıcının öğrettiği soru-cevaplar
  'fagent.tax.v1',            // düzenlenmiş stopaj oranları
  'fagent.target.v1',         // hedef dağılım
] as const;

export interface BackupFile {
  fagentBackup: number;
  createdAt: string;
  data: Record<string, string>;
}

export interface BackupMeta {
  lastBackupAt?: string;
  dismissedUntil?: string;
}

const DAY_MS = 86_400_000;
export const STALE_AFTER_DAYS = 14;
export { YEDEK_DOSYA_MAX_BOYUT };
const DISMISS_DAYS = 7;

export function getBackupMeta(): BackupMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BackupMeta;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch { return {}; }
}

function writeMeta(meta: BackupMeta): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* kota */ }
}

// İçe aktarılan dosyanın createdAt değeri güvenilmez girdidir: yalnız geçerli ISO tarih-saat ve şimdiden ileri
// değilse kabul edilir; aksi halde şimdiki zaman (gelecek tarih yedek hatırlatmasını sonsuza dek susturmasın).
const ISO_ZAMAN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
export function guvenilirYedekZamani(v: unknown, simdi: Date = new Date()): string {
  if (typeof v === 'string' && ISO_ZAMAN.test(v)) {
    const t = Date.parse(v);
    if (Number.isFinite(t) && t <= simdi.getTime()) return new Date(t).toISOString();
  }
  return simdi.toISOString();
}

// Yedek dosyasının içeriğini üretir. SAF sayılmaz (localStorage okur) ama ağ/DOM'a dokunmaz —
// ErrorBoundary bunu React durumu bozukken de çağırabilsin diye ayrı tutuldu.
export function buildBackup(): BackupFile {
  return { fagentBackup: BACKUP_VERSION, createdAt: new Date().toISOString(), data: snapshotUserData() };
}

export function downloadBackup(): void {
  const file = buildBackup();
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fagent-yedek-${file.createdAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const meta = getBackupMeta();
  writeMeta({ ...meta, lastBackupAt: file.createdAt });
}

export interface RestoreResult {
  ok: boolean;
  message: string;
  restoredKeys?: number;
}

// ---- Ortak doğrula-sonra-yaz çekirdeği ----
//
// Dosyadan geri yükleme (restoreBackup) VE bulut senkronu (cloud.ts) localStorage'a kullanıcı
// verisini YALNIZCA buradan yazar — tek uygulama noktası. Gelen veri her zaman GÜVENİLMEYEN
// girdi sayılır (dosya dışarıdan gelebilir; bulut satırını da kullanıcı kendi token'ıyla
// REST üzerinden rastgele bir jsonb ile doldurabilir):
//   • yalnızca BACKED_UP_KEYS'teki anahtarlar ve yalnızca `typeof === 'string'` değerler yazılır,
//     bilinmeyen anahtarlar sessizce atlanır;
//   • ya hep ya hiç: önce tamamı doğrulanır, yazılacak hiçbir şey yoksa HİÇBİR ŞEY yazılmaz.
//
// Kipler:
//   'replace'       — bugünkü dosya geri yükleme davranışı: veride olmayan katmanlar SİLİNİR
//                     (aksi halde eski veriyle yenisi karışırdı).
//   'portfolioOnly' — yalnızca 'fagent.portfolio.v1' yazılır, diğer katmanlara dokunulmaz
//                     (eski standalone biçimli bulut satırı yalnızca portföy içerir).

//   'selected'      — yalnızca `only` ile verilen (BACKED_UP_KEYS içinden) anahtarlar yazılır, diğerlerine dokunulmaz
//                     (kurtarma kaydından tek katman geri yükleme, src/kurtarma.ts).
export type ApplyMode = 'replace' | 'portfolioOnly' | 'selected';

// 'yazilamadi' sonuçlarında rollback alanı: 'tamam' = önceki veri aynen geri yazıldı (hiçbir şey
// değişmedi); 'eksik' = geri alma da başarısız oldu, rollbackKeys'teki katmanlar önceki halinde OLMAYABİLİR.
export type ApplyResult =
  | { ok: true; written: number }
  | { ok: false; reason: 'gecersiz' | 'bos' }
  | { ok: false; reason: 'yazilamadi'; rollback: 'tamam' | 'eksik'; rollbackKeys?: string[] };

const PORTFOLIO_KEY = 'fagent.portfolio.v1';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Beyaz listeden geçirilmiş, yazılmaya hazır çiftler. SAF — localStorage'a dokunmaz.
export function whitelistUserData(data: unknown, mode: ApplyMode, only?: readonly string[]): [string, string][] | undefined {
  if (!isPlainObject(data)) return undefined;
  const all: readonly string[] = BACKED_UP_KEYS;
  const keys: readonly string[] = mode === 'portfolioOnly' ? [PORTFOLIO_KEY] : mode === 'selected' ? (only ?? []).filter(k => all.includes(k)) : all;
  const out: [string, string][] = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const v = data[key];
    if (typeof v !== 'string') continue;
    // Portföy iç şeması (sonlu, >=0 sayılar; bkz. portfoySema.ts): geçersizse HİÇBİR ŞEY yazılmaz (ya hep ya hiç).
    if (key === PORTFOLIO_KEY && !portfoyMetniGecerli(v)) return undefined;
    out.push([key, v]);
  }
  return out;
}

// Yazım sonrası bellek tazeleme kancası (D-a): geri yükleme / bulut çekme / kurtarma diske yazınca, o anahtarların bellekteki
// durumu (store.ts lastRaw dahil) diskten yeniden yüklenmeli ki kendi yazımımız "yabancı yazım" sanılmasın. backup.ts store.ts'i
// İÇE AKTARMAZ (açılış sırası: store, bootStorage'dan sonra yüklenir); kanca src/main.tsx'te bağlanır.
let afterApply: ((keys: readonly string[]) => void) | undefined;
export function setAfterApplyHook(fn: ((keys: readonly string[]) => void) | undefined): void { afterApply = fn; }

export function applyUserData(data: unknown, opts: { mode: ApplyMode; only?: readonly string[] }): ApplyResult {
  const toWrite = whitelistUserData(data, opts.mode, opts.only);
  if (!toWrite) return { ok: false, reason: 'gecersiz' };
  if (toWrite.length === 0) return { ok: false, reason: 'bos' };

  // 1) Anlık görüntü (rollback için): DİSKTEKİ ham değerler. Okunamıyorsa geri alma garanti
  //    edilemez; hiçbir şey yazmadan çık (veri değişmedi).
  const before = new Map<string, string | null>();
  try {
    for (const key of BACKED_UP_KEYS) before.set(key, localStorage.getItem(key));
  } catch {
    return { ok: false, reason: 'yazilamadi', rollback: 'tamam' };
  }

  // 2) Yazım: ÖNCE veride olmayan katmanlar silinir (replace), SONRA yeni değerler yazılır.
  //    Gerekçe (kota ödünleşimi): kota net boyuta bakar; silmeyi önce yapmak, son hali kotaya sığan
  //    bir geri yüklemenin ara adımda takılmasını önler. Güvenlidir çünkü eski değerler bellekteki
  //    anlık görüntüdedir ve hata olursa aşağıdaki rollback (ikinci tur + bekleyen değer) devreye girer.
  const written = toWrite.map(([k]) => k);
  const removed: string[] = [];
  try {
    if (opts.mode === 'replace') {
      for (const key of BACKED_UP_KEYS) if (!written.includes(key)) { localStorage.removeItem(key); removed.push(key); }
    }
    for (const [key, v] of toWrite) localStorage.setItem(key, v);
  } catch {
    // 3) Rollback. Kota toplam boyuta bakar: ÖNCE küçülen/silinen katmanlar geri yazılır (yer açar),
    //    SONRA büyüyenler; başarısızlar ikinci turda yeniden denenir. Ayna TETİKLENMEZ.
    const cur = (k: string): number => { try { return localStorage.getItem(k)?.length ?? 0; } catch { return 0; } };
    const order = [...before.keys()].sort((x, y) => ((before.get(x)?.length ?? 0) - cur(x)) - ((before.get(y)?.length ?? 0) - cur(y)));
    let failed: string[] = order;
    for (let round = 0; round < 2 && failed.length > 0; round++) {
      const next: string[] = [];
      for (const key of failed) {
        const old = before.get(key) ?? null;
        try {
          if (old === null) localStorage.removeItem(key);
          else if (localStorage.getItem(key) !== old) localStorage.setItem(key, old);
        } catch { next.push(key); }
      }
      failed = next;
    }
    if (failed.length === 0) return { ok: false, reason: 'yazilamadi', rollback: 'tamam' };
    // Geri alınamayan katmanların ESKİ değeri kaybolmasın: bekleyen olarak bellekte tutulur (uyarı kartı çıkar,
    // yedek eski değeri taşır, okuyucular onu okur) ve ayna bu anahtarlara yazmaz (mirror.ts, bekleyen = korumalı).
    // Eskiden olmayan katmanın yeni değeri silinemediyse 'silinmeli' işareti konur (markPending null).
    for (const key of failed) markPending(key, before.get(key) ?? null);
    return { ok: false, reason: 'yazilamadi', rollback: 'eksik', rollbackKeys: failed };
  }
  clearPendingWrites([...written, ...removed]); // yalnız yazılan/silinen katmanların bekleyeni geçersiz
  try { afterApply?.([...written, ...removed]); } catch { /* tazeleme hatası yazımı geri almaz */ }
  fireWrites();
  return { ok: true, written: toWrite.length };
}

// Kullanıcı katmanlarının anlık görüntüsü — buildBackup'ın `data` kısmı ve bulut satırının
// gövdesi. Yalnızca BACKED_UP_KEYS; önbellekler, meta ve oturum token'ı GİRMEZ.
// TODO(hukuk): yedek dosyası kişisel finansal veri içerir; dosyanın ele geçmesine karşı bilgilendirme metni hukuken gözden geçirilmedi.
export function snapshotUserData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of BACKED_UP_KEYS) {
    try {
      // Diske yazılamamış (kota) son değer varsa o önceliklidir: yedek/bulut en güncel hali taşısın.
      const v = readLocal(key);
      if (v !== null) data[key] = v;
    } catch { /* okunamayan anahtarı atla — yarım yedek, hiç yedeksizden iyidir */ }
  }
  return data;
}

// ---- Değişiklik bildirimi ----
// Kalıcı katmanların (vergi, hedef, ajan hafızası, öğretilen bilgi) yazma noktaları bunu
// çağırır; bulut senkronu (cloud.ts) dinleyip YALNIZCA kayıt zamanlar. Analitiğe, log'a ya
// da telemetriye hiçbir şey yazılmaz — bildirim içerik taşımaz. Portföy (store.ts) kendi
// aboneliğini (subscribePortfolio) kullanır.
const userDataListeners = new Set<() => void>();

// Depolama yazma dinleyicileri (IndexedDB aynası, src/mirror.ts): kullanıcı katmanı localStorage'a
// yazıldığında (katman kaydı, geri yükleme, bulut çekme) tetiklenir. İçerik taşımaz.
const writeListeners = new Set<() => void>();

export function subscribeUserDataWrites(fn: () => void): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

function fireWrites(): void {
  writeListeners.forEach(fn => {
    try { fn(); } catch { /* dinleyici hatası yazma noktasını bozmasın */ }
  });
}

export function notifyUserDataChanged(): void {
  fireWrites();
  userDataListeners.forEach(fn => {
    try { fn(); } catch { /* dinleyici hatası yazma noktasını bozmasın */ }
  });
}

export function subscribeUserData(fn: () => void): () => void {
  userDataListeners.add(fn);
  return () => userDataListeners.delete(fn);
}

// Geri yükleme MEVCUT VERİNİN ÜZERİNE YAZAR — çağıran taraf önce kullanıcıya onaylatmalı.
// Dosya bozuksa hiçbir şey yazılmaz (ya hep ya hiç): önce tamamı doğrulanır, sonra yazılır.
export function restoreBackup(text: string): RestoreResult {
  // Boyut sınırı: ayrıştırmadan ÖNCE (güvenilmeyen girdi).
  if (text.length > YEDEK_DOSYA_MAX_BOYUT) {
    return { ok: false, message: `Dosya çok büyük (en çok yaklaşık ${Math.round(YEDEK_DOSYA_MAX_BOYUT / 1_000_000)} MB); hiçbir şey değişmedi.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: 'Dosya okunamadı — geçerli bir JSON değil.' };
  }

  const file = parsed as Partial<BackupFile>;
  if (!file || typeof file !== 'object' || file.fagentBackup !== BACKUP_VERSION) {
    return { ok: false, message: 'Bu bir FAGENT yedek dosyası değil (ya da farklı bir sürümden).' };
  }
  if (!file.data || typeof file.data !== 'object') {
    return { ok: false, message: 'Yedek dosyasının içeriği eksik.' };
  }

  // Portföy değeri geçersizse (bozuk biçim, eksi ya da sayı olmayan tutar) yazmadan önce açık mesajla dur.
  const pv = (file.data as Record<string, unknown>)[PORTFOLIO_KEY];
  if (typeof pv === 'string' && !portfoyMetniGecerli(pv)) {
    return { ok: false, message: 'Yedekteki portföy verisinde geçersiz değer var (bozuk biçim, eksi ya da sayı olmayan tutar). Geri yükleme yapılmadı, mevcut veri değişmedi.' };
  }

  // BEYAZ LİSTE + ya hep ya hiç: ortak çekirdek (bulut senkronu da aynısını kullanır).
  const result = applyUserData(file.data, { mode: 'replace' });
  if (!result.ok) {
    if (result.reason === 'yazilamadi') {
      return result.rollback === 'tamam'
        ? { ok: false, message: 'Yazma başarısız — tarayıcı depolama kotası dolu olabilir. Önceki veriler aynen korundu, hiçbir şey değişmedi.' }
        : { ok: false, message: 'Yazma başarısız — tarayıcı depolama kotası dolu olabilir. Önceki veriler tamamen geri alınamadı; bazı katmanlar eksik ya da değişmiş olabilir. Geri alınamayan katmanların önceki değerleri bu açık sayfada bekletiliyor; sayfa yenilenmeden önce Panel sekmesindeki "Veri Yedeği" kartından yedek dosyası indirilebilir.' };
    }
    return { ok: false, message: 'Yedekte geri yüklenebilir bir veri bulunamadı.' };
  }

  // Meta (son yedek zamanı) yalnızca DOSYA yolunda yazılır; bulut yolu meta yazmaz.
  writeMeta({ ...getBackupMeta(), lastBackupAt: guvenilirYedekZamani(file.createdAt) });
  // Hesaplı kullanıcıda geri yüklenen veri buluta da gitsin (cloud.ts yalnızca kayıt zamanlar).
  notifyUserDataChanged();
  return { ok: true, message: `Yedek geri yüklendi (${result.written} katman).`, restoredKeys: result.written };
}

// Kullanıcıyı yedek almaya çağırmalı mıyız? Rahatsız etmemek için: portföy boşken hiç,
// ertelendiyse süresi dolana kadar, alınmışsa 14 gün geçene kadar sessiz.
export function shouldNudge(hasData: boolean, now = new Date()): boolean {
  if (!hasData) return false;
  const meta = getBackupMeta();
  if (meta.dismissedUntil && new Date(meta.dismissedUntil).getTime() > now.getTime()) return false;
  if (!meta.lastBackupAt) return true;
  const age = now.getTime() - new Date(meta.lastBackupAt).getTime();
  return !Number.isFinite(age) || age > STALE_AFTER_DAYS * DAY_MS;
}

export function dismissNudge(now = new Date()): void {
  writeMeta({ ...getBackupMeta(), dismissedUntil: new Date(now.getTime() + DISMISS_DAYS * DAY_MS).toISOString() });
}

// SIFIRLA ile birlikte çağrılır — yedek geçmişi de kullanıcı verisidir.
export function resetBackupMeta(): void {
  try { localStorage.removeItem(META_KEY); } catch { /* yok */ }
}
