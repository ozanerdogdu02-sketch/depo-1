import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { bootStorage, requestMirror, pauseMirrorForForeignReset, resumeMirrorAfterForeignReset, preserveForeignValue, isResetMarked } from './mirror';

// Hangi build'in yayında olduğunu hızlıca doğrulamak için (bkz. vite.config.ts __BUILD_TIME__).
// eslint-disable-next-line no-console
console.log('FAGENT build:', __BUILD_TIME__);

async function start(): Promise<void> {
  // 1) Depolama açılışı (React ve store.ts'ten ÖNCE): IndexedDB aynası ile localStorage eşitlenir /
  //    localStorage boşsa aynadan geri yüklenir. store.ts modül yüklenirken localStorage'ı okur; bu yüzden
  //    store'a bağlı her modül AŞAĞIDA dinamik içe aktarılır. Kısa zaman aşımı: uygulama açılışı bloklanmaz.
  try { await bootStorage(); } catch { /* açılış hatası uygulamayı durdurmaz; durum getStorageSnapshot()'ta */ }

  const [{ default: App }, { ErrorBoundary }, { purgeLegacyKeys }, { subscribePortfolio, reloadPortfolioFromDisk, setDivergenceSink }, { subscribeUserData, subscribeUserDataWrites, setAfterApplyHook }, { installTabSync, bumpLayerEpoch }, { markTabOverwrite }] =
    await Promise.all([import('./App'), import('./ErrorBoundary'), import('./localData'), import('./store'), import('./backup'), import('./sekmeSenkron'), import('./yazmaDurumu')]);

  // Kaldırılmış özelliklerin eski yerel anahtarlarını ilk açılışta temizle.
  purgeLegacyKeys();

  // Ayna write-through: portföy ve diğer katmanlar değişince localStorage'ın o anki hali IndexedDB'ye yazılır.
  subscribePortfolio(requestMirror);
  subscribeUserData(requestMirror);
  subscribeUserDataWrites(requestMirror);

  // Geri yükleme / bulut çekme / kurtarma diske yazınca bellek diskten tazelenir (D-a): kendi yazımız yabancı sanılmaz.
  setAfterApplyHook(keys => {
    if (keys.includes('fagent.portfolio.v1')) reloadPortfolioFromDisk();
    if (keys.some(k => k !== 'fagent.portfolio.v1')) bumpLayerEpoch();
  });

  // Başka sekmede yapılan değişiklik bu sekmenin belleğine taşınır (A8): eski bellek diski ezmesin.
  // Olay gecikmesi: eski bellek diskteki farklı sürümün üstüne yazacaksa o sürüm önce kurtarma alanına alınır ve bildirilir.
  setDivergenceSink((key, diskRaw) => preserveForeignValue(key, diskRaw).then(ok => { markTabOverwrite(key, ok); return ok; }));

  installTabSync({
    reloadPortfolio: reloadPortfolioFromDisk,
    preserveForeign: preserveForeignValue,
    resetMarked: isResetMarked,
    diskValue: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
    foreignResetStart: pauseMirrorForForeignReset,
    foreignResetEnd: resumeMirrorAfterForeignReset,
  });

  // ErrorBoundary en dışta: App içindeki HERHANGİ bir bileşenin render hatası beyaz ekran
  // yerine veri kurtarma ekranını göstersin.
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

// Dinamik içe aktarma ya da açılış hatası: beyaz ekran yerine düz bir mesaj. React'e bağlı DEĞİL (React yüklenemeyebilir);
// metin textContent ile yazılır, veriye dokunulmaz.
function showLoadError(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.textContent = '';
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.id = 'yukleme-hatasi';
  box.style.cssText = 'max-width:480px;margin:15vh auto;padding:24px;font-family:system-ui,sans-serif;color:#e8e8ee;background:#16161d;border-radius:12px;';
  const p = document.createElement('p');
  p.textContent = 'Sayfa yüklenemedi. Kayıtlı verilerin bu tarayıcıda durması beklenir; yedek dosyan varsa sakla.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Yeniden yükle';
  btn.style.cssText = 'padding:8px 16px;border-radius:8px;border:0;cursor:pointer;';
  btn.addEventListener('click', () => window.location.reload());
  box.append(p, btn);
  root.append(box);
}

start().catch(showLoadError);
