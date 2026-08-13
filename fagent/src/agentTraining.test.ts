// hasComputedFigures — 👍 ile sabitlenmemesi gereken cevapları ayırt eder.
// Gerçek bir hatanın koruması: beğenilen "reel getirin %−22,24" cevabı kalıcı bilgiye
// dönüşüyor ve portföy değişse bile aynı rakamı göstermeye devam ediyordu.
import { describe, it, expect } from 'vitest';
import { hasComputedFigures } from './agentTraining';

describe('hasComputedFigures', () => {
  it('₺ tutarı içeren cevabı oynak sayar', () => {
    expect(hasComputedFigures('Toplam portföyün ₺143.700.')).toBe(true);
  });

  it('yüzde içeren cevabı oynak sayar', () => {
    expect(hasComputedFigures('REEL getirin %-22,24.')).toBe(true);
    expect(hasComputedFigures('Nominal getirin %2,64.')).toBe(true);
  });

  it('Türkçe eksi işaretini (U+2212) de yakalar', () => {
    expect(hasComputedFigures('Reel getirin %−22,69.')).toBe(true);
  });

  it('sayı içermeyen sohbet cevabını oynak SAYMAZ', () => {
    expect(hasComputedFigures('Merhaba! Portföyün hakkında soru sorabilirsin.')).toBe(false);
    expect(hasComputedFigures('Rica ederim! Başka bir sorun olursa buradayım.')).toBe(false);
  });

  it('regülasyon cevabı gibi sayısız uzun metni oynak SAYMAZ', () => {
    expect(hasComputedFigures(
      'Al/sat tavsiyesi veremem — bu, yalnızca SPK lisanslı aracı kurumların yapabileceği bir şey.',
    )).toBe(false);
  });

  it('yalın rakam (yüzde ya da ₺ olmadan) tek başına oynak saymaz', () => {
    // "5 varlık sınıfına yayılmışsın" gibi cümleler sabitlenebilir kalmalı.
    expect(hasComputedFigures('5 varlık sınıfına yayılmışsın.')).toBe(false);
  });
});
