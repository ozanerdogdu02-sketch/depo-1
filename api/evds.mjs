// TCMB EVDS proxy'si — Vercel Function. Asıl mantık netlify/functions/evds.mjs içindedir (tek kaynak);
// bu dosya yalnızca onu Vercel'in Web-standart GET işleyicisine bağlar. Anahtar (EVDS_API_KEY) Vercel
// ortam değişkeninde durur, tarayıcıya inmez. Tanımsızsa fonksiyon düzgün hata döner, istemci elle girilen
// enflasyon varsayımına düşer (src/evds.ts). Gerçek deploy'da doğrulanmadıysa "test edildi" DEĞİLDİR.
import handler from '../netlify/functions/evds.mjs';

export function GET(request) {
  return handler(request);
}
