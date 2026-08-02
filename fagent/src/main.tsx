import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './index.css';

// ErrorBoundary en dışta: App içindeki HERHANGİ bir bileşenin render hatası beyaz ekran
// yerine veri kurtarma ekranını göstersin.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
