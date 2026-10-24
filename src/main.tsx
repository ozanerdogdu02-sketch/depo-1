import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './index.css';
import { purgeLegacyKeys } from './localData';

// Hangi build'in yayında olduğunu hızlıca doğrulamak için (bkz. vite.config.ts __BUILD_TIME__).
// eslint-disable-next-line no-console
console.log('FAGENT build:', __BUILD_TIME__);

// Kaldırılmış özelliklerin eski yerel anahtarlarını ilk açılışta temizle.
purgeLegacyKeys();

// ErrorBoundary en dışta: App içindeki HERHANGİ bir bileşenin render hatası beyaz ekran
// yerine veri kurtarma ekranını göstersin.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
