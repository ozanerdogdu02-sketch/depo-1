# Çok kaynaklı veri planı: TCMB (EVDS) + KAP + BİST

Yazan: yönetmen, 2026-10-27. Durum: **PLAN — kod yok, kullanıcı kararı bekliyor (§7).**
Kapsam: `CLAUDE.md` → KAPSAM KARARI (altyapı ve veri akışı); `docs/veri-akisi/spec.md` P5 ve P3'e bağlıdır.

## 0. Sonuç önce (sade dille)

1. **EVDS ile "TCMB" aynı kurumdur.** EVDS, Merkez Bankası'nın veri dağıtım servisidir. Merkez Bankası'nın günlük
   kur dosyası (`tcmb.gov.tr/kurlar/...xml`) ise aynı kurumun sitesidir. İkisini **tek kaynak "TCMB (EVDS üzerinden)"**
   olarak birleştirmeyi öneriyoruz. Neden: EVDS'in kullanım şartları "kaynak göstererek kullanılabilir" diyor; ana sitenin
   şartları ise "ticari kullanım yazılı izne tabi" diyor (kaynaklar §4). Yani ticari üründe EVDS yolu hukuken daha temiz.
2. **Böylece üç kaynak şöyle olur:** (1) TCMB/EVDS — enflasyon (TÜFE), döviz kuru, gerekirse faiz; (2) KAP — şirket
   bildirimleri (temettü, sermaye artırımı, finansal tablo tarihi); (3) BİST — hisse fiyatı. **BİST fiyatı için ücretsiz,
   resmî, lisanssız bir yol bulunamadı**; hisse fiyatı bugünkü gibi elle/CSV ile girilmeye devam eder (AGENTS.md §0.4).
3. **"Birden fazla veritabanı" sözü doğru anlamıyla:** bunlar bizim veritabanımız değil, dışarıdaki **veri kaynakları**.
   Kullanıcının portföyü sunucuya gitmez (local-first). Her kaynağın son okunan değeri tarayıcıda, kendi ayrı
   "çekmecesinde" (önbellek) durur. Sunucuda yalnızca anahtar isteyen ince geçiş fonksiyonları olur (`api/evds.mjs` gibi).
4. **"Sorun olunca yalnızca o kaynağa ulaşılsın":** her kaynağın kendi bağdaştırıcısı (adapter) olur. EVDS çökerse
   yalnızca enflasyon/kur bölümü "EVDS'ye ulaşılamadı, son bilinen değer: 5 Ekim 2026" der; kripto ve diğer ekranlar
   çalışmaya devam eder. Uydurma sayı hiçbir koşulda gösterilmez.
5. **KAP** için resmî, belgelenmiş, ücretsiz bir geliştirici API'si **bulunamadı**. Topluluk araçları KAP sitesinin iç
   uçlarını (`kap.org.tr/tr/api/...`) kullanıyor; bu "kazıma" sayılır, koşulları doğrulanamadı. **Hukuk onayı olmadan
   KAP bağlanmaz**; plan sıranın sonunda.

## 1. (a) EVDS ve TCMB: aynı kurumun iki yüzü

| Yüz | Ne | Erişim | Anahtar | Biçim | Bugün kodda |
|---|---|---|---|---|---|
| EVDS (Elektronik Veri Dağıtım Sistemi) | TCMB'nin zaman serisi servisi: TÜFE, kurlar, faizler, binlerce seri | `evds2.tcmb.gov.tr/service/evds/...` (yeni arayüz `evds3.tcmb.gov.tr`) | **Evet** (ücretsiz üyelik; anahtar istek başlığında `key`) | JSON / XML / CSV | `netlify/functions/evds.mjs` + `api/evds.mjs`; yalnız TÜFE `TP.FG.J0`; anahtar Vercel'de henüz yok (503 `anahtar_yok`) |
| TCMB günlük kur dosyası | 15:30'da açıklanan "gösterge niteliğinde" döviz/efektif kurlar | `www.tcmb.gov.tr/kurlar/today.xml`, geçmiş: `/kurlar/YYYYAA/GGAAYYYY.xml` | Hayır | Yalnız XML | Kullanılmıyor (kur bugün Frankfurter/ECB'den) |

