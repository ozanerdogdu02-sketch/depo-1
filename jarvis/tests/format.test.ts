// Biçimleme ve tarih testleri.
// Buradaki tarih testleri "kozmetik" değil: yanlış takvim günü, işlemin bir önceki güne
// yazılmasına ve brifingdeki "dünden bugüne" karşılaştırmasının kaymasına yol açar.
import { describe, expect, it } from 'vitest';
import {
  fmtTL, fmtSignedTL, fmtPrice, fmtPct, fmtSignedPct, fmtQty,
  localDateString, daysAgoLocalDate, partOfDay, normalizeName,
} from '../src/core/format.ts';

const IST = 'Europe/Istanbul';

describe('para ve yüzde biçimleme', () => {
  it('Türkçe ayraçları kullanır (binlik nokta, ondalık virgül)', () => {
    expect(fmtTL(1234.56)).toBe('1.234,56 ₺');
    expect(fmtTL(0)).toBe('0,00 ₺');
  });

  it('büyük tutarlarda kuruşu atar (gürültü)', () => {
    expect(fmtTL(1_250_000.49)).toBe('1.250.000 ₺');
  });

  it('işaretli tutarda + ve − gösterir', () => {
    expect(fmtSignedTL(1234.5)).toBe('+1.234,50 ₺');
    expect(fmtSignedTL(-1234.5)).toBe('−1.234,50 ₺');
  });

  it('yüzde işareti Türkçedeki gibi sayının ÖNÜNDE', () => {
    expect(fmtPct(12.34)).toBe('%12,3');
    expect(fmtSignedPct(-4.5)).toBe('−%4,5');
    expect(fmtSignedPct(4.5)).toBe('+%4,5');
  });

  it('geçersiz sayıda 0 değil — çizgi basar', () => {
    expect(fmtTL(Number.NaN)).toBe('—');
    expect(fmtPct(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('fmtPrice — ölçeğe duyarlı', () => {
  // Sabit 2 hane kullanılsaydı SHIB "0,00 ₺" görünürdü. Bu sınıf hata FAGENT'ta yaşandı.
  it('küçük fiyatlarda ondalık hane artırır', () => {
    expect(fmtPrice(0.00042)).toBe('0,000420 ₺');
    expect(fmtPrice(0.0000031)).toBe('0,00000310 ₺');
    expect(fmtPrice(0.052)).toBe('0,0520 ₺');
  });

  it('büyük fiyatlarda 2 hane yeter', () => {
    expect(fmtPrice(3_542_180.55)).toBe('3.542.180,55 ₺');
    expect(fmtPrice(312.75)).toBe('312,75 ₺');
  });

  it('küçük bir fiyat asla sıfır görünmez', () => {
    expect(fmtPrice(0.00000001)).not.toMatch(/^0,0+ ₺$/);
  });
});

describe('miktar biçimleme', () => {
  it('gereksiz sıfır basmaz', () => {
    expect(fmtQty(0.5)).toBe('0,5');
    expect(fmtQty(12)).toBe('12');
    expect(fmtQty(0.00012345)).toBe('0,00012345');
  });
});

describe('yerel takvim günü', () => {
  // EN KRİTİK TEST: konteyner UTC'de çalışır. TSİ (UTC+3) gece yarısını geçtiğinde
  // toISOString() HÂLÂ bir önceki günü verir. Gerçek senaryo: kullanıcı 00:30'da
  // "500 TL BTC aldım" yazıyor, işlem dünün defterine düşüyor.
  it('gece yarısını geçen saatte DOĞRU günü verir', () => {
    const utcAksami = new Date('2026-08-31T21:30:00Z'); // TSİ 01 Eylül 00:30
    expect(localDateString(utcAksami, IST)).toBe('2026-09-01');
    expect(utcAksami.toISOString().slice(0, 10)).toBe('2026-08-31'); // yanlış olan bu
  });

  it('gün içinde aynı günü verir', () => {
    expect(localDateString(new Date('2026-08-31T09:00:00Z'), IST)).toBe('2026-08-31');
  });

  it('sabaha karşı saatte gün geriye kaymaz', () => {
    // TSİ 03:30 — hâlâ aynı gün olmalı
    expect(localDateString(new Date('2026-09-01T00:30:00Z'), IST)).toBe('2026-09-01');
  });

  it('ay ve yıl sınırını doğru geçer', () => {
    expect(localDateString(new Date('2026-12-31T21:30:00Z'), IST)).toBe('2027-01-01');
  });

  it('daysAgoLocalDate geriye doğru sayar', () => {
    const today = localDateString(new Date(), IST);
    const yesterday = daysAgoLocalDate(1, IST);
    expect(yesterday < today || yesterday === today).toBe(true);
    expect(daysAgoLocalDate(0, IST)).toBe(today);
  });
});

describe('günün vakti', () => {
  it('saate göre doğru dilimi seçer', () => {
    expect(partOfDay(IST, new Date('2026-08-31T05:00:00Z'))).toBe('sabah');   // TSİ 08:00
    expect(partOfDay(IST, new Date('2026-08-31T11:00:00Z'))).toBe('gunduz');  // TSİ 14:00
    expect(partOfDay(IST, new Date('2026-08-31T18:00:00Z'))).toBe('aksam');   // TSİ 21:00
  });
});

describe('ad normalleştirme', () => {
  it('büyük/küçük harf ve boşluk duyarsız', () => {
    expect(normalizeName('  Gram   Altın ')).toBe('gram altın');
    expect(normalizeName('THYAO')).toBe(normalizeName('thyao'));
  });

  // Türkçe I/İ tuzağı: İngilizce toLowerCase('IŞIK') → 'işik' (yanlış), 'tr-TR' → 'ışık'.
  it('Türkçe I/İ ayrımını bozmaz', () => {
    expect(normalizeName('IŞIK')).toBe('ışık');
    expect(normalizeName('İSTANBUL')).toBe('istanbul');
  });
});
