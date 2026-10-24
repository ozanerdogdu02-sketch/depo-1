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
8. **(yeni, 2026-10-19 onaylandı)** Abonelik ve ödeme — ücretsiz + Premium katman, iyzico/PayTR (kart verisi bize gelmez), özellik kilidi, mesafeli satış sözleşmesi. Premium'da da al/sat önerisi ve işlem yürütme yok.
9. **(yeni)** İlk kullanıcılar — tanıtım sayfası, 2–3 ay gerçek gelir (satış fiyatını belirleyen adım).
10. Devir paketi (full paket) — kod, alan adı, Supabase/Vercel/ödeme hesaplarının devri, kurulum/devir dokümanı, gelir kanıtı, gizlilik dostu metrik.

**Önce araştırma (cumartesi ilk iş):** `fagent-arastirma` iş akışı, konu `docs/is-kuyrugu.md` → "A1 — SaaS full paket araştırması".
Tahmini bugünkü değer (gelirsiz, doğrulanmamış): ~1–5 bin $; hedef: ücretli kullanıcıyla 10–50 bin $+.

## NEREDEN DEVAM EDİLİR (2026-10-19 son durum)

- Ürün dalı `urun/birlesik` temiz ve yeşil (adım 1–2 tamam). Yarım kod yok.
- **Sıradaki iş: adım 3 / K2 (deftere kayıt dili + 9 tavsiye kalıbı). K1 (AI bağlantısı çıkarıldı) 2026-10-24'te commit edildi: typecheck/build ✓, tarama 0 kritik, e2e 587/587.** Ekip planı hazır ve güvenlik/uyum danışmasından geçti: `docs/adim3-ekip-plani.md`
  (K1 aiAgent'ı çıkar → K2 "deftere kayıt" dili + 9 tavsiye kalıbı → K3 testler). Koşu kredi bittiği için K1'in
  başında durduruldu; kalemleri sırayla uygula, sonra kapıyı koş.
- Sonraki işler: `docs/is-kuyrugu.md` (34 iş + G1–G3 görsel).
- Vercel: `fagent` projesi (takım MYSELF) Vite/`dist` olarak ayarlandı ve yalnızca `urun/birlesik` dalını derler;
  GitHub'a bağlı; her push önizlemeyi günceller: https://fagent-git-urun-birlesik-myself-40f7.vercel.app
  (Vercel girişi gerekir). fagent.vercel.app hâlâ eski maket; üretime geçiş kullanıcı onayıyla, 4. adımdan sonra.
- Tasarım dosyaları: `docs/tasarim/`.
- İzleme paneli: https://claude.ai/artifact/Re4RorKLeMADNWMqGDhFu3 — "Olay günlüğü" ve "Bilmen gerekenler" (sözlük) bölümleri var.
  Her önemli adımdan sonra günlüğe satır ekle; raporda yeni teknik terim geçtiyse sözlüğe ekle (kullanıcı teknik değil).

## EKİP HAFIZASI — bilinen hatalar (her ajan işe başlamadan okur)

Aynı hatayı tekrar yapma. Yeni bir hata bulunursa buraya tek satır eklenir (tarih + ne + doğrusu).

**Okuma düzeni**
- Her ajan taze başlar, önceki ajanın okuduğunu bilmez. Son koşuda `App.tsx` 14, `agent.ts` 10 kez baştan okundu.
  Doğrusu: önce `grep -n` ile yeri bul, sonra yalnızca o satır aralığını oku (`App.tsx` ~2100 satır). Kendi düzenlemenden sonra dosyayı yeniden okuma.
- Plan/pano mesajındaki satır numaraları kayar. Düzenlemeden önce kodda yeniden doğrula.

**Komutlar**
- `npm install` çalıştırma (`package-lock.json` değişir ve dal kirlenir). `npm ci` kullan; lock değiştiyse `git checkout -- package-lock.json`.
- e2e: `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`. `playwright install` çalıştırma.
- `pkill -f` ile genel desen kullanma (kendi kabuğunu öldürür). Süreci PID ile durdur.
- Workflow çıktısı sarmalayıcı JSON'dur; asıl sonuç `.result` altındadır.

**Test ve doğrulama**
- Kullanıcıya görünen metni değiştirirsen, aynı kalemde o metni arayan tüm e2e seçicilerini güncelle (`grep -rn` tests/e2e). Kontrol sayısı azalmaz.
- `tests/e2e/fagent-auth-e2e.mjs` içindeki beyaz liste kontrolleri (satır ~200, 276-278, 359-368) silinmez, gevşetilmez.
- Supabase testlerde taklittir. Rapor dili: "sahte Supabase ile yeşil", asla "çalışıyor". Dış API'ler (Frankfurter, CoinGecko, EVDS) bu ortamda doğrulanamaz; "doğrulanamadı" yaz.
- Türkçe regex: `\b` kullanma. Girdiyi `toLocaleLowerCase('tr-TR')` ile normalle; İ/I/ı/i varyantlarını test et. Kalıplar sınırlı olsun (ReDoS).

- 2026-10-24: Dosya silen değişiklikte `git ls-files --cached` silinmiş dosyayı da verir; tarama betikleri `existsSync` ile süzmeli (tarama bu yüzden çöktü, düzeltildi).
- 2026-10-24: Var olan e2e dosyasına blok eklerken `grep -n "const <ad>"` ile değişken adı çakışmasını ve bloğun zaten ekli olup olmadığını kontrol et (tekrar eklenen blok test dosyasını çökertti).

**Süreç**
- Ajanlar commit atmaz, push etmez, dal değiştirmez. Çalışma ağacı temiz başlar (inceleyenler `git diff` ile görür).
- İncelenmemiş/yarım iş git dalına konmaz; yama dosyası olarak `/home/user/FAGENT-Raporlar/02-degisiklikler/` altına yedeklenir (kullanıcı kararı).
- Hiçbir `.env*` dosyası okunmaz. Gizli anahtar istemciye girmez; `VITE_*` içinde yalnızca publishable/anon anahtar olur.
- Bütçe koruması yalnızca kullanıcı mesajında "+800k" gibi token hedefi varsa çalışır; yoksa limit bilinmez, işi küçük parçalara böl.
- Kullanıcı kuralları: kişiye özel al/sat önerisi yok, gerçek işlem yürütme yok, sahte veri yok. Tavsiye dili ("almalısın", "öneri") ajan çıktısında yasak.

## ERTELENEN TEKNOLOJİLER (kullanıcı kararı, 2026-10-23)

Şimdilik KULLANILMAZ (çok maliyetli, büyük mühendislik): zaman serisi analizi (gecikmeli değişkenler / lag),
rassal yürüyüş (random walk) kuramı, transfer öğrenme, Fourier dönüşümü. Unutulmasın; ürün satıldıktan sonra
ya da gelirle birlikte yeniden değerlendirilir. Bugünkü ajan ve projeksiyon yapısı kural tabanlı ve anahtarsız kalır.

## EKİP EKOSİSTEMİ — KURULDU (2026-10-24, kullanıcı "tamam başla" dedi)

Üst Kurul (`docs/ust-kurul.md`, `.claude/agents/fagent-ust-kurul.md`, kayıt: `docs/teknoloji-talepleri.md`), ortak istem iskeleti
(`docs/istem-iskeleti.md`) ve skill'ler (`.claude/skills/`: app-tsx-haritasi, e2e-kosu, turkce-regex) var. Ajan istemlerine
(`fagent-ekip.js` ORTAK) "önce EKİP HAFIZASI + skill, sonra dar okuma, yeni teknoloji = talep" kuralı eklendi.
Sınırlar: kurul kapısı zorunlu iş akışı aşaması DEĞİL (istem kuralı); henüz bir koşuda denenmedi, etkisi ölçülmedi.
Yeni tekrar eden bilgi → yeni skill; yeni hata → EKİP HAFIZASI'na satır.

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
| ~~40~~ | `scripts/build.mjs` | ✅ Kapandı: derleme `sb_secret_`/service_role içeren VITE_* değerinde durur | — |
| 43/16 | barındırma yapılandırması | CSP, frame-ancestors, nosniff, Referrer-Policy yok (adım 4) | veri-akışı |
| 47 | `src/Account.tsx` | KVKK aydınlatma metni olmadan kayıt açılabiliyor (adım 7) | tasarım |
| ~~42/39~~ | `scripts/guvenlik-tarama.mjs` | ✅ Kapandı: tarama artık izlenmeyen yeni dosyaları da tarıyor | — |

Kısa vadeli (orta/düşük) bulguların tam listesi ve ekip koşusunun kaydı: geliştirme raporları klasörü
(`01-ekip-kosulari/2026-10-19-kosu-2-hesap-katmani.md`).