Öneri — **birleştir, tek bağdaştırıcı "tcmb", tek sunucu ucu `api/evds.mjs`:**
- Kur da EVDS'ten çekilir (TCMB kur serileri EVDS'te de yayınlanır). Tek anahtar, tek hata yeri, tek kaynak etiketi:
  "Kaynak: TCMB EVDS, dönem: …".
- Günlük XML dosyası **kullanılmaz**: (1) ana site şartlarında "ticari kullanım yazılı izne tabi" ibaresi var; (2) Node'da
  XML ayrıştırıcı yok, yeni bağımlılık ya da elle ayrıştırma gerekir (risk); (3) aynı veri EVDS'te JSON olarak var.
  İstisna: hukuk incelemesi XML'i serbest bulursa, anahtarsız yedek yol olarak yeniden değerlendirilir (§6 S9).
- EVDS kur seri kodları (ör. ABD doları alış/satış) **doğrulanamadı** (bu ortamdan EVDS'e erişim yok: proxy reddetti,
  2026-10-27). Kod, anahtar Vercel'e eklendikten sonra gerçek yanıtla doğrulanır; beyaz listeye (`IZINLI_SERILER`) ancak
  o zaman eklenir.
- Not: anahtarın URL'den istek başlığına taşındığı topluluk kaynaklarında yazıyor; mevcut kod zaten başlıkla gönderiyor
  (`headers: { key }`). Resmî duyuru tarihi doğrulanamadı.

## 2. (b) Bağdaştırıcı (adapter) mimarisi — kaynak başına izolasyon

### 2.1 Tek sözleşme
Her kaynak aynı biçimde cevap verir (ad önerisi, kod yazılmadı):

```
KaynakSonucu<T> = {
  kaynak: 'tcmb' | 'coingecko' | 'frankfurter' | 'kap' | 'elle',
  durum: 'guncel' | 'eski' | 'ulasilamadi' | 'kapali' | 'veri_yok',
  veri?: T,              // yalnızca gerçekten okunmuş veri; tahmin/doldurma yok
  donem?: string,        // verinin ait olduğu tarih (ör. "09-2026"), kaynağın kendi tarihi
  alindi?: string,       // tarayıcının en son başarıyla aldığı an (ISO)
  hata?: 'anahtar_yok' | 'ulasilamadi' | 'kaynak_hatasi' | 'okunamadi' | 'zaman_asimi' | 'mantik_disi'
}
```
- Bağdaştırıcı **hata fırlatmaz** (bugünkü `src/evds.ts` deseni). Her şey `KaynakSonucu` döner.
- Yeni dosya önerisi: `src/kaynaklar/` (tip, kayıt defteri, bağdaştırıcılar). Saf parçalar (durum metni, TTL hesabı,
  geri çekilme hesabı) I/O içermez ve `node --test` ile sınanır.

### 2.2 Her kaynağın kendi önbelleği
| Kaynak | Önbellek anahtarı (öneri) | Ömür (TTL) | Gerekçe |
|---|---|---|---|
| TCMB TÜFE | `fagent.kaynak.tcmb.tufe.v1` | 12 saat (bugünkü değer) | Ayda bir açıklanır |
| TCMB kur | `fagent.kaynak.tcmb.kur.v1` | 1 saat; hafta sonu değişmez | Günde bir açıklanır |
| CoinGecko | mevcut `fagent.cryptomarket.cache` | mevcut | değişmez |
| Frankfurter | mevcut `fagent.pricehistory.v1.*` | mevcut | karar K2'ye göre kalır/çıkar |
| KAP (ileride) | `fagent.kaynak.kap.v1` | 30 dk | yalnız hukuk onayından sonra |

