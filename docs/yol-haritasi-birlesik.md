# Birleşik yol haritası: tek ekran Projeksiyon + arka plan motorları + çok kaynaklı veri

Yazan: yönetmen, 2026-10-27. Durum: **PLAN, kod yok.** Dayanak: `CLAUDE.md` → "KARARLAR (2026-10-27/28)", KAPSAM KARARI;
`docs/veri-akisi/{spec,mevcut-durum-ve-plan,cok-kaynakli-veri-plani}.md`; `docs/projeksiyon/gelismis-model-plani.md`.
Satır numaraları 27.10'da doğrulandı, kayar; kullanmadan önce `grep -n` ile yeniden bul.

## 0. Sonuç önce (sade dille)

1. Ekranda tek bir pano kalır: **Projeksiyon**. Bugünkü diğer sekmelerin hesapları silinmez; "motor" denen,
   ekransız modüllere taşınır ve projeksiyona sayı verir (başlangıç değeri, varlık dağılımı, vergi, enflasyon, içgörü).
2. Sıra: **(Y1) yerel veri katmanını bağla → (Y2) Projeksiyon Aşama A → (Y3) TCMB/EVDS ve kur bağdaştırıcıları →
   (Y4) KAP/BİST kazıma bağdaştırıcıları → (Y5) paylaşılan herkese açık veri deposu → (Y6) panelleri arkaya al, ekranı sadeleştir.**
   Ekran sadeleştirme en sona kalır, çünkü 699 e2e kontrolünün çoğu bugünkü sekmelere bağlı (`side-link` 22 dosyada).
3. Kazıma **tarayıcıdan yapılamaz** (CORS). Her kaynak için ayrı Vercel sunucu fonksiyonu gerekir. Bu geliştirme ortamından
   kaynak sitelere erişim 27.10'da reddedildi; gerçek kazıma ancak Vercel önizlemesinde denenebilir.
4. Kullanıcının portföyü hiçbir adımda sunucuya gitmez. Sunucu yalnızca herkese açık, kişiselleştirilmemiş tablolar çeker
   (tüm kurlar, tüm hisselerin gün sonu, son N bildirim); süzme tarayıcıda yapılır.
