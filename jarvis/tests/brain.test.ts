// Türkçe metin anlama — Ollama olmadan da çalışması gereken kural katmanı.
import { beforeEach, describe, expect, it } from 'vitest';
import { openMemoryDb, type Db, type HoldingRow } from '../src/db.ts';
import { addHolding, listHoldings } from '../src/core/portfolio.ts';
import { parseIntent, matchHoldings } from '../src/brain/rules.ts';
import { parseTurkishAmount, parseQuantity, detectAssetKind, detectQuotedSymbol, stemRe, wordRe } from '../src/brain/parse.ts';
import { splitMessage, stripHtml } from '../src/telegram/bot.ts';

const TZ = 'Europe/Istanbul';
let db: Db;
let holdings: HoldingRow[];

beforeEach(() => {
  db = openMemoryDb();
  addHolding(db, { name: 'Bitcoin', kind: 'kripto', amount: 120_000, symbol: 'BTC', quantity: 0.05 }, TZ);
  addHolding(db, { name: 'THYAO', kind: 'hisse', amount: 60_000, symbol: 'THYAO', quantity: 200 }, TZ);
  addHolding(db, { name: 'Mevduat', kind: 'mevduat', amount: 40_000 }, TZ);
  holdings = listHoldings(db);
});

describe('Türkçe tutar ayrıştırma', () => {
  it('düz sayıyı okur', () => {
    expect(parseTurkishAmount('500')).toBe(500);
    expect(parseTurkishAmount('500 TL')).toBe(500);
    expect(parseTurkishAmount('250₺')).toBe(250);
  });

  // Türkçede NOKTA binlik ayıracıdır — "1.500" bin beş yüz demektir, 1,5 değil.
  it('noktayı binlik ayıracı olarak okur', () => {
    expect(parseTurkishAmount('1.500')).toBe(1500);
    expect(parseTurkishAmount('1.234.567')).toBe(1_234_567);
  });

  it('virgülü ondalık ayıracı olarak okur', () => {
    expect(parseTurkishAmount('1,5')).toBe(1.5);
    expect(parseTurkishAmount('1.500,75')).toBe(1500.75);
  });

  // Kullanıcı klavye alışkanlığıyla İngilizce yazabilir: "1.5" → 1,5 olmalı, 15 değil.
  it('noktadan sonra 1-2 hane varsa ondalık kabul eder', () => {
    expect(parseTurkishAmount('1.5')).toBe(1.5);
    expect(parseTurkishAmount('0.05')).toBe(0.05);
  });

  it('çarpan sözcüklerini uygular', () => {
    expect(parseTurkishAmount('3 milyon')).toBe(3_000_000);
    expect(parseTurkishAmount('2,5 milyon')).toBe(2_500_000);
    expect(parseTurkishAmount('500 bin')).toBe(500_000);
    expect(parseTurkishAmount('1 milyar')).toBe(1_000_000_000);
  });

  it('çarpan sayının hemen ardında değilse uygulamaz', () => {
    // "5000 TL" sonra çok ilerideki "milyon" kelimesi bunu 5 milyar yapmamalı
    expect(parseTurkishAmount('5000 TL değerinde bir şey, toplam milyon civarı')).toBe(5000);
  });

  it('sayı yoksa undefined döner', () => {
    expect(parseTurkishAmount('merhaba nasılsın')).toBeUndefined();
  });

  it('miktar ayrıştırıcı çarpan uygulamaz', () => {
    expect(parseQuantity('0,05')).toBe(0.05);
    expect(parseQuantity('200')).toBe(200);
  });
});

describe('sınıf ve sembol tespiti', () => {
  it('sınıf adını doğrudan tanır', () => {
    expect(detectAssetKind('ekle Bitcoin kripto BTC 0.05')).toBe('kripto');
    expect(detectAssetKind('bu bir altin varlığı')).toBe('altin');
  });

  it('eş anlamlıları tanır', () => {
    expect(detectAssetKind('borsadaki hisselerim')).toBe('hisse');
    expect(detectAssetKind('TEFAS fonlarım')).toBe('fon');
    expect(detectAssetKind('vadeli mevduatım')).toBe('mevduat');
  });

  it('takma adları sembole çevirir', () => {
    expect(detectQuotedSymbol('dolar kaç')).toEqual({ symbol: 'USD', kind: 'doviz' });
    expect(detectQuotedSymbol('bitcoin ne durumda')).toEqual({ symbol: 'BTC', kind: 'kripto' });
    expect(detectQuotedSymbol('gram altın fiyatı')).toEqual({ symbol: 'GRAM', kind: 'altin' });
  });

  it('büyük harfli kodu BIST hissesi sayar', () => {
    expect(detectQuotedSymbol('ASELS nasıl')).toEqual({ symbol: 'ASELS', kind: 'hisse' });
  });
});

