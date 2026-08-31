// Kural tabanlı niyet çözümleme — Ollama YOKKEN ya da bozuk yanıt verdiğinde devreye girer.
//
// Bu katman olmasaydı model çöktüğünde Jarvis tamamen sağır olurdu. Burada niyet
// anlaşılamazsa 'bilinmiyor' döner ve (varsa) dil katmanı ikinci bir şans dener.
//
// TÜRKÇE NOTU: Ekler kök ünsüzünü yumuşatır — "portföy" + "üm" sorun değil ama
// "analiz et" / "analizim", "grafik" / "grafiğim" (k→ğ) gibi durumlar için regex'lerde
// tam kelime yerine KÖK kullanılır.
import type { HoldingRow } from '../db.ts';
import { ASSET_KINDS } from '../db.ts';
import type { Intent } from './intents.ts';
import { normalizeName } from '../core/format.ts';
import {
  detectAssetKind, detectQuotedSymbol, parseQuantity, parseTurkishAmount, resolveSymbolAlias,
  stemRe, wordRe,
} from './parse.ts';

// Fiil kalıpları: kök tabanlı — "aldım", "alacağım", "almıştım" hepsi yakalanmalı.
const ALIS_FIIL = stemRe('aldım|aldim|alayım|alayim|alacağım|alacagim|almıştım|almistim|ekledim');
const SATIS_FIIL = stemRe('sattım|sattim|satayım|satayim|satacağım|satacagim|satmıştım|satmistim');
// Tek başına "sat"/"al" — ek almadan. wordRe kullanılır ki "satın" ya da "alarm"
// yanlışlıkla satış/alış komutu sanılmasın.
const SATIS_KISA = wordRe('sat');
const ALIS_KISA = wordRe('al');

