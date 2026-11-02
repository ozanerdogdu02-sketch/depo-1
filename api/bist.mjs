// BİST gün sonu kapanış ucu — Vercel Function. Asıl mantık netlify/functions/bist.mjs içindedir (tek kaynak; kazıma bayrağı,
// keşif modu, hız sınırı, devre kesici, ayrıştırıcı arayüzü orada); bu dosya yalnızca onu Vercel'in GET işleyicisine bağlar.
// Sunucu ortam değişkeni FAGENT_KAZIMA=on yoksa 503 `kapali` döner ve Borsa İstanbul'a hiç gidilmez (canlıda varsayılan).
// TODO(hukuk): BİST verisi lisansı / bülten kullanım koşulları / otomatik okuma izni doğrulanmadı (ayrıntı: netlify/functions/bist.mjs).
// Gerçek deploy'da doğrulanmadıysa "test edildi" DEĞİLDİR.
import { createBistHandler } from '../netlify/functions/bist.mjs';

// Vercel'de istemci kimliği yalnız x-real-ip / x-vercel-forwarded-for başlığından alınır (hız sınırı).
const handler = createBistHandler({ platform: 'vercel' });

export function GET(request) {
  return handler(request);
}
