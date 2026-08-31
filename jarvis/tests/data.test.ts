// Veri adaptörlerinin SAF ayrıştırıcıları — kaydedilmiş fixture'lara karşı, ağ olmadan.
// Bu testler CI'da ve internetsiz ortamda da çalışır; gerçek uçların ayakta olup olmadığı
// ayrı bir soru ve onu `npm run doctor` cevaplıyor.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseTcmbXml } from '../src/data/tcmb.ts';
import { parseYahooChart } from '../src/data/yahoo.ts';
import { toYahooSymbol, fromYahooSymbol } from '../src/data/bist.ts';
import { parseTefasHistory } from '../src/data/tefas.ts';
import { parseCoinList, parseSimplePrice, isStablecoinSymbol } from '../src/data/crypto.ts';
import { gramGoldTry, TROY_OUNCE_GRAMS } from '../src/data/gold.ts';
import { DataError } from '../src/data/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf-8');
const jsonFixture = (name: string) => JSON.parse(fixture(name)) as unknown;

describe('TCMB', () => {
  const bulletin = parseTcmbXml(fixture('tcmb-today.xml'));

  it('bülten tarihini ve kurları okur', () => {
    expect(bulletin.date).toBe('29.08.2026');
    expect(bulletin.rates.get('USD')?.forexSelling).toBeCloseTo(41.2892, 4);
    expect(bulletin.rates.get('EUR')?.forexSelling).toBeCloseTo(48.1887, 4);
  });

  // EN KRİTİK TEST: JPY'nin Unit'i 100'dür. Bölmezsek yen 100 kat pahalı görünür ve
  // yen tutan biri portföyünü 100 katı sanır.
  it('Unit=100 olan JPY\'yi birim fiyata böler', () => {
    const jpy = bulletin.rates.get('JPY');
    expect(jpy).toBeDefined();
    expect(jpy!.forexSelling).toBeCloseTo(28.1150 / 100, 6);
    expect(jpy!.forexSelling).toBeLessThan(1); // 1 yen 1 TL'den ucuz olmalı
  });

  it('fiyatı boş gelen satırları atar (uydurmaz)', () => {
    expect(bulletin.rates.has('XDR')).toBe(false);
  });

  it('bozuk XML\'de anlaşılır hata verir', () => {
    expect(() => parseTcmbXml('<html>hata sayfası</html>')).toThrow(DataError);
  });
});

describe('Yahoo / BIST', () => {
  it('anlık fiyatı ve değişim yüzdesini okur', () => {
    const q = parseYahooChart(jsonFixture('yahoo-thyao.json'), 'THYAO.IS');
    expect(q.price).toBe(312.75);
    expect(q.currency).toBe('TRY');
    expect(q.previousClose).toBe(305.5);
    expect(q.changePct).toBeCloseTo(((312.75 - 305.5) / 305.5) * 100, 6);
  });

  it('anlık fiyat yoksa son DOLU kapanışa düşer (null kapanışı atlar)', () => {
    const q = parseYahooChart(jsonFixture('yahoo-no-market-price.json'), 'ASELS.IS');
    expect(q.price).toBe(195.2);
  });

  it('Yahoo hata döndürdüğünde uydurma fiyat üretmez', () => {
    const errorPayload = { chart: { result: null, error: { code: 'Not Found', description: 'No data found' } } };
    expect(() => parseYahooChart(errorPayload, 'YOKBOYLE.IS')).toThrow(DataError);
  });

  it('sembol dönüştürme .IS ekini bir kez uygular', () => {
    expect(toYahooSymbol('thyao')).toBe('THYAO.IS');
    expect(toYahooSymbol('THYAO.IS')).toBe('THYAO.IS');
    expect(toYahooSymbol(' xu100 ')).toBe('XU100.IS');
    expect(fromYahooSymbol('THYAO.IS')).toBe('THYAO');
  });
});

