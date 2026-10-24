# Ekip kararları (özerk skill / kural değişiklikleri)

Ajanlar kendi yazdıkları skill ve kuralları buraya tek satırla kaydeder: `tarih | kim | ne | neden`. Sınırlar: `docs/ajan-sistemi.md` → Ajan özerkliği.

| Tarih | Kim | Ne | Neden |
|---|---|---|---|
| 2026-10-24 | uygulayıcı (veri-akışı) | EKİP HAFIZASI'na 2 satır: public/ yalnız üretim dosyası; varsayılan sabit değişince grep | cors-test.html sızdı; enflasyon sabiti testlerde tekrar ediyor |
| 2026-10-24 | uygulayıcı (metin/belge) | Skill `uyum-dili` (yasak kalıplar + şablonlar) | Demo/öneri/işlendi dili tekrar tekrar düzeltiliyor |
| 2026-10-24 | uygulayıcı (metin/belge) | Faz 1 uyum düzeltmesi: README "Demo Ajan" kalktı, evds.ts yorumu Vercel'e uyarlandı, "Vercel çalışıyor" iddiası "503 gözlendi, doğrulanmadı" oldu, uyum-dili'ne "Deftere ekle onaylı" notu, Faz 2'ye 2.6 | Uyum/güvenlik incelemesi KOŞULLU döndü |
| 2026-10-24 | uygulayıcı (metin/belge) | Skill `belge-kod-tutarliligi` (belge-kod grep listesi) | README ve entegrasyonlar.md kodla ayrıştı (EVDS Netlify iddiası, cors-test adresi) |
