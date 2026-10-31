# Bulut senkronu: açık maddeler araştırması (34+33, 35b, 27, 47)

Durum: ARAŞTIRMA, kod yazılmadı. 2026-10-31. Kapsam: `docs/veri-akisi/veri-yolculugu.json` A16/A17.
Kod satırları 2026-10-31'de `grep -n` ile bulundu (son commit a247359); satır numaraları kayar.
Bu belge hiçbir şeyi canlıya açmaz: `VITE_SUPABASE_*` canlıda tanımsız kalır (CLAUDE.md, zorunlu liste).

## 0. Sonuç önce

- **Öneri: Seçenek 2 "sürümlü koşullu yazım + karantina + dürüst onay"**, iki parçada:
  **2a** (yalnız istemci, migration yok, küçük-orta): 35b karantina, 34+33 yeniden kurulum koruması ve dürüst onay metni, çıkışta "yüklenemeyen değişiklik" koruması.
  **2b** (migration + istemci, orta; adım 5'e bağlı): `portfolios.version` sütunu ile "yalnız sürüm eşleşirse yaz" (27).
- CRDT ve alan bazlı birleştirme **şimdi gereksiz**: tek kullanıcı, az cihaz, küçük veri. Bunlar P8 (şifreli senkron) ile birlikte düşünülür.
- 47 (KVKK aydınlatma) bir kod sorunu değil, **metin ve hukuk** sorunudur. Hukuk devri kararına göre alıcıya açık madde olarak gider; kodda yalnız "aydınlatma ile onay kutusunu ayırma" yeri hazırlanabilir.
- Yeni bulgu (listede yoktu, kodda görüldü, ekip doğrulamalı): kullanıcı **kendisi** Çıkış'a bastığında son kayıt ağ hatasıyla başarısız olursa yerel veri yine silinir (aşağıda 35c).

## 1. Sorunların özeti (kodda nerede, ne zaman, kullanıcıya etkisi)

Arka plan: hesap açıkken tüm kullanıcı katmanları (portföy, ajan hafızası, öğretilen bilgi, vergi, hedef) **tek bir satırda** (`portfolios.data`, jsonb) durur. Yazma `save()` ile, okuma `pull()` ile yapılır. `pull()` girişte zaten akıllıdır: son eşitlemenin parmak izini (`getCloudBase`) tutar ve "yerel mi değişti, bulut mu değişti, ikisi mi" diye bakar (`src/cloud.ts:427-446`); ikisi de değiştiyse sormadan karar vermez (`cakisma`). Sorunlar bu akıllı kontrolün **dışında kalan** yollardadır.

| # | Kodda nerede | Ne zaman tetiklenir | Kullanıcıya etkisi |
|---|---|---|---|
| **34+33** | `src/App.tsx:1989-1996` (`resetAll`, `confirm('Tüm veriler silinsin ve başa dönülsün mü?')`); `src/cloud.ts:291-294` (onboard değilse kayıt atlanır) ve `:283-285` (yorum açıkça yazıyor); `src/App.tsx:1687` (gizlilik notu) | Girişliyken SIFIRLA'ya basılır. O an bulut silinmez (e2e (k) bunu korur). Ama kullanıcı yeniden kurulum yapınca (örnek portföy ya da boş başlangıç) `onboarded=true` olur, 1 sn sonra `save()` **koşulsuz** yazar. | Hesaptaki tam portföy, örnek ya da boş portföyle **sormadan ezilir**. Onay metni yalnız "tüm veriler silinsin mi" der; hesaptaki kopyanın kaldığını ve yeniden kurulumda **üzerine yazılacağını** söylemez (33: yanıltıcı). |
| **35b** | `src/cloud.ts:539-544` (`onSession`: oturum düştü ve çıkışı kullanıcı başlatmadı → `localSignOutCleanup(false)` → `clearForSignOut`); `:569-575` (açılışta oturum yok ama sahiplik işareti var → aynı temizlik) | Başka sekmede Çıkış; oturum süresinin dolması; token yenileme hatası; başka cihazdan "tüm oturumları kapat". Supabase belgesine göre `SIGNED_OUT` sekmeler arasında yayılır ve "başka cihazda çıkış" dahil süre dolmasında da gelir (kaynak K7). | O anda hesaba **henüz gitmemiş** veri silinir: 1 sn bekleme penceresindeki kayıt, ağ hatasıyla düşmüş kayıt (`status='hata'`), boyut sınırını aşan veri, ve en kötüsü **çakışma ekranında bekleyen veri** (girişten önceki, hesaba ait olmayan yerel veri dahil: kullanıcının kendi bastığı Çıkış bunu korur `:672`, başka sekmeden çıkış korumaz). Kopyası yoksa geri gelmez. 35a (öteki sekmenin diski yeniden doldurması) A8 ile kapandı; bu kalan "silinmeden önce kopya alınmıyor" yanıdır. |
| **35c (yeni, doğrulanmalı)** | `src/cloud.ts:669-694` (`signOut`): bekleyen kaydı gönderir (`:677-681`), hata olsa da `localSignOutCleanup(keepLocalData)` çalışır | Kullanıcı internet yokken ya da Supabase hata verirken Çıkış'a basar; ya da önceki kayıt zaten `hata` durumundaydı (bekleyen zamanlayıcı yok, yeniden denenmez). | Hesaba gitmemiş son değişiklikler sessizce silinir. 35b ile aynı çözümle (karantina ya da "önce indir" sorusu) kapanır. |
| **27** | `src/cloud.ts:303-305` (`.upsert({ user_id, data, updated_at })`); migration'da sürüm sütunu yok (`supabase/migrations/20261018000000_...sql:10-16`) | İki cihaz (ya da iki tarayıcı) aynı anda girişli. Her biri değişiklikten 1 sn sonra tüm satırı yazar. Giriş anındaki akıllı kontrol oturum boyunca **çalışmaz**. | Son yazan kazanır; öteki cihazın değişikliği **haber verilmeden** kaybolur. Satır tek parça olduğu için farklı katmanlardaki değişiklikler bile (birinde vergi oranı, ötekinde işlem) birbirini ezer. Kaybeden cihaz sonraki açılışta bulutu "daha yeni" görüp kendi kopyasını da onunla değiştirir (`:429-432`). |
| **47** | `src/Account.tsx:11` ve `:64` (yorum: "KVKK aydınlatma metni DEĞİLDİR"); `:357-363` (tek onay kutusu: "Aşağıdaki açıklamayı okudum; ... işlenmesini kabul ediyorum") | Kayıt ekranı (yalnız env tanımlıyken görünür). | Aydınlatma metni yok; "okudum" ile "kabul ediyorum" tek kutuda birleşik. KVKK Kurulu'nun 2026/347 sayılı ilke kararı (ikincil kaynaklara göre) aydınlatma ile açık rızanın **ayrı** yapılmasını istiyor (K12). Hesap verisinin hukuki sebebinin açık rıza mı, sözleşmenin ifası mı olduğu `TODO(hukuk)`. |

## 2. Yerleşik yaklaşımlar (kaynaklı)

Not: bu oturumda `supabase.com`, `docs.postgrest.org`, `martinfowler.com` ağ izninde değildi; bu sitelerin birincil metni **açılamadı**. Aşağıdaki bilgiler arama sonuçlarındaki özetlerden ve açılabilen sayfalardan alındı; "doğrulanamadı" yazanlar uygulama öncesi birincil metinle teyit edilmeli.

### 2.1 Sürüm numarası / ETag ile koşullu güncelleme (optimistic concurrency)
- **Desen:** Kayıtla birlikte bir sürüm okunur; yazarken "sunucudaki sürüm hâlâ buysa yaz, değilse reddet" denir. Fowler'ın "Optimistic Offline Lock" kalıbı çakışmayı tespit edip işlemi geri almayı ve çakışma olasılığının düşük olduğunu varsayar (K1, katalog sayfası arama özeti; sayfa açılamadı). En yaygın uygulaması her güncellemede artan bir sayısal sürüm alanıdır (K2, ikincil).
- **HTTP karşılığı:** `If-Match` başlığı yazmayı koşullu yapar; eşleşmezse `412 Precondition Failed`; MDN bunu "kayıp güncelleme" (lost update) sorununa karşı önerir (K3). İstemcinin doğru tepkisi: yeniden oku, gerekirse birleştir, yeni etiketle tekrar dene (K4).
- **Apple CloudKit:** Kayıt başına sunucu bir "change tag" tutar; `.ifServerRecordUnchanged` politikasında etiket uymazsa kayıt yazılmaz ve `serverRecordChanged` hatası döner; hata içinde yerel, sunucu ve **ortak ata** (ancestor) kopyaları verilir, birleştirmenin sunucu kaydına yapılması önerilir (K5). FAGENT'ın `getCloudBase` parmak izi bu "ortak ata" fikrinin hafif bir karşılığıdır (yalnız parmak izi, içerik değil).
- **Supabase/PostgREST'te:** Kontrol ile yazma **tek komutta** olmalıdır. Bir Supabase tartışmasında, önce sürüm okuyup sonra ayrı bir çağrıyla yazmanın arada yarış bıraktığı ve her çağrının kendi işleminde otomatik bittiği (kilidin tutulmadığı) not edilmiş (K6, kullanıcı raporu). Doğru biçim: `update ... where user_id = X and version = V` ve sürümü aynı komutta artırmak; 1 satır etkilendiyse başarılı, 0 satırsa çakışma (K6'daki ikincil kaynaklar). supabase-js'te `.update({...}).eq('user_id',uid).eq('version',v).select('version')` boş dizi dönerse çakışma sayılır. **Doğrulanamadı:** PostgREST'in 0 satırda tam olarak ne döndürdüğü (boş dizi + 200 beklenir) birincil belgeden okunamadı; sahte Supabase taklidi bunu varsayar, gerçek projede sınanmalı.
- **RPC alternatifi:** `save_portfolio(beklenen_surum, veri)` adlı bir veritabanı fonksiyonu tek komutta "ekle ya da koşullu güncelle" yapıp yeni sürümü ya da "çakışma" döner. Artısı: ilk kayıt (insert) ile güncellemeyi tek yerde toplar. Eksisi: yeni bir yetkili fonksiyon yüzeyi (güvenlik incelemesi gerekir). İş kuyruğu sıra 10 zaten düz koşullu `update` + ilk kayıtta `insert` (23505 = çakışma) yolunu tarif ediyor (`docs/is-kuyrugu.md:82`); bu belge de onu öneriyor.