describe('varlık eşleştirme', () => {
  it('adı metin içinde bulur', () => {
    expect(matchHoldings('bitcoin ne durumda', holdings).map(h => h.name)).toEqual(['Bitcoin']);
  });

  it('ek almış adı bulur (THYAO\'dan)', () => {
    expect(matchHoldings("THYAO'dan 2000 TL sattım", holdings).map(h => h.name)).toEqual(['THYAO']);
  });

  it('sembolle de bulur', () => {
    expect(matchHoldings('BTC 5000 aldım', holdings).map(h => h.name)).toEqual(['Bitcoin']);
  });
});

describe('niyet çözümleme', () => {
  const parse = (t: string) => parseIntent(t, holdings);

  it('portföy sorgularını tanır', () => {
    expect(parse('portföyüm').id).toBe('portfoy');
    expect(parse('portföyüm ne durumda').id).toBe('portfoy');
    expect(parse('/portfoy').id).toBe('portfoy');
  });

  it('brifing, analiz, dağılım, geçmiş', () => {
    expect(parse('brifing ver').id).toBe('brifing');
    expect(parse('analiz et').id).toBe('analiz');
    expect(parse('dağılımım nasıl').id).toBe('dagilim');
    expect(parse('geçmiş işlemlerim').id).toBe('gecmis');
  });

  it('küçük sohbeti tanır', () => {
    expect(parse('merhaba').id).toBe('selam');
    expect(parse('günaydın Jarvis').id).toBe('selam');
    expect(parse('teşekkürler').id).toBe('tesekkur');
    expect(parse('yardım').id).toBe('yardim');
  });

  it('en iyi / en kötü kıyaslaması', () => {
    expect(parse('en çok kazandıran ne').id).toBe('en_iyi_kotu');
    expect(parse('en kötü hangisi').id).toBe('en_iyi_kotu');
  });

  it('varlık ekleme — elle tutar', () => {
    const intent = parse('ekle Gram Altın altin 25000');
    expect(intent).toMatchObject({ id: 'varlik_ekle', name: 'Gram Altın', kind: 'altin', amount: 25_000 });
  });

  it('varlık ekleme — canlı fiyata bağlı (sembol + miktar)', () => {
    const intent = parse('ekle Ethereum kripto ETH 1.5');
    expect(intent).toMatchObject({ id: 'varlik_ekle', name: 'Ethereum', kind: 'kripto', symbol: 'ETH', quantity: 1.5 });
  });

  it('alım/satım komutunu tanır', () => {
    expect(parse('Bitcoin 5000 TL aldım')).toMatchObject({ id: 'islem', name: 'Bitcoin', txnKind: 'alis', amount: 5000 });
    expect(parse("THYAO'dan 2000 TL sattım")).toMatchObject({ id: 'islem', name: 'THYAO', txnKind: 'satis', amount: 2000 });
  });

  // GÜVENLİK: belirsiz komut ASLA işleme dönüşmemeli — yanlış varlığa yazmaktansa anlamamak iyi.
  it('birden fazla varlık geçiyorsa işlem üretmez', () => {
    expect(parse('Bitcoin ve THYAO için 5000 TL aldım').id).not.toBe('islem');
  });

  it('hangi varlık olduğu belli değilse işlem üretmez', () => {
    expect(parse('5000 TL aldım').id).not.toBe('islem');
  });

  it('alış ve satış fiili birlikte geçerse işlem üretmez', () => {
    expect(parse('Bitcoin aldım sonra sattım 5000').id).not.toBe('islem');
  });

  it('alarm kurmayı tanır — yukarı yön', () => {
    expect(parse('BTC 4 milyon üstüne çıkarsa haber ver')).toMatchObject({
      id: 'alarm_kur', target: 'BTC', kind: 'kripto', direction: 'ustunde', threshold: 4_000_000,
    });
  });

  it('alarm kurmayı tanır — aşağı yön', () => {
    expect(parse('dolar 45 altına düşerse haber ver')).toMatchObject({
      id: 'alarm_kur', target: 'USD', kind: 'doviz', direction: 'altinda', threshold: 45,
    });
  });

  it('portföy toplamı alarmı', () => {
    expect(parse('portföyüm 500 bin üstüne çıkarsa bildir')).toMatchObject({
      id: 'alarm_kur', target: 'PORTFOY', kind: 'portfoy', direction: 'ustunde', threshold: 500_000,
    });
  });

  it('alarm listeleme ve silme', () => {
    expect(parse('alarmlarım').id).toBe('alarm_listele');
    expect(parse('alarm sil a1b2c3d4')).toMatchObject({ id: 'alarm_sil', shortId: 'a1b2c3d4' });
  });

  it('fiyat sorgusu', () => {
    expect(parse('dolar kaç')).toMatchObject({ id: 'fiyat_sorgu', symbol: 'USD' });
    expect(parse('gram altın ne kadar')).toMatchObject({ id: 'fiyat_sorgu', symbol: 'GRAM' });
  });

  it('fiyat tazeleme', () => {
    expect(parse('fiyatları güncelle').id).toBe('fiyat_guncelle');
  });

  it('portföydeki varlık hakkında serbest soru', () => {
    expect(parse('Mevduatım ne alemde')).toMatchObject({ id: 'varlik_sorgu', name: 'Mevduat' });
  });

  it('varlık silme', () => {
    expect(parse('sil Mevduat')).toMatchObject({ id: 'varlik_sil', name: 'Mevduat' });
  });

  it('anlaşılmayanı dürüstçe bilinmiyor der', () => {
    expect(parse('bugün hava nasıl olacak acaba').id).toBe('bilinmiyor');
  });
});

