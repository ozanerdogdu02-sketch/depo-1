# FAGENT veri yolculuğu: backend oyun simülasyonu

Sürüm 1.0 · 2026-10-31 · Kaynak: `docs/veri-akisi/veri-yolculugu.json` (bu dosya ondan türetilmiştir; düzeltme JSON'da yapılır).

**Nasıl okunur.** Her sahne bir oyun bölümüdür: veri bir karakterdir, kontroller kapılardır. Bir kontrol geçilirse oyun sürer (gecerse), geçilmezse karakter durdurulur ya da güvenli yere alınır (gecemezse). Her sahnenin sonunda 'bozulursa' kullanıcının ne göreceğini ve veri kaybı olup olmadığını söyler. Durum: YAPILDI = kodda var ve testle korunuyor; KISMEN = bir kısmı var ya da ekrana bağlı değil; PLANLI = yok. 'yh' alanı docs/yol-haritasi-birlesik.md adımına bağlar. Bu belgedeki hiçbir dış kaynak (EVDS, CoinGecko, Frankfurter, Supabase) gerçek ağda doğrulanmadı; testler taklit (page.route, sahte fetch, sahte Supabase) ile yeşildir. Kod referansları 2026-10-31 tarihinde grep -n ile bulundu; satır numaraları kayar.

**Ekran alanı.** Her sahnedeki opsiyonel ekran alanı, o verinin ya da kontrolün docs/tasarim/FAGENT_web_sitesi.pdf (Fagent'ın normal ürün tasarımı) içinde hangi ekranı/paneli beslediğini söyler. Simülasyon tasarımın kendisini anlatmaz, yalnız arkasında çalışan veri ve kontrolleri anlatır. YH-7 (paneller motora) ve YH-8 PDF tasarımına göre yeniden tanımlanacaktır: motorlar PDF ekranlarını besler.


## A) Verinin yolculuğu

Kullanıcının portföyü tarayıcıdan çıkmaz. Yolculuk: sayfa açılır, depolama uzlaştırılır, kullanıcı işlem girer, veri localStorage'a yazılır, IndexedDB aynasına kopyalanır, hesap motoru ve ajan okur, yedek alınır ya da SIFIRLA ile silinir. Hesap açılırsa (canlıda kapalı) aynı beş katman yalnız kullanıcının kendi satırına gider.


### A1 · Uygulama açılışı: önce depolama, sonra ekran

**Durum:** YAPILDI · **Yol haritası:** YH-1 · **PDF ekranı:** Tüm ekranlar (açılışta veri hazırlanır)

Sayfa açılır ama oyun hemen başlamaz. Önce bekçi (bootStorage) çağrılır: localStorage'daki kayıtlar ile IndexedDB aynasındaki kayıtları karşılaştırır. Ekranı çizen bölümler (App, store) bekçi işini bitirene kadar yüklenmez; çünkü store.ts yüklenirken localStorage'ı bir kez okur ve bekçi araya girmeden okursa eski durumu görürdü. Bekçi hata verirse oyun yine de başlar.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Bekçi (bootStorage) React ve store'dan önce bekleniyor | App, ErrorBoundary, store dinamik içe aktarılır, kayıtlar zaten uzlaştırılmıştır. | Açılış hatası yutulur (try/catch), uygulama yine açılır; durum getStorageSnapshot() içinde görünür. |
| Dinamik içe aktarma ya da açılış hatası | Normal ekran çizilir. | Beyaz ekran yerine düz bir hata kutusu ve 'Yeniden yükle' düğmesi (showLoadError); veriye dokunulmaz. |
| Kaldırılmış özelliklerin eski anahtarları | purgeLegacyKeys eski anahtarı (fagent.ai.proxyurl.v1) siler. | Depolama kapalıysa sessizce atlanır. |

**Kod:**
- `src/main.tsx:start`
- `src/mirror.ts:bootStorage`
- `src/localData.ts:purgeLegacyKeys`
- `src/main.tsx:showLoadError`

**Bozulursa:** Bekçi çökerse ya da zaman aşımına uğrarsa uygulama açılır, IndexedDB aynası o oturumda kapalı kalır; localStorage'daki veri aynen durur, veri kaybı yok. İçe aktarma çökerse düz hata kutusu görünür, veri yerinde kalır.

**Test:**
- tests/e2e/fagent-depolama-e2e.mjs (gerçek Chromium IndexedDB'sine karşı)
- tests/unit/depolama.test.ts: açılış: l var / i yok -> kopyalanır; ikinci açılışta esit

### A2 · Açılış karar tablosu: iki kopya yan yana gelince kim kazanır

**Durum:** YAPILDI · **Yol haritası:** YH-1

Bekçi her anahtar için iki kopyaya bakar: localStorage (l, ana kopya) ve IndexedDB (i, ayna). Kural: l esastır; hiçbir kopya sessizce ezilmez. İkisi farklıysa i'nin değeri atılmaz, 'kurtarma kaydı' olarak ayrı bir rafa konur.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| l yok, i yok | Yapılacak bir şey yok. | - |
| l var, i yok | l, i'ye kopyalanır ve geri okunup doğrulanır. | Doğrulama tutmazsa hata raporlanır, l'ye dokunulmaz. |
| l var, i var, aynı | Yapılacak bir şey yok (esit). | - |
| l var, i var, FARKLI | l esas kalır; i'nin değeri fagent.recovery.idb.<anahtar> kaydına alınır; konsola yalnız anahtar adı yazılır. | Kurtarma kaydı alınamazsa ayna aynadaki değeri ezmez; not kalır, yeniden denenir. |
| Beş katmanın HİÇBİRİ l'de yok, i dolu | Tüm katmanlar l'ye geri yüklenir, geri okunup doğrulanır. | Doğrulama tutmazsa hata raporlanır. |
| Bazı katmanlar l'de var, biri yok, i dolu (kısmi durum) | Geri yükleme YOK (eksik katman bilerek silinmiş sayılır); i değeri kurtarma kaydına alınır. | - |
| Silme işareti (fagent.mirror.cleared.v1) var | Önce ayna silinir, geri yükleme ASLA yapılmaz, işaret kalkar. | Silme başarısızsa işaret kalır, sonraki açılış yeniden dener, geri yükleme yine yapılmaz. |
| IndexedDB okunamıyor ya da hatalı | O anahtar 'hata' olarak raporlanır, localStorage'a dokunulmaz. | - |

**Kod:**
- `src/storage/mirror.ts:bootMirror`
- `src/storage/mirror.ts:MIRROR_CLEARED_KEY`
- `src/storage/mirror.ts:saveRecovery`

**Bozulursa:** Yanlış karar verilseydi iki kopyadan biri kaybolurdu. Kural gereği hiçbiri ezilmez; en kötü durumda kullanıcının eski değeri kurtarma kaydında durur. Kurtarma kaydı kullanıcıya şu an ekranda gösterilmiyor (bkz. acik).

**Test:**
- tests/unit/depolama.test.ts: açılış: ikisi de var ve farklı -> HİÇBİRİ ezilmez; l esas; IndexedDB değeri kurtarma kaydına alınır
- tests/unit/depolama.test.ts: açılış: localStorage tamamen boş + IndexedDB dolu -> TÜM katmanlar geri yüklenir ve doğrulanır
- tests/unit/depolama.test.ts: açılış: kısmi durum (l bazı katmanlarda var, birinde yok, i dolu) -> geri yükleme YOK, kopya korunur
- tests/unit/depolama.test.ts: silme işareti: yarım kalan SIFIRLA sonrası açılış aynayı siler, GERİ YÜKLEMEZ; işaret kalkar
- tests/e2e/fagent-depolama-e2e.mjs

### A3 · 2,5 saniyelik sabır sınırı

**Durum:** YAPILDI · **Yol haritası:** YH-1

Bekçiye 2500 milisaniye verilir. Süre dolarsa oyun bekçisiz başlar ve o oturumda ayna kapalı kalır; geç gelen bekçi artık localStorage'a hiçbir şey yazamaz. Amaç: yavaş ya da takılan bir IndexedDB kullanıcıyı boş ekranda bekletmesin.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Açılış 2500 ms içinde bitti mi (bootStorage zaman aşımı) | Durum 'hazir'; ayna açık. | Durum 'zaman-asimi'; uygulama açılır, ayna bu oturumda kapalı. |
| Terk edilmiş açılış yazım yapıyor mu (abandoned bayrağı) | Hiçbir IndexedDB ya da localStorage yazımı yapmaz. | - |

**Kod:**
- `src/mirror.ts:bootStorage (varsayılan timeoutMs = 2500)`
- `src/storage/mirror.ts:bootMirror (abandoned kontrolü)`

**Bozulursa:** Zaman aşımında kullanıcı farkı görmez; veri localStorage'da durur. Ayna o oturumda yazmaz, sonraki açılışta yeniden denenir. Veri kaybı yok.

**Test:**
- tests/unit/depolama.test.ts: açılış: terk edilmiş (zaman aşımı) açılış localStorage'a geri yükleme YAZMAZ
- tests/unit/depolama.test.ts: DÜŞÜK-5: açılış terk edilince (abandoned) bootMirror hiçbir IndexedDB/localStorage yazımı yapmaz

**Not:** Plan belgesi (mevcut-durum-ve-plan.md) açılış zaman aşımı ile SIFIRLA yarışını 'sınanmadı' diye yazıyor (D-c); sonradan 'O-B' birim testleri eklendi. O belge satırı güncel olmayabilir, gerçek tarayıcıda bu yarış ölçülmedi.

### A4 · İşlem ve varlık ekleme: tek yazma kapısı

**Durum:** YAPILDI · **Yol haritası:** YH-1 · **PDF ekranı:** Panel; Hisseler; Fonlar; Kripto (varlık ve işlem ekleme)

Kullanıcı bir varlık ya da işlem girer. Önce ekranın kendi kapısı bakar (tutar sayı mı, sıfırdan büyük mü, aynı isimde varlık var mı). Sonra veri tek yazma noktasına, store.ts içindeki actions.* fonksiyonlarına gelir. İşlem varlığa ismiyle değil holdingId ile bağlanır; tarih bugünün yerel tarihi olarak damgalanır. Son adım commit: bellekteki durum güncellenir, localStorage'a yazılır, dinleyiciler uyarılır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Tutar sayı ve sıfırdan büyük (arayüz) | Ekleme çağrılır. | Fonksiyon sessizce döner, kayıt eklenmez. |
| Aynı isimli varlık var mı (büyük/küçük harf ve boşluk duyarsız) | Varlık eklenir. | Ekranda 'Bu isimde bir varlık zaten var' hatası; ekleme yapılmaz. |
| holdingId ile varlık bulundu mu (addTxn, addIncome) | İşlem varlığa bağlanır, maliyet ve gerçekleşen kâr hesaplanır. | Varlık bu sırada silinmişse sessizce döner, işlem eklenmez. |
| Komisyon negatif mi | - | Math.max(0, komisyon) ile 0'a çekilir. |
| Tarih damgası | todayLocalDate() yerel takvim günü (UTC kayması yok). | - |
| Canlı fiyata bağlı varlıkta miktar | Alış/satışta miktar orantılı güncellenir. | Sıfırdan yeniden alışta oran bilinemez; canlı bağlantı kaldırılır, varlık elle girişe döner (uydurma miktar yok). |

**Kod:**
- `src/store.ts:commit`
- `src/store.ts:actions (addHolding, addTxn, addIncome)`
- `src/store.ts:todayLocalDate`
- `src/store.ts:liveLinkAfterChange`
- `src/App.tsx (tutar kontrolü; ad çakışması mesajı)`

**Bozulursa:** Geçersiz giriş kayda geçmez, kullanıcı hata mesajını ya da hiçbir değişiklik olmadığını görür; veri bozulmaz. localStorage dolu ise bkz. A7.

**Test:**
- tests/e2e/fagent-validation-e2e.mjs: Aynı isimli varlık eklenince hata mesajı görünür
- tests/e2e/fagent-pnl-e2e.mjs
- tests/e2e/fagent-action-e2e.mjs

**Not:** Doğrulama kısmen arayüzdedir (App.tsx); store.addTxn tutarın sıfırdan büyük olmasını kendisi denetlemez (yalnız addIncome denetler). Kayıt kimliği t<milisaniye> biçimindedir; aynı milisaniyede iki kayıt aynı kimliği alabilir (bkz. acik).

### A5 · Ayna yazıcısı: localStorage'dan IndexedDB'ye kopya

**Durum:** YAPILDI · **Yol haritası:** YH-1

Her başarılı commit'ten sonra bir 'ayna yazıcısı' uyanır. localStorage'ın o anki halini IndexedDB'ye yazar, hemen geri okuyup aynı mı diye bakar. Yazıcı sıralı çalışır, aynı anda gelen istekleri birleştirir. IndexedDB bozuksa oyun durmaz, hata yalnız kayıt defterine yazılır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Yazılan değer geri okununca aynı mı | Ayna doğrulanmış sayılır. | 'verify' hatası durum bilgisinde görünür; uygulama bozulmaz. |
| localStorage'da anahtar yoksa | Aynadaki karşılığı silinir; ancak silmeden önce IndexedDB değeri kurtarma kaydına alınır. | Kurtarma kaydı alınamazsa silme ilerlemez. |
| Silme işareti varken (SIFIRLA sırasında) | Yazıcı kurtarma kaydı oluşturmaz. | - |
| IndexedDB hatası | - | Throw yok; status.lastError dolar; sonraki yazımda yeniden denenir. |

**Kod:**
- `src/mirror.ts:requestMirror`
- `src/storage/mirror.ts:createMirrorWriter`
- `src/main.tsx (subscribePortfolio, subscribeUserData, subscribeUserDataWrites bağlantıları)`

**Bozulursa:** Ayna geride kalırsa asıl veri (localStorage) etkilenmez. Kullanıcı yalnız şunu kaybeder: localStorage silinirse (tarayıcı temizliği) aynadan geri yükleme olanağı eksik kalır.

**Test:**
- tests/unit/depolama.test.ts: ayna yazıcı: localStorage'ın son hali yazılır ve doğrulanır; yok -> silinir; istekler birleşir
- tests/unit/depolama.test.ts: ayna yazıcı: IndexedDB hatası uygulamayı bozmaz (throw yok), status.lastError dolar; disable sonrası yazmaz
- tests/e2e/fagent-depolama-e2e.mjs: IndexedDB aynası portföyü localStorage ile AYNI metin olarak yazdı

**Not:** Asıl okuma hâlâ localStorage'dan. Okumanın IndexedDB'ye geçmesi (yedekli depo ve kirli anahtar kuralının devreye girmesi) ayrı bir adım olarak kullanıcı onayı bekliyor.

### A6 · Bozuk kayıt: kurtarma kaydı

**Durum:** YAPILDI · **Yol haritası:** YH-1

Bir katmanın okuyucusu (örneğin store.load) bozuk bir kayıt bulursa boş açılır ama bozuk ham değeri önce kurtarma rafına koyar. Böylece kullanıcının ilk yeni kaydı bozuk veriyi ezse bile asıl metin elde kalır. Raf küçük kalır: 256 KB üstü değerler localStorage'a kopyalanmaz, yalnız bir not düşülür ve ham değer IndexedDB'nin ayrı 'bozuk' kovasına gider; anahtar başına üst sınır vardır. Rafı yöneten arka plan işlevleri de vardır (ekranı yok): kayıtları listeler, ayrıştırılabilen bir kaydı doğrulayıp ilgili katmana geri yükler (önceki değeri ayrı bir 'geri' kovasına alarak), ayrıştırılamayanı ham metin olarak dışa aktarılabilir biçimde verir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| JSON okunabiliyor ve biçim doğru mu (holdings ve txns dizi) | Eski veri göçüyle okunur (costBasis yoksa amount, holdingId yoksa isimle eşleştirme, realizedPnl yoksa 0). | Boş açılır; ham değer fagent.recovery.corrupt.<anahtar> anahtarına kopyalanır. |
| Ham değer 256 KB (MAX_RAW_COPY) altında mı | localStorage'da en çok 5 farklı kopya (.2 ... .5), aynı değer çoğalmaz. | localStorage'a kopyalanmaz; <anahtar>.not düşer; kopya IndexedDB'de kurtarma kaydına alınmaya çalışılır, alınınca not silinir. |
| IndexedDB kurtarma kaydı anahtar başına en çok 3, üç ayrı kovada: 'bozuk' (256 KB üstü bozuk ham değer), 'farkli' (açılışta localStorage ile farklı bulunan kopya), 'geri' (geri yüklemeden ya da başka sekmenin değerinin korunmasından önceki değer) | Yeni kayıt kendi kovasına eklenir; bir kovanın dolması ötekilerin kayıtlarını dışarı itmez (D-b). Geri yüklenmekte olan kayıt, kendi kovası dolu olsa bile üst sınır nedeniyle silinmez. | Kovanın en eski (korunmayan) kaydı silinir; silinemezse ya da silinecek kayıt yoksa yeni kayıt geri alınır, sınır aşılmaz. |
| Not yazılamıyor VE kurtarma alınamıyor | - | Anahtar KORUMALI işaretlenir; ayna bozuk değeri ezmez. |
| Kurtarma kaydı listeleme (listRecoveries) | Her kayıt için anahtar, tür (bozuk / farklilik / buyuk), boyut ve yalnız adından çıkarılabiliyorsa tarih döner; tarih uydurulmaz. | Depo okunamazsa tipli hata döner, fırlatmaz. |
| Geri yükleme (restoreRecovery): ham metin JSON mu ve katmanın biçiminde mi | ETKİN silme işareti (SIFIRLA/çıkış sürüyor; damga + 30 sn süre sınırı) ve bekleyen (kaydedilmemiş) değer yoksa (ikisi de yazımdan hemen önce senkron yeniden denetlenir) mevcut değer önce 'geri' kovasına alınır (geri yükleme geri alınabilir; kaynak kayıt korunur), sonra değer yalnız o katmana A14 yoluyla (applyUserData, anlık görüntü + iki turlu rollback) yazılır; ayna write-through ile eşitlenir; bellek tazelemesi (portföy diskten yeniden yüklenir, diğer katmanlar için sayaç) işlevin içinde yapılır; kurtarma kaydı silinmez. Önceki değer 'geri' kovasına alındıktan sonra katmanın diskteki değeri ve kaynak kayıt yeniden okunur: bu arada SIFIRLA tamamlanmışsa (işaret kalkmış, kaynak silinmiş) o çağrıda oluşturulan 'geri' kaydı silinir ve hiçbir şey yazılmaz (silinen veri rafta kalmaz). | HİÇBİR ŞEY yazılmaz; neden döner (ayristirilamadi, gecersiz-bicim, bekleyen-var, sifirlama-suruyor, durum-degisti, onceki-korunamadi, yazilamadi, yalniz-not, desteklenmiyor) ve ayrıştırılamayan ham metin yedek dosyası biçiminde dışa aktarılabilir olarak verilir (exportRecovery). readRecovery yalnız kurtarma öneklerini okur. |

**Kod:**
- `src/recovery.ts:preserveCorruptRaw`
- `src/recovery.ts:clearRecoveryKeys`
- `src/storage/mirror.ts:saveRecovery`
- `src/store.ts:load`
- `src/kurtarma.ts:listRecoveries, restoreRecovery, exportRecovery, disaAktarimOlustur`
- `src/backup.ts:applyUserData (mode 'selected')`
- `src/storage/mirror.ts:saveRecovery (kova: farkli | bozuk)`
- `src/mirror.ts (256 KB üstü bozuk değer 'bozuk' kovasına), src/mirror.ts:getRecoveryStores`
- `src/storage/mirror.ts:saveRecovery (kova: farkli | bozuk | geri; koru)`

**Bozulursa:** Kullanıcı bozuk kayıt sonrası boş portföyle açılır; ham veri kurtarma rafındadır. Rafı geri yükleyen işlev vardır ama ekrana bağlı değildir ve ekranda bozuk kaydı bildiren bir bildirim yoktur (tasarım kullanıcıda). Rafa dokunulmazsa veri kaybolmaz; SIFIRLA ve çıkış rafı siler.

**Test:**
- tests/unit/depolama.test.ts: recovery: bozuk ham değer kopyalanır, aynı değer çoğalmaz, farklı değerler ayrı yuvaya, en çok 5; clearRecoveryKeys temizler
- tests/unit/depolama.test.ts: store.load: bozuk JSON ve yanlış biçim EMPTY döner ama ham değer kurtarma anahtarına kopyalanır
- tests/unit/depolama.test.ts: DÜŞÜK-6: 256 KB üstü bozuk ham değer kopyalanmaz (yalnızca uzunluk notu)
- tests/unit/depolama.test.ts: ORTA-2: IndexedDB değeri her açılışta değişse bile anahtar başına kurtarma kaydı en çok 3
- tests/unit/sekme-kurtarma.test.ts: A6: listRecoveries — tür, anahtar, tarih (yalnız addan çıkarılabiliyorsa), boyut
- tests/unit/sekme-kurtarma.test.ts: A6: ayrıştırılabilir kayıt geri yüklenir; mevcut değer rafa alınır; kayıt silinmez; sonrası çağrılır
- tests/unit/sekme-kurtarma.test.ts: A6: ayrıştırılamayan kayıt yazılmaz, ham metin yedek dosyası biçiminde aynen döner
- tests/unit/sekme-kurtarma.test.ts: A6 D-b: bozuk kovadaki kayıt farklılık kayıtlarıyla dışarı itilmez; kovaların sınırı ayrı
- tests/e2e/fagent-sekme-e2e.mjs: A6 D-b: 300000 karakterlik bozuk değer IndexedDB 'bozuk' kovasında (kırmızı/yeşil kanıtlı: sink kovasız çağrılınca kontrol KIRMIZI)
- tests/unit/sekme-kurtarma.test.ts: A6: gecersiz-bicim, yalnız-not, desteklenmeyen anahtar, bulunamadı, bekleyen-var, kota hatasında rollback tamam
- tests/unit/sekme-kurtarma.test.ts: O2: 3 kayıtlı kovada en eski kayıt geri yüklenir + kota hatası -> kayıt rafta durur; saveRecovery koru; mevcut değer 'geri' kovasında (kırmızı/yeşil kanıtlı)
- tests/unit/sekme-kurtarma.test.ts: D1 bekleyen-var yazımdan hemen önce tekrarlanır; D2 sifirlama-suruyor (başta ve beklemeler sırasında); D3 bellek tazelemesi içeride; D4 readRecovery yalnız kurtarma önekleri; D7 clearMirror sonrası tüm kovalar boş (her biri kırmızı/yeşil kanıtlı)
- tests/unit/sekme-kurtarma.test.ts: D-b (KVKK): kopya alınırken SIFIRLA tamamlanırsa 'geri' kaydı silinir, veri diriltilmez; katman değeri başka yerden değişirse 'durum-degisti' (ikisi de kırmızı/yeşil kanıtlı)

**Not:** Geri yükleme/dışa aktarma/listeleme saf işlev olarak testli; ekrana bağlı DEĞİL (düğme ve bildirim yeri tasarım kararı; sözleşme docs/yol-haritasi-birlesik.md §11). İki sekmede aynı kaydın eşzamanlı geri yüklenmesinde kilit yoktur: son yazan kazanır, öteki sekme storage olayıyla diskten yeniden yükler, ezilen değer 'geri' kovasında kalır. Boyut ölçümü için her kaydın değeri okunur (KvStore'da yalnız-uzunluk okuması yok); raf küçük ve sınırlıdır, listeleme açılışta ya da kullanıcı isteğiyle çağrılmalıdır. IndexedDB kovaları birim testte bellek içi taklitle, 300000 karakterlik bozuk değer yolu ve 'geri' kovası gerçek Chromium IndexedDB'siyle sınandı. Eski adlandırmayla (kovasız) yazılmış büyük bozuk kayıtlar 'farklilik' diye listelenir. Ham metin dışa aktarımı yedek dosyası biçimindedir ama yedek olarak geri yüklenirse bozuk metin yeniden kurtarma rafına girer.
### A7 · Depolama dolu, IndexedDB yok ya da engelli

**Durum:** YAPILDI · **Yol haritası:** YH-1

Tarayıcı bazen bir kapıyı kapatır: özel gezinti, kota dolu, IndexedDB hiç yok. IndexedDB tarafında oyun bunu hata kodu olarak tanır (quota, unavailable, blocked, version, io, corrupt) ve uygulamayı durdurmaz. localStorage tarafı ise tek kale: o dolarsa ana kopya yazılamaz. Bu durumda yazma hatası yakalanır, değişiklik 'kaydedilmedi' diye işaretlenir ve ekranda uyarı çıkar.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| IndexedDB açılabiliyor mu | Ayna çalışır. | Tipli hata (açılamıyor / engelli / yok); throw yok; ayna kapalı; localStorage'a dokunulmaz. |
| Kota hatası | - | 'quota' koduyla eşlenir, işlenmemiş reddedilme oluşmaz. |
| Yedekli depo (resilient) için version/blocked | - | Yazma yedeğe düşmez, hata çağırana döner. |
| Yedekli depo için io/quota | - | Yazma yedeğe düşer, anahtar KİRLİ işaretlenir, okuma önce yedeği kullanır (asıl okuma IndexedDB'ye geçince devreye girer). |
| localStorage doluyken yazma (store.commit ve diğer dört katman) | Kayıt yazılır; anahtar 'kaydedilmedi' listesinden çıkar. | setItem hatası yakalanır (fırlatmaz): bellekteki durum geçerli kalır, değer bellekte bekletilir, anahtar KİRLİ işaretlenir ve her sekmede role=alert uyarısı çıkar (yedeğin nereden indirileceğini söyler: Panel > Veri Yedeği kartı). Yedek dosyası bekleyen son değeri taşır; sonraki başarılı yazım diske iner ve uyarıyı kaldırır. Sayfa kapatılırken kaydedilmemiş değişiklik varsa tarayıcı onay sorar (beforeunload). Değer IndexedDB aynasına yazılmaz; bekleyen anahtar için ayna korumalıdır (localStorage esas kaynak kalır). |
| Ayna koruması (bekleyen anahtar) | Bekleyen (diske yazılamayan) anahtar yokken ayna localStorage'ı IndexedDB'ye normal yansıtır. | Bekleyen anahtar varken ayna o anahtara ne yazar ne siler (neden bazlı koruma: 'bekleyen' ve 'kurtarma' ayrı nedenlerdir, biri kalkınca diğeri kalkmaz); koruma, abonelikten hemen sonra mevcut kirli anahtarlar için de kurulur; bekleyen çözülünce koruma kalkar ve ayna eşitlenir. |

**Kod:**
- `src/storage/idb.ts (hata eşlemesi)`
- `src/storage/resilient.ts`
- `src/storage/local.ts`
- `src/yazmaDurumu.ts:writeLocal`
- `src/store.ts:commit`
- `src/taxRates.ts, src/targetAllocation.ts, src/agentMemory.ts, src/agentTraining.ts (kayıt işlevleri writeLocal kullanır)`
- `src/backup.ts:snapshotUserData (bekleyen değeri önceler)`
- `src/mirror.ts (bekleyen anahtar için writer.protect)`
- `src/App.tsx (#kayit-uyarisi, role=alert; beforeunload)`
- `src/yazmaDurumu.ts:bindUnsavedGuard`
- `src/storage/mirror.ts:protect (neden bazlı)`

**Bozulursa:** IndexedDB tarafı bozulursa veri kaybı yok. localStorage dolarsa son işlem diske yazılamaz ama bellekte durur; kullanıcı ekranda 'kaydedilemedi' uyarısını görür ve yedek indirebilir. Sayfa yenilenirse diske yazılamayan değişiklik kaybolur (uyarı bunu söyler).

**Test:**
- tests/unit/depolama.test.ts: idb: açılamıyor/engelli/yok -> tipli hata, throw yok
- tests/unit/depolama.test.ts: local: kota hatası quota koduyla döner; depolama yoksa unavailable
- tests/unit/depolama.test.ts: Y1: version/blocked hatasında YAZMA yedeğe düşmez
- tests/unit/depolama.test.ts: Y1: io/quota hatasında yedeğe yazılır, anahtar KİRLİ
- tests/unit/depolama.test.ts: A7: store.commit kota hatasında fırlatmaz; bellek güncel, anahtar KİRLİ; sonraki başarılı yazım temizler
- tests/unit/depolama.test.ts: A7: yazmaDurumu — yazılamayan değer bekler, okuma/yedek anlık görüntüsü onu görür; başarılı yazım ve removeLocal temizler
- tests/e2e/fagent-yazma-e2e.mjs (gerçek Chromium, Storage.prototype.setItem kota taklidi): uyarı görünür, sayfa çökmez, yedek bekleyen değeri taşır, kota açılınca uyarı kalkar
- tests/e2e/fagent-yazma-e2e.mjs: uyarı metni Panel/Veri Yedeği'ni söyler; beforeunload yalnız kaydedilmemiş değişiklik varken istenir
- tests/e2e/fagent-yazma-e2e.mjs 5d/5e: korumalı portföy için IndexedDB kopyası aynı kalır (koruma kapatılınca bu kontrol KIRMIZI verir), kota açılıp portföye yazılınca IndexedDB yeni değerle eşitlenir
- tests/unit/depolama.test.ts: DÜŞÜK-A neden bazlı koruma; DÜŞÜK-C bindUnsavedGuard hemen eşitler

**Not:** Kota gerçek doldurularak değil, setItem'in QuotaExceededError fırlatması taklit edilerek sınandı. Uyarı kutusu ekrandaki en üst satırdır; yeri, görünümü ve 'Veri Yedeği' kartının yalnız Panel sekmesinde olması tasarım kararıdır (uyarı her sekmede çıkar, kart yalnız Panel'de). Vergi, hedef, ajan belleği ve öğretilen bilgi katmanlarının kota davranışı birim testte yalnız yazmaDurumu üzerinden sınandı (bu modüller node altında içe aktarılamıyor: uzantısız içe aktarma). Ayna korumasının (mirror.ts) IndexedDB tarafı birim testte yok; e2e yalnız kopyanın değişmediğini doğrular.

### A8 · İki sekme aynı anda

**Durum:** YAPILDI · **Yol haritası:** YH-1

Kullanıcı iki sekme açarsa iki oyuncu aynı tahtaya oynar. Sekmeler artık birbirini izler: bir sekme beş katmandan birini değiştirince diğeri window 'storage' olayıyla bunu duyar ve kendi belleğini diskten yeniden yükler; böylece eski bellek diskteki yeni veriyi ezmez. Olay gecikirse bile yazım anında disk bellekle karşılaştırılır; farklıysa ezilecek sürüm önce kurtarma alanına alınır ve kullanıcıya söylenir. Kaydedilmemiş (kota nedeniyle bekleyen) değeri olan sekme çakışmayı sessizce ezmez: bekleyen değeri korur, öteki sekmenin değerini kurtarma alanına alır; alamazsa kendi değerini diskteki öteki değerin üstüne yazmaz. Bir sekme SIFIRLA/çıkış yaparsa silme kazanır (yalnız öteki sekmede değer gerçekten boşaldıysa): öteki sekme boşalır, kaydedilmemiş değeri de atılır, silme bitene dek ayna yazıcısı durur ve kullanıcıya söylenir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Silme işareti varken başka sekmenin yazıcısı kurtarma kaydı oluşturuyor mu | Oluşturmaz; araya girerse alınan kayıt geri silinir. Başka sekmenin değerini korumak için yapılan kopya da (preserveForeignValue) silme işaretinde çalışmaz ve tek kuyrukta sırayla işlenir. | - |
| Başka sekme bir katmanı değiştirdi (storage olayı, handleTabEvent) | Portföy için bellek diskten yeniden yüklenir (reloadPortfolioFromDisk), ekran yenilenmeden güncellenir; sonraki işlem diskteki yeni veriyi ezmez. Vergi, hedef, ajan belleği ve öğretilen bilgi diskten her okumada okunur; ekrandaki durumları tazeleyen bir sayaç (useLayerEpoch) artar. key=null (başka sekme localStorage.clear yaptı) tüm katmanları kapsar. Yedeklenen katmanlar dışındaki anahtarlar yok sayılır. | Olay işlenirken hata olursa yutulur (uygulama bozulmaz); bellek eski kalır, sonraki olay, yazım anı karşılaştırması ya da yenileme düzeltir. |
| Olay gecikmesi: yazım anında disk, bellekle karşılaştırılır (store.ts commit, lastRaw) | Disk bellekle uyumluysa yazım olduğu gibi yapılır. | Disk başka bir sürümdeyse yazımdan ÖNCE o sürüm kurtarma alanına alınır (geri kovası) ve #kayit-uyarisi kartına 'üzerine yazıldı; önceki sürüm ... kopyalandı / kopyalanamadı' cümlesi eklenir; işlem yine uygulanır. Disk gerçekten BOŞALMIŞSA (anahtar yok ya da boş portföy durumu: onboarded=false, varlık ve işlem yok) ve son bilinen değer doluydu, bu başka sekmede SIFIRLA/çıkış sayılır (silme işareti olmasa da): işlem YAZILMAZ (silme kazanır), bekleyen değer atılır, bellek diskten yüklenir ve 'başka sekmede veriler silindi' bildirimi çıkar. |
| Bu sekmede kaydedilmemiş (A7 bekleyen) değer varken başka sekme aynı anahtarı değiştirdi | - | ÇAKIŞMA: bekleyen değer ezilmez, diskten yükleme yapılmaz; öteki sekmenin yeni değeri IndexedDB kurtarma alanına alınır. Alma sonuçlanana kadar ve alınamazsa bu anahtar için yazım BEKLETİLİR (bekleyen değer diskteki öteki değerin üstüne yazılmaz; uyarı sürer). Bekletmede her yeni yazım denemesinde kopya YENİDEN denenir; başarılıysa bekletme kalkar ve en güncel değer yazılır. IndexedDB hiç yoksa (ya da sürekli hata verirse) kopya hiç alınamaz: bekletme sürer, değişiklik yalnız açık sayfada ve yedek dosyasında durur, sayfa yenilenirse kaybolur. Başarılıysa kart 'Diğer sekmenin sürümü bu tarayıcıdaki kurtarma alanına kopyalandı; bu sekmedeki değişiklik açık sayfada duruyor ve yedek dosyasına giriyor' der; başarısızsa 'kopyalanamadığı için bu sekmedeki değişiklik diske yazılmıyor' der. Yedek dosyası bekleyen değeri taşır. Bekleyen çözülünce çakışma kalkar. |
| Başka sekmede SIFIRLA/çıkış (anahtarın silinmesi ya da boş portföy durumu; silme işareti) | SİLME KAZANIR YALNIZ değer gerçekten boşsa (newValue=null, boş portföy durumu ya da clear()): bu sekmenin belleği diskten (boş) yüklenir, kaydedilmemiş (bekleyen) değeri de atılır (diske ve aynaya geri yazılmaz, yedeğe sızmaz); kart 'Başka bir sekmede veriler silindi; bu sekmedeki kaydedilmemiş değişiklik de silindi.' der. Silme işareti (fagent.mirror.cleared.v1, değer Date.now() damgası) yalnız 30 sn (SIFIRLA_ISARETI_OMRU_MS, src/config/varsayilanlar.ts; ölçülmedi, varsayım) etkin sayılır; etkinken bu sekmenin ayna yazıcısı durur, işaret kalkınca ya da süre dolunca (zamanlayıcı) sürer; bu sekmenin kendi silmesi sürüyorsa kendisi sürdürür. | Silme işareti takılırsa (IndexedDB silmesi hata aldı): işaret süre dolunca etkisizdir; başka sekmenin sıradan (dolu) yazımı silme sayılmaz, bekleyen değer atılmaz, ayna yazıcısı sürer, kullanıcının işlemi yazılır, yanlış 'veriler silindi' bildirimi çıkmaz. Eski biçimli (damga olmayan) işaret etkin sayılmaz. Açılıştaki temizlik (bootMirror) işaret yaşına bakmaksızın her açılışta silmeyi yeniden dener; takılı işaret bu sayede sonunda kalkar. Bu sekmenin KENDİ silmesi hata alırsa o sekmenin yazıcısı oturum boyunca kapalı kalır (değişmedi). |

**Kod:**
- `src/sekmeSenkron.ts:handleTabEvent, installTabSync, useLayerEpoch, createForeignPreserver, createForeignResetGate`
- `src/store.ts:reloadPortfolioFromDisk, commit (lastRaw, setDivergenceSink)`
- `src/yazmaDurumu.ts:markTabConflict, resolveTabConflict, discardPendingBySiblingReset, markTabOverwrite, getTabNotice, writeLocal (hold)`
- `src/mirror.ts:pauseMirrorForForeignReset, resumeMirrorAfterForeignReset, preserveForeignValue`
- `src/main.tsx (installTabSync ve setDivergenceSink bağlantısı)`
- `src/App.tsx (#kayit-uyarisi ek cümle; ekrandaki durumların diskten tazelenmesi)`
- `src/storage/mirror.ts:runResetClear`
- `src/storage/mirror.ts:clearMirror (ikinci tur temizlik)`
- `src/storage/mirror.ts:resetMarkerActive, isEmptyPortfolioRaw, isEmptyLayerValue`
- `src/config/varsayilanlar.ts:SIFIRLA_ISARETI_OMRU_MS`
- `src/backup.ts:setAfterApplyHook (geri yükleme/bulut çekme sonrası bellek tazeleme; src/main.tsx bağlar)`
- `src/yazmaDurumu.ts:setHoldRetry (bekletmede kopya yeniden denemesi)`

**Bozulursa:** Kaydedilmemiş değeri olan sekmede çakışma sürerken öteki sekmenin sürümü kurtarma alanına alınamazsa bu sekmenin değişikliği diske yazılmaz; yalnız açık sayfada ve yedekte durur, sayfa yenilenirse kaybolur (uyarı ve beforeunload onayı bunu bildirir). İki sekmede aynı katmanda iki ayrı kaydedilmemiş değer varsa sekmeler birbirinden habersiz kalır. Çakışmada kopya başarılıysa bekleyen değerin sonraki başarılı yazımı diskteki öteki değerin üstüne yazar (öteki değer kurtarma alanında kalır). Başka sekmede SIFIRLA yapıldığında bu sekmenin kaydedilmemiş değişikliği kasıtlı olarak atılır (silme kazanır). Takılı silme işareti 30 sn sonra etkisiz sayılır; bu pencerede başka sekmenin dolu yazımı da yazıcıyı durdurabilir (en çok 30 sn). Disk boşaldığında bekleyen değer atıldığı için kullanıcı, başka sekmedeki SIFIRLA'dan önce yaptığı kaydedilmemiş değişikliği kaybeder (kasıtlı; kartta söylenir).

**Test:**
- tests/unit/depolama.test.ts: O-B: başka sekmenin yazıcısı SIFIRLA ile yarışırsa (silme işareti var) kurtarma kaydı oluşmaz / geri silinir
- tests/unit/depolama.test.ts: O-B: clearMirror ikinci tur
- tests/unit/sekme-kurtarma.test.ts: A8: başka sekme portföyü değiştirince bellek diskten yüklenir; sonraki işlem o kaydı ezmez (kontrol grubu: işleyici yokken ezilir)
- tests/unit/sekme-kurtarma.test.ts: A8: diğer katman sayacı, ilgisiz anahtar, key=null
- tests/unit/sekme-kurtarma.test.ts: A8: kaydedilmemiş değer varken çakışma (ezilmez, yüklenmez, yedekte kalır, kopya başarılıysa 'kopyalandı' metni, çözülünce kalkar)
- tests/unit/sekme-kurtarma.test.ts: UYUM: kopya alınamadıysa bekleyen değer diskteki sürümün üstüne yazılmaz, kota açılsa bile (kırmızı/yeşil kanıtlı)
- tests/unit/sekme-kurtarma.test.ts: A8: başka sekmede SIFIRLA — yazıcı durdurulur, bellek boşalır, eski veri geri yazılmaz, işaret kalkınca yazıcı sürer
- tests/unit/sekme-kurtarma.test.ts: O1 silme kazanır (bekleyen atılır, bildirim, yedeğe sızmaz; işaret olayı sonra gelirse; vergi katmanı; newValue=null) (kırmızı/yeşil kanıtlı)
- tests/unit/sekme-kurtarma.test.ts: O3 olay gecikmesi — ezilen sürüm sink'e verilir; fark + SIFIRLA işareti varken yazılmaz (kırmızı/yeşil kanıtlı)
- tests/unit/sekme-kurtarma.test.ts: D5 createForeignPreserver (işarette çalışmaz, tek kuyruk, yarışta geri silinir); D6 createForeignResetGate (kendi silmesi sürerken sürdürmez)
- tests/e2e/fagent-sekme-e2e.mjs (gerçek Chromium, aynı bağlamda iki sayfa): A kayıt ekler B yenilemeden görür; B'nin kaydı A'nınkini ezmez; A'da SIFIRLA B diski yeniden doldurmaz; kaydedilmemiş değer çakışması kartta ve kopya geri kovasında; O1: B'de bekleyen + A'da SIFIRLA -> bildirim, B'nin sonraki yazımı eski veriyi geri getirmez, IndexedDB'de de yok; O3: olay gecikmesi taklidi -> ezilen sürüm kurtarma alanında + kart (O1 ve O3 korumaları kapatılınca ilgili kontroller KIRMIZI, açılınca yeşil)
- tests/unit/sekme-kurtarma.test.ts: O-a: resetMarkerActive süre sınırı ve eski biçim; takılı işaret + sıradan yabancı yazım (bekleyen atılmaz, yanlış bildirim yok); taze işaret + dolu yazım silme sayılmaz; takılı işaretle kullanıcı işlemi yazılır; yazıcı kapısı zamanlayıcısı (kırmızı/yeşil kanıtlı)
- tests/unit/sekme-kurtarma.test.ts: D-a restoreBackup sonrası kanca bellek tazeler, kendi yazımız yabancı sanılmaz (kancasız yanlış alarm = kontrol grubu); D-c bekletmede yeniden deneme; D-d boş disk = silme (kırmızı/yeşil kanıtlı)
- tests/e2e/fagent-sekme-e2e.mjs 8: takılı (süresi geçmiş) işaretle sıradan yabancı yazım -> çakışma bildirimi, yanlış 'veriler silindi' yok, G'nin yazımı diskte ve IndexedDB'de, kullanıcının kendi işlemi yazılır (süre sınırı kapatılınca kontrol KIRMIZI)

**Not:** Gerçek iki sayfalı Chromium ile sınandı (storage olayı gerçek); kota yalnız çakışma/O1 senaryolarında setItem hatası taklidiyle; olay gecikmesi (O3) aynı belgede doğrudan setItem ile taklit edildi. Birim testte olay sahte nesneyle verilir. Kopya ALINAMAMA (IndexedDB yok/hata) yolu yalnız birim testte (sahte preserveForeign=false); gerçek tarayıcıda hata enjekte edilmedi. Bu değişiklik CLAUDE.md zorunlu listesindeki #35'in YALNIZ 'başka sekmede çıkış/SIFIRLA sonrası bu sekmenin bellekten diski yeniden doldurması' yanını kapatır; 'hesaba yüklenmemiş tek yerel kopyanın çıkışla silinmesi' (cloud.ts karantina önerisi) AÇIK kalır. Silme-kazanır kararı ürün varsayılanıdır (kullanıcıya bildirildi).
### A9 · Hesap motoru: projeksiyon (src/projection.ts)

**Durum:** KISMEN · **Yol haritası:** YH-2 · **PDF ekranı:** Projeksiyon; brüt→net→reel

Motor saf bir hesap makinesidir: içine sayı girer, sayı çıkar; ağ, React, localStorage yoktur. Girdiler sınırlanır (yıl en çok 100, oran -%99 ile %1000 arası, sonsuz ve NaN sonlu hale getirilir), çıktının her sayısı bir etiket taşır: resmi, varsayim ya da kullanici. Türetilmiş sayının etiketi girdilerinin en zayıfıdır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Girdi sınırlama (yilSinirla, oranSinirla) | Sonlu sonuç, döngü en çok 100 yılda biter. | Infinity/NaN/1e9 yıl gibi girdiler sınır değerine çekilir, NaN üretilmez. |
| Etiket birleştirme (birlestirKaynak) | Biri varsayim ise sonuç varsayim; yoksa biri kullanici ise kullanici; hepsi resmi ise resmi. | - |
| Stopaj: doğrulanmamış varlık türü | Oran 0 ve dogrulanmadi=true işareti. | - |
| Eşdeğerlik | sonDeger, reelDeger, projeksiyonYollari eski satır içi formülle Object.is düzeyinde aynı sonucu verir. | Test kırmızı olur. |
| Hedefe ulaşma süresi | Ay sayısı döner. | Ulaşılamıyorsa null; sonsuz döngü yok. |

**Kod:**
- `src/projection.ts:yilSinirla`
- `src/projection.ts:oranSinirla`
- `src/projection.ts:birlestirKaynak`
- `src/projection.ts:senaryoSonucu`
- `src/projection.ts:stopajSonrasiDeger`
- `src/projection.ts:hedefeUlasmaSuresi`
- `src/projection.ts:getiriEnflasyonTablosu`
- `src/projection.ts:siraRiski`

**Bozulursa:** Motor bozulursa ekrandaki projeksiyon sayıları yanlış olur ama veri bozulmaz. Eşdeğerlik testi bunu önceden yakalar.

**Test:**
- tests/unit/projeksiyon.test.ts: eşdeğerlik: sonDeger + reelDeger eski hesapla BİREBİR (Object.is) aynı
- tests/unit/projeksiyon.test.ts: sınır: Infinity/NaN/1e9 yıl -> sonlu sonuç, döngü 100 yılda biter
- tests/unit/projeksiyon.test.ts: stopajSonrasiDeger: karışım ağırlıklı oran; doğrulanmamış tür işaretlenir
- tests/e2e/fagent-projection-e2e.mjs

**Not:** Ekrana yalnız sonDeger, reelDeger, projeksiyonYollari bağlı. senaryoSonucu, stopajSonrasiDeger, turAgirliklari, hedefeUlasmaSuresi, getiriEnflasyonTablosu, siraRiski, birlestirKaynak, enflasyonEtiketi henüz ekrana bağlı değil (PDF tasarımındaki ilgili ekrana bağlama bekliyor). Aşama B (Monte Carlo) için ayrı onay gerekiyor.

### A10 · Varsayımlar ve vergi oranları: koda gömülü sabit yok kuralı

**Durum:** KISMEN · **Yol haritası:** YH-2 · **PDF ekranı:** brüt→net→reel; Projeksiyon

Oranlar (enflasyon varsayımı, stopaj, eşikler, zaman aşımları) tek bir dosyada toplanır ve yanında kaynağı yazar. Doğrulanamayan oran uydurulmaz: stopaj tablosunda kripto, altın, döviz, tahvil, BES, gayrimenkul için 0 yazar ve 'doğrulanmadı' etiketi taşır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Sabit tek yerde mi (src/config/varsayilanlar.ts) | analytics.ts, inflation.ts gibi modüller oradan içe aktarır. | Gömülü sabit kalırsa belge-kod-tutarlılığı grep'i yakalar (eski değeri src ve tests'te ara). |
| Doğrulanmamış tür (UNVERIFIED_TAX) | Ekranda varsayım olarak etiketlenir. | - |
| Enflasyon kaynağı etiketi | 'TCMB EVDS · dönem', 'senin girdiğin oran' ya da 'varsayım (... doğrulanmadı)' yazar. | - |

**Kod:**
- `src/config/varsayilanlar.ts:DEFAULT_TAX_RATES`
- `src/config/varsayilanlar.ts:UNVERIFIED_TAX`
- `src/config/varsayilanlar.ts:VARSAYILAN_ENFLASYON_PCT`
- `src/inflation.ts:inflationSourceLabel`

**Bozulursa:** Yanlış oran kullanıcıya yanlış net getiri gösterir. Bu yüzden her oran muhasebe doğrulaması bekleyen varsayım olarak etiketlidir; veri bozulmaz.

**Test:**
- tests/unit/hesap.test.ts: varsayılanlar: değerler taşıma öncesiyle aynı
- tests/unit/hesap.test.ts: afterTaxOf: fon kazancı %17,5 stopajla net; zararda stopaj 0
- tests/e2e/fagent-vergi-e2e.mjs

**Not:** Oranlar yapılandırma dosyasında (TypeScript), tarih aralıklı JSON değil; tarih aralıklı tax_rules.json (spec P6) yapılmadı. Fon stopajı %17,5 ve enflasyon varsayımı %30 birincil kaynakla doğrulanmadı (TODO(muhasebe)).

### A11 · Ajan ve içgörü metni: kural tabanlı, yasak kalıplı

**Durum:** YAPILDI · **PDF ekranı:** PDF tasarımında ayrı bir ajan paneli doğrulanmadı; içgörü satırlarının yeri tasarımda belirlenecek

Ajan sekmesi bir yapay zekâ değildir; kural kitabı olan bir oyun yöneticisidir. Kullanıcının cümlesi önce foldTr ile sadeleştirilir (küçük harf, ı->i, ş->s, ğ->g, ü->u, ö->o, ç->c), sonra ASCII yazılmış kalıplarla eşleştirilir. 'Hangisini almalıyım' türü tavsiye soruları her zaman en önce yakalanır ve reddedilir; kullanıcının öğrettiği bilgi bile bu reddi gölgeleyemez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Tavsiye kuralı (id: tavsiye) foldTr(girdi) üzerinde | Ajan nazikçe reddeder ve yapabildiklerini sıralar. | Kalıp tutmazsa normal kurallara düşer (bu yüzden kalıplar geniş tutulur, ReDoS'a kapalı sınırlı niceleyicilerle). |
| Metin dili: yasak kalıplar (gerekir, malısın, melisin, öneri, sayılır, kesin; tavsiye yalnız 'tavsiye değildir/veremem') | Çıktı betimleyici kalır. | e2e kontrolü kırmızı olur. |
| Girdi varyantları (İ, I, ı, i) | foldTr hepsini aynı biçime indirir. | - |
| Saflık: agent.ts ve analytics.ts | I/O, React, window yok; veri parametreyle girer. | AGENTS.md §0.6 ihlali; incelemede yakalanır. |

**Kod:**
- `src/agent.ts:foldTr`
- `src/agent.ts:chatReply`
- `src/agent.ts:analyzePortfolio`
- `src/agent.ts:proactiveInsights`
- `src/agent.ts (CHAT_RULES id: tavsiye)`

**Bozulursa:** Kalıp kaçarsa ajan tavsiye gibi okunabilecek bir cümle kurabilir: bu SPK sınırı açısından en hassas yerdir. Yasak kalıp e2e testleri bunu yakalar; avukat görüşü ayrıca bekleniyor.

**Test:**
- tests/e2e/fagent-analytics-e2e.mjs: HHI dalı: tavsiye/kesinlik dili yok
- tests/e2e/fagent-parser-e2e.mjs: Ret metni yasaklı kelime içermiyor
- tests/e2e/fagent-insight-e2e.mjs
- tests/e2e/fagent-teach-e2e.mjs

### A12 · İşlem komutu: 'deftere kayıt' dili ve onay

**Durum:** YAPILDI · **PDF ekranı:** PDF tasarımında ayrı bir ajan paneli doğrulanmadı; işlem girişi Hisseler/Fonlar/Kripto ekranlarındaki kayıtla aynı defteri besler

Kullanıcı ajana 'THYAO'dan 500 TL sat' yazabilir. Ajan bunu aracı kuruma emir olarak göndermez; yalnızca 'deftere kayıt' olarak ele alır, kullanıcıya onay sorar ('... kaydı ekleyeyim mi? Yalnızca defterine yazılır.'), onay gelirse store.actions üzerinden yerel defteri günceller. Gerçek işlem yürütme, bakiye çekme, ödeme yoktur.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Komut ayrıştırma (tutar, varlık, yön) | Bekleyen bir kayıt önerisi oluşur ve onay istenir. | Anlaşılamayan komut için 'anlayamadım' tipi bir yanıt; defter değişmez. |
| Kullanıcı onayı | Kayıt eklenir (holdingId ile). | İptal ifadesiyle ('vazgeç' vb.) 'Kayıt eklenmedi; defterin değişmedi.' |
| Emir kipi ve tavsiye dili | - | Ret metninde 'emir gönderildi', 'uygula', 'işlendi' gibi sözcükler yasak; test kırılır. |

**Kod:**
- `src/agent.ts:chatReply (pendingAction; 'kaydı ekleyeyim mi')`
- `src/store.ts:actions.addTxn`

**Bozulursa:** Yanlış ayrıştırma yanlış tutarda defter kaydı açabilir; kayıt onaydan sonra düşer ve işlem geçmişinden görülebilir. Gerçek para hareketi yoktur.

**Test:**
- tests/e2e/fagent-parser-e2e.mjs
- tests/e2e/fagent-action-e2e.mjs
- tests/e2e/fagent-cryptodemo-e2e.mjs

### A13 · Yedek alma

**Durum:** YAPILDI · **Yol haritası:** YH-1 · **PDF ekranı:** Gizlilik kartları (veri tarayıcıda kalır); yedek düğmesinin yeri tasarımda belirlenecek

Kullanıcı 'yedek al' der; sistem BACKED_UP_KEYS listesindeki beş katmanı (portföy, ajan belleği, öğretilen bilgi, vergi, hedef dağılım) tek bir JSON dosyasına koyar. Önbellekler, yedek meta verisi, bulut sahiplik işareti ve kurtarma kayıtları bilerek dışarıda kalır. Dosya kullanıcının bilgisayarına iner; sunucuya gitmez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Yalnız BACKED_UP_KEYS anahtarları | Dosya beş katmanı içerir. | Önbellek anahtarı yedekte görünürse e2e kırmızı olur. |
| Hatırlatma (shouldNudge) | Portföy doluysa ve 14 günden eskiyse ana ekranda tek satır, 'Sonra' ile ertelenir. | Portföy boşken hiç hatırlatılmaz. |

**Kod:**
- `src/backup.ts:BACKED_UP_KEYS`
- `src/backup.ts:buildBackup`
- `src/backup.ts:downloadBackup`
- `src/backup.ts:shouldNudge`

**Bozulursa:** Yedek eksik kalırsa kullanıcı geri yüklemede bir katmanı bulamaz. Yeni katman eklenip BACKED_UP_KEYS'e yazılmazsa o katman yedeğe, SIFIRLA'ya ve buluta girmez: AGENTS.md bu yüzden üç yere birden yazmayı şart koşar.

**Test:**
- tests/e2e/fagent-yedek-e2e.mjs: Portföy katmanı yedekte / Öğretilen bilgi katmanı yedekte / Yeniden üretilebilir önbellek yedeğe girmedi

### A14 · Yedek geri yükleme ve ya-hep-ya-hiç (#41)

**Durum:** YAPILDI · **PDF ekranı:** Gizlilik kartları; geri yükleme düğmesinin yeri tasarımda belirlenecek

Geri yükleme güvenilmeyen girdi sayılır: dosya dışarıdan gelebilir. Önce dosya boyutu (yaklaşık 10 MB) ve sürümü/biçimi denetlenir, sonra yalnız beyaz listedeki anahtarlar ve yalnız metin değerler alınır. Yazımdan önce mevcut beş katmanın diskteki anlık görüntüsü alınır; veride olmayan katmanlar silinir, sonra yeni değerler yazılır (silmeyi öne almak, son hali kotaya sığan bir geri yüklemenin ara adımda takılmasını önler; eski değerler bellekteki anlık görüntüde durur). Herhangi bir yazım kota nedeniyle başarısız olursa anlık görüntüye geri dönülür: önce küçülen katmanlar, sonra büyüyenler, başarısızlar ikinci turda yeniden denenir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Geçerli JSON ve fagentBackup sürümü | İlerler. | 'Dosya okunamadı' / 'Bu bir FAGENT yedek dosyası değil' mesajı; hiçbir şey yazılmaz. |
| Beyaz liste ve tür (whitelistUserData) | Yalnız BACKED_UP_KEYS ve typeof string değerler yazılacaklar listesine girer; bilinmeyen anahtar sessizce atlanır. | Yazılacak hiçbir şey yoksa 'Yedekte geri yüklenebilir bir veri bulunamadı'; hiçbir şey yazılmaz. |
| Kullanıcı onayı | Arayüz 'MEVCUT VERİLERİNİN ÜZERİNE YAZAR. Devam edilsin mi?' diye sorar. | Vazgeçilirse hiçbir şey değişmez. |
| Yazım atomik mi (applyUserData replace) | Hata olursa anlık görüntüye geri dönülür (rollback, iki tur) ve önceki veri aynen kalır; mesaj bunu söyler. Ayna bildirimi yalnız tam başarıda atılır. | Geri alma iki turda da başarısız olursa sonuç rollback 'eksik' + etkilenen anahtarlar döner; o katmanların eski değeri bellekte bekletilir (uyarı kartı çıkar, yedek eski değeri taşır, ayna o anahtara yazmaz) ve mesaj 'önceki veriler tamamen geri alınamadı' der ve yedeği Panel > Veri Yedeği kartından indirmeye yönlendirir. Sessiz yarım durum kalmaz. |
| Dosya boyutu sınırı | En çok yaklaşık 10 MB (YEDEK_DOSYA_MAX_BOYUT; bayt ya da karakter, hangisi önce aşılırsa); arayüz dosyayı okumadan önce, restoreBackup ayrıştırmadan önce denetler. | 'Dosya çok büyük' mesajı; onay penceresi bile açılmaz, hiçbir şey değişmez. |
| Geri alınamayan katman: eski değer ve 'silinmeli' işareti | Geri alma başarılıysa bekleyen yoktur. | Geri alınamayan katmanın eski değeri bekletilir; eskiden olmayan katmanın yeni değeri silinemediyse 'silinmeli' işareti konur (okuma null, yedekte yok, uyarı çıkar). İki durumda da ayna o anahtarı korur (src/mirror.ts bindUnsavedGuard). |

**Kod:**
- `src/backup.ts:restoreBackup`
- `src/backup.ts:whitelistUserData`
- `src/backup.ts:applyUserData (anlık görüntü, yazım, rollback)`
- `src/config/varsayilanlar.ts:YEDEK_DOSYA_MAX_BOYUT`
- `src/App.tsx (boyut denetimi + confirm 'Geri yükleme MEVCUT VERİLERİNİN ÜZERİNE YAZAR')`

**Bozulursa:** Kota dolarsa geri yükleme baştan sona uygulanmaz: önceki veri geri yazılır ve kullanıcı bunu mesajdan okur. Geri alma da başarısız olursa (nadir) mesaj bunu açıkça söyler; yedek dosyasının kendisi etkilenmez, tekrar denenebilir.

**Test:**
- tests/e2e/fagent-yedek-e2e.mjs
- tests/e2e/fagent-yazma-e2e.mjs: N. yazımda kota hatası -> beş katman birebir aynı; geri alma da başarısız -> açık mesaj; 10 MB üstü dosya reddedilir
- tests/unit/depolama.test.ts: ORTA-3: applyUserData replace kipinde yazım yarıda kalırsa (yazilamadi) ayna bildirimi ATILMAZ; başarılıda atılır
- tests/unit/depolama.test.ts: A14: N. yazımda kota hatası -> rollback TAMAM, önceki katmanlar aynen geri gelir
- tests/unit/depolama.test.ts: A14: rollback da başarısızsa açık durum (rollback eksik + anahtarlar)
- tests/unit/depolama.test.ts: A14: replace kipinde silme yeni değerlerden SONRA; restoreBackup boyut sınırı
- tests/unit/depolama.test.ts: ORTA-1: bayt toplamı kotasında rollback önce küçülenleri geri yazar / ikinci tur yeniden dener
- tests/unit/depolama.test.ts: ORTA-2: portfolioOnly başarısında yalnız yazılan anahtarın bekleyeni temizlenir; 'eksik' durumda eski değer bekleyende
- tests/e2e/fagent-yazma-e2e.mjs: geri alınamayan katman için uyarı, yedek eski değeri taşır, IndexedDB kopyası ezilmedi
- tests/unit/depolama.test.ts: DÜŞÜK-B 'silinmeli' işareti (uyarı, okuma null, yedekte yok)
- tests/e2e/fagent-yazma-e2e.mjs 5d: geri yüklemede geri alınamayan portföy için ayna koruması (kırmızı/yeşil kanıtlı)

**Not:** CLAUDE.md canlı-öncesi listesinde madde 41 bu değişiklikle kapanır (tablo güncellemesi koordinatörde). 'Önceki veriler aynen korundu' güvencesi YALNIZ DİSKE KAYITLI katmanları kapsar: yazma hatasıyla önceden diske yazılamamış (yalnız bellekte bekleyen) değişiklikler anlık görüntüde yoktur ve sayfa yenilenirse zaten kaybolur. Kota taklit edildi (setItem hatası; birim testte bayt toplamına göre), gerçek kota dolumu denenmedi. Yaklaşık 10 MB sınırı genel tarayıcı kotası bilgisinden (ikincil) türetildi.

### A15 · SIFIRLA ve çıkış: her şeyi silme yolu

**Durum:** YAPILDI · **Yol haritası:** YH-1 · **PDF ekranı:** Gizlilik kartları; SIFIRLA düğmesinin yeri tasarımda belirlenecek

SIFIRLA bütün oyunu başa sarar. Sırayla: portföy boş duruma, ajan belleği, öğretilen bilgi, vergi, hedef, yedek meta verisi, girilen enflasyon, eski anahtarlar, bulut sahiplik işareti, kurtarma kayıtları silinir; son olarak IndexedDB aynası silinir. Ayna silinmezse açılışta veri geri gelirdi; bu yüzden önce localStorage'a senkron bir 'silme işareti' konur. Sayfa silme bitmeden yenilenirse açılış işareti görür ve aynayı siler, geri yüklemez. Çıkış (hesaptan) buna ek olarak fiyat ve piyasa önbelleğini ve portföy anahtarını da siler.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Kullanıcı onayı | 'Tüm veriler silinsin ve başa dönülsün mü?' onayıyla devam eder. | Vazgeçilirse hiçbir şey silinmez. |
| Silme işareti önce yazılıyor | Yarım kalan silmede bile geri yükleme olmaz. | IndexedDB silmesi hata verirse işaret kalır ve ayna o oturumda yazmaz. |
| Kurtarma kayıtları (fagent.recovery.*) da siliniyor | Silinen veri kurtarma rafında kalmaz. | - |
| Çıkışta kullanıcı katmanları ve önbellekler | clearForSignOut hepsini temizler. | Bulut çakışması varsa keepLocalData ile yerel kopya korunabilir (cloud.ts signOut). |

**Kod:**
- `src/localData.ts:clearLocalUserData`
- `src/localData.ts:clearForSignOut`
- `src/mirror.ts:clearMirrorForReset`
- `src/storage/mirror.ts:runResetClear`
- `src/App.tsx:resetAll`
- `src/recovery.ts:clearRecoveryKeys`

**Bozulursa:** Silme yarım kalırsa en kötü durum eski veri geri gelmesidir; bunu işaret engeller. Yanlışlıkla SIFIRLA'ya basan kullanıcının veriyi geri alma yolu yalnız önceden aldığı yedektir.

**Test:**
- tests/e2e/fagent-depolama-e2e.mjs: SIFIRLA sonrası onboarding döndü; yenileyince veri GERİ GELMEZ
- tests/unit/depolama.test.ts: silme işareti: silme başarısızsa işaret KALIR (sonraki açılış tekrar dener) ve geri yükleme yapılmaz
- tests/unit/depolama.test.ts: O-B: KOŞAN iş sırasında SIFIRLA -> silinen veri kurtarma kaydında KALMAZ

**Not:** Girişliyken SIFIRLA'nın buluttaki kopyayı sormadan ezmesi ayrı bir açık madde (34+33, bkz. A17).

### A16 · Hesap ve bulut: isteğe bağlı, canlıda kapalı

**Durum:** KISMEN · **Yol haritası:** YH-6 öncesi (ayrı karar) · **PDF ekranı:** Abonelik planları ve hesap ekranı (hesap canlıda kapalı)

Supabase hesabı oyunun isteğe bağlı bir bölümüdür. Derleme sırasında VITE_SUPABASE_URL ve publishable key yoksa bulut kodu hiç çalışmaz (cloudEnabled=false); varsayılan akış tamamen yereldir. Env tanımlıysa kullanıcı kayıt olur, aynı beş katman kendi satırına (RLS korumalı) yazılır. Derleme sırasında sb_secret_ ya da service_role içeren bir değer varsa derleme durur.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Env tanımlı mı ve adres geçerli mi (cloudEnabled) | Bulut kodu etkinleşir. | Hesap ekranı görünmez, hiçbir ağ isteği gitmez. |
| Derleme: gizli Supabase anahtarı (scripts/build.mjs) | Derleme sürer. | 'DERLEME DURDURULDU' hatası. |
| Gönderilen veri beyaz listede mi, boyut sınırında mı (MAX_SYNC_CHARS 1.500.000) | Satır yazılır. | Durum 'hata', 'Veri, hesap senkronu için çok büyük; buluta kaydedilmedi.' |
| Onboarding tamam mı (portfolioOnboarded) | Yazılır. | Boş durum buluta yazılmaz. |
| Satır sahibi | RLS: yalnız kendi user_id satırı. | Gerçek Supabase'de RLS doğrulanmadı (yalnız sahte Supabase ile yeşil). |

**Kod:**
- `src/cloud.ts:cloudEnabled`
- `src/cloud.ts:save`
- `src/cloud.ts:MAX_SYNC_CHARS`
- `src/cloud.ts:deleteAccount`
- `scripts/build.mjs (sb_secret_/service_role denetimi)`
- `supabase/migrations/20261018000000_portfolios_and_account_deletion.sql`

**Bozulursa:** Bulut kapalıyken etkisi yok. Açıkken kayıt başarısız olursa yerel kopya durur, durum 'hata' görünür.

**Test:**
- tests/e2e/fagent-auth-e2e.mjs (ayrı dist-e2e-cloud derlemesi, port 4201, SAHTE Supabase ile yeşil)
- tests/run-e2e.mjs (dist/ içinde Supabase adresi yok doğrulaması)

**Not:** Kod tam; canlıya açılması canlı-öncesi zorunlu listeye bağlı (A17). RLS, delete_my_account, e-posta yönlendirmeleri, PASSWORD_RECOVERY gerçek projede doğrulanmadı. Kullanıcı kararı (2026-10-27): kod repoda açık kalır, silinmez, sert kilitlenmez.

### A17 · Bulut: canlı öncesi zorunlu açık maddeler (34+33, 35, 41, 27)

**Durum:** PLANLI · **PDF ekranı:** Abonelik planları ve hesap ekranı (hesap canlıda kapalı)

Bulut oyunu canlıya çıkmadan önce kapanması gereken dört kapı vardır. Bunlar kapanana kadar canlıda VITE_SUPABASE_* tanımlanmaz. Kullanıcı kararıyla (2026-10-24) bu maddeler şimdilik YAPILMAZ; önce çakışma çözümü ve çoklu cihaz örnekleri araştırılacak.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| 34+33: girişliyken SIFIRLA + yeniden kurulum | - | Buluttaki kopyayı sormadan ezer; onay metni yanıltıcı (kayıt kaynaklı, bu oturumda yeniden doğrulanmadı). |
| 35: başka sekmeden çıkış | - | Hesaba yüklenmemiş tek yerel kopyayı silebilir (kayıt kaynaklı). |
| 41: geri yükleme yazımı ya-hep-ya-hiç, dosya boyutu sınırı | KAPANDI: anlık görüntü + rollback ve 10 MB sınırı kodda ve testte (bkz. A14). | - |
| 27: koşulsuz upsert | - | cloud.ts save() koşulsuz upsert yapıyor (kodda doğrulandı): iki cihazda son yazan kazanır. |

**Kod:**
- `src/cloud.ts:save (upsert)`
- `src/cloud.ts:resolveConflict`
- `src/cloud.ts:signOut`
- `src/backup.ts:applyUserData`

**Bozulursa:** Canlıda açılsaydı iki cihazlı kullanıcı veri kaybedebilirdi. Bu yüzden hesap özelliği kapalı tutulur.

**Test:**
- tests/e2e/fagent-auth-e2e.mjs (mevcut davranışı sahte Supabase ile korur; açık maddeleri kapatan test yok)

**Not:** 34+33, 35 satırları CLAUDE.md tablosundan alındı; bu belge için kod yeniden incelenmedi, 27 ve 41 kodda görüldü.

## B) Veri kaynakları işletimi

Dışarıdan gelen her sayı bir kapıdan geçer: sunucu geçiş fonksiyonu (anahtar yalnız orada), istemci çalıştırıcısı (zaman aşımı, yeniden deneme, devre kesici, önbellek) ve mantık denetimi. Kaynak çökerse yalnız o kaynağın bölümü etkilenir; uydurma sayı gösterilmez. Bugün canlı olan: kur (Frankfurter) ve kripto (CoinGecko). Hazır ama anahtarsız kapalı: TCMB/EVDS. Planlı: KAP, BİST, paylaşılan önbellek.


### B1 · Enflasyon çekimi: tarayıcıdan EVDS'ye giden yol

**Durum:** YAPILDI · **Yol haritası:** YH-3 · **PDF ekranı:** brüt→net→reel (enflasyon girdisi); Projeksiyon

Sayfa açılınca loadLiveInflation bir kez çalışır: evds.ts ince sarmalayıcıdır, asıl iş src/kaynaklar/tcmb.ts içinde. İstek /api/evds?series=TP.FG.J0 adresine gider; yalnız seri kodu taşır, tarih bile taşımaz (aralığı sunucu kurar), portföy, tutar, sembol listesi taşımaz. Önce önbelleğe bakılır (12 saat); geçerliyse ağa gidilmez. Yanıttan yıllık değişim, 13 aylık endeksten hesaplanır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Önbellek geçerli mi (TTL 12 saat, TCMB_TUFE_TTL_MS) | Ağa gidilmez, durum 'guncel'. | Kaynağa gidilir. |
| Yıllık TÜFE hesaplanabildi mi (tufeAyristir) | Dönem son satırdan alınır. | Eksik seri / sıfır taban -> 'okunamadi'. |
| Akla yatkınlık: -%50 ile +%500 arası (TUFE_MANTIK_ARALIK_PCT) | Değer kabul edilir. | 'mantik_disi'; değer atılır, durum 'veri_yok'. |
| Kullanıcı kendi oranını girdiyse | - | Canlı okuma kullanıcı girdisinin üstüne yazmaz. |
| Eski önbellek biçimi (fagent.evds.v1) | Yeni anahtara kopyalanır, eski anahtar yalnız başarılı kopyadan sonra silinir. | Tanınmayan kayıt dokunulmadan kalır. |

**Kod:**
- `src/inflation.ts:loadLiveInflation`
- `src/evds.ts:fetchInflationPct`
- `src/kaynaklar/tcmb.ts:tufeOku`
- `src/kaynaklar/tcmb.ts:tufeAyristir`
- `src/kaynaklar/tcmb.ts:eskiTufeOnbelleginiTasi`
- `src/kaynaklar/onbellek.ts:onbellekOku`

**Bozulursa:** Okuma başarısızsa enflasyon varsayımı (%30, etiketli) kalır; kullanıcıya hata gösterilmez. Yanlış sayı gösterilmez, çünkü akla yatkınlık denetimi sayıyı atar.

**Test:**
- tests/unit/kaynaklar.test.ts: tufeAyristir: endeksten yıllık değişim (1000 -> 1450 = %45,0)
- tests/unit/kaynaklar.test.ts: tufeOku: istek yalnız seri taşır (tarih, portföy, sembol yok)
- tests/unit/kaynaklar.test.ts: tufeOku: akıl dışı / eksik yanıt -> veri_yok
- tests/unit/kaynaklar.test.ts: göç: eski fagent.evds.v1 yeni biçime taşınır
- tests/e2e/fagent-evds-e2e.mjs (page.route taklidi)

**Not:** Kod ve testler tamam (commit 0a8a9bb). Gerçek EVDS yanıtıyla DOĞRULANMADI: anahtar Vercel'de yok, TP.FG.J0 seri kodu gerçek veriyle teyit edilmedi (TODO(muhasebe)). Bu ortamdan EVDS'e erişim yok.

### B2 · İstemci çalıştırıcı: zaman aşımı, yeniden deneme, devre kesici

**Durum:** YAPILDI · **Yol haritası:** YH-3 · **PDF ekranı:** brüt→net→reel; Projeksiyon

Her kaynak aynı çalıştırıcıdan geçer. Bir istek en çok 5 saniye bekler. Geçici hatada (ağ, zaman aşımı, 5xx) bir kez, 1 saniye sonra yeniden denenir. Denemeler tükenirse kaynak 15 dakika denenmez (devre kesici). Yapılandırma hataları (anahtar yok, seri tanımsız) yeniden denenmez ve devreyi açmaz: bunlar arıza değil, durumdur. En kötü bekleme yaklaşık 11 saniyedir (5 + 1 + 5).

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Zaman aşımı 5000 ms (KAYNAK_ZAMAN_ASIMI_MS) | Yanıt işlenir. | AbortController iptal eder, 'zaman_asimi', yeniden denenir. |
| Yeniden deneme: en çok 1, 1000 ms bekleme | İkinci denemede başarı olursa devre açılmaz. | Tükenince devre kesici 15 dk açılır. |
| Yukarı akış 4xx (kaynak_reddetti) | - | Yeniden deneme ve devre kesici YOK. |
| Başarısızlıkta son bilinen değer | Önbellekte kayıt varsa SİLİNMEDEN 'eski' durumuyla tarihiyle verilir. | Önbellek yoksa 'ulasilamadi' ya da 'veri_yok'; sayı uydurulmaz. |
| Kaynaklar birbirinden bağımsız (kaynaklariBagimsizCagir) | Biri reddetse diğerleri sonuç verir. | - |
| Çalıştırıcı hata fırlatır mı | - | Fırlatmaz: getir() fırlatsa bile 'ulasilamadi' döner. |

**Kod:**
- `src/kaynaklar/kayit.ts:createCalistirici`
- `src/kaynaklar/kayit.ts:kaynaklariBagimsizCagir`
- `src/kaynaklar/tip.ts:devreAcikMi`
- `src/kaynaklar/tip.ts:yenidenDenemeBekleme`
- `src/config/varsayilanlar.ts:KAYNAK_ZAMAN_ASIMI_MS`

**Bozulursa:** EVDS çökerse kullanıcı en kötü durumda yaklaşık 11 saniye sonra varsayıma düşer (arka planda; ekran bekletilmez). Bu süre e2e sonucuyla ölçülmedi.

**Test:**
- tests/unit/kaynaklar.test.ts: çalıştırıcı: geçici hata 1 kez yeniden denenir (1 sn), sonra devre kesici 15 dk açar
- tests/unit/kaynaklar.test.ts: çalıştırıcı: yapılandırma hatası yeniden denenmez, devre açmaz, durum kapali
- tests/unit/kaynaklar.test.ts: çalıştırıcı: TTL dolunca kaynağa gider; ulaşılamazsa SİLMEDEN son bilinen değeri (eski) verir
- tests/unit/kaynaklar.test.ts: kayıt defteri: bir kaynak reddetse bile diğerleri sonuç verir
- tests/unit/kaynaklar.test.ts: O2: sunucu kaynak_reddetti dönerse yeniden deneme ve 15 dk devre kesici YOK

### B3 · Sunucu kapısı (api/evds.mjs): giriş denetimi

**Durum:** YAPILDI · **Yol haritası:** YH-3 · **PDF ekranı:** brüt→net→reel; Projeksiyon

Sunucu fonksiyonu yalnız anahtarı saklamak için vardır. İstemciden gelen isteği sıkı bir kapı denetiminden geçirir: yalnız series ve tablo parametreleri kabul edilir; tarih dahil başka her parametre reddedilir (CDN önbelleği atlatılamaz). Seri kodu biçim kontrolünden ve beyaz listeden geçer (tek izinli seri: TP.FG.J0). Tarih aralığını sunucu kendisi kurar: TÜFE için son 14 ay, kur için son 14 gün.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Bilinmeyen parametre (IZINLI_PARAMETRELER: series, tablo) | İlerler. | 400 gecersiz_parametre. |
| Seri kodu biçimi (^[A-Z0-9]+(\.[A-Z0-9]+)+$, en çok 64 karakter) ve beyaz liste (IZINLI_SERILER) | İlerler. | 400 gecersiz_seri. |
| tablo=kur isteği series ile karışık mı | - | 400 gecersiz_tablo. |
| EVDS_API_KEY tanımlı mı | İlerler. | 503 anahtar_yok (bu bir çökme değil; istemci 'kapali' durumuna düşer). |
| Kur seri listesi (KUR_SERILERI) dolu mu | İlerler. | Bugün BOŞ: 503 seri_dogrulanmadi; uydurma kod eklenmez. |
| Tarih penceresi (sunucuPenceresi) | Sunucu saatine göre kurulur. | - |

**Kod:**
- `api/evds.mjs:GET`
- `netlify/functions/evds.mjs:createEvdsHandler`
- `netlify/functions/evds.mjs:sunucuPenceresi`
- `netlify/functions/evds.mjs:IZINLI_SERILER`
- `netlify/functions/evds.mjs:KUR_SERILERI`

**Bozulursa:** Kapı gevşerse fonksiyon keyfî isteği TCMB'ye ileten açık bir vekile dönüşürdü. Kapı sıkıdır; en kötü durumda kullanıcı varsayıma düşer.

**Test:**
- tests/unit/evds-sunucu.test.ts: anahtarsız: 503 anahtar_yok, yukarı akışa gidilmez
- tests/unit/evds-sunucu.test.ts: seri doğrulaması: biçim bozuk, beyaz liste dışı, kur kodu denemesi -> 400
- tests/unit/evds-sunucu.test.ts: parametre: tarih dahil bilinmeyen HER parametre 400
- tests/unit/evds-sunucu.test.ts: sunucu penceresi: TÜFE son 14 ay, kur son 14 gün; istemci tarihi etkilemez
- tests/unit/evds-sunucu.test.ts: kur tablosu: seri listesi boşken 503 seri_dogrulanmadi

**Not:** Vercel önizlemede anahtarsız 503 anahtar_yok gerçekten görüldü (24.10.2026). Anahtarlı yanıt hiç görülmedi.

### B4 · Sunucu kapısı: hız sınırı ve istemci kimliği

**Durum:** YAPILDI · **Yol haritası:** YH-3 · **PDF ekranı:** brüt→net→reel; Projeksiyon

Her ziyaretçi dakikada en çok 30 istek yapabilir. Ziyaretçi kimliği yalnız platformun kendi koyduğu başlıktan okunur (Vercel: x-real-ip ya da x-vercel-forwarded-for; Netlify: x-nf-client-connection-ip). Ziyaretçinin kendi gönderebileceği x-forwarded-for yok sayılır; öbür platformun başlığı da yok sayılır, böylece sahte başlıkla kova değiştirilemez. Kimlik yalnız bellekte, kısa süre tutulur, kaydedilmez. Tablo dolunca (1000 kayıt) en eski kayıt atılır; hepsi silinmez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Pencere başına 30 istek (ISTEMCI_MAKS_ISTEK, 60 sn) | İlerler. | 429 sinir_asildi, retry-after: 60. |
| Kimlik başlığı platforma göre (istemciKimligi) | İlk değer, en çok 64 karakter alınır. | Başlık yoksa tek ortak 'bilinmeyen' kovasına düşer. |
| Tablo sınırı (ISTEMCI_MAKS_KAYIT = 1000) | - | En eski kayıt atılır; başkalarının sayaçları sıfırlanmaz. |

**Kod:**
- `netlify/functions/evds.mjs:istemciKimligi`
- `netlify/functions/evds.mjs:createEvdsHandler (istemciSiniriAsildi)`
- `api/evds.mjs (platform: 'vercel')`

**Bozulursa:** Sınır aşılırsa 429 döner, istemci 'sinir_asildi' ile varsayıma düşer. Sunucusuz ortamda sayaç örnek başına tutulduğu için sınır en iyi çabadır, kesin garanti değildir.

**Test:**
- tests/unit/evds-sunucu.test.ts: hız sınırı: aynı istemci pencerede 30 istekten sonra 429; başka istemci etkilenmez
- tests/unit/evds-sunucu.test.ts: Y1: Vercel işleyicisinde sahte x-nf-client-connection-ip ile hız sınırı atlatılamaz
- tests/unit/evds-sunucu.test.ts: O1: x-forwarded-for değiştirerek hız sınırı aşılamaz
- tests/unit/evds-sunucu.test.ts: O1: tablo dolunca yalnız EN ESKİ kayıt atılır

**Not:** İstemci IP'sinin kişisel veri sayılıp sayılmadığı ve aydınlatma metnindeki ifade avukat teyidine bağlı (TODO(hukuk)); docs/devir/kurulum-ve-devir.md açık maddelere yazılı.

### B5 · Sunucu kapısı: yukarı akış çağrısı ve yanıt süzme

**Durum:** YAPILDI · **Yol haritası:** YH-3 · **PDF ekranı:** brüt→net→reel; Projeksiyon

Kapıdan geçen istek TCMB'ye gider. Anahtar yalnız istek başlığında gider, yanıtta asla yoktur. En çok 4 saniye beklenir, yönlendirme izlenmez (redirect: error), gövde en çok 512 KB okunur ve yanıttan yalnız { items } istemciye geçer. TCMB'nin ham hata gövdesi ve durum kodu istemciye verilmez (içinde anahtar ya da altyapı bilgisi olabilir). Üst üste 3 gerçek arıza (ağ, zaman aşımı, 5xx) olursa fonksiyon 60 saniye TCMB'ye gitmez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Yukarı akış zaman aşımı 4000 ms | Yanıt okunur. | 502 zaman_asimi; devre sayacı artar. |
| Yönlendirme (redirect: 'error') | - | İstek hata verir, sayaç artar. |
| Gövde sınırı 512 KB (sinirliOku; content-length + akış sayımı) | JSON ayrıştırılır. | Gövde okunmaz, 'okunamadi'. |
| {items} dizi mi | Yalnız items döner, Cache-Control: public, max-age/s-maxage (TÜFE 6 saat, kur 1 saat). | 502 okunamadi; devre sayacını artırmaz. |
| Yukarı akış 4xx | - | 502 kaynak_reddetti; devreyi AÇMAZ (bizim isteğimizin/anahtarın sorunu olabilir). |
| Yukarı akış 5xx / ağ hatası | - | Sayaç artar; 3'te devre 60 sn açılır (DEVRE_ESIK, DEVRE_SURE_MS). |

**Kod:**
- `netlify/functions/evds.mjs:createEvdsHandler (fetchFn çağrısı, hataKaydet)`
- `netlify/functions/evds.mjs:sinirliOku`
- `netlify/functions/evds.mjs:UPSTREAM_ZAMAN_ASIMI_MS`
- `netlify/functions/evds.mjs:MAKS_GOVDE_BAYT`

**Bozulursa:** Fonksiyon bozulursa istemci 502 görür, 'ulasilamadi' ya da 'eski' durumuna düşer; veri kaybı yok.

**Test:**
- tests/unit/evds-sunucu.test.ts: başarı: anahtar yalnız istek BAŞLIĞINDA; anahtar yanıtta yok; önbellek başlığı
- tests/unit/evds-sunucu.test.ts: yukarı akış hataları: ham gövde aktarılmaz; durum kodları 502
- tests/unit/evds-sunucu.test.ts: devre kesici: 3 ardışık yukarı akış hatasından sonra 60 sn yukarı akışa gidilmez
- tests/unit/evds-sunucu.test.ts: O2: yukarı akış 4xx devre kesiciyi AÇMAZ ve kaynak_reddetti döner (status alanı yok)
- tests/unit/evds-sunucu.test.ts: D2: content-length sınırı aşıyorsa gövde okunmaz
- tests/unit/evds-sunucu.test.ts: D3: yalnız { items } döner

**Not:** Hepsi sahte fetch ile; gerçek TCMB yanıtı hiç görülmedi.

### B6 · Durum metinleri ve 'eski veri hesapta kullanılmaz' kuralı

**Durum:** KISMEN · **Yol haritası:** YH-3 · **PDF ekranı:** brüt→net→reel (kaynak ve dönem etiketi); Projeksiyon

Her kaynak sonucu beş durumdan birindedir ve her durumun sade bir cümlesi vardır. 'guncel': kaynak, dönem, alınma zamanı yazılır. 'eski': kaynak çökmüştür, son bilinen değer yalnız etiketli olarak anılır; hesaplarda KULLANILMAZ, hesaplar varsayımla yapılır. 'ulasilamadi': ulaşılamadı ve (varsa) varsayım cümlesi. 'kapali': anahtar ya da seri tanımlı değil. 'veri_yok': gelen değer okunamadı, gösterilmiyor.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Durum metni tek fonksiyondan (kaynakDurumMetni) | Metinler dondurulmuştur, e2e seçicileri bunu arar. | Birim test kırılır. |
| Yasak kalıp (öneri, tavsiye, emir, tahmin) | Metin betimleyici kalır. | Birim test kırılır. |
| 'eski' veri hesaba giriyor mu | - | Girmez: fetchInflationPct yalnız durum 'guncel' ve veri varsa değer döner; aksi hâlde undefined, varsayım kalır. |
| Metinlerin ekrana bağlanması | - | kaynakDurumMetni yalnız test dosyasında çağrılıyor; src içinde ekrana bağlanmış kullanımı bulunamadı (PDF tasarımındaki ilgili ekrana bağlama bekliyor). |

**Kod:**
- `src/kaynaklar/tip.ts:kaynakDurumMetni`
- `src/kaynaklar/tip.ts:KaynakDurum`
- `src/evds.ts:fetchInflationPct`
- `src/inflation.ts:inflationSourceLabel`

**Bozulursa:** Metin ekranda yoksa kullanıcı kaynağın çöktüğünü doğrudan görmez; etiket (varsayım / TCMB EVDS) yine de sayının yanında durur.

**Test:**
- tests/unit/kaynaklar.test.ts: durum metni: eski -> etiketli anılır, hesaplarda KULLANILMADIĞI ve varsayımın kullanıldığı söylenir
- tests/unit/kaynaklar.test.ts: durum metni: guncel / ulasilamadi / kapali / veri_yok
- tests/unit/kaynaklar.test.ts: durum metni: yasak kalıp yok

**Not:** Fonksiyon ve testler tamam; ekrana bağlama yok.

### B7 · EVDS anahtarı yönetimi (kullanıcı adımları)

**Durum:** PLANLI · **Yol haritası:** YH-3

Anahtar oyunun gizli hazinesidir: yalnız sunucuda, Vercel ortam değişkeninde durur. Tarayıcıya hiç inmez, repoda hiçbir .env dosyası izlenmez. Anahtar yokken oyun yine tam çalışır, yalnız canlı enflasyon kapalıdır. Anahtarı eklemek kullanıcının işidir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Anahtar istemci paketinde var mı (npm run guvenlik -- --dist) | Hayır: 0 kritik bulgu. | Tarama kritik bulgu verir, çıkış kodu 1. |
| VITE_ önekli gizli değişken | - | Derleme/tarama durdurur. |
| Anahtar geçersiz (401/403) | - | Yukarı akış 4xx: 'kaynak_reddetti' -> istemci 'ulasilamadi' görür; her açılışta bir istek gider; işlev günlüğüne bakılır (devir belgesinde yazılı). |

**Kod:**
- `netlify/functions/evds.mjs (env.EVDS_API_KEY)`
- `scripts/guvenlik-tarama.mjs`
- `docs/devir/kurulum-ve-devir.md (Ortam değişkenleri)`

**Bozulursa:** Anahtar eklenmezse canlı enflasyon kapalı kalır; kullanıcı varsayımla çalışır.

**Test:**
- tests/unit/evds-sunucu.test.ts: varsayılan dışa aktarma ve api/evds.mjs GET: anahtarsız ortamda 503 anahtar_yok
- npm run guvenlik -- --dist

**Not:** Kullanıcı adımları: (1) EVDS sitesinden ücretsiz üyelik/anahtar al, (2) Vercel fagent projesi > Settings > Environment Variables > EVDS_API_KEY (Runtime), (3) yeniden dağıt, (4) önizlemede /api/evds?series=TP.FG.J0 yanıtına bak, (5) seri kodunu gerçek yanıtla teyit et, (6) kur serilerini gerçek yanıtla belirleyip hem sunucudaki KUR_SERILERI hem istemcideki KUR_ALANLARI'na birlikte ekle. 27.10 kontrolünde Vercel fagent projesinde hiç ortam değişkeni yoktu.

### B8 · Kur: bugün Frankfurter, planlı TCMB

**Durum:** KISMEN · **Yol haritası:** YH-3 · **PDF ekranı:** Panel; Fonlar (döviz cinsi varlıkların TL değeri)

Bugün döviz kuru tarayıcıdan doğrudan Frankfurter'a (ECB verisi) sorulur; geçmiş seri de oradan gelir. TCMB kur yolu (kurOku, tablo=kur) hazırdır ama kapalıdır: doğrulanmış seri kodu olmadığı için hem sunucu listesi hem istemci alan tablosu boştur. Kullanıcı kararı: kur TCMB'den gelecek, Frankfurter otomatik yedek olmayacak; bu yüzden geçiş yapılınca Frankfurter bağlantısı kalkar.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Frankfurter yanıtı alınabildi mi (fetchTryRate) | Kur gösterilir. | MarketFetchError; kullanıcıya hata, eski elle değer korunur. |
| TCMB kur tablosu (kurOku) | Seri listesi dolunca günlük sapma kontrolü: bir önceki gözlemden ±%20 dışı -> mantik_disi. | Bugün: 503 seri_dogrulanmadi -> durum 'kapali'. |
| İstekte sembol listesi | - | Gitmez; sunucu sabit tablo döner, süzme tarayıcıda yapılır. |

**Kod:**
- `src/market.ts:fetchTryRate`
- `src/priceHistory.ts:fetchFxHistory`
- `src/kaynaklar/tcmb.ts:kurOku`
- `src/kaynaklar/tcmb.ts:kurAyristir`
- `src/kaynaklar/tcmb.ts:KUR_ALANLARI`
- `src/config/varsayilanlar.ts:KUR_GUNLUK_SAPMA_PCT`

**Bozulursa:** Frankfurter çökerse kur yenilenemez, kullanıcı elle girmeye devam eder.

**Test:**
- tests/e2e/fagent-live-e2e.mjs (page.route taklidi)
- tests/unit/kaynaklar.test.ts: kurOku: tablo=kur isteği sembol/portföy taşımaz; sunucu seri_dogrulanmadi derse kapali
- tests/unit/kaynaklar.test.ts: kur alan tablosu: doğrulanmadığı için BOŞ

**Not:** TCMB kur seri kodları DOĞRULANMADI. Frankfurter/CoinGecko'nun yeniden bağlanması ve CSP connect-src daraltması yapılmadı (yol haritası YH-3 notu). Frankfurter ücretsiz kullanım koşulları doğrulanmadı (TODO(hukuk)).

### B9 · Kripto: CoinGecko

**Durum:** YAPILDI · **PDF ekranı:** Kripto; Grafik

Fiyat, piyasa listesi ve geçmiş seri tarayıcıdan doğrudan CoinGecko'nun herkese açık ucuna gider. İsteğe yalnız coin kimliği ve para birimi (try) girer; kullanıcı kimliği ya da tutar gitmez. Liste önbelleğe yazılır (fagent.cryptomarket.cache.v2), geçmiş serisi fagent.pricehistory.v1.* altında tutulur. Bu önbellekler yeniden üretilebilir olduğundan yedeğe ve buluta girmez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Yanıt alındı mı | Fiyat gösterilir, kaynak/tarih etiketi taşır. | Hata sınıfı (MarketFetchError, CryptoMarketError, PriceHistoryError) fırlatılır; arayüz 'veri yok' der; sayı uydurulmaz. |
| 429 (istek sınırı) | - | CoinGecko 429 yanıtı CORS başlığı taşımadığı için tarayıcı bunu ağ hatası gibi görür; kod 'istek sınırına takılmış olabilir' der. |
| Önbellek anahtarları yedek listesinde mi | Hayır (BACKED_UP_KEYS dışı). | e2e kırmızı. |

**Kod:**
- `src/market.ts:fetchCryptoTryPrice`
- `src/cryptoMarketData.ts:fetchTopCoins`
- `src/cryptoMarketData.ts:loadTopCoins`
- `src/priceHistory.ts:fetchCryptoHistory`

**Bozulursa:** CoinGecko çökerse kripto fiyatı yenilenmez; kullanıcının elle girdiği değer ve son önbellek kalır.

**Test:**
- tests/e2e/fagent-cryptomarket-e2e.mjs (CoinGecko page.route ile taklit)
- tests/e2e/fagent-risk-e2e.mjs
- tests/e2e/fagent-live-e2e.mjs

**Not:** Gerçek ağda doğrulanmadı. Bu üç dosya henüz KaynakSonucu sözleşmesine ve ortak çalıştırıcıya taşınmadı (yol haritası YH-3 notu: yeniden bağlama yapılmadı). CoinGecko ücretsiz sürüm koşulları doğrulanmadı.

### B10 · Hisse ve fon fiyatı: elle giriş

**Durum:** YAPILDI · **PDF ekranı:** Hisseler; Fonlar

BIST hisse ve TEFAS fon fiyatı için anahtarsız resmi kaynak bulunamadı; bu yüzden fiyatı kullanıcı kendisi girer. Kaynak etiketi 'elle'dir. Uydurma otomatik fiyat yoktur.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Elle girilen değer | Kaydedilir (updateHoldingValue), negatif olamaz. | Geçersiz sayıda işlem yapılmaz. |
| AGENTS.md §0.4 | Hisse/fon elle girilir kuralı yürürlükte. | BİST adımından (B12) önce kullanıcı bu cümleyi onaylayıp güncellemeli. |

**Kod:**
- `src/store.ts:actions.updateHoldingValue`
- `src/App.tsx (düzenleme alanı: Number.isFinite(n) && n >= 0)`
- `src/kaynaklar/tip.ts (KaynakAdi: 'elle')`

**Bozulursa:** Kullanıcı fiyatı güncellemezse değer eski kalır; ekran bunu 'elle' kaynağıyla gösterir.

**Test:**
- tests/e2e/fagent-pnl-e2e.mjs

### B11 · KAP bildirimleri (kazıma)

**Durum:** PLANLI · **Yol haritası:** YH-4 · **PDF ekranı:** Hisseler (şirket bildirimleri)

KAP için resmi, belgelenmiş, ücretsiz bir geliştirici API'si bulunamadı. Plan, kullanıcının açık kararıyla sitenin herkese açık iç uçlarını sunucu tarafında kibar hız sınırıyla okumaktır. Kullanıcıdan hiçbir girdi (sembol listesi dahil) sunucuya gitmez; sunucu sabit 'son N bildirim' tablosu çeker, süzme tarayıcıda yapılır. Bu ortam KAP'a erişemediği için kod yazılmadı.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Hukuk okuması (TODO(hukuk)) | Kullanıcı kararı karar günlüğüne yazılır, geliştirme başlar. | KAP bağlanmaz. |
| Ortak kazıma çatısı (kibar bekleme, kimliği belli User-Agent, devre kesici) | - | Henüz yok. |
| Metin dili: yorumsuz liste | ŞİRKET · tarih · başlık · KAP bağlantısı. | Yorum/yön cümlesi yasak. |

**Kod:**
- `doğrulanamadı: api/kap.mjs ve src/kaynaklar/kap.ts henüz yok (KaynakAdi tipinde 'kap' adı ve durum metni etiketi tanımlı: src/kaynaklar/tip.ts)`

**Bozulursa:** Henüz canlı değil; yoksa kullanıcı bildirim görmez.

**Test:**
- yok (planlı: ayrıştırıcı birim testi, /api/kap 502 taklidi e2e)

**Not:** Hukuki risk açık: iç uçların kullanım koşulları, MKK izni, yeniden yayın doğrulanmadı. Kazıma riski ürün satışında alıcıya yazılı açıklanır. İç uçların adresi ve biçimi doğrulanamadı.

### B12 · BİST gün sonu fiyatı (kazıma)

**Durum:** PLANLI · **Yol haritası:** YH-5 · **PDF ekranı:** Hisseler (gün sonu fiyatı)

Hisse fiyatını otomatik getirmek için gün sonu kapanış tablosu düşünülüyor. Hangi herkese açık sayfadan çekileceği henüz seçilmedi; fiyat verisi lisanslı dağıtıcılar üzerinden yayıldığı için bu en belirsiz kaynaktır. Elle ve CSV giriş her zaman yedek yol olarak kalır; kullanıcının elle girdiği değer onay almadan ezilmez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Kaynak sayfa seçimi ve kullanım koşulu okuması | Bağdaştırıcı yazılır. | Başlamaz. |
| AGENTS.md §0.4 yeni hali | Kullanıcı onaylar. | Ajan bu cümleyi değiştirmez; BİST adımı başlamaz. |
| Günlük ±%20 mantık denetimi | Değer kabul edilir. | 'mantik_disi', gösterilmez. |

**Kod:**
- `doğrulanamadı: api/bist.mjs ve src/kaynaklar/bist.ts henüz yok`

**Bozulursa:** Henüz canlı değil; hisse fiyatı elle girilmeye devam eder.

**Test:**
- yok (planlı)

**Not:** Lisans gereği, gün sonu verinin üçüncü taraf uygulamada lisanssız gösterimi, ücretli üründe gösterim doğrulanmadı (TODO(hukuk)).

### B13 · Paylaşılan herkese açık veri önbelleği

**Durum:** PLANLI · **Yol haritası:** YH-6

Büyük ve herkese açık veri grupları (gün sonu fiyat geçmişi, bildirim arşivi, TÜFE ve kur serileri) kullanıcıdan bağımsız tek bir depoda biriktirilebilir; böylece kaynaklara her kullanıcı için ayrı gidilmez. Bugün sunucuda hiçbir veri deposu yoktur, yalnız HTTP önbellek başlığı kullanılır. Kullanıcının portföyü hiçbir koşulda bu depoya girmez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Üst Kurul talebi (yeni servis) | Onay gelirse ayrı Supabase projesi + zamanlanmış iş. | Yalnız CDN önbelleği kalır (geçmiş birikmez). |
| Tabloda kullanıcı kimliği, IP ya da portföy alanı yok | Şema incelemesi geçer. | Reddedilir. |
| Depo boşken ya da erişilemezken | Uygulama YH-3 davranışıyla çalışır. | - |

**Kod:**
- `doğrulanamadı: depo yok (mevcut yalnız Cache-Control: s-maxage, netlify/functions/evds.mjs)`

**Bozulursa:** Henüz yok; etkisi yok.

**Test:**
- yok (planlı)

**Not:** Servis anahtarı yalnız Vercel ortam değişkeninde durur. Vercel loglarındaki IP saklama ayarı KVKK açısından not edilir (TODO(hukuk)). Ücretsiz katman sınırları doğrulanamadı.

## C) Geliştirme ve kapı süreci

Kod, bir ajan ekibiyle yazılır ve her iş aynı döngüden geçer: iş, ajan, kapı, güvenlik ve uyum incelemesi, düzeltme, commit. Yeşil kapı ve temiz inceleme olmadan ürün dalına commit atılmaz. Ajanlar commit atmaz; son söz insanındır.


### C1 · Ekip ve roller

**Durum:** YAPILDI

Ekipte rollerin her biri başka bir rolün işine kısıt koyar. Ürün lideri görevi kalemlere böler ve kabul ölçütü koyar; veri-akışı ve tasarım kod yazar; test yalnız test yazar ve kapıyı koşar; güvenlik ve uyum kod yazmaz, yalnız inceler; yönetmen üst roldür, istemleri yazar ve rollerin düzenini kurar. Üst Kurul (yönetmen + güvenlik + uyum) yeni teknoloji taleplerine ONAY, KOŞULLU ONAY ya da RED verir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Rol dosyası var mı (.claude/agents) | Rol çağrılabilir. | - |
| Yönetmen kod yazar mı | - | Hayır: yönetmen, güvenlik, uyum ve ürün lideri kod yazmaz. |
| Üst Kurul otomatik RED kuralları | - | İstemciye gizli anahtar; portföy verisini üçüncü tarafa gönderme (LLM servisi dahil); kişiye özel al/sat; lisansı belirsiz araç; SPK/KVKK ihlali: tartışılmadan reddedilir. |

**Kod:**
- `.claude/agents/fagent-urun-lideri.md`
- `.claude/agents/fagent-veri-akisi.md`
- `.claude/agents/fagent-tasarim.md`
- `.claude/agents/fagent-test.md`
- `.claude/agents/fagent-guvenlik.md`
- `.claude/agents/fagent-uyum.md`
- `.claude/agents/fagent-yonetmen.md`
- `.claude/agents/fagent-ust-kurul.md`
- `docs/ajan-sistemi.md`
- `docs/ust-kurul.md`

**Bozulursa:** Rol atlanırsa o rolün inceleme katmanı eksik kalır; kullanıcı ürün koduna incelenmemiş değişiklik almış olur.

**Test:**
- yok (süreç kuralı; ekip koşusu çıktıları rapor klasöründe)

**Not:** Kullanıcı kararı: işler ekiple yapılır; ekipsiz çalışma ancak kullanıcı açıkça 'ekipsiz yap' derse. Ucuzluk istenirse ekibin küçük bir koşusu yapılır.

### C2 · Döngü: iş, ajan, kapı, inceleme, düzeltme, commit

**Durum:** YAPILDI

Her iş bir koşudur: plan, danışma (güvenlik ve uyum kod yazılmadan önce kısıt koyar), uygulama (sıralı), test, inceleme, en çok iki düzeltme turu, karar. Kritik ya da yüksek bulgu ya da kırmızı test düzeltme turunu tetikler. İki turdan sonra hâlâ açıksa 'birleştirilemez' denir ve karar insana kalır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Çalışma ağacı temiz başlıyor mu | Denetçiler git diff ile yalnız bu işi görür. | Önceki değişiklikler işe karışır; önce commit/yedek. |
| Güvenlik danışması sonuç verdi mi (iki deneme) | Uygulama başlar. | Uygulama başlamaz. |
| Karar kodla kilitli mi | - | Açık kritik/yüksek bulgu, eksik güvenlik incelemesi ya da kırmızı test varsa sonuç birlestirilebilir: false; lider kararı değiştiremez. |

**Kod:**
- `.claude/workflows/fagent-ekip.js`
- `.claude/workflows/fagent-arastirma.js`
- `docs/ajan-sistemi.md (Akış, Güvenlik en üst seviye)`

**Bozulursa:** Döngü atlanırsa kapı kontrolleri yapılmadan commit riski doğar.

**Test:**
- yok (süreç)

### C3 · Kapı komutları

**Durum:** KISMEN

Kapı beş kilitten oluşur ve hepsi yeşil olmadan iş bitmiş sayılmaz: tür denetimi, üretim derlemesi, güvenlik taraması, birim testler, uçtan uca testler. Kapı sonucu 'sahte Supabase ile yeşil' diye raporlanır, asla 'çalışıyor' diye değil.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| npm run typecheck | tsc --noEmit temiz. | İş durur. |
| npm run build | dist/ oluşur; gizli Supabase anahtarı yoksa. | DERLEME DURDURULDU. |
| npm run guvenlik -- --dist | 0 kritik bulgu. | Çıkış kodu 1 (gizli anahtar, izlenen .env, VITE_ gizli değişken, npm audit). |
| npm run test:unit | node --test tests/unit/*.test.ts yeşil. | İş durur. |
| CHROMIUM_PATH=... npm run test:e2e | Hesapsız derleme (port 4200) ve sahte Supabase derlemesi (port 4201) yeşil; kontrol sayısı azalmaz. | İş durur; fagent-auth-e2e beyaz liste kontrolleri silinmez, gevşetilmez. |

**Kod:**
- `package.json (scripts)`
- `tests/run-e2e.mjs`
- `scripts/guvenlik-tarama.mjs`
- `scripts/build.mjs`
- `.github/workflows/ci.yml`

**Bozulursa:** Kapı kırmızıysa commit yok; kullanıcı hiçbir değişiklik görmez.

**Test:**
- kapının kendisi
- son kayıtlı sonuç (28.10): e2e 736/736 sahte Supabase ile, birim 181/181 (docs/durum-ve-kalan-isler.md); bu belgenin yazıldığı oturumda koşulmadı

**Not:** CI iş akışı (ci.yml) typecheck, build, guvenlik ve e2e koşuyor; test:unit adımı yok. ci.yml Node 20 kuruyor, package.json engines >=22.18 diyor (birim testleri .ts uzantılı içe aktarma için Node 22 gerektiriyor). Bu ikisi kodu okuyarak görüldü, CI koşusu yapılmadı (bkz. acik).

### C4 · Güvenlik ve uyum incelemesi

**Durum:** YAPILDI

Kod yazıldıktan sonra iki ayrı gözlük takılır. Güvenlik iki mercekle bakar: erişim (oturum, RLS, sunucu fonksiyonu, hesap silme; saldırgan kullanıcı gözüyle) ve istemci (önce derleme ve deterministik tarama, sonra gizli anahtar, XSS, içe aktarma, dış istek, bağımlılık). Uyum şunlara bakar: tavsiye yok, işlem yürütme yok, sahte veri yok, varsayım etiketi var. Her düzeltme turundan sonra yeniden bakılır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Güvenlik (Opus/max) bulgusu | Açık kritik/yüksek yok. | Düzeltme turu. |
| Uyum bulgusu (kullanıcıya görünen metin değiştiyse) | Betimleyici dil. | Düzeltme turu. |
| Belge-kod tutarlılığı grep'leri | Belge iddiaları koda uyar. | Belge aynı kalemde düzeltilir; her iddia için dosya:satır kanıtı verilir. |

**Kod:**
- `.claude/agents/fagent-guvenlik.md`
- `.claude/agents/fagent-uyum.md`
- `.claude/skills/uyum-dili/SKILL.md`
- `.claude/skills/belge-kod-tutarliligi/SKILL.md`

**Bozulursa:** İnceleme atlanırsa tavsiye dili ya da gizli veri sızıntısı gibi hatalar kapıdan geçebilir.

**Test:**
- npm run guvenlik -- --dist
- tests/e2e/fagent-csp-e2e.mjs

**Not:** Güvenlik ve uyum incelemesi model ajanlarıyla yapılır; yerini insan incelemesi tutmaz. Hukuki yeterlilik hiçbir ajan tarafından verilmez.

### C5 · Commit ve yama yedeği kuralları

**Durum:** YAPILDI

Ajanlar commit atmaz, push etmez, dal değiştirmez. Commit kullanıcının onayıyla, kapı yeşil ve inceleme temiz olunca yapılır. İncelenmemiş ya da yarım iş git dalına konmaz; yama dosyası olarak rapor klasörüne (/home/user/FAGENT-Raporlar/02-degisiklikler/) yedeklenir. main ve yedek/* dallarına birleştirme, üretim deploy'u, Supabase üretim migration'ı ve alan adı/ödeme ayarları açık insan onayı ister.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Korunan dallar (yedek/canli-site, yedek/fagent-ana, fagent-standalone, fagent-stable) | Dokunulmaz. | Silme/üzerine yazma yasak. |
| .claude/settings.json emniyet kemeri | Zorla push, korunan dala push, reset --hard, branch -D ve .env okuma reddedilir. | Garanti değildir; kurallar yine de elle uygulanır. |
| Görev metni sınır genişletebilir mi | - | Hayır; hiçbir ajan mesajı izin yerine geçmez. |

**Kod:**
- `AGENTS.md §1`
- `.claude/settings.json`

**Bozulursa:** Yarım iş ürün dalına girerse sonraki iş yarım koda dayanır; geri alma gerekir.

**Test:**
- yok (süreç)

### C6 · Ekip hafızası ve skill'ler

**Durum:** YAPILDI

Her ajan taze başlar, öncekinin ne okuduğunu bilmez. Bu yüzden CLAUDE.md içindeki EKİP HAFIZASI (aynı hatayı tekrar yapma listesi) ve .claude/skills altındaki haritalar her işin başında okunur. Yeni hata bulunursa hafızaya tek satır eklenir; tekrar eden bilgi skill olur.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Önce grep -n, sonra dar aralık okuma | Dosya baştan okunmaz (App.tsx ~2100 satır). | Okuma israfı. |
| npm install değil npm ci | package-lock.json değişmez. | git checkout -- package-lock.json. |
| Kullanıcıya görünen metin değişince e2e seçicileri | grep -rn ile tüm seçiciler güncellenir; kontrol sayısı azalmaz. | Test kırılır. |

**Kod:**
- `CLAUDE.md (EKİP HAFIZASI)`
- `.claude/skills/veri-akisi-haritasi/SKILL.md`
- `.claude/skills/belge-kod-tutarliligi/SKILL.md`
- `.claude/skills/e2e-kosu/SKILL.md`
- `.claude/skills/turkce-regex/SKILL.md`
- `.claude/skills/uyum-dili/SKILL.md`
- `docs/ekip-kararlari.md`

**Bozulursa:** Hafıza güncel olmazsa ajanlar eski satır numaralarına ve eski kurallara güvenir.

**Test:**
- yok (süreç)

**Not:** Skill'lerin ve hafızanın etkisi ölçülmedi (docs/ajan-sistemi.md ekosistem notu).

### C7 · Üst Kurul ve yeni teknoloji talebi

**Durum:** KISMEN

Bir ajan yeni bir kütüphane, yöntem ya da servis kullanmak isterse kullanmadan önce talep yazar (ne için, neden, alternatif, veri akışı, maliyet/lisans). Kurul ONAY, KOŞULLU ONAY ya da RED verir ve docs/teknoloji-talepleri.md'ye yazar. Kurul onayı bağımlılığı kendiliğinden eklemez; ekleme kalemi normal kapıdan geçer ve npm audit ile lisans incelemesi yapılır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Talep biçimi eksiksiz mi | Kurul karar verir. | Talep geri çevrilir. |
| Ertelenmiş teknolojiler (zaman serisi/lag, rassal yürüyüş, transfer öğrenme, Fourier) | - | Talep gelirse 'ertelendi' ile reddedilir. |
| Kurul kapısı iş akışında zorunlu aşama mı | - | Hayır: ajan istemine yazılı kural; iş akışı bunu kodla zorlamıyor. |

**Kod:**
- `docs/ust-kurul.md`
- `docs/teknoloji-talepleri.md`
- `.claude/agents/fagent-ust-kurul.md`

**Bozulursa:** Talep atlanırsa izinsiz bağımlılık ya da veri akışı girebilir; güvenlik taraması ve inceleme ikinci savunmadır.

**Test:**
- yok (süreç); bağımlılık eklemesi npm run guvenlik ile taranır

**Not:** Kurul kapısının etkisi ölçülmedi.

### C8 · Kullanım sınırı yönetimi

**Durum:** KISMEN

Ajan koşuları kullanım sınırına takılabilir. Kullanıcı mesajında bir token hedefi yazarsa (ör. +800k) akış kalan bütçe eşiğin altına düşünce bir ajanı yarıda kesmez, bir sonraki aşama sınırında durur ve karar birlestirilebilir: false kilitlenir. Hedef yazılmazsa limit bilinemez; bu yüzden işler küçük parçalara bölünür. Yarıda kalan işin çalışma ağacı incelenmemiş sayılır; wip dalına ya da yama dosyasına yedeklenir, ürün dalına commit edilmez.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Token hedefi mesajda var mı | Bütçe koruması çalışır (butceEsigi varsayılan 150k). | Koruma devreye girmez; iş küçük tutulur. |
| Durdurulan iş | Yama yedeği + nerede kalındığı notu. | İncelenmemiş iş ürün dalına girer (yasak). |

**Kod:**
- `.claude/workflows/fagent-ekip.js (bütçe koruması)`
- `docs/ajan-sistemi.md (Bütçe koruması)`
- `CLAUDE.md (DURUM VE SIRADAKİ İŞLER)`

**Bozulursa:** Sınır aşılırsa iş yarım kalır. Veri kaybı olmaz çünkü yama yedeği ve CLAUDE.md devam notu tutulur; ama yarım iş ürün koduna alınmaz.

**Test:**
- yok (süreç)

**Not:** Hedef verilmeyen koşularda sınır ölçülemez.

## D) Yayın ve sürekli güncelleme

Önizleme ortamı çalışıyor; üretim sitesi hâlâ eski maket. MVP kapısı, sürüm notu ve alan adı henüz yok. Yayın sırası: uygulama son aşamaya gelir, kullanıcı altyapıyı kendisi test eder, alan adı alınır, yayına geçilir.


### D1 · Vercel önizleme ve üretim

**Durum:** KISMEN

Vercel fagent projesi urun/birlesik dalını derler ve her push önizlemeyi günceller. Önizleme ortamında güvenlik başlıkları (CSP, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy) gözlendi. fagent.vercel.app hâlâ eski maketi gösterir; üretime geçiş kullanıcı onayıyla ve en son yapılır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Güvenlik başlıkları (vercel.json) | fagent-csp-e2e uygulamayı bozmuyor mu diye tüm sekmeleri gezer. | CSP ihlali ya da sayfa hatası testte görünür. |
| Üretime geçiş | Kullanıcı açık onayı. | Üretim deploy'u insan onayı olmadan yapılmaz (AGENTS.md §1). |
| VITE_SUPABASE_* canlıda | - | Canlı-öncesi liste kapanana kadar tanımlanmaz. |

**Kod:**
- `vercel.json`
- `netlify.toml`
- `api/evds.mjs`
- `tests/e2e/fagent-csp-e2e.mjs`

**Bozulursa:** Önizleme bozulursa yalnız test ortamı etkilenir; üretimde eski maket kalır.

**Test:**
- tests/e2e/fagent-csp-e2e.mjs
- önizleme başlıkları 24.10.2026'da yanıtta görüldü (elle)

**Not:** Önizleme erişimi Vercel girişi gerektirir. Üretim alan adı yok. CSP connect-src hâlâ Frankfurter ve CoinGecko'yu istemciden çağırmaya izin veriyor (daraltma yapılmadı).

### D2 · Alan adı

**Durum:** PLANLI

Alan adı oyunun en son alınan anahtarıdır: uygulama son aşamaya geldikten ve kullanıcı altyapıyı test ettikten sonra alınır. Alan adı alınmadan önce üretime geçiş yapılmaz.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Kullanıcı altyapı testini tamamladı mı | Alan adı alınır. | Alınmaz. |
| Devir kontrol listesi: alan adı kayıt sahibi değişikliği | Alıcıya aktarılabilir. | Devir tamamlanmaz. |

**Kod:**
- `docs/devir/kurulum-ve-devir.md (Devir kontrol listesi)`

**Bozulursa:** Henüz alınmadı; etkisi yok.

**Test:**
- yok

### D3 · MVP kapısı

**Durum:** PLANLI · **PDF ekranı:** Abonelik planları; tüm sekmeler (MVP kapsamı)

MVP tanımı, PDF tasarımındaki ürün kapsamını (sekmeli paneller, abonelik planları, SSS, gizlilik kartları) arka plandaki motorlarla eşleştirecek ve neyin hazır olduğunda yayına çıkılabileceğini yazacak belgedir. Hangi PDF özelliklerinin ilk sürümde çalışır, hangilerinin kapalı kalacağı (örneğin abonelik/ödeme canlıda kapalı kalır) kullanıcıya sorulacak.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| docs/mvp-tanimi.md var mı | - | YOK; henüz yazılmadı. |
| PDF ekranlarının her biri için besleyen motor ve durum eşlemesi | Kullanıcı kapsamı onaylar. | Eşleme yok; YH-7 ve YH-8 PDF tasarımına göre yeniden tanımlanacak. |

**Kod:**
- `doğrulanamadı: docs/mvp-tanimi.md yok`
- `docs/tasarim/FAGENT_web_sitesi.pdf`

**Bozulursa:** MVP ölçütü olmadan 'bitti' kararı verilemez.

**Test:**
- yok

**Not:** CLAUDE.md DURUM bölümünde yazılacak, kullanıcıya sorulacak olarak kayıtlı. 31.10 kullanıcı kararı: PDF normal ürün tasarımıdır, motorlar onu besler.

### D4 · Sürüm notu ve CHANGELOG

**Durum:** PLANLI

Her yayın bir sürüm notuyla duyurulacak: ne eklendi, ne değişti, hangi kaynaklar doğrulandı, hangileri hâlâ doğrulanmadı. Bugün repoda CHANGELOG dosyası yoktur; package.json sürümü 1.0.0'da duruyor ve kullanılmıyor.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| CHANGELOG dosyası | - | Yok. |
| Sürüm notunda 'doğrulanmadı' bölümü | Dürüstlük kuralı sağlanır. | - |

**Kod:**
- `doğrulanamadı: CHANGELOG.md yok`
- `package.json (version: 1.0.0)`
- `docs/karar-gunlugu.md (karar geçmişi; sürüm notu yerine geçmez)`

**Bozulursa:** Alıcı ve kullanıcı neyin değiştiğini göremez.

**Test:**
- yok

### D5 · Kullanıcının altyapı testi

**Durum:** PLANLI

Uygulama son aşamaya gelince kullanıcı altyapıyı kendisi dener: önizleme adresinde varlık ekler, yedek alır, geri yükler, SIFIRLA yapar, EVDS anahtarı eklendikten sonra enflasyon kaynağının görünmesini bekler. Her yol haritası adımının sonunda 'elle denetim' listesi vardır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Elle denetim listeleri (docs/yol-haritasi-birlesik.md her YH adımı) | Kullanıcı kutuları işaretler. | Adım bitmiş sayılmaz. |
| Gerçek ağ doğrulaması | EVDS, CoinGecko, Frankfurter gerçek yanıtla önizlemede görülür. | Rapor 'gerçek ağda doğrulanmadı' der. |

**Kod:**
- `docs/yol-haritasi-birlesik.md (Elle denetim bölümleri)`

**Bozulursa:** Gerçek ağ denemesi yapılmadan yayına geçilirse taklitle yeşil olan kaynaklar canlıda çalışmayabilir.

**Test:**
- elle (kullanıcı)

### D6 · Bağımlılık güncelleme

**Durum:** KISMEN

Bağımlılıklar için npm audit güvenlik taramasının içinde çalışır; kritik açık çıkışı bozar, ağ yoksa tarama 'doğrulanmadı' uyarısı verir. Tedarik zinciri sertleştirme (GitHub aksiyonlarını SHA ile sabitleme, Dependabot, SECURITY.md) planlı ama yapılmadı. Yeni bağımlılık Üst Kurul'dan geçer.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| npm audit --omit=dev (guvenlik taraması) | Kritik açık yok. | Çıkış kodu 1; ağ yoksa 'DOĞRULANMADI' uyarısı. |
| Yeni sürümü hemen alma beklemesi (14 gün) | - | doğrulanamadı: depoda 14 günlük bekleme kuralı bulunamadı; '14 gün' yalnız yedek hatırlatması için geçiyor. |
| CI aksiyonları SHA ile sabit mi | - | Hayır: ci.yml actions/checkout@v4 gibi sürüm etiketi kullanıyor. |

**Kod:**
- `scripts/guvenlik-tarama.mjs (npm audit)`
- `.github/workflows/ci.yml`
- `docs/faz-plani-kucuk-orta.md (2.3 Tedarik zinciri)`
- `docs/devir/ucuncu-taraf-lisanslar.md`

**Bozulursa:** Açık bir bağımlılık fark edilmeden kalabilir.

**Test:**
- npm run guvenlik -- --dist

**Not:** Dependabot yapılandırması bulunamadı. Bağımlılık güncelleme düzeni (aralık, bekleme süresi) henüz yazılı bir kural değil.

## E) Hukuk ve uyum devri

Ürün kişiye özel tavsiye vermez ve işlem yürütmez. KVKK, SPK ve ETBİS gibi yükümlülükler satış sonrası alıcıya devredilir; 'yükümlülükler sağlandı' beyan edilmez. Canlıda hesap, ödeme, kazıma ve yapay zekâ yorumu KAPALI kalır; çünkü kullanıcı verisi toplayan bir özellik açılırsa veri sorumlusu satıcı olur.


### E1 · TODO(hukuk) ve TODO(muhasebe) işaretleri

**Durum:** YAPILDI

Emin olunmayan hukuki ya da vergisel her konuda varsayım yapılmaz; kodun yanına bir işaret bırakılır ve listeye alınır. İşaretler devir paketindeki 'Uyumluluk durumu ve açık maddeler' sayfasının ham maddesidir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Kodda işaret var mı | src, api, netlify altında 30 satırlık eşleşme var (grep, 31.10.2026). | - |
| Yeni belirsizlik | İşaret + liste. | Varsayım yapılırsa uyum incelemesi yakalar. |

**Kod:**
- `src/kaynaklar/tcmb.ts (TODO(hukuk), TODO(muhasebe))`
- `src/evds.ts`
- `src/store.ts:addTxn (komisyon vergisi TODO(muhasebe))`
- `src/cloud.ts:deleteAccount (hesap silme TODO(hukuk))`
- `docs/veri-akisi/mevcut-durum-ve-plan.md (§5 TODO adayları)`

**Bozulursa:** İşaretsiz varsayım, alıcıya gizli hukuki borç olarak geçer.

**Test:**
- grep -rn 'TODO(hukuk)\|TODO(muhasebe)' src api netlify (elle)

### E2 · KVKK, SPK, ETBİS: alıcıya devir

**Durum:** KISMEN · **PDF ekranı:** Gizlilik kartları; SSS

Kullanıcı kararı (2026-10-28): odak sistemi kurmak; KVKK, SPK, ETBİS ve benzeri yükümlülükler satış sonrası alıcıdadır. Yasal metin taslakları (aydınlatma, kullanım koşulları, yatırım tavsiyesi değildir) docs/yasal altındadır ve YAYINLANMAZ: avukat onayı şarttır. Avukat görüşü alıcıya devredilen açık maddedir; istenirse satıştan önce alınır.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Yasal metinler avukat onaylı mı | - | Hayır; taslak. |
| 'Yükümlülükler sağlandı' beyanı | - | Hiçbir yerde yazılmaz. |
| ETBİS | - | docs altında ETBİS geçen bir belge bulunamadı; avukat maddesi olarak ayrıca yazılmalı. |

**Kod:**
- `docs/yasal/README.md`
- `docs/yasal/aydinlatma-kvkk.md`
- `docs/yasal/kullanim-kosullari.md`
- `docs/yasal/yatirim-tavsiyesi-degildir.md`

**Bozulursa:** Yükümlülük açıkça devredilmezse alıcı bunu sürpriz olarak bulur.

**Test:**
- yok (hukuki iş; test değil, avukat kontrolü)

**Not:** SPK açısından 'kullanıcıya veri/yorum sunmak' ile 'yatırım danışmanlığı' sınırı avukat görüşüne bağlıdır; hiçbir ajan bu konuda hüküm vermez.

### E3 · Tavsiye yok, işlem yürütme yok, sahte veri yok

**Durum:** YAPILDI · **PDF ekranı:** brüt→net→reel; Gizlilik kartları ("Yatırım tavsiyesi değildir" uyarısı)

Üç değişmez kural: ürün ölçer ve betimler, yönlendirmez (emir kipi yok, varsayılan hedef önerilmez); aracı kuruma emir, bakiye çekme ya da ödeme yoktur; doğrulanmamış bir sayı gerçekmiş gibi gösterilmez, kaynak başarısızsa 'veri yok' denir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Emir kipi taraması (e2e yasak kalıp) | Metin betimleyici kalır. | Test kırılır. |
| Sayı kaynak ve tarih etiketi taşıyor mu | Evet (resmi/varsayım/kullanıcı etiketi; durum metni). | Etiketsiz sayı uyum bulgusu olur. |

**Kod:**
- `AGENTS.md §0.2, §0.3, §0.4`
- `src/agent.ts (tavsiye kuralı)`
- `src/kaynaklar/tip.ts:kaynakDurumMetni`
- `src/projection.ts (EtiketliSayi)`

**Bozulursa:** İhlal SPK/tüketici riski doğurur; bu yüzden e2e ve uyum incelemesi iki katman olarak çalışır.

**Test:**
- tests/e2e/fagent-parser-e2e.mjs: Ret metni yasaklı kelime içermiyor
- tests/e2e/fagent-analytics-e2e.mjs: tavsiye/kesinlik dili yok
- tests/unit/kaynaklar.test.ts: durum metni: yasak kalıp yok

### E4 · Yapay zekâ yorumu (cihazda açık kaynak model)

**Durum:** PLANLI

Kullanıcı, portföy ve piyasa verisi üzerinden LLM yorumu istedi. Üst Kurul kararı: yalnız CİHAZDA çalışan açık kaynak model (A) koşullu onay, yalnız uygulanabilirlik denemesi olarak; sunucuda model (B) ve ticari API (C) RED, çünkü portföy verisi sunucuya gidemez. Ajan sekmesi kural tabanlı kalır. Deneme başlamadan önce kullanıcının açık 'başla' onayı beklenir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Kullanıcı 'başla' onayı | Deneme başlar. | Başlamaz. |
| Deneme ölçütleri (model ≤2 GB bellek, 40 sentetik senaryo, çıktıdaki sayı doğrulaması ≥%95, yasak kalıp %0, Türkçe okur puanı ≥4) | Ürüne alınabilirlik değerlendirilir. | Biri tutmazsa RED. |
| Tavsiye filtresi ve 'Yapay zekâ ile üretildi, tavsiye değildir' etiketi | - | Çıktı atılır. |
| Avukat ve kullanıcı onayı canlıdan önce | - | 'Yorum bizi sorumlu tutmaz' varsayımı DOĞRULANMADI; canlıya alınmaz. |

**Kod:**
- `docs/teknoloji-talepleri.md (2026-10-27 satırı)`
- `doğrulanamadı: yapay zekâ kodu repoda yok (aiAgent katmanı 3. adımda çıkarıldı; src/localData.ts LEGACY_KEYS yalnız eski anahtarı siler)`

**Bozulursa:** Henüz kod yok; etkisi yok.

**Test:**
- yok (planlı deneme)

**Not:** HF model kartları bu ortamdan doğrulanamadı.

### E5 · 'Uyumluluk durumu ve açık maddeler' sayfası

**Durum:** PLANLI

Devir paketine eklenecek tek sayfa: hangi yükümlülük kimde, hangi madde açık, hangi belge taslak. Kaynakları TODO işaretleri, docs/yasal/*, docs/teknoloji-talepleri.md ve docs/devir/kurulum-ve-devir.md içindeki açık maddelerdir. Bu sayfa 'sağlandı' demez, 'şu açık' der.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Sayfa var mı | - | Yok. |
| Her açık madde kaynak satırıyla bağlı | Alıcı izleyebilir. | - |

**Kod:**
- `doğrulanamadı: docs/devir/ altında bu sayfa yok (3 dosya var: ilan-taslagi.md, kurulum-ve-devir.md, ucuncu-taraf-lisanslar.md)`

**Bozulursa:** Sayfa olmadan hukuk yükünün devri yazılı olmaz.

**Test:**
- yok

### E6 · Canlıda kapalı kalanlar

**Durum:** YAPILDI · **PDF ekranı:** Abonelik planları (ödeme canlıda kapalı); Gizlilik kartları

Satıştan önce canlıda dört kapı kilitli kalır: hesap (Supabase), ödeme, kazıma (KAP/BİST) ve yapay zekâ yorumu. Hesap kapısı kodla kilitli: env boşken bulut kodu çalışmaz. Ödeme, kazıma ve yapay zekâ için kod yoktur.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Hesap: VITE_SUPABASE_* canlıda tanımlı değil | Hesap ekranı görünmez. | Tanımlanırsa veri sorumlusu satıcı olur. |
| Ödeme/abonelik | - | Yok (adım 8 planlı; canlıda kapalı kalır, PDF tasarımındaki abonelik planları ekranı ödeme olmadan yalnız bilgi olarak düşünülür, karar kullanıcıda). |
| Kazıma | - | Yok. |
| Yapay zekâ | - | Yok. |

**Kod:**
- `src/cloud.ts:cloudEnabled`
- `CLAUDE.md (HUKUK/UYUM YÜKÜ ALICIYA DEVİR)`

**Bozulursa:** Kapı yanlışlıkla açılırsa kullanıcı verisi toplanır ve hukuki sorumluluk satıcıya geçer.

**Test:**
- tests/run-e2e.mjs: dist/ içinde Supabase adresi yok doğrulaması

**Not:** Yalnız hesap kapısı kodla zorlanıyor; ötekiler kod yazılmadığı için kapalı.

## F) Satış ve devir

Hedef: Acquire.com'da satılabilir tek ürün. Değer gelirle belirlenir (2-3 ay gerçek gelir adımı); bugün gelir yoktur. Devir paketi kod, alan adı, hesaplar, belgeler ve gelir kanıtını içerecek.


### F1 · Devir belgeleri

**Durum:** KISMEN

docs/devir altında üç taslak vardır: kurulum ve devir kılavuzu, ilan taslağı, üçüncü taraf lisanslar. Kılavuz yerel çalıştırma, ortam değişkenleri, barındırma, Supabase ve açık maddeleri anlatır. Bazı bölümleri güncel değildir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Belge-kod tutarlılığı (EVDS/Netlify/Vercel, depolama, sabitler) | İddialar kodla uyumlu. | Belge aynı kalemde düzeltilir. |
| IndexedDB aynası ve yeni sunucu uçları belgede | - | Kılavuz bunları anlatmıyor (doğrulama: bu belgenin içeriğine bakıldı; IndexedDB geçmiyor). |
| Lisans özeti | scripts/lisans-ozeti.mjs üretir. | - |

**Kod:**
- `docs/devir/kurulum-ve-devir.md`
- `docs/devir/ilan-taslagi.md`
- `docs/devir/ucuncu-taraf-lisanslar.md`
- `scripts/lisans-ozeti.mjs`

**Bozulursa:** Eskimiş devir belgesi alıcıyı yanlış yönlendirir.

**Test:**
- belge-kod-tutarlılığı grep'leri (elle)

**Not:** Kılavuz başlığında TASLAK yazıyor; canlı kurulumla birlikte tamamlanacak. İlan taslağında test sayısı '674+' geçiyor ve eski; güncel kayıtlı sayı 736 e2e (28.10).

### F2 · Acquire.com ilanı ve gelir kanıtı

**Durum:** PLANLI

İlana yalnız gerçek, kanıtlanabilir rakam yazılır. Gelir, kullanıcı, büyüme ya da retention uydurulmaz; veri yoksa 'henüz gelir yok' yazılır. Alıcı due diligence'ta ödeme sağlayıcı raporu ve ölçüm ekran görüntüsü isteyecektir. Bugün gelir yok ve ödeme sistemi kurulu değil.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| İlan alanları doldurulmuş mu | Yayınlanır. | Taslakta [GELİR/KULLANICI DURUMU] gibi boş alanlar var: DOLDURULMADAN YAYINLANMAZ. |
| Gizlilik dostu metrik | - | Tanımlı değil (devir paketi adımı 10). |
| Tahmini değer | - | Gelirsiz, doğrulanmamış tahmin: yaklaşık 1-5 bin $; hedef ücretli kullanıcıyla 10-50 bin $+ (CLAUDE.md). |

**Kod:**
- `docs/devir/ilan-taslagi.md`

**Bozulursa:** Uydurma rakam ilanı hukuki ve itibar riskine çevirir.

**Test:**
- yok

### F3 · Devir paketi klasörü

**Durum:** PLANLI

Planlanan paket: kaynak kod, tasarım, belgeler, raporlar, ekip hafızası ve bir zip. Kullanıcının özel prompt dizini dosyası pakete ASLA girmez ve hiçbir .env* dosyası girmez. Paket oluşturma betiği ve klasör henüz yok.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| scripts/paket-olustur.sh ve /home/user/FAGENT-Paket var mı | - | Yok (scripts/ altında bu dosya yok; klasör yok). |
| Dışlama listesi (kullanıcı özel prompt dizini, .env*) | Pakete girmez. | - |
| Paket içi gizli anahtar taraması | npm run guvenlik ile taranabilir. | - |

**Kod:**
- `doğrulanamadı: scripts/paket-olustur.sh yok`
- `doğrulanamadı: /home/user/FAGENT-Paket yok`

**Bozulursa:** Paket yanlış dosya taşırsa özel prompt ya da anahtar sızabilir; bu yüzden dışlama listesi test edilmeden paket üretilmez.

**Test:**
- yok (planlı)

### F4 · Hesap devri kontrol listesi

**Durum:** KISMEN

Devirde alan adı kayıt sahibi, Vercel projesi/ekibi, Supabase proje sahipliği, ödeme sağlayıcı hesabı/IBAN, GitHub deposu ve ortam değişkenleri alıcıya geçer. Ortam değişkenleri alıcının hesabında yeniden girilir, eski anahtarlar iptal edilir.

| Kontrol | Geçerse | Geçemezse |
|---|---|---|
| Kontrol listesi maddeleri | Her biri işaretlenir. | Devir tamamlanmaz. |
| Eski anahtarlar iptal edildi mi (EVDS, Supabase) | Evet. | Eski sahip erişimi sürer. |

**Kod:**
- `docs/devir/kurulum-ve-devir.md (Devir kontrol listesi)`

**Bozulursa:** Eksik devirde eski sahibin anahtarı çalışmaya devam edebilir.

**Test:**
- yok

**Not:** Liste var; hiçbir madde işaretli değil, çünkü devredilecek hesap bu aşamada yok (alan adı, ödeme, Supabase üretim projesi).

## Kapılar

| Kapı | Nerede | Ne zaman | Test |
|---|---|---|---|
| Tür denetimi (typecheck) | npm run typecheck; CI: ci.yml | Her iş sonunda, commit öncesi | tsc --noEmit -p tsconfig.app.json |
| Üretim derlemesi | npm run build (scripts/build.mjs); CI | Her iş sonunda | Derleme biter ve gizli Supabase anahtarı yoksa |
| Derleme: gizli Supabase anahtarı kilidi | scripts/build.mjs | Her derlemede | sb_secret_ ya da service_role içeren VITE_* değerinde derleme durur |
| Güvenlik taraması | npm run guvenlik -- --dist (scripts/guvenlik-tarama.mjs); CI | Her iş sonunda, derlemeden sonra | Gizli anahtar deseni, izlenen .env, VITE_ gizli değişken, npm audit; kritik bulguda çıkış 1 |
| Birim testler | npm run test:unit (tests/unit/*.test.ts) | Her iş sonunda | depolama, evds-sunucu, kaynaklar, projeksiyon, hesap test dosyaları; CI'da koşulmuyor (açık) |
| Uçtan uca testler (iki derleme) | npm run test:e2e (tests/run-e2e.mjs) | Her iş sonunda, ve düzeltme turlarından sonra | dist/ hesapsız (port 4200) ve dist-e2e-cloud/ sahte Supabase (port 4201); sonuç 'sahte Supabase ile yeşil' |
| Kontrol sayısı azalmaz | Test ajanı raporu | Her e2e koşusunda | Önceki kayıtlı sayıyla karşılaştırma (son kayıt 736) |
| Auth beyaz liste kontrolleri silinmez | tests/e2e/fagent-auth-e2e.mjs | Bulut ya da yedek yoluna dokunan her işte | Beyaz liste kontrolleri gevşetilmez |
| CSP / güvenlik başlıkları | vercel.json, netlify.toml | Başlık ya da dış adres değişince | tests/e2e/fagent-csp-e2e.mjs |
| IndexedDB aynası gerçek tarayıcıda | tests/e2e/fagent-depolama-e2e.mjs | Depolama katmanına dokunan her işte | Ayna yazımı, SIFIRLA sonrası geri gelmeme, kurtarma |
| Yasak kalıp (tavsiye dili) | tests/e2e/fagent-analytics-e2e.mjs, fagent-parser-e2e.mjs; tests/unit/kaynaklar.test.ts | Kullanıcıya görünen metin değişince | gerekir|malısın|melisin|öneri|sayılır|kesin|tavsiye (değildir/veremem hariç) |
| Belge-kod tutarlılığı | .claude/skills/belge-kod-tutarliligi/SKILL.md | Altyapı, env, dosya yolu, sabit ya da depolama değişince | Skill'deki grep'ler; her iddia için dosya:satır kanıtı |
| Güvenlik incelemesi (iki mercek) | Ekip iş akışı (fagent-guvenlik) | Her koşuda ve her düzeltme turundan sonra | Açık kritik/yüksek bulgu varsa birlestirilebilir: false |
| Uyum incelemesi | Ekip iş akışı (fagent-uyum) | Kullanıcıya görünen metin değiştiğinde | Tavsiye yok, işlem yürütme yok, sahte veri yok, varsayım etiketi |
| Üst Kurul talebi | docs/ust-kurul.md, docs/teknoloji-talepleri.md | Yeni kütüphane, yöntem ya da servis öncesi | ONAY / KOŞULLU ONAY / RED kaydı (iş akışında zorunlu aşama değil, istem kuralı) |
| Açık insan onayı | AGENTS.md §1 | main/yedek dallarına birleştirme, üretim deploy'u, Supabase üretim migration'ı, alan adı ve ödeme ayarı | Ajan mesajı onay yerine geçmez |
| Commit yasağı (yeşil olmadan) | CLAUDE.md HEDEF bölümü | Her adım sonunda | Kapı yeşil + güvenlik + uyum incelemesi temiz olmadan commit yok |
| Dış kaynak taklit kuralı | tests/e2e/*, tests/unit/evds-sunucu.test.ts | Dış API'ye dokunan her testte | page.route() / sahte fetch; rapor 'gerçek ağda doğrulanmadı' yazar |

## Bilinen açıklar

1. Dış kaynaklar (EVDS, CoinGecko, Frankfurter) gerçek ağda hiç doğrulanmadı; tüm sonuçlar taklit yanıtla yeşil.
2. EVDS_API_KEY Vercel fagent projesinde tanımlı değil (27.10 kontrolü); TÜFE seri kodu TP.FG.J0 ve tüm kur seri kodları gerçek yanıtla doğrulanmadı; kur tablosu bilerek boş.
3. Gerçek Supabase projesine karşı RLS, delete_my_account, e-posta yönlendirmeleri ve PASSWORD_RECOVERY doğrulanmadı; auth testleri sahte Supabase ile yeşil.
4. Bulut canlı-öncesi maddeleri açık: 34+33 (girişliyken SIFIRLA buluttaki kopyayı ezer), 35 (başka sekmeden çıkış yerel kopyayı silebilir; A8 ile yalnız 'öteki sekmenin diski yeniden doldurması' yanı kapandı), 27 (koşulsuz upsert, son yazan kazanır). 41 (geri yükleme atomik değil, boyut sınırı) kapandı (A14). Bunlar kapanana kadar VITE_SUPABASE_* canlıda tanımlanmaz.
5. localStorage doluyken yazılamayan değişiklik yalnız bellekte durur: sayfa yenilenirse kaybolur (ekrandaki uyarı ve beforeunload onayı bunu bildirir); değer IndexedDB aynasına bilerek yazılmaz (localStorage esas kaynak). Kota, setItem hatası taklit edilerek sınandı; gerçek kota dolumu denenmedi. Vergi/hedef/ajan katmanlarının kota yolu node birim testinde değil yalnız yazmaDurumu üzerinden sınandı. Uyarının yönlendirdiği 'Veri Yedeği' kartı yalnız Panel sekmesinde; yeri tasarım kararı.
6. Kayıt kimliği t<milisaniye> / h<milisaniye> biçiminde; aynı milisaniyede iki kayıt aynı kimliği alabilir (store.ts addTxn, addIncome, addHolding). Kod okunarak görüldü.
7. store.addTxn tutarın pozitif olmasını kendisi denetlemez; denetim arayüzde (App.tsx). Başka bir çağıran (örn. ajan) geçersiz tutar gönderirse store'a ulaşabilir; ajan yolunda tutar denetiminin tamlığı bu belgede doğrulanmadı.
8. Asıl okuma hâlâ localStorage'dan; IndexedDB yalnız doğrulanmış ayna. Okumanın IndexedDB'ye geçmesi, uyumluluk aynasının kalkma zamanı ve kurtarma kayıtları için kullanıcıya görünür bildirim yapılmadı.
9. IndexedDB'de ayrılan alan sınırı ve kota davranışı gerçek cihazlarda sınanmadı; IndexedDB silme mantıksaldır, fiziksel silme tarayıcıya bağlıdır (aydınlatma metni notu avukat onayı bekliyor).
10. kaynakDurumMetni ve KaynakSonucu sözleşmesi ekrana bağlı değil (PDF tasarımındaki ilgili ekrana bağlama bekliyor); CoinGecko ve Frankfurter çağrıları henüz ortak çalıştırıcıya taşınmadı ve CSP connect-src daraltılmadı.
11. EVDS çökerse en kötü vazgeçme süresi yaklaşık 11 sn (5 + 1 + 5); e2e ile ölçülmedi, arka planda çalıştığı için ekranı bekletmediği varsayımı doğrulanmadı.
12. Sunucu hız sınırı ve devre kesici sunucusuz ortamda örnek başına bellekte tutulur; kesin garanti değil, en iyi çaba.
13. Hız sınırında kullanılan istemci IP'sinin kişisel veri sayılıp sayılmadığı avukat teyidine bağlı (TODO(hukuk)); EVDS kullanım şartları ticari/abonelikli üründe birincil metinle doğrulanmadı.
14. Projeksiyon motorunun yeni fonksiyonlarının çoğu ekrana bağlı değil; Aşama B (Monte Carlo) için ayrı onay gerekiyor ve rassal yürüyüş ertelemesiyle çelişki notu planda.
15. Vergi oranları tarih aralıklı tax_rules.json yerine TypeScript yapılandırmasında; fon stopajı %17,5 ve enflasyon varsayımı %30 birincil kaynakla doğrulanmadı (TODO(muhasebe)).
16. KAP (YH-4), BİST (YH-5) ve paylaşılan veri önbelleği (YH-6) yapılmadı; YH-7 ve YH-8 PDF tasarımına göre yeniden tanımlanacak (motorlar PDF ekranlarını besler). KAP/BİST için kaynak sayfa, kullanım koşulu ve lisans doğrulanmadı; AGENTS.md §0.4 güncellemesi kullanıcı onayı bekliyor.
17. docs/mvp-tanimi.md, CHANGELOG, scripts/paket-olustur.sh, /home/user/FAGENT-Paket, 'Uyumluluk durumu ve açık maddeler' sayfası ve alan adı henüz yok. MVP kapsamı (PDF tasarımındaki hangi ekran ve özellik ilk sürümde açık) kullanıcıya sorulacak.
18. ci.yml Node 20 kuruyor, package.json engines >=22.18; CI'da test:unit adımı yok; aksiyonlar SHA ile sabit değil; Dependabot yok. Kod okunarak görüldü, CI koşusu yapılmadı.
19. Bağımlılıklar için 14 günlük bekleme kuralı depoda bulunamadı; bağımlılık güncelleme düzeni yazılı kural değil.
20. Yapay zekâ yorumu denemesi kullanıcının 'başla' onayını bekliyor; 'yorum bizi sorumlu tutmaz' varsayımı doğrulanmadı, SPK açısından avukat görüşü canlı öncesi zorunlu. HF model kartları bu ortamdan doğrulanamadı.
21. Yasal metin taslakları (docs/yasal) avukat onaylı değil; ETBİS hiçbir belgede geçmiyor.
22. Devir belgeleri güncel değil: kurulum-ve-devir.md IndexedDB aynasını ve yeni sunucu uçlarını anlatmıyor; ilan taslağındaki test sayısı (674+) eski.
23. Gerçek tarayıcıda 1440 px ve 375 px görsel kontrol yapılmadı (doğrulama durumu notu, 2026-10-18).
24. Kurtarma rafı işlevleri (listele, geri yükle, dışa aktar) ekrana bağlı değil; düğme ve bildirim yeri tasarım kararı. İki sekmede eşzamanlı geri yüklemede kilit yok (son yazan kazanır). Eski adlandırmayla yazılmış büyük bozuk kayıtlar 'farklilik' diye listelenir. Listeleme her kaydı okuyarak boyut ölçer (raf küçük ve sınırlı).
25. Sekmeler arası eşitleme: olay gecikmesinde yazım anı karşılaştırması ezilen sürümü kurtarma alanına alır ama işlemi yine uygular (stale bellek kazanır). Başka sekmenin sürümü kurtarma alanına alınamazsa (IndexedDB yok/hata) kaydedilmemiş değişiklik yazılmadan bekler; her yazımda kopya yeniden denenir, IndexedDB hiç yoksa bekletme sürer (yenilemede kaybolur). Silme işareti ömrü (30 sn) ölçülmedi, varsayım. Çakışma ve silme-kazanır kararları gerçek tarayıcıda yalnız kota taklidiyle sınandı; 'kopya alınamadı' yolu yalnız birim testte. #35'in 'çıkışla hesaba yüklenmemiş tek yerel kopya silinir' yanı açık.

---
Durum dağılımı: YAPILDI 28, KISMEN 13, PLANLI 13.
