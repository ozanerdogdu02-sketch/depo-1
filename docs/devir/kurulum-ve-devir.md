# Kurulum ve devir kılavuzu (alıcı için) — TASLAK, canlı kurulumla birlikte tamamlanır

## Ne devrediliyor
Kod (bu depo), Vercel projesi, Supabase projesi (hesap açılırsa), alan adı, ödeme sağlayıcı hesabı (abonelik eklenirse), tasarım dosyaları (`docs/tasarim/`), karar geçmişi (`docs/karar-gunlugu.md`), bu kılavuz.

## Yerel çalıştırma
`npm ci` → `npm run dev` (geliştirme) / `npm run build` (üretim derlemesi `dist/`). Kapı: `npm run typecheck`, `npm run guvenlik -- --dist`, `npm run test:e2e` (Chromium gerekir).

## Ortam değişkenleri
| Ad | Nerede | Zorunlu | Not |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Vercel (Build) | Hesap özelliği için | Boşsa hesap/bulut kodu hiç çalışmaz |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel (Build) | Hesap özelliği için | Yalnız publishable/anon; `sb_secret_`/service_role derlemeyi durdurur |
| `EVDS_API_KEY` | Vercel (Runtime, **sunucu**) | Canlı enflasyon için | TCMB EVDS ücretsiz anahtar; tarayıcıya girmez. Yoksa uygulama elle girilen varsayımla çalışır |
Gizli anahtarlar yalnızca sunucu tarafındadır; `.env*` dosyaları depoya girmez.

## Barındırma
Vercel: framework Vite, çıktı `dist`, `vercel.json` güvenlik başlıklarını verir (CSP vb.; değiştirirsen `netlify.toml` ve `fagent-csp-e2e` ile birlikte güncelle). Sunucu fonksiyonu: `api/evds.mjs` (mantık `netlify/functions/evds.mjs`).

## Supabase (hesap özelliği açılacaksa)
`supabase/migrations/` içindeki SQL uygulanır; RLS satır güvenliği ve `delete_my_account` işlevi gelir. Site URL, e-posta yönlendirmeleri ve özel SMTP ayarlanır. **Canlıya almadan önce** `CLAUDE.md` → "Hesap katmanı — canlı öncesi zorunlu liste" kapatılmalıdır (şu an açık: SIFIRLA/çıkış/geri yükleme/çakışma maddeleri).

## Açık maddeler (alıcıya devredilen)
- **EVDS ara katmanı ve IP:** `netlify/functions/evds.mjs` istek sınırı için istemci IP adresini yalnızca kısa süreli bellekte (≈1 dk) tutar, kalıcı kayıt yoktur. IP'nin kişisel veri sayılıp sayılmadığı ve aydınlatma metnindeki ifade avukat teyidine bağlıdır (`TODO(hukuk)`, `docs/yasal/aydinlatma-kvkk.md`).
- **EVDS kullanım şartları:** ticari/abonelikli üründe gösterim ve kaynak gösterme biçimi birincil metinle doğrulanmadı (`TODO(hukuk)`).
- **EVDS anahtarı geçersizse (401/403):** işlev günlüğüne bak; her açılışta bir istek gider, kullanıcıya yalnız "ulaşılamadı" görünür (yukarı akış 4xx devre kesiciyi açmaz).
- **EVDS seri kodları:** TÜFE `TP.FG.J0` ve kur serileri gerçek yanıtla doğrulanmadı; kur serisi listesi bilerek boş (`TODO(muhasebe)`).

## Devir kontrol listesi
- [ ] Alan adı kayıt sahibi değişikliği · [ ] Vercel proje/ekip aktarımı · [ ] Supabase proje sahipliği · [ ] Ödeme sağlayıcı hesabı/IBAN değişikliği
- [ ] Ortam değişkenleri alıcının hesabında yeniden girildi, eski anahtarlar iptal edildi · [ ] GitHub deposu aktarıldı
- [ ] Yasal metinlerdeki ünvan/adres/e-posta güncellendi · [ ] Gelir ve kullanıcı verisi kanıtı (ölçüm raporu) paylaşıldı
