// Türkçe serbest metinden sayı, varlık sınıfı ve sembol çıkarma.
// SAF fonksiyonlar — dil katmanı (Ollama) çalışmasa da bunlar çalışır ve Jarvis'in
// komutları anlamaya devam etmesini sağlar.
import type { AssetKind } from '../db.ts';
import { ASSET_KINDS } from '../db.ts';

// ── Türkçe duyarlı kelime sınırı ─────────────────────────────────────────────
// JavaScript'in \b sınırı ASCII'dir: ç, ğ, ı, ö, ş, ü harflerini "kelime karakteri"
// SAYMAZ. Sonuç olarak /\bçıkarsa\b/ boşluktan sonra gelen "çıkarsa" ile EŞLEŞMEZ
// (iki taraf da ASCII-dışı olduğu için orada sınır yoktur) ve /\bgeçmiş\b/ de
// "geçmiş" sözcüğünü bulamaz. Bu, Türkçe metinde sessizce yanlış davranan bir tuzak:
// kod doğru görünür, regex çalışmaz, hiçbir hata da vermez.
//
// Çözüm: sınırı Türkçe harfleri de içeren bir karakter kümesiyle KENDİMİZ kuruyoruz.
const TR_WORD_CHARS = 'A-Za-z0-9ÇĞİIÖŞÜçğışöü';

/**
 * Kök eşleşmesi: kelimenin BAŞI sınırlıdır ama SONU serbesttir.
 * Türkçe sondan eklemeli bir dil — "geçmiş" → "geçmişim", "hisse" → "hisselerim",
 * "teşekkür" → "teşekkürler". Sonu sabitlemek bu eklerin hepsini kaçırır.
 */
export function stemRe(pattern: string, flags = 'i'): RegExp {
  return new RegExp(`(?<![${TR_WORD_CHARS}])(?:${pattern})`, flags);
}

/** Tam kelime eşleşmesi: iki taraf da sınırlı. Ek almaması gereken kalıplar için. */
export function wordRe(pattern: string, flags = 'i'): RegExp {
  return new RegExp(`(?<![${TR_WORD_CHARS}])(?:${pattern})(?![${TR_WORD_CHARS}])`, flags);
}

const MULTIPLIERS: Array<{ test: RegExp; factor: number }> = [
  { test: /\bmilyar\b/i, factor: 1_000_000_000 },
  { test: /\bmilyon\b|\bmn\b/i, factor: 1_000_000 },
  { test: /\bbin\b|\bk\b/i, factor: 1_000 },
];

/**
 * Türkçe yazılmış bir tutarı sayıya çevirir.
 *
 * Zorluk: Türkçede binlik ayıracı NOKTA, ondalık ayıracı VİRGÜLdür — İngilizcenin tam
 * tersi. "1.500" burada 1500 demektir, 1,5 değil. Ama kullanıcı klavye alışkanlığıyla
 * "1.5" de yazabilir. Ayrım: noktadan sonra TAM 3 hane varsa binlik, 1-2 hane varsa
 * ondalık kabul edilir.
 *
 * Desteklenenler: "500", "1.500", "1.500,75", "1,5", "2 bin", "3,5 milyon", "500 TL", "250₺"
 */
export function parseTurkishAmount(text: string): number | undefined {
  const cleaned = text.replace(/[₺]/g, ' ').replace(/\bTL\b/gi, ' ');
  const match = cleaned.match(/-?\d[\d.,]*/);
  if (!match) return undefined;

  let raw = match[0];
  let value: number;

  if (raw.includes(',')) {
    // Virgül varsa: virgül ondalık, noktalar binlik.
    value = Number(raw.replace(/\./g, '').replace(',', '.'));
  } else if (raw.includes('.')) {
    const parts = raw.split('.');
    const last = parts[parts.length - 1] ?? '';
    // Tek nokta + son parça 1-2 haneli → İngilizce ondalık ("1.5")
    if (parts.length === 2 && last.length > 0 && last.length < 3) {
      value = Number(raw);
    } else {
      // Aksi halde binlik ayıracı ("1.500", "1.234.567")
      value = Number(raw.replace(/\./g, ''));
    }
  } else {
    value = Number(raw);
  }

  if (!Number.isFinite(value)) return undefined;

  // Çarpan sözcüğü sayının HEMEN ardından gelmeli ("3 milyon" evet, "3 TL milyonluk" hayır).
  const after = cleaned.slice((match.index ?? 0) + raw.length, (match.index ?? 0) + raw.length + 12);
  for (const m of MULTIPLIERS) {
    if (m.test.test(after)) {
      value *= m.factor;
      break;
    }
  }
  return value;
}

