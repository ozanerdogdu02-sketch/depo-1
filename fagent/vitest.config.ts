import { defineConfig } from 'vitest/config';

// Birim testleri — YALNIZCA saf fonksiyonlar (analytics.ts, agentTraining.ts gibi).
// Tarayıcı davranışı 23 dosyalık Playwright takımında test ediliyor (`npm run test:e2e`);
// bu ikisi ayrı tutuluyor: e2e yavaş ve gerçek DOM ister, birim testleri uç durumları
// (XIRR yakınsamama, tam sapma sınırı, sıfır varyans) hızlı ve doğrudan kontrol eder.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
