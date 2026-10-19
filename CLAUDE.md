# FAGENT — Proje Hafızası (ürün dalı `urun/birlesik`)

FAGENT, Türk bireysel yatırımcı için API anahtarı gerektirmeyen portföy takip ve analiz
panelidir. Bu dal, üç ayrı sürümü Acquire.com'da satılabilir tek bir ürüne birleştirir.
Kurallar: `AGENTS.md` (önce onu oku). Karar geçmişi: `docs/karar-gunlugu.md`.

## Kaynak dallar (korunur, değiştirilmez)

| Dal | Ne | Bu dala ne alındı |
|---|---|---|
| `yedek/fagent-ana` | En kapsamlı kod — bu dalın temeli | Tamamı (kod köke taşındı) |
| `fagent-standalone` | Ana sürümün eski kopyası + Supabase kayıt/giriş | `src/cloud.ts`, `src/Account.tsx`, migration, auth testi (2. adım) |
| `yedek/canli-site` | fagent.vercel.app'teki Claude Design maketi, örnek veriyle | Yalnızca görsel dil (6. adım) |

## Yapı

- Uygulama repo kökünde: `src/`, `tests/e2e/`, `scripts/`, `public/`, `netlify/functions/`.
- Sekmeler: Panel, Bugün, Hisseler, Fonlar, Kripto, Kripto Piyasası, İşlemler, Projeksiyon, Ajan.
- Ajan sekmesi kural tabanlıdır (`src/agent.ts`), LLM çağırmaz.
- Canlı fiyat yalnızca döviz (Frankfurter) ve kripto (CoinGecko); hisse/fon elle girilir.
- Kalıcı katmanlar `src/backup.ts` → `BACKED_UP_KEYS`.

## Geliştirme planı (onaylandı)

1. ✅ Repoyu satışa uygun hale getir — kök dizine taşıma, kişisel dosya/iz temizliği.
2. ✅ Hesap katmanı — standalone'dan Supabase kayıt/giriş + senkronu tüm katmanları kapsayacak şekilde (kod tamam; canlıya açılması aşağıdaki listeye bağlı).
3. Kural uyumu — işlem komutu "deftere kayıt" dili, `aiAgent` katmanını çıkar, gizlilik metnini güncelle.
4. Vercel'e taşı — EVDS fonksiyonunu Vercel'e uyarla, seri kodunu doğrula, yedek enflasyon değerini güncelle.
5. Gerçek Supabase projesi — migration, Site URL, özel SMTP, canlıda uçtan uca deneme.
6. Canlı sitenin görünümü — Nocturne görsel dili; Kurulum ve Hedefler ekranları.
7. Yasal metinler — KVKK aydınlatma, kullanım koşulları, tavsiye değildir.
8. Devir paketi — kurulum/devir dokümanı, ortam değişkenleri, gizlilik dostu metrik.

## Geliştirme ekibi

Altı rollü çok ajanlı ekip `.claude/agents/` altında, iş akışı `.claude/workflows/fagent-ekip.js`.
Kullanım ve pano protokolü: `docs/ajan-sistemi.md`.

## Doğrulama durumu (2026-10-18)

- typecheck ✓, build ✓, e2e **486 + 96 auth = 582/582 sahte Supabase ile yeşil**.
- Koşucu (`tests/run-e2e.mjs`) iki derleme yapar: `dist/` (Supabase env'leri açıkça boş; 486 kontrol, port 4200) ve
  `dist-e2e-cloud/` (sahte `https://sahte.supabase.co`; yalnızca `fagent-auth-e2e.mjs`, port 4201). `.env.local`
  tanımlıyken de aynı sonuç alındı; `dist/` içinde sahte değer yok (koşucu doğrular).
- Supabase `page.route()` ile TAKLİT edilir. Gerçek projeye karşı doğrulanmayanlar: RLS, `delete_my_account`,
  e-posta yönlendirmeleri, `PASSWORD_RECOVERY`; migration'ın SQL ile iki kullanıcıyla sınanması adım 5'e kalır.
  "Çalışıyor" değil, "sahte Supabase ile yeşil".
- Doğrulanamayanlar: gerçek ağdaki dış API'ler, EVDS fonksiyonu (gerçek deploy gerekir), 1440/375px görsel kontrol.

## Hesap katmanı — CANLI ÖNCESİ ZORUNLU LİSTE (2026-10-19, ekip kararı)

Bu liste kapanmadan **üretim ortamında `VITE_SUPABASE_*` tanımlanmaz** (5. adımın giriş koşulu).
Env boşken bulut kodu hiç çalışmaz; hesapsız ürün bu maddelerden etkilenmez.

| # | Dosya | Sorun | Sahip |
|---|---|---|---|
| 34 + 33 | `src/cloud.ts`, `src/App.tsx` | Girişliyken SIFIRLA + yeniden kurulum buluttaki kopyayı sormadan ezer; onay metni yanıltıcı | veri-akışı + tasarım |
| 35 | `src/cloud.ts` | Başka sekmeden çıkış, hesaba yüklenmemiş tek yerel kopyayı siler | veri-akışı |
| 41 | `src/backup.ts` | Geri yükleme yazımı ya-hep-ya-hiç değil; dosya boyutu sınırı yok | veri-akışı |
| 27 | `src/cloud.ts` | Koşulsuz upsert: iki cihazda son yazan kazanır (koşullu güncelleme ya da açıkça belgeleme) | veri-akışı |
| 40 | `scripts/build.mjs` | Derleme `sb_secret_`/service_role anahtarını reddetmiyor | veri-akışı |
| 43/16 | barındırma yapılandırması | CSP, frame-ancestors, nosniff, Referrer-Policy yok (adım 4) | veri-akışı |
| 47 | `src/Account.tsx` | KVKK aydınlatma metni olmadan kayıt açılabiliyor (adım 7) | tasarım |
| ~~42/39~~ | `scripts/guvenlik-tarama.mjs` | ✅ Kapandı: tarama artık izlenmeyen yeni dosyaları da tarıyor | — |

Kısa vadeli (orta/düşük) bulguların tam listesi ve ekip koşusunun kaydı: geliştirme raporları klasörü
(`01-ekip-kosulari/2026-10-19-kosu-2-hesap-katmani.md`).