### 2.2 Son yazan kazanır + çakışma kopyası (conflict copy)
- **Dropbox:** Aynı dosya aynı anda (ya da biri çevrimdışıyken) düzenlenirse ikisini birden saklar; ikinciye "conflicted copy", kullanıcı adı ve tarih eklenir; çözüm kullanıcının iki sürümü karşılaştırıp elle birleştirmesidir (K8).
- **Obsidian Sync:** Varsayılan olarak notları otomatik birleştirir (diff-match-patch); 1.9.7'den beri ayarlardan "çakışma dosyası oluştur" seçilebilir, kullanıcı elle birleştirir; forumda otomatik birleştirmenin bazen eski veriyle yeniyi ezdiği bildirilmiş (K9; resmî yardım sayfası + forum).
- **FAGENT'a dersi:** Kazananı seçmek yetmez; **kaybedenin kopyası saklanmalı** ve kullanıcıya gösterilmeli. FAGENT'ta bunun en ucuz biçimi: çakışmada yerel kopyayı otomatik olarak yedek dosyası (`.json`) olarak indirmeyi önermek ya da yerelde "karantina" anahtarına koymak.

### 2.3 Alan bazlı birleştirme
- CloudKit'in ortak ata ile birleştirme önerisi (K5) ve Obsidian'ın metin birleştirmesi (K9) bu sınıftandır. FAGENT'ta doğal birim **katman** (beş anahtar) ya da P3'teki **kayıt** (`id`, `updatedAt`, `deviceId`; `docs/veri-akisi/spec.md` P3).
- Gerekenler: yerelde son eşitlemenin **içeriğini** (bugün yalnız parmak izi var) saklamak, katman/kayıt bazında üç yollu karşılaştırma, silmeleri ayırt etmek. Hatalı birleştirme finansal veride sessiz yanlışlık üretir (yinelenen işlem). Bu yüzden şimdi önerilmez; P8'de op günlüğüyle gelir.

