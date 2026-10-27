---
name: belge-kod-tutarliligi
description: Kod hakkında iddia taşıyan belgeler kod değişince eskir. Hangi belgelerin hangi grep ile denetleneceğini listeler. Altyapı, env, dosya yolu ya da sabit değiştiğinde kullan.
---

# Belge-kod tutarlılığı

## İddia taşıyan belgeler
README.md, docs/entegrasyonlar.md, docs/yasal/*, docs/devir/* (kurulum-ve-devir.md, ilan-taslagi.md, ucuncu-taraf-lisanslar.md).

## Kod değişince çalışacak grep'ler
- EVDS/barındırma: `grep -rn -i "evds\|netlify\|vercel" README.md docs/entegrasyonlar.md docs/devir docs/yasal` (kaynak: api/evds.mjs, netlify/functions/evds.mjs, src/evds.ts, vercel.json, netlify.toml).
- Dosya yolu: değişen/taşınan dosya adını tüm belgelerde ara (örn. `cors-test`; public/ yalnız üretim dosyası).
- Sabitler: enflasyon, stopaj, eşik -> `grep -rn "<eski değer>" README.md docs src tests/e2e`.
- Sayılar (satır, test, bağımlılık sayısı): iddia eskiyse tarih yaz ya da sayıyı kaldır; ölçülmeden yazma.
- Veri toplama/ağ iddiası (yasal, ilan): src/cloud.ts, src/evds.ts, canlı fiyat kaynakları ile karşılaştır.
- Durum cümleleri ("çalışıyor", "kapalı"): kanıt ya da "doğrulanamadı". Dış API ve Supabase için "sahte Supabase ile yeşil".

- Depolama (localStorage/IndexedDB aynası, kurtarma anahtarları, SIFIRLA yolu): `grep -rn -i "localStorage\|IndexedDB\|fagent.recovery\|fagent.mirror" README.md docs/entegrasyonlar.md docs/yasal docs/devir` (kaynak: src/mirror.ts, src/storage/mirror.ts, src/recovery.ts, src/localData.ts, src/backup.ts BACKED_UP_KEYS). Kullanıcıya görünen "veri silinirse" cümleleri (src/agent.ts, src/App.tsx) ve e2e seçicileri de aynı kalemde.

## Kural
Belgeyi düzelten kalem, teslim notuna her iddia için `dosya:satır` kanıtı koyar.
