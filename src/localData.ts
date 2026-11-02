// Bu tarayıcıdaki kullanıcı verisinin toplu temizliği + bulut sahiplik işareti.
//
// İki ayrı temizlik bilinçli olarak ayrı tutulur:
//   • clearLocalUserData() — SIFIRLA'nın gövdesi. Davranışı SIFIRLA ile birebir aynıdır
//     (tek ek: senkronlanmayan sahiplik işareti de silinir; görünür bir fark yaratmaz).
//   • clearForSignOut()    — hesaptan çıkış / hesap silme / kullanıcının başlatmadığı oturum
//     düşüşü. SIFIRLA kümesine ek olarak sembol içeren fiyat önbelleklerini de siler:
//     ortak bir cihazda bir sonraki kişi, çıkan kullanıcının hangi varlıkları takip ettiğini
//     önbellek anahtarlarından okuyamasın. SIFIRLA davranışı değişmesin diye bu ek yalnızca
//     çıkış yolundadır.
import { actions } from './store';
import { resetMemory } from './agentMemory';
import { resetTraining } from './agentTraining';
import { resetTaxRates } from './taxRates';
import { resetTargets } from './targetAllocation';
import { resetBackupMeta } from './backup';
import { resetInflation } from './inflation';
import { clearPriceHistoryCache } from './priceHistory';
import { clearMarketCache } from './cryptoMarketData';
import { clearRecoveryKeys } from './recovery';
import { clearMirrorForReset } from './mirror';
import { deleteQuarantine } from './karantina';

// Bu tarayıcıdaki kullanıcı verisinin hangi hesaba (Supabase user id) ait olduğu.
// SENKRONLANMAZ ve BACKED_UP_KEYS'te YOKTUR. Amaç hesaplar arası sızıntıyı önlemek:
// A'nın verisi tarayıcıda kalmışken B giriş yaparsa, bu işaret A'yı gösterdiği için yerel
// veri B'nin hesabına YÜKLENMEZ, önce temizlenir (bkz. cloud.ts → pull).
export const CLOUD_OWNER_KEY = 'fagent.cloud.owner.v1';
// Son başarılı eşitlemedeki anlık görüntünün özeti (içerik değil, yalnızca hash). Girişte
// "yerel mi değişti, bulut mu?" ayrımını yapmak için — senkronlanmaz.
export const CLOUD_BASE_KEY = 'fagent.cloud.base.v1';

export function getCloudOwner(): string | null {
  try { return localStorage.getItem(CLOUD_OWNER_KEY); } catch { return null; }
}

export function getCloudBase(): string | null {
  try { return localStorage.getItem(CLOUD_BASE_KEY); } catch { return null; }
}

export function setCloudOwner(uid: string, baseHash: string): void {
  try {
    localStorage.setItem(CLOUD_OWNER_KEY, uid);
    localStorage.setItem(CLOUD_BASE_KEY, baseHash);
  } catch { /* kota — işaret yoksa bir sonraki girişte çakışma sorusu sorulur, veri kaybolmaz */ }
}

export function clearCloudOwner(): void {
  try {
    localStorage.removeItem(CLOUD_OWNER_KEY);
    localStorage.removeItem(CLOUD_BASE_KEY);
  } catch { /* yok */ }
}

// Üründen çıkarılmış özelliklerin eski kullanıcılarda kalmış anahtarları. Yedek, bulut senkronu ve
// beyaz liste kümelerine GİRMEZ; yalnızca silinir. (Dış AI bağlantısı kaldırıldı — adım 3.)
export const LEGACY_KEYS = ['fagent.ai.proxyurl.v1'] as const;

export function purgeLegacyKeys(): void {
  for (const k of LEGACY_KEYS) {
    try { localStorage.removeItem(k); } catch { /* depolama kapalı olabilir */ }
  }
}

// SIFIRLA. App.tsx'teki resetAll yalnızca bunu çağırır.
// Karantina (hesaba gitmemiş kopya, karantina.ts) SIFIRLA'da da silinir. `keepQuarantine` yalnızca cloud.ts'in
// çıkış/oturum düşüşü yolunda true gelir: orada karantina temizlikten SONRA yazılır ya da var olan korunur.
export function clearLocalUserData(keepQuarantine = false): void {
  actions.reset();
  resetMemory();
  resetTraining();
  resetTaxRates();
  resetTargets();
  resetBackupMeta();
  resetInflation(); // kullanıcının girdiği enflasyon oranı da kullanıcı verisidir
  purgeLegacyKeys();
  clearCloudOwner();
  clearPriceHistoryCache(); // fiyat geçmişi önbelleği: anahtar adları (coin/döviz kodu) tutulan varlıkları gösterir
  clearRecoveryKeys();   // bozuk-kayıt kurtarma kopyaları da kullanıcı verisidir
  clearMirrorForReset(); // IndexedDB aynası: silinmezse açılışta veri geri gelirdi
  if (!keepQuarantine) deleteQuarantine();
  // Not: actions.reset() onboarded'ı false yapar, Panel unmount olur; bir sonraki
  // onboarding'de yeniden mount olup getTargets()/getTaxRates()'i TAZE okur — bu yüzden
  // kart state'lerini ayrıca sıfırlamak gerekmiyor.
}

// Çıkış / hesap silme / oturum düşüşü.
export function clearForSignOut(keepQuarantine = false): void {
  clearLocalUserData(keepQuarantine);
  clearPriceHistoryCache();
  clearMarketCache();
  // actions.reset() boş durumu 'fagent.portfolio.v1'e geri yazar (onboarded=false). Çıkıştan
  // sonra kullanıcı katmanlarının HİÇBİRİ bu tarayıcıda kalmasın diye anahtar da silinir;
  // bellekteki durum zaten boş, load() anahtar yokken de aynı boş durumu döner.
  try { localStorage.removeItem('fagent.portfolio.v1'); } catch { /* yok */ }
}
