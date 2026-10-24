---
name: e2e-kosu
description: FAGENT'ın typecheck + build + güvenlik taraması + e2e kapısını doğru komutlarla koşmak ve sonucu doğru dille raporlamak için. Test koşarken ya da "kapı yeşil mi" sorusunda kullan.
---

# Doğrulama kapısı

Sırayla, hepsi repo kökünde:
1. `npm run typecheck`
2. `npm run build`
3. `npm run guvenlik -- --dist` (beklenen: 0 kritik, 0 uyarı)
4. `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`
   Beklenen: `TOPLAM: 582 geçti, 0 başarısız` (486 uygulama + 96 hesap; yeni kontrol eklenirse sayı artar, azalmaz).

## Kurallar
- `npm install` yok (`npm ci`). `playwright install` yok. `.env*` okunmaz.
- E2e iki derleme yapar (`dist/` env'siz, `dist-e2e-cloud/` sahte Supabase). Elle `.env.local` gerekmez.
- Tek bir test dosyası: koşucu portları (4200/4201) kendi açar; dosyayı tek başına koşmak için önce `npm run build`.
- Metin değiştiyse seçicileri güncelle; kontrol sayısını azaltma; `fagent-auth-e2e.mjs` beyaz liste kontrollerini gevşetme.

## Rapor dili
"sahte Supabase ile yeşil" (asla "çalışıyor"). Dış API'ler (Frankfurter, CoinGecko, EVDS) bu ortamda doğrulanamaz: "doğrulanamadı".
Çıktıyı kanıt olarak ver: komut, sonuç satırı, sayı.