/** Miktar (adet) ayrıştırma — para değil, "0,05 BTC" gibi. Çarpan sözcüğü uygulanmaz. */
export function parseQuantity(text: string): number | undefined {
  const match = text.match(/-?\d[\d.,]*/);
  if (!match) return undefined;
  const raw = match[0];
  let value: number;
  if (raw.includes(',')) value = Number(raw.replace(/\./g, '').replace(',', '.'));
  else if (raw.includes('.')) value = Number(raw);
  else value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

const KIND_WORDS: Array<{ kind: AssetKind; test: RegExp }> = [
  { kind: 'hisse', test: stemRe('hisse|borsa|bist|pay senedi') },
  { kind: 'fon', test: stemRe('fon|tefas|yatırım fonu') },
  { kind: 'doviz', test: stemRe('döviz|doviz|dolar|euro|avro|sterlin|yen|para birimi') },
  { kind: 'altin', test: stemRe('altın|altin|ons|külçe|kulce') },
  { kind: 'kripto', test: stemRe('kripto|coin|bitcoin|ethereum') },
  { kind: 'mevduat', test: stemRe('mevduat|vadeli|nakit') },
];

/** Metinde geçen varlık sınıfını bulur. */
export function detectAssetKind(text: string): AssetKind | undefined {
  // Önce birebir sınıf adı yazılmış mı ("kripto", "altin"...)
  const words = text.toLocaleLowerCase('tr-TR').split(/\s+/);
  for (const kind of ASSET_KINDS) {
    if (words.includes(kind)) return kind;
  }
  for (const entry of KIND_WORDS) {
    if (entry.test.test(text)) return entry.kind;
  }
  return undefined;
}

/** Yaygın döviz/kripto/altın adlarını sembole çevirir. */
const SYMBOL_ALIASES: Record<string, { symbol: string; kind: AssetKind }> = {
  dolar: { symbol: 'USD', kind: 'doviz' },
  usd: { symbol: 'USD', kind: 'doviz' },
  euro: { symbol: 'EUR', kind: 'doviz' },
  avro: { symbol: 'EUR', kind: 'doviz' },
  eur: { symbol: 'EUR', kind: 'doviz' },
  sterlin: { symbol: 'GBP', kind: 'doviz' },
  gbp: { symbol: 'GBP', kind: 'doviz' },
  frank: { symbol: 'CHF', kind: 'doviz' },
  yen: { symbol: 'JPY', kind: 'doviz' },
  altın: { symbol: 'GRAM', kind: 'altin' },
  altin: { symbol: 'GRAM', kind: 'altin' },
  gram: { symbol: 'GRAM', kind: 'altin' },
  ons: { symbol: 'ONS', kind: 'altin' },
  bitcoin: { symbol: 'BTC', kind: 'kripto' },
  btc: { symbol: 'BTC', kind: 'kripto' },
  ethereum: { symbol: 'ETH', kind: 'kripto' },
  eth: { symbol: 'ETH', kind: 'kripto' },
  ether: { symbol: 'ETH', kind: 'kripto' },
};

export function resolveSymbolAlias(word: string): { symbol: string; kind: AssetKind } | undefined {
  return SYMBOL_ALIASES[word.trim().toLocaleLowerCase('tr-TR')];
}

/**
 * Metinden fiyatı sorulan sembolü çıkarır ("dolar kaç", "BTC ne durumda", "THYAO").
 * Belirsizse undefined döner — yanlış sembole cevap vermektense sormak iyidir.
 */
export function detectQuotedSymbol(text: string): { symbol: string; kind: AssetKind } | undefined {
  const words = text.split(/[\s,.!?;:]+/).filter(Boolean);
  for (const word of words) {
    const alias = resolveSymbolAlias(word);
    if (alias) return alias;
  }
  // Büyük harfli 3-6 karakterlik kod → BIST hissesi varsayımı (THYAO, ASELS, XU100)
  for (const word of words) {
    if (/^[A-ZÇĞİÖŞÜ]{3,6}$/.test(word) && !/^(TL|USD|EUR|GBP|CHF|JPY|BTC|ETH)$/.test(word)) {
      return { symbol: word.toUpperCase(), kind: 'hisse' };
    }
  }
  return undefined;
}