/** "THYAO'dan", "Bitcoin'i" gibi ekleri kırpar. */
function stripSuffix(word: string): string {
  return word.replace(/['’].*$/, '');
}

/**
 * Metinde geçen varlık adlarını bulur.
 * BİRDEN FAZLA eşleşme varsa çağıran taraf komutu belirsiz sayar — yanlış varlığa
 * işlem yazmaktansa kullanıcıya sormak çok daha ucuz.
 */
export function matchHoldings(text: string, holdings: HoldingRow[]): HoldingRow[] {
  const haystack = normalizeName(text);
  return holdings.filter(h => {
    const name = normalizeName(h.name);
    if (name.length < 2) return false;
    if (haystack.includes(name)) return true;
    // Sembolüyle de anılabilir ("BTC 5000 aldım" → Bitcoin)
    const symbol = h.symbol ? normalizeName(h.symbol) : '';
    return symbol.length >= 2 && new RegExp(`(^|[^a-z0-9ğüşöçı])${symbol}([^a-z0-9ğüşöçı]|$)`).test(haystack);
  });
}

/** "ekle Bitcoin kripto BTC 0.05" ya da "ekle Gram Altın altin 25000" */
function parseAddCommand(text: string): Intent | undefined {
  const m = text.match(/^\s*(?:\/)?(?:ekle|yeni varlık|yeni varlik)\s+(.+)$/i);
  if (!m?.[1]) return undefined;

  const tokens = m[1].trim().split(/\s+/);
  // Sınıf adını bul — adı çok kelimeli olabilir ("Gram Altın"), sınıf ondan sonra gelir.
  const kindIndex = tokens.findIndex(t => (ASSET_KINDS as readonly string[]).includes(t.toLocaleLowerCase('tr-TR')));
  if (kindIndex < 1) return undefined;

  const name = tokens.slice(0, kindIndex).join(' ').trim();
  const kind = tokens[kindIndex]!.toLocaleLowerCase('tr-TR') as Intent extends { kind: infer K } ? K : never;
  const rest = tokens.slice(kindIndex + 1);
  if (!name || rest.length === 0) return undefined;

  // İki kalan parça varsa: sembol + miktar (canlı fiyata bağlı)
  if (rest.length >= 2 && /^[A-Za-z]{2,10}$/.test(rest[0] ?? '')) {
    const quantity = parseQuantity(rest[1] ?? '');
    if (quantity !== undefined && quantity > 0) {
      return {
        id: 'varlik_ekle',
        name,
        kind: kind as never,
        symbol: rest[0]!.toUpperCase(),
        quantity,
      };
    }
  }

  const amount = parseTurkishAmount(rest.join(' '));
  if (amount === undefined || amount <= 0) return undefined;
  return { id: 'varlik_ekle', name, kind: kind as never, amount };
}

/** "BTC 4 milyon üstüne çıkarsa haber ver" / "dolar 45 altına düşerse" */
function parseAlertCommand(text: string, holdings: HoldingRow[]): Intent | undefined {
  const wantsAlert = stemRe('haber ver|alarm|uyar|bildir|geçerse|gecerse|çıkarsa|cikarsa|düşerse|duserse|olursa|inerse').test(text);
  if (!wantsAlert) return undefined;
  if (stemRe('alarmlar').test(text)) return undefined; // listeleme komutu

  const yukari = stemRe('üst|ust|geçerse|gecerse|çıkarsa|cikarsa|aşarsa|asarsa|yukarı|yukari|olursa').test(text);
  const asagi = stemRe('alt|düşerse|duserse|inerse|gerilerse|aşağı|asagi').test(text);
  // İkisi birden ya da hiçbiri → belirsiz, tahmin etme.
  if (yukari === asagi) return undefined;

  const threshold = parseTurkishAmount(text);
  if (threshold === undefined || threshold <= 0) return undefined;

  const direction = yukari ? 'ustunde' : 'altinda';

  // Portföy toplamı alarmı
  if (stemRe('portf[oö]y').test(text)) {
    return { id: 'alarm_kur', target: 'PORTFOY', kind: 'portfoy', direction, threshold };
  }

  // Sembol: önce takma adlar, sonra portföydeki varlıklar
  const symbol = detectQuotedSymbol(text);
  if (symbol) {
    return { id: 'alarm_kur', target: symbol.symbol, kind: symbol.kind, direction, threshold };
  }
  const matched = matchHoldings(text, holdings);
  if (matched.length === 1 && matched[0]!.symbol) {
    return {
      id: 'alarm_kur',
      target: matched[0]!.symbol as string,
      kind: matched[0]!.kind,
      direction,
      threshold,
    };
  }
  return undefined;
}

/** "Bitcoin 5000 TL aldım" / "THYAO'dan 2000 sattım" */
function parseTradeCommand(text: string, holdings: HoldingRow[]): Intent | undefined {
  const satis = SATIS_FIIL.test(text) || SATIS_KISA.test(text);
  const alis = ALIS_FIIL.test(text) || (!satis && ALIS_KISA.test(text));
  // İkisi birden geçiyorsa ("aldığımı sattım") belirsiz — dokunma.
  if (satis === alis) return undefined;

  const amount = parseTurkishAmount(text);
  if (amount === undefined || amount <= 0) return undefined;

  const matched = matchHoldings(text, holdings);
  // TAM OLARAK bir varlık eşleşmeli. 0 → hangisi bilinmiyor, 2+ → yanlışına yazma riski.
  if (matched.length !== 1) return undefined;

  return { id: 'islem', name: matched[0]!.name, txnKind: satis ? 'satis' : 'alis', amount };
}

/** "guncelle Mevduat 45000" / "Mevduat değeri 45000 oldu" */
function parseUpdateCommand(text: string, holdings: HoldingRow[]): Intent | undefined {
  const explicit = text.match(/^\s*(?:\/)?(?:guncelle|güncelle)\s+(.+)$/i);
  const wantsUpdate = explicit || stemRe('değeri|degeri|oldu|yaptım|yaptim').test(text);
  if (!wantsUpdate) return undefined;
  // "fiyatları güncelle" bambaşka bir komut
  if (stemRe('fiyat').test(text)) return undefined;

  const amount = parseTurkishAmount(explicit?.[1] ?? text);
  if (amount === undefined || amount < 0) return undefined;

  const matched = matchHoldings(explicit?.[1] ?? text, holdings);
  if (matched.length !== 1) return undefined;

  return { id: 'deger_guncelle', name: matched[0]!.name, amount };
}

/**
 * Serbest Türkçe metinden niyet çıkarır.
 * SIRA ÖNEMLİ: en spesifik kalıplar önce denenir, genel kalıplar sonra.
 */
export function parseIntent(rawText: string, holdings: HoldingRow[]): Intent {
  const text = rawText.trim();
  if (!text) return { id: 'bilinmiyor', text: '' };

  // Eğik çizgili komutlar ve tek kelimelik kısayollar
  const slash = text.match(/^\/(\w+)/);
  const command = slash?.[1]?.toLowerCase();
  if (command === 'start' || command === 'yardim' || command === 'help') return { id: 'yardim' };
  if (command === 'portfoy') return { id: 'portfoy' };
  if (command === 'brifing') return { id: 'brifing' };
  if (command === 'analiz') return { id: 'analiz' };
  if (command === 'dagilim') return { id: 'dagilim' };
  if (command === 'gecmis') return { id: 'gecmis' };
  if (command === 'alarmlar') return { id: 'alarm_listele' };
  if (command === 'guncelle') return { id: 'fiyat_guncelle' };

  // 1) Varlık ekleme (en katı biçim, önce denenmeli)
  const add = parseAddCommand(text);
  if (add) return add;

  // 2) Alarm kurma
  const alert = parseAlertCommand(text, holdings);
  if (alert) return alert;

  // 3) Alarm yönetimi
  if (stemRe('alarm').test(text) && stemRe('sil|kaldır|kaldir|iptal').test(text)) {
    const id = text.match(/\b([0-9a-f]{4,8})\b/i)?.[1];
    if (id) return { id: 'alarm_sil', shortId: id };
  }
  if (stemRe('alarm').test(text) && stemRe('listele|neler|hangi|var mı|var mi|göster|goster').test(text)) {
    return { id: 'alarm_listele' };
  }
  if (/^\s*alarmlar(ım|im)?\s*\??$/i.test(text)) return { id: 'alarm_listele' };

  // 4) Varlık silme
  const del = text.match(/^\s*(?:\/)?(?:sil|kaldır|kaldir)\s+(.+)$/i);
  if (del?.[1]) {
    const matched = matchHoldings(del[1], holdings);
    if (matched.length === 1) return { id: 'varlik_sil', name: matched[0]!.name };
    return { id: 'varlik_sil', name: del[1].trim() };
  }

  // 5) Değer güncelleme
  const update = parseUpdateCommand(text, holdings);
  if (update) return update;

  // 6) Alım/satım
  const trade = parseTradeCommand(text, holdings);
  if (trade) return trade;

  // 7) Fiyat tazeleme
  if (stemRe('fiyat').test(text) && stemRe('güncelle|guncelle|tazele|yenile|çek|cek').test(text)) {
    return { id: 'fiyat_guncelle' };
  }

  // 8) Genel niyetler
  if (stemRe('yardım|yardim|ne yapabilir|komut|nasıl kullan|nasil kullan').test(text)) return { id: 'yardim' };
  if (/^\s*(merhaba|selam|günaydın|gunaydin|iyi akşamlar|iyi aksamlar|hey|alo|naber|nasılsın|nasilsin)/i.test(text)) {
    return { id: 'selam' };
  }
  if (stemRe('teşekkür|tesekkur|sağ ol|sag ol|eyvallah|süpersin|supersin|harikasın|harikasin').test(text)) {
    return { id: 'tesekkur' };
  }
  if (stemRe('brifing|rapor|günlük özet|gunluk ozet').test(text)) return { id: 'brifing' };
  if (stemRe('portf[oö]y|durum ne|ne durumda|toplamım|toplamim|varlıklar|varliklar').test(text)) {
    return { id: 'portfoy' };
  }
  // Alternatiflerin HEPSİ tek bir gruba alınır. Öncesinde "\bA|B|C\b" yazılmıştı ve
  // regex önceliği yüzünden sınır yalnızca ilk/son alternatife uygulanıyordu.
  if (stemRe('dağıl|dagil|alokasyon|yüzde kaç|yuzde kac').test(text)) return { id: 'dagilim' };
  if (stemRe('analiz|yorumla|değerlendir|degerlendir|risk').test(text)) return { id: 'analiz' };
  if (stemRe('en (çok|cok) (kazand|kaybed|iyi|kötü|kotu)|en iyi|en kötü|en kotu').test(text)) {
    return { id: 'en_iyi_kotu' };
  }
  if (stemRe('geçmiş|gecmis|işlemler|islemler|hareketler|defter').test(text)) return { id: 'gecmis' };

  // 9) Fiyat sorgusu ("dolar kaç", "BTC ne durumda", "THYAO")
  const asksPrice = stemRe('kaç|kac|ne kadar|fiyat|kur|ne durumda|nasıl gidiyor|nasil gidiyor').test(text);
  const symbol = detectQuotedSymbol(text);
  if (symbol && (asksPrice || text.trim().split(/\s+/).length <= 2)) {
    return { id: 'fiyat_sorgu', symbol: symbol.symbol, kind: symbol.kind };
  }

  // 10) Portföydeki bir varlık hakkında serbest soru
  const matched = matchHoldings(text, holdings);
  if (matched.length === 1) return { id: 'varlik_sorgu', name: matched[0]!.name };

  // 11) Tek kelimelik takma ad ("altın", "dolar")
  const single = text.trim().split(/\s+/);
  if (single.length === 1 && single[0]) {
    const alias = resolveSymbolAlias(stripSuffix(single[0]));
    if (alias) return { id: 'fiyat_sorgu', symbol: alias.symbol, kind: alias.kind };
  }

  // Sınıf adı geçiyorsa dağılıma yönlendirmek makul bir tahmin.
  if (detectAssetKind(text) && stemRe('ne kadar|kaç|kac|durum').test(text)) return { id: 'dagilim' };

  return { id: 'bilinmiyor', text };
}
