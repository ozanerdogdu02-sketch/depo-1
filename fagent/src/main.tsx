import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';
import Landing from './Landing';
import App from './App';
import { usePortfolio } from './store';
import { useRoute, navigate, LANDING_PATH, DEFAULT_APP_PATH } from './router';
import './index.css';

// NOT — App bilerek `React.lazy` ile BÖLÜNMEDİ. Denendi ve geri alındı: tanıtım sayfası
// için ~200 kB (gzip) tasarruf ediliyordu ama karşılığında panele HER girişte fazladan bir
// ağ turu doğuyordu; e2e testleri bunu yakaladı (yenileme sonrası ekran geç geliyordu).
// Nadir yolu (ilk ziyaret) hızlandırmak için sık yolu (her açılış) yavaşlatmak yanlış takas.
// Kod bölme ayrı ve doğru şekilde yapılmalı — Recharts'ı manualChunks ile ayırarak.

function Root() {
  const s = usePortfolio();
  const route = useRoute();
  const onLanding = route === LANDING_PATH;

  // Verisi OLAN ziyaretçi kök adrese geldiğinde tanıtım sayfasını görmesin — yer imi
  // ekleyenler ve geri dönen kullanıcılar doğrudan panele gitsin. `replace: true`:
  // geçmişe kayıt eklemiyoruz, yoksa geri tuşu kullanıcıyı yönlendirmeye geri atardı.
  useEffect(() => {
    if (onLanding && s.onboarded) navigate(DEFAULT_APP_PATH, true);
  }, [onLanding, s.onboarded]);

  if (onLanding && !s.onboarded) return <Landing />;

  // Yönlendirme bir sonraki render'da gerçekleşir; o ana kadar boş dönüyoruz ki
  // tanıtım sayfası bir kare boyunca yanıp sönmesin.
  if (onLanding) return null;

  return <App />;
}

// ErrorBoundary en dışta: HERHANGİ bir bileşenin render hatası beyaz ekran yerine
// veri kurtarma ekranını göstersin.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);
