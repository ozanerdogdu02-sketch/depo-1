// Dil katmanının GÜVENLİK korumaları.
// Bu testler modelin uydurmasına karşı yazılan savunmayı sınar — yerel küçük bir modelle
// çalışırken projedeki en riskli nokta burasıdır.
import { describe, expect, it } from 'vitest';
import { toIntent } from '../src/brain/nlu.ts';
import { extractNumbers, isSafeRewrite } from '../src/brain/nlg.ts';

const HOLDINGS = ['Bitcoin', 'THYAO', 'Gram Altın'];

describe('NLU — model çıktısını güvenli niyete çevirme', () => {
  it('parametresiz niyetleri doğrudan geçirir', () => {
    expect(toIntent({ niyet: 'portfoy' }, 'portföyüm', HOLDINGS)).toEqual({ id: 'portfoy' });
    expect(toIntent({ niyet: 'analiz' }, 'analiz', HOLDINGS)).toEqual({ id: 'analiz' });
  });

  it('bilinmiyor niyetini undefined yapar (kurallara düşülsün diye)', () => {
    expect(toIntent({ niyet: 'bilinmiyor' }, 'hava nasıl', HOLDINGS)).toBeUndefined();
  });

  it('varlık adını portföyden doğrular', () => {
    expect(toIntent({ niyet: 'varlik_sorgu', varlik: 'bitcoin' }, 'bitcoin nasıl', HOLDINGS))
      .toEqual({ id: 'varlik_sorgu', name: 'Bitcoin' });
  });

  // Model portföyde OLMAYAN bir varlık uydurursa reddedilmeli.
  it('uydurulmuş varlık adını reddeder', () => {
    expect(toIntent({ niyet: 'varlik_sorgu', varlik: 'Dogecoin' }, 'doge nasıl', HOLDINGS)).toBeUndefined();
    expect(toIntent({ niyet: 'varlik_sil', varlik: 'Olmayan Fon' }, 'sil', HOLDINGS)).toBeUndefined();
  });

  // EN KRİTİK KORUMA: tutar kullanıcının kendi cümlesinde geçmeli.
  it('kullanıcının cümlesinde OLMAYAN tutarla işlem üretmez', () => {
    const intent = toIntent(
      { niyet: 'islem', varlik: 'Bitcoin', tutar: 50_000, islem_turu: 'satis' },
      'Bitcoin 5000 TL sattım', // kullanıcı 5.000 dedi, model 50.000 uydurdu
      HOLDINGS,
    );
    expect(intent).toBeUndefined();
  });

  it('cümledeki tutarla işlem üretir', () => {
    expect(toIntent(
      { niyet: 'islem', varlik: 'Bitcoin', tutar: 5000, islem_turu: 'satis' },
      'Bitcoin 5000 TL sattım',
      HOLDINGS,
    )).toEqual({ id: 'islem', name: 'Bitcoin', txnKind: 'satis', amount: 5000 });
  });

  it('Türkçe yazılmış tutarı da temellendirilmiş sayar', () => {
    expect(toIntent(
      { niyet: 'alarm_kur', sembol: 'BTC', tutar: 4_000_000, yon: 'ustunde' },
      'BTC 4 milyon üstüne çıkarsa haber ver',
      HOLDINGS,
    )).toMatchObject({ id: 'alarm_kur', target: 'BTC', threshold: 4_000_000 });
  });

  it('tutarsız veya eksik alanlarda niyet üretmez', () => {
    expect(toIntent({ niyet: 'islem', varlik: 'Bitcoin', tutar: 5000 }, 'Bitcoin 5000', HOLDINGS)).toBeUndefined();
    expect(toIntent({ niyet: 'alarm_kur', sembol: 'BTC', tutar: 100 }, 'BTC 100', HOLDINGS)).toBeUndefined();
    expect(toIntent({ niyet: 'fiyat_sorgu' }, 'kaç', HOLDINGS)).toBeUndefined();
  });

  it('sembol takma adlarını çözer', () => {
    expect(toIntent({ niyet: 'fiyat_sorgu', sembol: 'dolar' }, 'dolar kaç', HOLDINGS))
      .toEqual({ id: 'fiyat_sorgu', symbol: 'USD', kind: 'doviz' });
    expect(toIntent({ niyet: 'fiyat_sorgu', sembol: 'GRAM' }, 'gram altın', HOLDINGS))
      .toEqual({ id: 'fiyat_sorgu', symbol: 'GRAM', kind: 'altin' });
    expect(toIntent({ niyet: 'fiyat_sorgu', sembol: 'ASELS' }, 'ASELS', HOLDINGS))
      .toEqual({ id: 'fiyat_sorgu', symbol: 'ASELS', kind: 'hisse' });
  });
});

describe('NLG — rakam koruması', () => {
  it('Türkçe ve düz biçimdeki aynı sayıyı EŞ sayar', () => {
    const a = extractNumbers('Portföyün 1.234.567,89 ₺');
    const b = extractNumbers('Portföyün 1234567,89 TL');
    expect([...a]).toEqual([...b]);
  });

  it('biçim değişikliğine izin verir', () => {
    expect(isSafeRewrite('Portföyün 100.000 ₺ oldu.', 'Portföyün 100000 TL oldu.')).toBe(true);
  });

  it('sayı ÇIKARMAYA izin verir (detay atlamak sorun değil)', () => {
    expect(isSafeRewrite('Toplam 100.000 ₺, kâr 5.000 ₺.', 'Toplam 100.000 ₺.')).toBe(true);
  });

  // EN KRİTİK KORUMA: model rakam uydurursa yeniden yazım reddedilir.
  it('taslakta OLMAYAN sayıyı içeren yeniden yazımı reddeder', () => {
    expect(isSafeRewrite('Portföyün 100.000 ₺.', 'Portföyün 110.000 ₺.')).toBe(false);
    expect(isSafeRewrite('Portföyün 100.000 ₺.', 'Portföyün 100.000 ₺, geçen ay 90.000 ₺ idi.')).toBe(false);
  });

  it('sayı içermeyen metinlerde sorun çıkarmaz', () => {
    expect(isSafeRewrite('Merhaba, nasıl yardımcı olabilirim?', 'Selam! Ne yapmamı istersin?')).toBe(true);
  });

  it('sondaki noktalama sayıya karışmaz', () => {
    expect(isSafeRewrite('Toplam 100.', 'Toplam 100')).toBe(true);
  });
});