5. Kazıma hukuki riski açık kalır (`TODO(hukuk)`); kullanıcı kararıyla ilerlenir, satışta alıcıya yazılı açıklanır.
   **AGENTS.md §0.4 bugün "BIST hisse ve TEFAS fon fiyatı … elle girilir" diyor**; Y4'ten önce bu cümle kullanıcı
   onayıyla güncellenmeli (yönetmen ve ajanlar AGENTS.md'yi değiştirmez).

## 1. Hedef mimari

```
[Kaynaklar]  TCMB EVDS · CoinGecko · KAP · BİST (gün sonu)
     │  yalnız sunucu: api/evds.mjs, api/prices.mjs, api/kap.mjs, api/bist.mjs (kaynak başına ayrı dosya)
     │  hız sınırı + önbellek + devre kesici; isteğe bağlı paylaşılan depo (Y5)
     ▼
[Tarayıcı] src/kaynaklar/ (KaynakSonucu, kayıt defteri) → src/motor/* (saf, React/window yok)
     │      portföy verisi: src/storage (IndexedDB) — yalnız yerelde
     ▼
[Ekran]  Projeksiyon (tek pano) + "Ekle" çekmecesi + kaynak/tarih durum satırı
```

| Bugünkü sekme (`src/App.tsx`) | Arka plan motoru (öneri ad) | Projeksiyona ne verir |
|---|---|---|
| Panel (`Panel` ~625, `RiskPanel.tsx`) | `motor/degerleme`: toplam değer, tür dağılımı, risk ölçüleri | Başlangıç değeri, tür bazında stopaj ağırlığı |
| Hisseler / Fonlar | `motor/fiyat` (elle + CSV + Y4 BİST bağdaştırıcısı) | Hisselerin güncel değeri; fon elle kalır (TEFAS kapsamda yok) |
| Kripto | `motor/fiyat` (CoinGecko, `api/prices.mjs` üzerinden) | Kripto değeri |
| Kripto Piyasası (`CryptoMarket.tsx`) | `kaynaklar/coingecko` önbelleği | Doğrudan katkısı yok; yalnız Aşama B dalgalanması onaylanırsa. Aksi halde arka planda **çalıştırılmaz** (gereksiz istek) |
| İşlemler (`Islemler` ~1146, `store.ts` actions) | `motor/defter`: maliyet, gerçekleşen K/Z, aylık katkı geçmişi | Gerçek katkı geçmişi (betimleyici), maliyet tabanı |
| Bugün (`Bugun` ~1076) | `motor/olaylar`: günlük değişim + (Y4) KAP bildirim takvimi | Durum satırı: "X için D tarihinde KAP bildirimi var" (yorumsuz) |
| Ajan (`Ajan` ~1706, `agent.ts` saf) | `motor/icgoru` (kurallar aynen, saf kalır) | Projeksiyon yanında betimleyici içgörü satırları |
| (vergi) `taxRates.ts`, `analytics.ts` `afterTaxOf` | `motor/vergi` (+ P6 `tax_rules.json`) | Stopaj sonrası değer |
| (enflasyon) `inflation.ts`, `evds.ts` | `motor/enflasyon` (tcmb bağdaştırıcısı) | Reel değer, "resmî/varsayım/senin girdin" etiketi |
| Hesap (`Account.tsx`) | Değişmez; env boşken kapalı (27.10 kararı) | — |

**Portföy girişi ekranda nasıl kalır (KULLANICIYA SORULACAK, §5 K1):** öneri, Projeksiyon başlığında tek "Ekle" düğmesi →
yan çekmece (diyalog): varlık ekle, işlem ekle ("deftere kayıt" dili), CSV içe aktar, yedek al/geri yükle. Girilenin
görülüp düzeltilebilmesi için çekmecede salt okunur varlık/işlem listesi şart; liste yoksa kullanıcı hatalı kaydı bulamaz.

## 2. Sıralı uygulama planı

Her adım ekip akışıyla (`fagent-ekip`, küçük koşu) yürür; istemler `docs/istem-iskeleti.md` altı bölümüyle yazılır.
Her adımın kapısı: `npm run typecheck`, `npm run build`, `npm run guvenlik -- --dist`, `npm run test:unit` (varsa),
`CHROMIUM_PATH=… npm run test:e2e` (sahte Supabase ile yeşil), kontrol sayısı azalmaz, `uyum-dili` taraması.

| # | İş | Rol | Kabul ölçütü | Test | Uyum/hukuk riski | Büyüklük | Plan adımı |
|---|---|---|---|---|---|---|---|
| **Y1** | **P3 bağlama:** Y1–Y5 (`mevcut-durum-ve-plan.md` son bölüm) kapanır; SIFIRLA ve çıkış IndexedDB'yi de siler; bozuk kayıtta `load()` ezmez (`corrupt` ayrı); yedek+bulut için tek gerçek kaynak yazılır; `store.ts` write-through + localStorage aynası | veri-akışı (yazar), güvenlik (Y1–Y5 inceler), test | Yenilemede 5 katman IndexedDB'den gelir; ayna kapalıyken de geçer; mevcut e2e değişmeden yeşil | Birim (sahte IDB) + **yeni gerçek tarayıcı Playwright IndexedDB e2e**: yenile, SIFIRLA, bozuk kayıt, kota hatası taklidi | Düşük (yerel) | Büyük | Spec P3 (kapsam kararı) |
| **Y2** | **Projeksiyon Aşama A:** hesap saf `src/projeksiyon.ts`'e; stopaj sonrası; varsayım etiketleri; hedef karşılaştırma (boş başlar); 3×3 duyarlılık; deterministik sıra riski | veri-akışı, uyum (metin), test; tasarım rolü yalnız etiket/metin | Mevcut 13 projeksiyon kontrolü aynen yeşil; yeni sayılar birim testle donmuş | Birim + e2e (etiket, hedef boşken yok, 9 hücre) | Orta: "tahmin/hedefe ulaşmak için" dili yasak | Orta | Projeksiyon planı (f) 1–6 |
| **Y3** | **Kaynak bağdaştırıcıları:** S1 (kullanıcı `EVDS_API_KEY` ekler, `TP.FG.J0` gerçek yanıtla doğrulanır), S2 `KaynakSonucu` + durum metni, S3 kayıt defteri/izolasyon, S4 kaynak+tarih satırı, S5 TCMB kur (sabit tablo, istemcide süzme), CoinGecko'yu `api/prices.mjs`'e alma; Frankfurter otomatik yedek **olmaz** | veri-akışı, güvenlik (sunucu girdi doğrulama, CSP), uyum (durum metni), test | Bir kaynak çökünce yalnız onun bölümü "ulaşılamadı + son bilinen değer/tarih" der; ağ günlüğünde portföy/sembol listesi yok; CSP `connect-src` dış fiyat sunucusuz | `node --test` (TTL, geri çekilme, metin); e2e `page.route` ile kaynak başına arıza; `fagent-csp-e2e` güncel | Orta (TCMB kuru ECB'den farklı; e2e sabit sayılar `grep -rn`); `TODO(hukuk)` EVDS ticari kullanım | Orta | Adım 4 + Spec P5 |
| **Y4** | **Kazıma bağdaştırıcıları:** ortak sunucu çatısı (hız sınırı, önbellek, devre kesici, zaman aşımı, kimliği belli User-Agent, robots.txt kontrolü, şema/mantık kontrolü) → `api/kap.mjs` (son N genel bildirim: başlık+tarih+bağlantı) → `api/bist.mjs` (tüm hisselerin gün sonu tablosu) | veri-akışı; güvenlik (SSRF: sabit hedef listesi, girdi yok); uyum (KAP metni yorumsuz); test | Kaynak bozulunca yalnız o bölüm etkilenir; sunucu kullanıcıdan sembol almaz; her değer kaynak+tarih etiketli; sayı uydurulmaz | Kaydedilmiş örnek yanıtlarla (fixture) ayrıştırıcı birim testi; e2e taklit; **gerçek kaynakta yalnız önizlemede elle deneme** | **Yüksek:** KAP iç uçları ve BİST verisi lisans/yeniden yayın (`TODO(hukuk)`); SPK: portföye göre bildirim listesi danışmanlık sayılır mı | Büyük | **8 adımlık plana uymuyor — yeni madde** |
| **Y5** | **Paylaşılan herkese açık veri deposu** (yalnız piyasa verisi): zamanlanmış sunucu işi tabloyu doldurur, tarayıcı yalnız `/api/*` üzerinden okur | veri-akışı, güvenlik (servis anahtarı yalnız sunucu env'inde), Üst Kurul | Depoda kullanıcı verisi/kimliği/IP yok; depo boşken uygulama yine çalışır; `VITE_SUPABASE_*` gerekmez | Sunucu fonksiyonu birim testi; e2e taklit | Orta: veri yeniden yayını (Y4 ile aynı TODO) | Orta | Adım 5'e yakın ama ayrı; **Üst Kurul talebi gerekir** (§3) |
| **Y6a** | Motorları ayır: Panel/İşlemler/Bugün/Ajan/vergi/enflasyon hesapları `src/motor/*` saf modüllere; ekran değişmez | veri-akışı, test | Görünen sayı/metin aynı; motor başına birim test | Birim + mevcut e2e | Düşük | Orta | Adım 6 hazırlığı |
| **Y6b** | Yeni tek ekran **bayrak arkasında**: Projeksiyon + "Ekle" çekmecesi + durum satırı (tasarım oturumundan gelen tasarımla) | tasarım oturumu (kullanıcı) → veri-akışı entegre eder, uyum, test | Bayrak kapalıyken eski arayüz birebir; açıkken giriş→projeksiyon akışı klavyeyle tamamlanır | Yeni e2e (bayrak açık); eski e2e aynen | Orta (uyarı metni her hesap ekranında) | Orta–büyük | Adım 6 |
| **Y6c** | Test geçişi + eski sekmelerin kaldırılması (kullanıcı onayıyla, en son) | test, tasarım, veri-akışı | Eski sekme kontrolleri motor birim testlerine/yeni ekrana taşınmış; **kontrol sayısı azalmaz** | Tam kapı | Düşük | Büyük | Adım 6 |

Kullanıcıya bağlı paralel işler: S0 birincil hukuk metinlerini okuma (EVDS şartları, KAP yasal uyarı, BİST veri yayını),
`EVDS_API_KEY` ekleme, AGENTS.md §0.4 güncellemesi. Projeksiyon Aşama B (Monte Carlo) ayrı onay bekler (rassal yürüyüş ertelemesiyle
çelişki notu: `gelismis-model-plani.md` K1); bu plan onu içermez.

## 3. Paylaşılan veri deposu (Y5): seçenekler

| Seçenek | Artı | Eksi |
|---|---|---|
| Yalnız CDN önbelleği (`s-maxage`, bugünkü `api/evds.mjs` gibi) | Yeni servis yok, en ucuz; Y3 için yeter | Geçmiş birikmez (gün sonu fiyat arşivi, bildirim arşivi tutulamaz) |
| **Ayrı Supabase projesi**, `piyasa_verisi` tablosu (kaynak, anahtar, dönem, alındı, veri) | Bilinen araç; geçmiş birikir; devirde tek hesap | Servis anahtarı sunucuda; zamanlayıcı (Vercel Cron) gerekir; hesap projesiyle karıştırılmamalı |
| Vercel Blob / Edge Config | Barındırmayla aynı yerde | Yeni servis; sorgu yeteneği sınırlı; kota ve fiyat doğrulanamadı |

Öneri: Y3'te yalnız CDN önbelleği; geçmiş gerekince (Y4 sonrası) **kullanıcı hesaplarından ayrı** bir Supabase projesi.
Ayrı proje, KVKK kapsamındaki hesap verisiyle piyasa verisini fiziksel olarak ayırır. Vercel Cron ve sunucu tarafı Supabase
kullanımı yeni servis sayılır → `docs/ust-kurul.md` biçiminde talep (VERİ AKIŞI satırı: "kullanıcı verisi yok"). Vercel Cron
sıklık/plan sınırları ve Supabase ücretsiz katman kotası **doğrulanamadı**.

## 4. Kazıma için ağ gerçeği

- **Tarayıcıdan olmaz:** KAP/BİST siteleri başka kökene CORS izni vermez (doğrulanamadı ama tipik); ayrıca CSP'mizi gevşetmek
  ve kullanıcının IP'sini kaynağa göstermek gerekir. Doğru yol: kaynak başına Vercel sunucu fonksiyonu.
- **Bu geliştirme ortamı:** `tcmb.gov.tr`, `evds2/evds3.tcmb.gov.tr`, `kap.org.tr`, `borsaistanbul.com` erişimi vekil sunucu
  tarafından reddedildi (27.10, `cok-kaynakli-veri-plani.md` §4). Ortamın ağ politikası belgesi (environment.network) okunmadı:
  **doğrulanamadı.** Sonuç: ayrıştırıcılar kaydedilmiş örnek yanıtlarla (fixture) test edilir; gerçek davranış yalnız Vercel
  önizlemesinde görülür ve raporda "gerçek ağda doğrulanmadı" yazılır.
- **Vercel'den de engellenebilir:** veri merkezi IP'leri, bot korumaları, iç uçların habersiz değişmesi. Bu yüzden devre kesici,
  "son bilinen değer + tarih" ve elle/CSV girişin her zaman yedek yol olarak kalması zorunlu. Kazıma kütüphanesi (ör. HTML
  ayrıştırıcı) gerekirse önce Üst Kurul talebi; KAP iç uçları JSON döndürüyorsa gerekmez (doğrulanamadı).
- Kibar kazıma: tek sabit istek dizisi, istekler arası bekleme, önbellek süresi dolmadan kaynağa gidilmez, User-Agent'ta ürün adı
  ve iletişim adresi (devirde alıcıya geçer).

## 5. Tasarım oturumuna devir notu (`docs/tasarim/*` yürüten oturuma)

- Kullanıcı kararı (27/28.10): **ekranda yalnız Projeksiyon paneli kalır.** `YENI-OTURUM-DEVIR-NOTU.md` ve
  `ana-ekran-konsepti.md`'deki "Ana ekran" (A 9 öğe, C detay katmanı, D araçlar çekmecesi) bu karara göre yeniden ele alınmalı:
  ana ekran = Projeksiyon; "araçlar çekmecesi" = portföy girişi çekmecesi (§1).
- Tasarımın sağlaması gereken veri yuvaları: başlangıç değeri, nominal → stopaj sonrası → reel, varsayım etiketleri,
  hedef alanı (boş başlar), 3×3 duyarlılık, sıra riski, kaynak/tarih durum satırı (5 durum metni), "Ekle" çekmecesi,
  "Yatırım tavsiyesi değildir" uyarısı.
- Uygulama sırası değişmez: yeni ekran bayrak arkasında (Y6b), kenar çubuğu kaldırma en son (Y6c).

## 6. Kullanıcıya sorulacak kararlar (en fazla 4)

| # | Karar | Önerim |
|---|---|---|
| K1 | Portföy girişi tek ekranda nasıl dursun: "Ekle" düğmesi → yan çekmece (varlık/işlem/CSV/yedek + salt okunur liste)? Ajan sohbet kutusu da bu çekmeceye mi girsin, yoksa yalnız içgörü satırı mı kalsın? | Evet, çekmece + liste. Ajan sohbeti çekmecede ayrı sekme; ekranda yalnız içgörü satırları |
| K2 | BİST kazımada ne çekilsin: yalnız gün sonu kapanış mı, gecikmeli gün içi de mi? AGENTS.md §0.4 cümlesi buna göre güncellensin mi? | Yalnız gün sonu, kaynak+tarih etiketli; §0.4'ü "doğrulanmış kaynaktan, etiketli otomatik fiyat; yoksa elle" diye güncelle |
| K3 | Paylaşılan veri deposu: önce yalnız CDN önbelleği, geçmiş gerekince **ayrı** Supabase projesi — kabul mü? | Evet (§3); Üst Kurul talebiyle |
| K4 | Eski sekmeler Y6c'de tamamen kalksın mı, yoksa Projeksiyon altında açılır "ayrıntı" bölümü olarak (salt okunur) dursun mu? | Ayrıntı bölümü olarak dursun: hesapların doğruluğu kullanıcıya görünür kalır, test geçişi küçülür |

## 7. Bilinmeyenler (uydurulmadı)

EVDS kur seri kodları; KAP iç uçlarının biçimi ve kararlılığı; BİST gün sonu verisinin hangi herkese açık sayfadan, hangi
koşulla alınabileceği; Vercel Cron/Supabase kotaları; Vercel IP'lerinin kaynaklarca engellenip engellenmediği; 699 kontrol
sayısı bu oturumda koşulmadı. Hepsi ilgili adımda "doğrulanamadı" olarak raporlanır.
