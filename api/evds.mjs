// TCMB EVDS proxy'si — Vercel Function. Asıl mantık netlify/functions/evds.mjs içindedir (tek kaynak; hız sınırı, zaman aşımı, devre kesici, kur tablosu orada);
// bu dosya yalnızca onu Vercel'in Web-standart GET işleyicisine bağlar. Anahtar (EVDS_API_KEY) Vercel
// ortam değişkeninde durur, tarayıcıya inmez. Tanımsızsa fonksiyon düzgün hata döner, istemci elle girilen
// enflasyon varsayımına düşer (src/evds.ts). Gerçek deploy'da doğrulanmadıysa "test edildi" DEĞİLDİR.
import { createEvdsHandler } from '../netlify/functions/evds.mjs';

// Vercel'de istemci kimliği yalnız x-real-ip / x-vercel-forwarded-for başlığından alınır (hız sınırı).
const handler = createEvdsHandler({ platform: 'vercel' });

export function GET(request) {
  return handler(request);
}
