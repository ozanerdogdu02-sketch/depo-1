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
| `FAGENT_KAZIMA` | Vercel (Runtime, **sunucu**), yalnız **Preview** | Hayır (varsayılan kapalı) | `on` ise `/api/kap` ve `/api/bist` kaynaklara gider. **Production'da TANIMLANMAZ.** Dağıtımdan sonra `/api/kap` → 503 `kapali` olduğu kontrol edilir (açıksa env silinir). Hukuk: `TODO(hukuk)` |
| `FAGENT_BIST_KESIF` | Vercel (Runtime, **sunucu**), yalnız **Preview** | Hayır | `on` iken `/api/bist` yalnız bülten biçim keşfi yapar (içerik, boyut, ilk 512 bayt özeti). Keşiften sonra kaldırılır; Production'da TANIMLANMAZ |
| `FAGENT_ILETISIM` | Vercel (Runtime, **sunucu**) | Hayır | Kazıma isteklerinin User-Agent'ına eklenen iletişim yeri (ör. e-posta); yoksa yalnız `FAGENT/1.0` |
Gizli anahtarlar yalnızca sunucu tarafındadır; `.env*` dosyaları depoya girmez.

## Barındırma
Vercel: framework Vite, çıktı `dist`, `vercel.json` güvenlik başlıklarını verir (CSP vb.; değiştirirsen `netlify.toml` ve `fagent-csp-e2e` ile birlikte güncelle). Sunucu fonksiyonu: `api/evds.mjs` (mantık `netlify/functions/evds.mjs`).

## Supabase (hesap özelliği açılacaksa)
`supabase/migrations/` içindeki SQL uygulanır; RLS satır güvenliği ve `delete_my_account` işlevi gelir. Site URL, e-posta yönlendirmeleri ve özel SMTP ayarlanır. **Canlıya almadan önce** `CLAUDE.md` → "Hesap katmanı — canlı öncesi zorunlu liste" kapatılmalıdır (şu an açık: SIFIRLA/çıkış/geri yükleme/çakışma maddeleri).

**CSP adımı (zorunlu, hesap açılırken):** `vercel.json` ve `netlify.toml` içindeki `connect-src` varsayılan olarak Supabase adresi İÇERMEZ (hesap kapalıyken dışarı çıkış kanalı olmasın; `npm run denetim` jokeri `csp-supabase-joker` HATASI sayar). Hesap açılırken iki dosyada da `connect-src` sonuna yalnız PROJE alt alanı eklenir: `https://<proje-kodu>.supabase.co wss://<proje-kodu>.supabase.co` (joker `*.supabase.co` KULLANILMAZ; iki dosya birebir aynı kalmalı). Sonra `VITE_SUPABASE_URL` (`https://` zorunlu, derleme `http:` ile durur) ve `VITE_SUPABASE_PUBLISHABLE_KEY` Vercel ortamına eklenir. Eklemeden hesap girişi tarayıcıda CSP tarafından engellenir.

## Açık maddeler (alıcıya devredilen)
- **EVDS ara katmanı ve IP:** `netlify/functions/evds.mjs` istek sınırı için istemci IP adresini yalnızca kısa süreli bellekte (≈1 dk) tutar, kalıcı kayıt yoktur. IP'nin kişisel veri sayılıp sayılmadığı ve aydınlatma metnindeki ifade avukat teyidine bağlıdır (`TODO(hukuk)`, `docs/yasal/aydinlatma-kvkk.md`).
- **Kazıma uçlarının kapalı olduğunun kontrolü (KAP/BİST):** Production dağıtımından sonra `GET /api/kap` ve `GET /api/bist` yanıtı **503 `kapali`** olmalı. 200 dönüyorsa Production'da `FAGENT_KAZIMA` tanımlıdır; kaldırılmalıdır. KAP/BİST kullanım koşulları, otomatik okuma izni ve lisans birincil metinle doğrulanmadı (`TODO(hukuk)`).
- **Üretimde varsayılan ret (kod kilidi, izin listesi):** kazıma YALNIZ ortam açıkça `preview`, `deploy-preview`, `branch-deploy`, `development` ya da `dev` ise VE `FAGENT_KAZIMA=on` ise çalışır (`netlify/ortak/sunucu-ortak.mjs` → `kazimaOrtamiUygunMu`). Ortam kaynakları: `VERCEL_ENV`, Netlify v2 `context.deploy.context`, `CONTEXT`. Hepsi boşsa ya da biri `production`/bilinmeyen ise ÜRETİM sayılır ve `/api/kap` ile `/api/bist` 503 `kapali` döner; bayrak yanlışlıkla Production'a eklense de açılmaz. **Netlify'da çalışma anında doğrulanmadı** (yalnız env/context nesnesi taklidiyle sınandı; Vercel önizlemede `VERCEL_ENV=preview` gelmesi de gerçek deploy'da doğrulanacak). Satış sonrası alıcı, hukuk/lisans konularını kapattıktan sonra bu kilidi bilinçli kaldırır (kod değişikliği gerekir).
- **EVDS kullanım şartları:** ticari/abonelikli üründe gösterim ve kaynak gösterme biçimi birincil metinle doğrulanmadı (`TODO(hukuk)`).
- **EVDS anahtarı geçersizse (401/403):** işlev günlüğüne bak; her açılışta bir istek gider, kullanıcıya yalnız "ulaşılamadı" görünür (yukarı akış 4xx devre kesiciyi açmaz).
- **EVDS seri kodları:** TÜFE `TP.FG.J0` ve kur serileri gerçek yanıtla doğrulanmadı; kur serisi listesi bilerek boş (`TODO(muhasebe)`).

- **Vergi kuralı ve sistem saati:** `src/config/tax_rules.json` içindeki fon kuralı 2026-05-01'den başlar (başlangıç tarihi de doğrulanmadı). Cihaz saati bu tarihten geriyse (yanlış ayarlı saat) fon için kural dönmez: oran 0 ve tür "bilinmiyor" sayılır, ekran "doğrulanamadı" der; sayı uydurulmaz. Yeni kural eklerken aralıkların bitişik olması gerekir (doğrulayıcı çakışma/boşlukta açılışta hata verir).
- **Stopaj oranı kaydı:** kullanıcının girdiği oran yalnız değiştirdiği sınıf için saklanır; eski sürümün tam tablo kaydı ilk okumada sadeleşir. Kural değişmeden önce uygulamayı hiç açmamış eski kullanıcıda eski değerler "kullanıcı oranı" gibi kalabilir.

## Devir kontrol listesi
- [ ] Alan adı kayıt sahibi değişikliği · [ ] Vercel proje/ekip aktarımı · [ ] Supabase proje sahipliği · [ ] Ödeme sağlayıcı hesabı/IBAN değişikliği
- [ ] Ortam değişkenleri alıcının hesabında yeniden girildi, eski anahtarlar iptal edildi · [ ] GitHub deposu aktarıldı
- [ ] Yasal metinlerdeki ünvan/adres/e-posta güncellendi · [ ] Gelir ve kullanıcı verisi kanıtı (ölçüm raporu) paylaşıldı
