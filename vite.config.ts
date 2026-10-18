import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Build zamanı damgası — main.tsx bunu konsola yazar. 2026-09-04'te yaşanan bir deploy
  // karmaşasından sonra eklendi: hangi build'in canlıda olduğunu doğrulamanın hızlı bir yolu
  // yoktu, bu da "gerçekten yeni build mi yayında" sorusunu gereksiz yere uzattı.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