- Önbellek **kullanıcı verisi değildir**, yeniden üretilebilir; `BACKED_UP_KEYS`'e girmez, buluta gitmez.
- Bugün localStorage; P3 bağlama adımı (Y1–Y5, `mevcut-durum-ve-plan.md` son bölüm) kapanınca aynı `KvStore`
  arayüzüyle IndexedDB'ye (`src/storage`) taşınır. Bu yüzden bağdaştırıcılar doğrudan `localStorage` değil
  `KvStore` arayüzü kullanmalı (bugün `createLocalStore`, sonra `createBrowserStore`).
- Süresi geçmiş önbellek **silinmez**: kaynak çökünce "son bilinen değer" olarak, tarihiyle gösterilir (`durum: 'eski'`).

### 2.3 Hata, yeniden deneme, devre kesici
- Zaman aşımı: her istek `AbortController` ile 8 sn (öneri).
- Yeniden deneme: aynı oturumda en çok 2 kez, artan bekleme (2 sn, 8 sn). Sonra **devre kesici**: o kaynak 15 dk
  denenmez, durum `ulasilamadi`. Sayfa her açıldığında kaynağa yüklenilmez.
- `anahtar_yok` (503) yeniden denenmez: bu bir arıza değil, yapılandırma durumudur → `kapali`.
- Mantık kontrolü bağdaştırıcıda: ör. TÜFE −%50…+%500 dışı → `mantik_disi`, değer atılır (bugünkü kural korunur).
  Kur için benzer aralık (önceki değerden günlük ±%20 dışı) önerilir; eşik `src/config/varsayilanlar.ts`'e yazılır.

### 2.4 İzolasyon (bozuk kaynak yalnızca kendi verisini etkiler)
- Tarayıcı: kayıt defteri kaynakları **bağımsız** çağırır (`Promise.allSettled` mantığı); biri asılı kalsa da diğerleri
  sonuç verir. Her ekran yalnızca kendi kaynağının sonucunu okur.
- Sunucu: kaynak başına **ayrı fonksiyon dosyası** (`api/evds.mjs`, ileride `api/kap.mjs`). Vercel'de her dosya ayrı
  çalışır; KAP fonksiyonundaki hata EVDS'i durdurmaz. Ortak "tek uç her şeyi çeker" tasarımı **reddedildi**.
- Sunucu fonksiyonları kullanıcı kimliği/portföy almaz; sabit, kişiselleştirilmemiş tablo çeker (tüm kurlar, son N
  bildirim); süzme tarayıcıda yapılır (`mevcut-durum-ve-plan.md` §5 karar 5 ile aynı ilke).

### 2.5 Kullanıcıya betimleyici durum metni (sahte veri yok)
| Durum | Metin örneği |
|---|---|
| guncel | "Kaynak: TCMB EVDS · dönem 09-2026 · alındı 27.10.2026 14:05" |
| eski | "TCMB EVDS'ye şu an ulaşılamıyor. Son bilinen değer gösteriliyor: dönem 09-2026 (alındı 26.10.2026)." |
| ulasilamadi + önbellek yok | "TCMB EVDS'ye ulaşılamadı. Enflasyon için varsayım kullanılıyor: %30 (kaynak: TÜİK Eylül 2026, doğrulanmadı)." |
| kapali | "Canlı enflasyon kapalı (sunucu anahtarı tanımlı değil). Varsayım kullanılıyor: …" |
| mantik_disi | "TCMB EVDS'den gelen değer okunamadı; gösterilmiyor." |
- Emir kipi, tahmin, "öneri" yok (`uyum-dili` skill). Her sayının yanında kaynak ve tarih zorunlu.
- Metinler saf bir fonksiyondan üretilir (`kaynakDurumMetni(sonuc)`), birim testle dondurulur; e2e seçicileri bu metni arar.

