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
import { resetAiProxyUrl } from './aiAgent';
import { clearPriceHistoryCache } from './priceHistory';
import { clearMarketCache } from './cryptoMarketData';

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

// SIFIRLA. App.tsx'teki resetAll yalnızca bunu çağırır.
export function clearLocalUserData(): void {
  actions.reset();
  resetMemory();
  resetTraining();
  resetTaxRates();
  resetTargets();
  resetBackupMeta();
  resetInflation(); // kullanıcının girdiği enflasyon oranı da kullanıcı verisidir
  resetAiProxyUrl(); // bağlı AI worker adresi de kullanıcıya özel bir bağlantı ayarıdır
  clearCloudOwner();
  // Not: actions.reset() onboarded'ı false yapar, Panel unmount olur; bir sonraki
  // onboarding'de yeniden mount olup getTargets()/getTaxRates()'i TAZE okur — bu yüzden
  // kart state'lerini ayrıca sıfırlamak gerekmiyor.
}

// Çıkış / hesap silme / oturum düşüşü.
export function clearForSignOut(): void {
  clearLocalUserData();
  clearPriceHistoryCache();
  clearMarketCache();
  // actions.reset() boş durumu 'fagent.portfolio.v1'e geri yazar (onboarded=false). Çıkıştan
  // sonra kullanıcı katmanlarının HİÇBİRİ bu tarayıcıda kalmasın diye anahtar da silinir;
  // bellekteki durum zaten boş, load() anahtar yokken de aynı boş durumu döner.
  try { localStorage.removeItem('fagent.portfolio.v1'); } catch { /* yok */ }
}
