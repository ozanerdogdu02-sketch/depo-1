// NLG — deterministik taslağı daha doğal Türkçeye çeviren katman.
//
// EN ÖNEMLİ KISIM SAVUNMA: küçük yerel modeller metni "güzelleştirirken" rakamları
// da değiştirir ("100.000" → "yaklaşık 100 bin" değil, bazen "110.000"). Bu yüzden
// yeniden yazılan metin, TASLAKTA OLMAYAN bir sayı içeriyorsa reddedilir ve özgün
// taslak gönderilir. Böylece dil katmanı en kötü ihtimalle işe yaramaz olur —
// ASLA yanlış rakam söyleyemez.
import { ollamaChat, type OllamaOptions } from './ollama.ts';

const SYSTEM = `Sen Türkçe konuşan bir finansal asistansın (adın Jarvis).
Sana bir taslak cevap verilecek. Görevin onu daha doğal ve samimi bir Türkçeyle yeniden yazmak.

KESİN KURALLAR:
- Hiçbir SAYIYI değiştirme, yuvarlama, ekleme veya çıkarma.
- Taslakta olmayan hiçbir bilgi, tavsiye ya da tahmin ekleme.
- Yatırım tavsiyesi verme.
- En fazla 3 cümle. Kısa tut.
- Sadece yeniden yazılmış metni döndür; başlık, tırnak veya açıklama ekleme.`;

/**
 * Metindeki tüm sayıları normalize edilmiş biçimde çıkarır.
 * "1.234,56" ve "1234,56" aynı sayı sayılır — biçim farkı yeniden yazımda serbesttir,
 * DEĞER farkı değildir.
 */
export function extractNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(/\d[\d.,]*/g)) {
    const raw = match[0].replace(/[.,]+$/, '');
    if (!raw) continue;
    // Türkçe biçim: nokta binlik, virgül ondalık.
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/\./g, '');
    const value = Number(normalized);
    if (Number.isFinite(value)) out.add(String(value));
  }
  return out;
}

/**
 * Yeniden yazım güvenli mi? Taslakta bulunmayan HİÇBİR sayı içermemeli.
 * Sayı ÇIKARMAK serbesttir (modelin bazı detayları atlaması sorun değil);
 * sayı UYDURMAK yasaktır.
 */
export function isSafeRewrite(draft: string, rewrite: string): boolean {
  const allowed = extractNumbers(draft);
  for (const n of extractNumbers(rewrite)) {
    if (!allowed.has(n)) return false;
  }
  return true;
}

/** Taslağı doğallaştırır. Güvenli değilse ya da model düşerse undefined döner. */
export async function rewrite(
  draft: string,
  userText: string,
  opts: OllamaOptions,
): Promise<string | undefined> {
  // HTML etiketi içeren taslakları modele hiç vermiyoruz: model etiketleri bozarsa
  // Telegram mesajı tamamen gönderilemez hale gelir.
  if (/<[a-z/]/i.test(draft)) return undefined;

  const content = await ollamaChat(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Kullanıcı şunu yazdı: "${userText}"\n\nTaslak cevap:\n${draft}` },
    ],
    { ...opts, temperature: 0.4, numPredict: 200 },
  );

  const cleaned = content.replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
  if (!cleaned) return undefined;
  // Model saçmalayıp çok uzun yazarsa taslağa sadık kal.
  if (cleaned.length > draft.length * 3 + 200) return undefined;
  if (/<[a-z/]/i.test(cleaned)) return undefined;
  if (!isSafeRewrite(draft, cleaned)) {
    console.warn('[nlg] yeniden yazım taslakta olmayan sayı içerdi, reddedildi.');
    return undefined;
  }
  return cleaned;
}