### 2.4 CRDT
- CRDT, kopyaların koordinasyon olmadan yerelde güncellenip sonra tek tutarlı duruma birleşmesini matematiksel olarak garanti eden veri yapısıdır; Yjs ve Automerge yaygın kütüphanelerdir; silinen öğelerin iz bırakması ve temizliğin yine koordinasyon istemesi bilinen bedelidir (K10, ikincil).
- **Finans örneği:** Actual Budget (açık kaynak bütçe uygulaması) senkronu için kendi CRDT'sini ve hibrit mantıksal saat (HLC) kullanır; sunucu yalnız dosya ve değişiklikleri barındırır, veri yerel anahtarla şifrelenebilir (K11; James Long'un yazısı ve proje belgesi, arama özetinden; tam metin okunamadı).
- **Neden şimdi gereksiz:** FAGENT tek kullanıcılı, cihaz sayısı az, eşzamanlı düzenleme nadir, veri küçük. CRDT yeni kütüphane (Üst Kurul talebi), şema değişikliği ve büyük test yükü getirir. P8 belgesi de "CRDT kütüphanesi şart değil, alan bazında son-yazan-kazanır + ekleme ağırlıklı op günlüğü" diyor (`docs/veri-akisi/p8-senkron-secenekleri.md:9`).

