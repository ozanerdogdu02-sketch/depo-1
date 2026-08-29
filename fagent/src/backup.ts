// Tam veri yedeği — dışa/geri al.
//
// NEDEN VAR: FAGENT'ın tüm verisi yalnızca tarayıcının localStorage'ında durur. Sunucu yok,
// hesap yok, bulut yok — bu bilinçli bir tasarım (gizlilik) ama tek bir yan etkisi var:
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
  const data: Record<string, string> = {};
  for (const key of BACKED_UP_KEYS) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) data[key] = v;
    } catch { /* okunamayan anahtarı atla — yarım yedek, hiç yedeksizden iyidir */ }
  }
  return { fagentBackup: BACKUP_VERSION, createdAt: new Date().toISOString(), data };
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

  // BEYAZ LİSTE: yalnızca tanıdığımız anahtarlar yazılır. Dosya dışarıdan gelmiş olabilir.
  const toWrite: [string, string][] = [];
  for (const key of BACKED_UP_KEYS) {
    const v = (file.data as Record<string, unknown>)[key];
    if (typeof v === 'string') toWrite.push([key, v]);
  }
  if (toWrite.length === 0) {
    return { ok: false, message: 'Yedekte geri yüklenebilir bir veri bulunamadı.' };
  }

  try {
    // Yedekte olmayan katmanlar temizlenir — aksi halde eski veriyle yenisi karışırdı.
    for (const key of BACKED_UP_KEYS) localStorage.removeItem(key);
    for (const [key, v] of toWrite) localStorage.setItem(key, v);
  } catch {
    return { ok: false, message: 'Yazma başarısız — tarayıcı depolama kotası dolu olabilir.' };
  }

  writeMeta({ ...getBackupMeta(), lastBackupAt: file.createdAt ?? new Date().toISOString() });
  return { ok: true, message: `Yedek geri yüklendi (${toWrite.length} katman).`, restoredKeys: toWrite.length };
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
