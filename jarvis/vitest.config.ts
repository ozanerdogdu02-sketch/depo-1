import { defineConfig } from 'vitest/config';

// Kendi config'imiz OLMASA vitest dizin ağacında yukarı çıkıp repo kökündeki
// Aura Finance'ın vite.config.ts / postcss.config.js dosyalarını bulur ve patlar.
// jarvis/ bağımsız bir proje — kök yapılandırmayla hiçbir bağı olmamalı.
export default defineConfig({
  root: import.meta.dirname,
  // Boş bir postcss yapılandırması VERMEK, üst dizinlerde postcss.config.js aramasını durdurur.
  // Bu projede hiç CSS yok, bu yüzden tamamen doğru davranış.
  css: { postcss: { plugins: [] } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