### 2.5 Çoklu cihaz örnekleri (özet)
| Ürün | Yaklaşım | Kaynak / durum |
|---|---|---|
| Apple CloudKit | Kayıt başına change tag, koşullu kaydet, çakışmada üç kopya | K5, resmî belge (arama özeti) |
| Dropbox | Son yazan + çakışma kopyası, elle birleştirme | K8, resmî yardım |
| Obsidian Sync | Otomatik metin birleştirme ya da çakışma dosyası (seçmeli) | K9, resmî yardım + forum |
| Actual Budget | CRDT + HLC, yerel SQLite, sunucu yalnız değişiklik taşır | K11, geliştirici yazısı (arama özeti) |
| Firebase Firestore | Çevrimdışı bekleyen yazılar sonra gönderilir; işlemler (transaction) çevrimdışı başarısız olur | K13, referans + ikincil; çakışma kuralı **doğrulanamadı** |
| Midas, Papara, banka uygulamaları | Sunucu-merkezli olduklarından (veri sunucuda, istemci görüntüler) bu sorunu yaşamazlar; yaklaşımları **doğrulanamadı**, yalnız mimari çıkarım | — |

### 2.6 Kısmi geri yükleme ve karantina
- Kısmi geri yükleme (#41) A14 ile kapandı: anlık görüntü + geri alma + ~10 MB sınırı (`docs/veri-akisi/veri-yolculugu.md` A14). Bulut yolu da aynı çekirdekten geçer (`applyUserData`, `src/cloud.ts:323`).
- **Karantina (çıkışta yerel kopya):** Yerleşik bir ürün belgesi bulunamadı; desen, Dropbox/Obsidian "kaybedeni silme, ayrı kopya yap" ilkesinin (K8, K9) yerel uyarlamasıdır. İş kuyruğunda tarifi var (`docs/is-kuyrugu.md:86`): temizlikten önce yerel parmak izi son eşitlemeyle karşılaştırılır; farklıysa veri, sahibi (uid) ve tarihle `fagent.quarantine.v1` anahtarına kopyalanır; aynı hesapla girişte "Kurtarılmamış yerel kopya: indir / hesaba yükle / sil" kartı; başka hesapla girişte, SIFIRLA'da ve hesap silmede karantina silinir.
- **Gizlilik bedeli:** çıkıştaki temizlik, ortak cihazda bir sonrakinin görmemesi için vardır (`src/cloud.ts:540-542`). Karantina bu veriyi cihazda tutar. Dengeleme: süre sınırı (ör. 7 gün), yalnız aynı uid'ye gösterim, başka uid girişinde silme. Karar kullanıcıda (§5, K2).

## 3. Local-first kararıyla uyum ve P8 ilişkisi

- **Uyum:** Supabase isteğe bağlı katmandır, canlıda kapalıdır, varsayılan akış yereldir (CLAUDE.md 2026-10-27 kararı). Önerilen değişikliklerin hepsi "yerel kopya, kullanıcı açıkça istemeden silinmez ve sunucu sessizce kazanmaz" ilkesini güçlendirir; local-first yazısının "başka bir bilgisayarın erişilebilirliği seni çalışmaktan alıkoymamalı" tanımıyla da uyumludur (K14).
- **P0.1 ile çelişki sürer:** bugünkü satır **düz metin** portföydür; spec P0.1 "sunucu yalnız şifreli blob görür" der. Bu araştırma çelişkiyi çözmez; P8 çözer (`p8-senkron-secenekleri.md`, öneri: şifreli röle + op günlüğü; aşama (a) tek kullanıcı çoklu cihaz şifreli yedek).
- **P8 gelene kadar güvenli tutma:** (1) `VITE_SUPABASE_*` canlıda tanımsız; (2) zorunlu liste kapanmadan açılmaz; (3) 2a/2b'de yapılan iş boşa gitmez: sürüm numarası ve "eşleşmezse yazma" mantığı P8 rölesinde aynen kullanılır (röle de sıra/epoch numarası tutar, `p8-senkron-secenekleri.md:12-13`); karantina ve dürüst onay ekranları da aynen kalır. Yalnız satırın içeriği düz JSON yerine şifreli blob olur.

## 4. Seçenekler

| | 1) Belgele ve kapalı tut | **2) Sürümlü koşullu yazım + karantina + dürüst onay (ÖNERİ)** | 3) Katman/kayıt bazlı birleştirme (P8 ile) |
|---|---|---|---|
| Ne yapılır | Kod yok. Son-yazan-kazanır ve 34/35b riskleri devir belgesine "bilinen davranış" olarak yazılır; hesap canlıda kapalı kalır. | **2a (istemci):** 35b/35c karantina; girişliyken SIFIRLA'dan sonra "hesap sıfırlandı" işareti → yeniden kurulumda kayıt gitmez, mevcut çakışma kartı (`bulut-kaydi-var`) açılır; `window.confirm` yerine dürüst onay penceresi ("Bu tarayıcıdaki veri silinir. Hesabındaki kopya silinmez; yeniden kurulumda hangisinin kalacağı sorulur."); çakışmada yerel kopyayı indirme bağlantısı (çakışma kopyası). **2b (migration):** `version bigint not null default 0` + güncellemede `version = eski + 1` tetikleyicisi; `save()` → koşullu `update ... eq('version', v)`, ilk kayıt `insert`; 0 satır / 23505 → `cakisma`, yazma yok. | P3 kayıtları (`id`, `updatedAt`, `deviceId`) üzerinden üç yollu birleştirme ya da op günlüğü; P8 aşama (a) ile birlikte, şifreli. |
| Kapatır | Hiçbirini (yalnız belgeler) | 34+33, 35b, 35c, 27 (47 ayrı, metin) | Hepsi + sessiz kayıp yerine otomatik birleştirme |
| Test planı | Yok | **Birim:** karantina kararı ve SIFIRLA işareti saf fonksiyon olarak (`tests/unit/`); sürüm çakışma kararı. **Sahte Supabase e2e** (`fagent-auth-e2e.mjs`, kontrol sayısı azalmaz, beyaz liste kontrolleri gevşemez): (i) iki context aynı sahte satır, ikincinin eski sürümle kaydı reddedilir, çakışma kartı görünür, upsert/PATCH gitmez; (ii) iki sayfa tek context, birinde çıkış → ötekinde veri karantinada, aynı hesapla girişte kart; başka hesapla girişte karantina yok; (iii) `page.route` ile ağ kesik → Çıkış → veri karantinada; (iv) SIFIRLA + örnek portföy → yazma yok, kart var; mevcut (k) kontrolü kalır. **Gerçek proje (adım 5):** tetikleyici, RLS iki kullanıcıyla, PostgREST'in 0 satır yanıtı, gerçek sekmeler/cihazlar arası `SIGNED_OUT` (GitHub #1708: küresel çıkış öteki cihazda hemen olay üretmeyebilir, K7) | Büyük: iki tarayıcı arası eşitleme, birleştirme özellik testleri, şifreleme |
| Risk | Alıcı için "veri kaybı olabilir" maddesi; satış değerini düşürür | Karantina ortak cihazda veriyi tutar (gizlilik dengesi); sahte Supabase'in koşullu güncellemeyi doğru taklit etmemesi (gerçek projede sınanmalı); sekmeler arası olay davranışı | Yanlış birleştirme = sessiz finansal hata; P8 onayı bekliyor; en büyük iş |
| Büyüklük | Küçük (yarım gün belge) | 2a: küçük-orta (cloud.ts ~100-150 satır, Account/App onay penceresi, ~15-25 yeni e2e kontrolü). 2b: orta (1 migration, cloud.ts save/pull, sahte Supabase sürüm taklidi, pgTAP isteğe bağlı) | Büyük |
| Onay | — | **2b migration değişikliği:** kullanıcı onayı gerekir; yeni teknoloji değildir (Postgres sütunu + tetikleyici), Üst Kurul gerekmez. RPC yolu seçilirse güvenlik incelemesi. Migration üretime yalnız adım 5'te, açık insan onayıyla (AGENTS.md §1) | P8 kararı + CRDT kütüphanesi istenirse Üst Kurul |