describe('Telegram mesaj bölme', () => {
  it('sınırın altındaki metni bölmez', () => {
    expect(splitMessage('kısa mesaj')).toEqual(['kısa mesaj']);
  });

  it('satır sınırlarını koruyarak böler', () => {
    const text = Array.from({ length: 50 }, (_, i) => `satır ${i}`).join('\n');
    const parts = splitMessage(text, 40);
    expect(parts.length).toBeGreaterThan(1);
    // Hiçbir parça sınırı aşmamalı
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(40);
    // Birleştirince orijinali vermeli
    expect(parts.join('\n')).toBe(text);
  });

  it('tek başına sınırı aşan satırı da böler (sonsuz döngüye girmez)', () => {
    const parts = splitMessage('x'.repeat(100), 30);
    expect(parts).toHaveLength(4);
    expect(parts.join('')).toBe('x'.repeat(100));
  });
});

describe('sesli okuma için metin temizleme', () => {
  it('HTML etiketlerini ve emojileri atar', () => {
    expect(stripHtml('<b>Portföy:</b> 100.000 ₺ ✅')).toBe('Portföy: 100.000 ₺');
  });

  it('kaçırılmış karakterleri geri açar', () => {
    expect(stripHtml('A &lt;B&gt; &amp; C')).toBe('A <B> & C');
  });

  it('satır sonlarını konuşulabilir noktalamaya çevirir', () => {
    expect(stripHtml('Bir\n\nİki\nÜç')).toBe('Bir. İki, Üç');
  });
});

describe('Türkçe kelime sınırı — regresyon', () => {
  // Bu testler gerçek bir hatayı belgeliyor: JavaScript'in \b sınırı ASCII'dir ve
  // ç, ğ, ı, ö, ş, ü harflerini kelime karakteri SAYMAZ. Sonuç: /\bçıkarsa\b/ ile
  // "çıkarsa" eşleşmez, /\bgeçmiş\b/ ile "geçmiş" eşleşmez. Kod doğru görünür,
  // hata vermez, sadece sessizce çalışmaz. Aşağıdaki ilk test bunu kanıtlıyor.

  it('yerleşik \\b Türkçe harfle başlayan/biten kelimede BAŞARISIZ olur', () => {
    expect(/\bçıkarsa\b/i.test('4 milyon üstüne çıkarsa')).toBe(false);
    expect(/\bgeçmiş\b/i.test('geçmiş işlemlerim')).toBe(false);
    expect(/\büstüne\b/i.test('bin üstüne çıkarsa')).toBe(false);
  });

  it('stemRe aynı kelimeleri DOĞRU yakalar', () => {
    expect(stemRe('çıkarsa').test('4 milyon üstüne çıkarsa')).toBe(true);
    expect(stemRe('geçmiş').test('geçmiş işlemlerim')).toBe(true);
    expect(stemRe('üst').test('bin üstüne çıkarsa')).toBe(true);
  });

  it('stemRe ek almış kelimeyi de yakalar (Türkçe sondan eklemeli)', () => {
    expect(stemRe('teşekkür').test('teşekkürler')).toBe(true);
    expect(stemRe('hisse').test('hisselerim')).toBe(true);
    expect(stemRe('borsa').test('borsadaki')).toBe(true);
  });

  it('stemRe kelime ORTASINDA eşleşmez (yanlış pozitif üretmez)', () => {
    expect(stemRe('al').test('portakal')).toBe(false);
    expect(stemRe('sat').test('masatı')).toBe(false);
  });

  it('wordRe ek almış kelimeyi yakalamaz — tam eşleşme gerektiğinde kullanılır', () => {
    expect(wordRe('sat').test('5000 sat')).toBe(true);
    expect(wordRe('sat').test('satın aldım')).toBe(false);
    expect(wordRe('al').test('alarm kur')).toBe(false);
  });

  it('bu düzeltmeler gerçek komutlarda çalışıyor', () => {
    expect(parseIntent('geçmiş işlemlerim', holdings).id).toBe('gecmis');
    expect(parseIntent('teşekkürler', holdings).id).toBe('tesekkur');
    expect(parseIntent('borsadaki hisselerim ne durumda', holdings).id).not.toBe('bilinmiyor');
    expect(parseIntent('BTC 4 milyon üstüne çıkarsa haber ver', holdings).id).toBe('alarm_kur');
    expect(parseIntent('yüzde kaç dağılmış', holdings).id).toBe('dagilim');
  });
});
