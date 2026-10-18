/// <reference types="vite/client" />

// vite.config.ts → define ile build zamanında gömülen sabit (bkz. main.tsx).
declare const __BUILD_TIME__: string;

// Opsiyonel hesap/bulut senkronu (cloud.ts). İkisi de tanımsızsa bulut kapalıdır ve uygulama
// yalnızca tarayıcıda çalışır. YALNIZCA URL ve publishable key — gizli/servis anahtarı ASLA
// VITE_ önekli bir değişkene konmaz (tarayıcıya iner).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
