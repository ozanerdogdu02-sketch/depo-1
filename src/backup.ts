// Tam veri yedeği — dışa/geri al.
//
// NEDEN VAR: FAGENT'ın verisi varsayılan olarak yalnızca tarayıcının localStorage'ında durur
// (hesap açılırsa ayrıca kullanıcının kendi RLS korumalı bulut satırına eşitlenir — bkz.
// cloud.ts; hesap opsiyoneldir). Bu bilinçli bir tasarım (gizlilik) ama tek bir yan etkisi var:
// tarayıcı verisi temizlenirse, gizli sekmede çalışılırsa ya da cihaz değişirse HER ŞEY gider.
// Mevcut CSV dışa aktarma yalnızca VARLIKLARI kurtarıyordu; işlem geçmişi, öğretilen bilgiler,
// stopaj oranları ve hedef dağılım kapsam dışıydı (CSV'nin içe aktarması da yalnızca varlık
// alıyor). Bu modül beş katmanın tamamını tek dosyada taşır ve geri yükleyebilir.
//
// GÜVENLİK: geri yüklerken dosyadaki anahtarlar BEYAZ LİSTEDEN geçirilir. Bir yedek dosyası
// dışarıdan gelebilir; içindeki rastgele anahtarları localStorage'a yazmak, saldırganın
// uygulamanın durumunu belirlemesine izin vermek olurdu.

const BACKUP_VERSION = 1;
const META_KEY = 'fagent.backup.v1';

// Yedeklenen katmanlar. Önbellekler (ör. fagent.cryptomarket.cache.v2) BİLEREK dışarıda:
// yeniden üretilebilirler ve yedeği şişirirler.
//
// DİKKAT — BURAYA EKLENEN ANAHTAR BULUTA DA GİDER: bu liste aynı zamanda hesap açan
// kullanıcının bulut senkronunun (cloud.ts) beyaz listesidir. Yeni bir anahtar eklersen
// gizlilik metnini (README, Hesap ekranı, ajan metinleri) ve aydınlatma metnini güncelle.
// Önbellekler, AI bağlantı adresi (fagent.ai.proxyurl.v1), yedek meta verisi ve bulut
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

export type ApplyMode = 'replace' | 'portfolioOnly';

export type ApplyResult =
  | { ok: true; written: number }
  | { ok: false; reason: 'gecersiz' | 'bos' | 'yazilamadi' };

const PORTFOLIO_KEY = 'fagent.portfolio.v1';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Beyaz listeden geçirilmiş, yazılmaya hazır çiftler. SAF — localStorage'a dokunmaz.
export function whitelistUserData(data: unknown, mode: ApplyMode): [string, string][] | undefined {
  if (!isPlainObject(data)) return undefined;
  const keys: readonly string[] = mode === 'portfolioOnly' ? [PORTFOLIO_KEY] : BACKED_UP_KEYS;
  const out: [string, string][] = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const v = data[key];
    if (typeof v === 'string') out.push([key, v]);
  }
  return out;
}

export function applyUserData(data: unknown, opts: { mode: ApplyMode }): ApplyResult {
  const toWrite = whitelistUserData(data, opts.mode);
  if (!toWrite) return { ok: false, reason: 'gecersiz' };
  if (toWrite.length === 0) return { ok: false, reason: 'bos' };
  try {
    if (opts.mode === 'replace') {
      for (const key of BACKED_UP_KEYS) localStorage.removeItem(key);
    }
    for (const [key, v] of toWrite) localStorage.setItem(key, v);
  } catch {
    return { ok: false, reason: 'yazilamadi' };
  }
  return { ok: true, written: toWrite.length };
}

// Kullanıcı katmanlarının anlık görüntüsü — buildBackup'ın `data` kısmı ve bulut satırının
// gövdesi. Yalnızca BACKED_UP_KEYS; önbellekler, AI adresi, meta ve oturum token'ı GİRMEZ.
export function snapshotUserData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of BACKED_UP_KEYS) {
    try {
      const v = localStorage.getItem(key);
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

export function notifyUserDataChanged(): void {
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

  // BEYAZ LİSTE + ya hep ya hiç: ortak çekirdek (bulut senkronu da aynısını kullanır).
  const result = applyUserData(file.data, { mode: 'replace' });
  if (!result.ok) {
    return result.reason === 'yazilamadi'
      ? { ok: false, message: 'Yazma başarısız — tarayıcı depolama kotası dolu olabilir.' }
      : { ok: false, message: 'Yedekte geri yüklenebilir bir veri bulunamadı.' };
  }

  // Meta (son yedek zamanı) yalnızca DOSYA yolunda yazılır; bulut yolu meta yazmaz.
  writeMeta({ ...getBackupMeta(), lastBackupAt: file.createdAt ?? new Date().toISOString() });
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