describe('TEFAS', () => {
  it('en YENİ fiyat kaydını seçer (sıralamaya güvenmez)', () => {
    const record = parseTefasHistory(jsonFixture('tefas-aft.json'), 'AFT');
    expect(record.code).toBe('AFT');
    expect(record.price).toBeCloseTo(1.256789, 6);
    expect(record.date.slice(0, 10)).toBe(new Date(1756486800000).toISOString().slice(0, 10));
  });

  it('istenen fon kodu dışındaki satırları eler', () => {
    const mixed = {
      data: [
        { TARIH: 1756486800000, FONKODU: 'TTE', FIYAT: 9.99, FONUNVAN: 'Başka fon' },
        { TARIH: 1756227600000, FONKODU: 'AFT', FIYAT: 1.11, FONUNVAN: 'Aranan fon' },
      ],
    };
    expect(parseTefasHistory(mixed, 'AFT').price).toBeCloseTo(1.11, 6);
  });

  it('Türkçe ondalıklı metin fiyatı ayrıştırır', () => {
    const trStyle = { data: [{ TARIH: 1756486800000, FONKODU: 'AFT', FIYAT: '1,234567', FONUNVAN: 'x' }] };
    expect(parseTefasHistory(trStyle, 'AFT').price).toBeCloseTo(1.234567, 6);
  });

  it('boş yanıtta anlaşılır hata verir', () => {
    expect(() => parseTefasHistory({ data: [] }, 'AFT')).toThrow(DataError);
  });
});

describe('CoinGecko', () => {
  it('fiyat ve 24s değişimi okur', () => {
    const idToSymbol = new Map([['bitcoin', 'BTC'], ['ethereum', 'ETH']]);
    const quotes = parseSimplePrice(jsonFixture('coingecko-price.json'), idToSymbol, '2026-08-29T12:00:00Z');
    expect(quotes).toHaveLength(2);
    expect(quotes.find(q => q.symbol === 'BTC')?.price).toBeCloseTo(3542180.55, 2);
    expect(quotes.find(q => q.symbol === 'ETH')?.changePct).toBeCloseTo(-1.2049, 4);
  });

  it('fiyatı gelmeyen sembolü sessizce atar (0 TL yazmaz)', () => {
    const idToSymbol = new Map([['bitcoin', 'BTC'], ['yok-boyle-coin', 'YOK']]);
    const quotes = parseSimplePrice(jsonFixture('coingecko-price.json'), idToSymbol, '2026-08-29T12:00:00Z');
    expect(quotes.map(q => q.symbol)).toEqual(['BTC']);
  });

  it('coin listesinde ilk eşleşen kazanır ve eksik satırlar elenir', () => {
    const map = parseCoinList(jsonFixture('coingecko-list.json'));
    expect(map.get('BTC')).toBe('bitcoin'); // "fake-bitcoin" değil
    expect(map.get('PEPE')).toBe('pepe');
    expect(map.size).toBe(2); // sembolü olmayan satır atlandı
  });

  it('stablecoin tespiti', () => {
    expect(isStablecoinSymbol('USDT')).toBe(true);
    expect(isStablecoinSymbol('usdc')).toBe(true);
    expect(isStablecoinSymbol('BTC')).toBe(false);
  });
});

describe('Altın (türetilmiş)', () => {
  it('gram altını ons ve kurdan doğru hesaplar', () => {
    // 3.400 USD/ons, 41,2892 USD/TRY  →  (3400 / 31,1034768) * 41,2892
    const gram = gramGoldTry(3400, 41.2892);
    expect(gram).toBeCloseTo((3400 / TROY_OUNCE_GRAMS) * 41.2892, 6);
    // Akıl sağlığı: gram altın binlerce TL mertebesinde olmalı
    expect(gram).toBeGreaterThan(1000);
  });

  it('gram × ons_gram = ons fiyatı (tur-tur tutarlılık)', () => {
    const gram = gramGoldTry(3400, 41.2892);
    expect(gram * TROY_OUNCE_GRAMS).toBeCloseTo(3400 * 41.2892, 4);
  });

  it('geçersiz girdide hesap yapmaz', () => {
    expect(() => gramGoldTry(0, 41)).toThrow(DataError);
    expect(() => gramGoldTry(3400, -1)).toThrow(DataError);
    expect(() => gramGoldTry(Number.NaN, 41)).toThrow(DataError);
  });
});
