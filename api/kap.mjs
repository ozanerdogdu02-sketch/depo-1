// KAP bildirim meta ucu — Vercel Function. Asıl mantık netlify/functions/kap.mjs içindedir (tek kaynak; kazıma bayrağı,
// hız sınırı, devre kesici, ayrıştırıcı orada); bu dosya yalnızca onu Vercel'in Web-standart GET işleyicisine bağlar.
// Sunucu ortam değişkeni FAGENT_KAZIMA=on yoksa 503 `kapali` döner ve KAP'a hiç gidilmez (canlıda varsayılan).
// Gerçek deploy'da doğrulanmadıysa "test edildi" DEĞİLDİR.
import { createKapHandler } from '../netlify/functions/kap.mjs';

// Vercel'de istemci kimliği yalnız x-real-ip / x-vercel-forwarded-for başlığından alınır (hız sınırı).
const handler = createKapHandler({ platform: 'vercel' });

export function GET(request) {
  return handler(request);
}