**Öneri gerekçesi:** 2a migration gerektirmez, hesap kapalıyken bile riski sıfır olan istemci kodudur ve üç maddeyi (34+33, 35b, 35c) kapatır. 2b, 27'yi sektörde yerleşik tek bir desenle (K1-K6) kapatır ve P8'e aynen taşınır. Seçenek 3 doğru hedeftir ama P8 kararına bağlıdır; şimdi yapmak düz metin yoluna büyük yatırım olur.

Plan bağlantısı: 2a → plan adım 2 (hesap katmanı) / YH sırasında "canlı-öncesi zorunlu liste"; 2b → plan adım 5 (gerçek Supabase); 47 → plan adım 7 (yasal metinler) ve hukuk devri; Seçenek 3 → P8.

## 5. Kullanıcının vereceği kararlar (önerimle)

1. **Hangi seçenek?** Öneri: **2** (önce 2a, sonra 2b). 
2. **Çıkışta hesaba gitmemiş veri ne olsun?** (a) Bugünkü gibi silinsin; (b) **karantina**: en çok 7 gün bu cihazda kalsın, yalnız aynı hesapla girişte "indir / hesaba yükle / sil" diye sorulsun, başka hesap girişinde, SIFIRLA'da ve hesap silmede silinsin. Öneri: **(b)**.
3. **Migration onayı (27):** `portfolios` tablosuna sürüm sütunu + tetikleyici eklenmesi, yalnız dosya olarak (üretime adım 5'te). Öneri: **evet**, düz koşullu güncelleme (RPC değil).
4. **47 (KVKK):** Hukuk devri kararıyla, metin alıcıya açık madde olarak gider. Kodda yalnız yer hazırlansın mı (ayrı "aydınlatma metni" bağlantısı + "okudum" bildirimi ile varsa ayrı rıza kutusu; hukuki sebep `TODO(hukuk)`)? Öneri: **evet, yalnız yer**; metni avukat yazar, hesap canlıda kapalı kalır.

## Kaynaklar

- K1 Fowler, Optimistic Offline Lock: https://www.martinfowler.com/eaaCatalog/optimisticOfflineLock.html (bu oturumda açılamadı; arama özeti)
- K2 Version Number / Optimistic Offline Lock (ikincil): https://java-design-patterns.com/patterns/version-number/ , https://www.java-design-patterns.com/patterns/optimistic-offline-lock
- K3 MDN If-Match: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/headers/if-Match (RFC 9110 §13.1.1 metni okunmadı)
- K4 412 Precondition Failed: https://http.dev/412 , https://evertpot.com/http/412-precondition-failed
- K5 Apple CloudKit: https://developer.apple.com/documentation/cloudkit/ckerror/serverrecordchanged , https://developer.apple.com/documentation/cloudkit/record-changed-error-keys , https://developer.apple.com/tutorials/data/documentation/cloudkit/ckmodifyrecordsoperation/recordsavepolicy/ifserverrecordunchanged.md
- K6 Supabase'de iyimser kilitleme tartışması (kullanıcı raporu): https://github.com/supabase/supabase-js/issues/1645 ; ikincil: https://oneuptime.com/blog/post/2026-01-30-optimistic-locking-implementation/view
- K7 Supabase onAuthStateChange: https://supabase.com/docs/reference/javascript/next/auth-onauthstatechange (arama özeti; açılamadı); bilinen sorun: https://github.com/supabase/supabase-js/issues/1708
- K8 Dropbox conflicted copy: https://help.dropbox.com/organize/conflicted-copy
- K9 Obsidian Sync: https://help.obsidian.md/sync/troubleshoot ; forum: https://forum.obsidian.md/t/obsidian-sync-updates-from-one-device-overwritten-by-another/33007/
- K10 CRDT (ikincil): https://cloud.r-project.org/web/packages/automerge/vignettes/crdt-concepts.html , https://system-design.space/en/chapter/crdt-collaborative-editing
- K11 Actual Budget: https://jlongster.com/using-crdts-in-the-wild , https://actualbudget.com/docs/contributing/project-details
- K12 KVKK İlke Kararı 2026/347 (aydınlatma ve açık rıza ayrı; RG 24.03.2026, ikincil özetler, resmî metin okunmadı): https://www.erdem-erdem.av.tr/bilgi-bankasi/acik-riza-ve-aydinlatma-metinlerinin-ayri-duzenlenmesine-iliskin-kisisel-verileri-koruma-kurulu-ilke-karari-yayimlandi , https://cottgroup.com/tr/mevzuat/item/kvkk-ilke-karari-aydinlatma-ve-acik-riza-metinlerinin-yonetimi
- K13 Firebase Firestore referansı: https://firebase.google.com/docs/reference/node/firebase.firestore.Firestore?authuser=5 ; ikincil: https://oneuptime.com/blog/post/2026-02-17-how-to-enable-offline-persistence-in-firestore-for-web-applications/markdown
- K14 Ink & Switch, Local-first software: https://inkandswitch.com/local-first/ ; Kleppmann 2024 tanımı (ikincil): https://en.wikipedia.org/wiki/Local-first_software