## 3. (c) "Veritabanı" sözünün doğru çevirisi

| Kullanıcının sözü | Sistemdeki karşılığı | Nerede |
|---|---|---|
| "EVDS veritabanı" | Dış veri kaynağı (TCMB'nin) | TCMB sunucusu; biz yalnızca okuruz |
| "KAP veritabanı" | Dış veri kaynağı (MKK işletir) | KAP sunucusu; şimdilik okunmaz |
| "BİST veritabanı" | Lisanslı dış kaynak | Lisans olmadan okunmaz |
| Kaynağın son değeri | Tarayıcı önbelleği | `localStorage` → P3 sonrası IndexedDB (`src/storage`) |
| Anahtar gerektiren çağrı | İnce geçiş fonksiyonu | `api/evds.mjs` (Vercel); veri saklamaz, CDN önbelleği 6 saat |
| Kullanıcının portföyü | Yalnız tarayıcı | Sunucuya gitmez (P0.1); Supabase kodu açık ama canlıda env tanımsız |

Sunucu tarafında **yeni bir veritabanı kurulmaz.** Gerekirse yalnızca HTTP önbellek başlığı (`s-maxage`) kullanılır.

## 4. (d) Kaynak başına hukuki/teknik durum

> Bu ortamdan `tcmb.gov.tr`, `evds2/evds3.tcmb.gov.tr`, `kap.org.tr`, `borsaistanbul.com` adreslerine doğrudan erişim
> proxy tarafından reddedildi (2026-10-27). Aşağıdakiler **web arama özetlerinden** alındı; birincil metin okunmadı.
> Her satır "doğrulanmalı" sayılır.

| Kaynak | Resmî API | Anahtar | Kullanım koşulu (bulgu) | Bilinmeyen / doğrulanamadı |
|---|---|---|---|---|
| **TCMB EVDS** | Var (web servis, kullanım kılavuzu PDF) | Evet, ücretsiz üyelik | EVDS'e özgü şartlar: veriler **kaynak gösterilerek** üçüncü kişilerce kullanılabilir ve yayımlanabilir; çeviride "resmî çeviri değildir" notu; TCMB doğruluk/güncellik taahhüdü vermez, veriyi haber vermeden değiştirebilir/kaldırabilir; içerik yatırım tavsiyesi değildir | İstek kotası; ticari üründe kullanım ve ücretli üründe yeniden gösterimle ilgili cümlenin tam metni (arama özeti belirsiz); evds2→evds3 geçiş tarihi; kur seri kodları |
| **TCMB ana site / today.xml** | Belgelenmiş API yok; herkese açık XML dosyası | Hayır | Site şartları (2018 tarihli sürüm): bilgiler kaynak gösterilerek yayımlanabilir, **ticari amaçla kullanım TCMB'nin yazılı iznine tabi** | Bu ibarenin EVDS verisi için de geçerli olup olmadığı; güncel metin |
| **KAP** | Belgelenmiş, herkese açık geliştirici API'si **bulunamadı**. Sitenin iç uçları (`kap.org.tr/tr/api/...`) topluluk araçlarınca (pykap, kap-mcp) kullanılıyor | — | KAP'ı SPK tebliği kapsamında MKK işletir (kap.org.tr genel bilgi). Bildirimler herkese açık okunur. KAP'ın kendi yasal uyarı/kullanım metni **bulunamadı** | Kazıma (iç uç çağırma) izni; ticari yeniden yayın; veri dağıtım lisansı gerekip gerekmediği; iç uçların kararlılığı; sunucu IP engeli |
| **BİST fiyat** | Doğrudan bireysel API yok; veri **lisanslı veri dağıtım kuruluşları** üzerinden eş zamanlı, gecikmeli (yaygın: 15 dk) ve gün sonu yayınlanır | Sözleşme | Borsa İstanbul "veri yayını" sayfası: başvuru veri/pazarlama birimine. Paketler (Pay Düzey 1/2 vb.) aracı kurum sayfalarında listeli | Gecikmeli/gün sonu verinin üçüncü taraf uygulamada **ücretsiz gösterimi** için lisans gerekip gerekmediği; 2026 ücretleri. Eylül 2026'da "anlık ücretsiz veri" dönemi başladığını söyleyen tek kaynak (Foreks bülteni) var, resmî duyuruyla doğrulanmadı ve bir aracı platforma özgü görünüyor |

### TODO adayları (hüküm verilmedi)
- `TODO(hukuk)` EVDS şartlarının tam metni: ticari/abonelikli üründe (adım 8 Premium) gösterim serbest mi; kaynak
  gösterme biçimi (ekranda "Kaynak: TCMB EVDS" yeterli mi).
- `TODO(hukuk)` TCMB ana site "ticari kullanım yazılı izne tabi" ibaresi: today.xml kullanılırsa izin gerekir mi.
- `TODO(hukuk)` KAP: iç uçları sunucudan çağırmak (kazıma) kullanım koşullarına uygun mu; MKK'dan yazılı izin/veri
  lisansı gerekir mi; bildirim metninin özetlenmesi/yeniden yayını.
- `TODO(hukuk)` BİST: gecikmeli ve gün sonu fiyatın uygulamada gösterimi için lisans; lisanssız elle/CSV girişin
  (kullanıcının kendi girdiği fiyat) sorun olmadığının teyidi.
- `TODO(hukuk)` SPK: KAP bildirimlerini portföydeki hisseye göre listelemek "yatırım danışmanlığı" sayılır mı
  (betimleyici liste, yorum yok varsayımıyla).
- `TODO(muhasebe)` TÜFE seri kodu `TP.FG.J0` ve yıllık değişim hesabı (endeks/12 ay önce) doğrulaması.
- `TODO(muhasebe)` Döviz varlığı değerlemesinde hangi TCMB kuru (döviz alış / satış / efektif) esas alınır; vergide
  kur farkı (mevcut TODO ile birleşir).
- `TODO(muhasebe)` KAP temettü bildiriminden net temettü gösterilirse stopaj oranı (bugün kodda yok).

## 5. (e) Mevcut modellere bağlanma

| Model | Bugün | Bağlantı | Uyarı |
|---|---|---|---|
| Enflasyon varsayımı (`src/inflation.ts`, `src/config/varsayilanlar.ts`) | EVDS TÜFE → yoksa sabit %30 | Değişmez; yalnızca `fetchInflationPct` tcmb bağdaştırıcısının içine sarılır, `InflationState` `durum`/`alindi` alanı kazanır | `kullanici` kaynağı (elle giriş) her zaman öncelikli kalır |
| Döviz değerleme (`src/market.ts` `fetchTryRate`, `priceHistory.ts`) | Frankfurter (ECB referansı) | Karar K2'ye göre tcmb bağdaştırıcısı; imzalar aynı kalır (P5 `PriceProvider` sözleşmesi) | Değerler ECB'den farklı çıkabilir; ekranda kaynak etiketi değişir; e2e sabit sayıları `grep -rn` ile kontrol |
| Projeksiyon (`SCENARIOS`, `src/App.tsx` ~1292) | Kaynaksız senaryo getirileri | Bu planla **bağlanmaz**. İleride EVDS mevduat faiz serisi yalnızca "geçmiş ortalama, kaynak+dönem" olarak betimleyici gösterilebilir | Geleceğe dair sayı "tahmin" diline kayar; ayrı karar. Ertelenen teknolojiler (zaman serisi) kullanılmaz |
| Vergi (`DEFAULT_TAX_RATES`) | Sabit + TODO(muhasebe) | **Bu üç kaynak vergi oranı vermez** (kaynak Resmî Gazete). Bağlantı yok | — |
| Ajan kuralları (`src/agent.ts`, saf) | `inflationPct` parametresi | Saf kalır: `KaynakSonucu` değeri **parametre** olarak girer; ajan metni kaynak+dönem basar; `durum !== 'guncel'` ise "son bilinen değer" ibaresi | KAP bildirimleri ileride yalnızca "X için D tarihinde KAP bildirimi var" biçiminde; yorum/yön yok |

## 6. (f) Sıralı iş listesi (küçükten büyüğe)

| # | İş | Rol | Kabul ölçütü | Test | Uyum riski | Bağımlılık / plan adımı | Efor |
|---|---|---|---|---|---|---|---|
| S0 | Birincil metinleri oku: EVDS şartları (docId=18), TCMB kullanım şartları, KAP yasal uyarı, BİST veri yayını | Kullanıcı (bu ortamdan erişim yok) + uyum | §4 tablosu "doğrulandı/değil" güncellenir, alıntı+bağlantı | — | Yok | Adım 7 (yasal) | 1–2 saat insan |
| S1 | `EVDS_API_KEY` Vercel'e; `TP.FG.J0` gerçek yanıtla doğrulanır | Kullanıcı + veri-akışı | Önizlemede `/api/evds` 200 ve yıllık değer TÜİK açıklamasıyla aynı | Elle + mevcut e2e | Yok | Adım 4 (zaten açık) | Küçük |
| S2 | `KaynakSonucu` tipi + saf `kaynakDurumMetni` + geri çekilme/TTL hesapları | veri-akışı, uyum (metin) | 5 durumun metni dondurulmuş; emir kipi yok | `node --test` birim; `uyum-dili` taraması | Düşük | P5; P3'ten bağımsız | Küçük |
| S3 | Kayıt defteri + izolasyon; mevcut EVDS/CoinGecko/Frankfurter çağrıları **davranış değişmeden** bağdaştırıcıya sarılır; önbellek `KvStore` (localStorage) | veri-akışı, test | Mevcut e2e değişmeden yeşil; yeni e2e: `/api/evds` 502 taklit → kripto ekranı çalışır, enflasyon kartında "ulaşılamadı + son bilinen/varsayım" metni | e2e (`page.route` ile kaynak başına arıza) | Düşük | P5 | Orta |
| S4 | Durum metninin ekrana çıkması (yalnız metin satırı, yeni tasarım yok) | veri-akışı, tasarım (yalnız yerleşim onayı) | Her canlı sayının yanında kaynak+tarih | e2e metin kontrolü; kontrol sayısı azalmaz | Orta (dil) | P5 | Küçük–orta |
| S5 | TCMB kur serisi: `IZINLI_SERILER`'e doğrulanmış kur kodları; tüm kurlar tek sabit tabloda çekilir, süzme istemcide | veri-akışı, güvenlik | Ağ günlüğünde portföy/sembol listesi yok; sunucu beyaz liste dışını 400 ile reddeder | e2e + `fagent-csp-e2e` | Orta (kur farkı) | K2 kararı + S1; P5 | Orta |
| S6 | Önbelleklerin IndexedDB'ye taşınması | veri-akışı | P3 Y1–Y5 kapalı; önbellek silinse de uygulama çalışır | Playwright IndexedDB e2e | Düşük | **P3 bağlama adımına bağlı** | Küçük (P3 sonrası) |
| S7 | Netlify aynası kararı: P5 uçları iki yerde bakım | yönetmen | `mevcut-durum-ve-plan.md` §5 karar 13 kapanır | — | Yok | Adım 4 | Küçük |
| S8 | KAP bağdaştırıcısı (`api/kap.mjs`): son N genel bildirim, salt okuma, istemcide süzme, metin = başlık+tarih+bağlantı | veri-akışı, güvenlik, uyum | Yazılı hukuk onayı (S0) olmadan başlamaz; bozulunca yalnız KAP bölümü "ulaşılamadı" der | e2e taklit; sunucu girdi doğrulama | **Yüksek** (kazıma, SPK) | K3 + S0; **8 adımlık plana uymuyor — yeni madde olarak işaretli** | Büyük |
| S9 | BİST fiyatı: yalnızca lisanslı dağıtıcıyla sözleşme sonrası `PriceProvider` uygulaması | — | Sözleşme ve gelir var | — | Yüksek (lisans) | Adım 8–9 sonrası; şimdilik **ertelendi** | Büyük + ücret |

Kod işleri `fagent-ekip` iş akışıyla, küçük koşu (`maksKalem` düşük) olarak yapılır. Yeni bağımlılık **gerekmiyor**:
EVDS JSON döner, `fetch` ve `AbortController` yerleşik. XML ayrıştırıcı ya da kazıma kütüphanesi (ör. cheerio) ihtiyacı
doğarsa önce Üst Kurul talebi (`docs/ust-kurul.md`) açılır; bu plan böyle bir talep **içermez**.

## 7. (g) Kullanıcıdan gereken kararlar (en fazla 4)

| # | Karar | Öneri |
|---|---|---|
| K1 | TCMB ve EVDS tek kaynak "TCMB (EVDS üzerinden)" olarak birleştirilsin mi? | **Evet.** Daha temiz kullanım şartı, tek anahtar, tek hata yeri |
| K2 | Döviz kuru Frankfurter (ECB) yerine TCMB/EVDS'ten mi gelsin? (`mevcut-durum-ve-plan.md` §5 karar 6 ile aynı) | **Evet, S1 doğrulandıktan sonra.** Türk kullanıcı TCMB kurunu bekler. Frankfurter yedek olarak **otomatik** devreye girmez (farklı kurum, farklı sayı); istenirse açık etiketle ayrı bir seçim olur |
| K3 | KAP: hukuk onayı gelene kadar beklesin mi? | **Evet, bekle.** Resmî API yok, kazıma koşulları doğrulanamadı. S0 tamamlanmadan kod yazılmaz |
| K4 | BİST hisse fiyatı elle/CSV girişte kalsın mı? | **Evet.** Lisanssız ücretsiz resmî yol bulunamadı; lisans konusu gelir sonrası (adım 9) yeniden açılır |

## Kaynaklar (web arama, 2026-10-27; birincil metin bu ortamdan okunamadı)
- EVDS kullanım şartları: https://evds3.tcmb.gov.tr/igmevdsms-dis/documents/showDocument?docId=18
- EVDS web servis kılavuzu: https://evds2.tcmb.gov.tr/help/videos/EVDS_Web_Service_Usage_Guide.pdf
- Anahtarın başlığa taşınması (topluluk): https://pypi.org/project/evdspy , https://github.com/SermetPekin/evdspy-repo
- TCMB site kullanım şartları: https://tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Bottom+Menu/Diger/Kullanim+Sartlari
- TCMB günlük kur XML (örnek geçmiş dosya): https://www.tcmb.gov.tr/kurlar/201803/20032018.xml
- KAP genel bilgi (MKK işletir): https://kap.org.tr/tr/about/genel-bilgi ; MKK KAP sayfası: https://www.mkk.com.tr/en/corporate-governance-services/kap-public-disclosure-platform
- KAP topluluk araçları (resmî değil): https://github.com/cemsinano/pykap , https://pypi.org/project/kap-mcp/
- Borsa İstanbul veri yayını: https://borsaistanbul.com/veriler/veri-yayini ; paket örneği: https://www.isbank.com.tr/borsa-istanbul-veri-lisansi-paketleri
- Tek kaynaklı, doğrulanmamış "anlık ücretsiz veri" haberi: https://www.foreks.com/haber/detay/6a9faffe24008d7d4372df97/FRKS/tr/analiz-bist-teknik-takip-bulteni-deniz-yatirim-08-09-26/
