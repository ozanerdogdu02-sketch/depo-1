# Tek ana ekran konsepti (24 Ekim 2026)

Kullanıcı isteği: göz yoran kısımlar azalsın, arkada çalışabilecek işler arkaya alınsın, hareket (motion) tek ekranda toplansın, tek bir ana ekran olsun; kullanıcı bastığı yere geçsin.
Bu belge bir **öneri ve prototip**tir. `src/` ve `tests/` değişmedi. Prototip: `docs/tasarim/ana-ekran-prototip.html` (tek dosya, dış kaynak yok, tüm sayılar örnek veri).

## 1. Envanter

Kaynak: `grep -n "^function \|<h2\|className=\"card" src/App.tsx src/RiskPanel.tsx src/CryptoMarket.tsx` ve `SideLink` listesi.
Sınıflar: **A** ana ekranda kalır, **B** arkaya alınır / sessiz çalışır, **C** detay katmanında, **D** Ayarlar/Araçlar çekmecesinde.

| # | Öğe (dosya) | Sınıf | Not |
|---|---|---|---|
| 1 | Toplam Portföy (Panel) | A | Ana ekranın büyük sayısı |
| 2 | İçgörüler `ProactiveInsightsCard` | A | "Gözlemler" kartı; tek-iki betimleyici cümle |
| 3 | Vergi sonrası `AfterTaxCard` | C | Projeksiyon bölümünün içinde; oran D'de |
| 4 | Risk `RiskPanel` | C | Projeksiyon/Gözlemler katmanında |
| 5 | Net Yatırım Geçmişi (Panel) | A | Toplam kartının içindeki çizgi grafik |
| 6 | Sınıf Dağılımı (Panel) | A | Halka grafik |
| 7 | Hedef dağılım editörü `TargetAllocationCard` | D | Sapma özeti A'da (Gözlemler) |
| 8 | Hedef dağılım boş durum kartı | D | |
| 9 | Varlık listesi (Panel altı) | C | Hisse/Fon/Kripto katmanında |
| 10 | Yedek `BackupCard` | D | Hatırlatma kısmı B (#39) |
| 11 | Oto aktarım `OtoAktarimCard` | D | |
| 12 | Onboarding / boş durum | A | Veri yokken ana ekranın yerini alır |
| 13 | Toplam Hisse (Panel, hisseler sekmesi) | A | Sınıf kartı |
| 14 | Toplam Fon | A | Sınıf kartı |
| 15 | Toplam Kripto Varlık | A | Sınıf kartı |
| 16 | Bugün özet `Bugun` (üst kart) | A | |
| 17 | Bugünkü Alışlar | C | |
| 18 | Bugünkü Satışlar | C | |
| 19 | Bugünkü İşlemler | C | |
| 20 | İşlemler: defter listesi | C | Ana ekranda yalnız "son kayıt" özeti |
| 21 | İşlemler: Yeni İşlem | C | "Deftere ekle" düğmesi katmanda |
| 22 | Projeksiyon: Varsayımlar | D | Oran/enflasyon "varsayım" etiketli |
| 23 | Projeksiyon: 3 senaryo | C | Ana ekranda yalnız özet kart |
| 24 | Ajan sohbeti | C | Üst çubuktan ve Gözlemler'den açılır |
| 25 | Ajan: öğretme paneli `TeachPanel` | D | |
| 26 | Ajan: hafıza `AgentMemoryCard` | D | |
| 27–30 | Kripto Piyasası (4 kart, `CryptoMarket`) | C | Kripto katmanında "Piyasa" alt bölümü; 9 sekme 7 hedefe iner |
| 31 | Hesap ekranı `Account` | D | |
| 32 | SIFIRLA düğmesi | D | Yıkıcı; çekmecenin en altında, onaylı |
| 33 | Arama kutusu | C | Katman içindeki listelere süzgeç |
| 34 | "ANAHTARSIZ MOD" rozeti | B | Araçlar'da bir satır; sürekli görünmesi gerekmez |
| 35 | Eşitleme durumu (hesap noktası) | B | Yalnız hata/çakışmada ana ekrana çıkar |
| 36 | Fiyat tazeleme (Frankfurter, CoinGecko) | B | Otomatik |
| 37 | Canlı enflasyon `loadLiveInflation` | B | Zaten sessiz; elle varsayım yedek |
| 38 | Bayat fiyat denetimi (`formatFetchedAt`) | B | Yalnız sorun varsa uyarı |
| 39 | Yedek hatırlatma (14 gün) | B | Ana ekranda tek satır, süre dolunca |
| 40 | "Veriler tarayıcında saklanır" alt yazısı | B | Durum satırına taşınır |

**Sayım (40 öğe):** A = 9 (#1, 2, 5, 6, 12, 13, 14, 15, 16), B = 7 (#34–40), C = 15 (#3, 4, 9, 17–21, 23, 24, 27–30, 33), D = 9 (#7, 8, 10, 11, 22, 25, 26, 31, 32).
Ana ekranda görünen **7 blok**: Toplam (+ geçmiş çizgisi), Halka, Sınıf kartları (3 kart), Bugün, Gözlemler, Projeksiyon özeti, İşlem defteri özeti. Son ikisi C öğelerinin tek satırlık özetidir.

### Göz yoran kalabalığın nedeni (koddan sayılan)
- Panel sekmesi tek ekranda **en çok 10 kart** gösterir (Toplam, İçgörüler, Vergi sonrası, Risk, Net Yatırım, Sınıf Dağılımı, Hedef Dağılım, Varlık listesi, Yedek, Oto aktarım). Bunların 4'ü (Yedek, Oto aktarım, Hedef, Vergi) seyrek kullanılan araçtır ama her açılışta görünür.
- Kenar çubuğunda **9 sekme + hesap + arama + rozet + SIFIRLA** vardır; telefonda dikey liste ilk ekranı kaplar (`gorsel-gozlemler.md` #2).
- Renk: kazanç (teal), kayıp (kırmızı), vurgu (mavi) ve grafik renkleri aynı ekranda; kazanç/kayıp ayrımı çoğunlukla renkle (`a2-tasarim-1-tur.md` F1).
- Metin: `App.tsx` içinde 50 yerde `hint` açıklama satırı geçer; açıklamalar kartların içinde sürekli görünür.
- Hareket: `.fade` (350 ms) her sekmede, `.big-number` yükselmesi, dönen simge; grafikler hareketsiz (`isAnimationActive={false}`). Yani hareket az ama tutarsız: sekme geçişinde tüm sayfa kayar, grafiklerde hiç yok.

### Arka plana alma: ne otomatik, ne onay ister
"Backend" burada iki şeydir: tarayıcıda sessiz çalışan işler ve sunucu tarafı (yalnız EVDS vekil fonksiyonu ve isteğe bağlı Supabase hesabı vardır; başka sunucumuz yok).
- **Onaysız, sessiz yapılabilir:** fiyat tazeleme, enflasyon çekme, bayat fiyat denetimi, eşitleme durumu izleme, yedek hatırlatma sayacı. Hepsi bugün zaten otomatik; değişen yalnız **görünürlükleri** (yalnız sorun olunca bir satır).
- **Kullanıcı onayı şart:** yedek dosyası indirme/geri yükleme ve içe aktarma (veriyi değiştirir/dışarı çıkarır), SIFIRLA, hesaba giriş/çıkış, bulutta farklı kayıt varken eşitleme çakışması (kullanıcı kararı: bu iş şimdilik yapılmıyor, `CLAUDE.md`), defter kaydı ("Deftere ekle" yalnız düğmeyle).
- **Sunucuya taşıma (fiyat tazelemeyi sunucudan yapmak):** tarayıcının dış API'lere doğrudan gitmesini ve IP'nin görünmesini önler; ama ek altyapı ve maliyet getirir. **Kullanıcı kararı bekliyor** (varsayılan: bugünkü gibi tarayıcıdan).

## 2. Konsept

### Düzen
- **1440 px:** üst çubuk (marka, "Örnek veri" etiketi, Ajan, Araçlar). Altında tek satırlık durum şeridi. 12 sütun: Toplam (8) + Halka (4); üç sınıf kartı (4+4+4); dört küçük kart (3×4: Bugün, Gözlemler, Projeksiyon, İşlem defteri). Ekran kaydırmadan sığar. Kenar çubuğu yok.
- **375 px:** tek sütun. Toplam kartı ilk ekranda tamamen görünür (menü yok), sonra halka, üç sınıf kartı, dört küçük kart 2×2. Yatay kaydırma yok (ölçüldü: sayfa genişliği 375).
- Bilgi hiyerarşisi: 1) toplam ve ▲/▼ kâr-zarar, 2) dağılım, 3) sınıflar, 4) bugün/gözlem/senaryo/defter. Seyrek işler yalnız Araçlar'da.

### Tıkla → detaya geç
- Her kart gerçek bir `<button>`; bastığında **detay katmanı** (`<dialog>` + `showModal`) açılır. Tam sayfa geçişi yok; ana ekran arkada kalır (bağlam kaybolmaz).
- Katmanın içinde 7 sekme (Bugün, Hisseler, Fonlar, Kripto, İşlemler, Projeksiyon, Ajan): kullanıcı ana ekrana dönmeden bölümler arasında gezer.
- Geri dönüş: "Kapat" düğmesi, Esc, perde (dışına tıklama). Kapanınca odak **bastığı karta** döner.
- Telefon: katman tam ekran sayfa gibi açılır (üstte Kapat, 44 px hedef). Araçlar çekmecesi sağdan (telefonda tam genişlik).

### Klavye ve ekran okuyucu
- Katman: yerleşik odak kapanı ve Esc (`dialog`); `aria-labelledby` başlığa bağlı. Sekmeler `role=tablist/tab/tabpanel`; Sol/Sağ/Home/End ile gezilir.
- Kartların `aria-label`'ı değeri ve yönü sözle söyler ("artış yüzde 17,5"); sayı sayarken ekran okuyucu ara değerleri okumaz (görünen sayı `aria-hidden`, son değer gizli metinde).
- Halka grafik `role=img` + açıklama; her dilim ayrıca tıklanır/odaklanır liste düğmesidir (renge tek başına güvenilmez).
- Kazanç/kayıp: renk (mavi/turuncu) + ▲/▼ + işaret (`+%17,5`, `-%22,7`). Hedef boyutu ≥ 44 px (WCAG 2.5.8'in 24 px şartının üstü). Prototipte < 24 px hedef ölçülmedi (0 bulundu).
- Başlık sırası: sayfa başlığı `h1`, kartlar `h2`.

### Boş ve yükleniyor durumu
- Veri yok: ana ekranın yerini bugünkü Onboarding (örnek veri yükle / kendi verini gir) alır; Araçlar ve Ajan yine erişilir.
- Yükleniyor: kartlar iskelet olarak yer tutar (yer değiştirme yok); fiyat gelmemişse durum şeridinde "Fiyatlar güncellenemedi, son kayıtlı değerler gösteriliyor" (betimleyici, uyarı rengi + simge).
- Hata: kartın içinde tek satır; tam ekran hata yok. Prototip bu durumları **çizmez** (yalnız dolu durum).

## 3. Hareket kataloğu

Kısıt: yalnız CSS (+ küçük JS); yeni bağımlılık yok; her süre ≤ 300 ms; sürekli dönen/yanıp sönen yok; `prefers-reduced-motion: reduce` altında hepsi kapanır (prototipte doğrulandı: sayı doğrudan son değer, halka dolu).

| Hareket | Hangi öğede | Nasıl | Süre | Prototipte |
|---|---|---|---|---|
| Çizgi çizilir | Toplam kartındaki geçmiş grafiği | `stroke-dashoffset` (`pathLength=1`) | 300 ms | Var |
| Halka çizilir | Sınıf dağılımı | `stroke-dasharray` geçişi | 300 ms | Var |
| Sayı sayarak oturur | Toplam ve sınıf tutarları | JS `requestAnimationFrame`, azaltılmış harekette atlanır | 300 ms | Var |
| Kart yükselerek gelir (kademeli) | Ana ekran kartları | `opacity`+`transform`, 40 ms arayla | 220 ms | Var |
| Kart → detay genişlemesi | Tüm kartlar | **View Transitions API** paylaşılan öğe (`view-transition-name`); desteklenmiyorsa `@keyframes` ile belirip ölçeklenir | 300 / 220 ms | Var (yedekli) |
| Sekme/katman geçişi | Katman içi bölüm değişimi | Yeni panel hafif kayarak gelir | 220 ms | Var |
| Çubuklar büyür | Projeksiyon senaryoları | `scaleX` | 300 ms | Var |
| Dilim vurgusu | Halka ↔ gösterge | Diğer dilimler soluklaşır | 140 ms | Var |
| Basma/üzerine gelme | Kart, düğme | Kart 2 px yükselir, kenar mora döner | 140 ms | Var |
| Mesaj belirir | Ajan balonları | Kayarak/solarak | 220 ms | Var |

Gerçek uygulamada: Recharts `Pie` bugün `isAnimationActive={false}`; açmak için `animationDuration={300}` ve reduced-motion denetimi yeterli (kütüphane zaten var, yeni bağımlılık yok). View Transitions Chromium/Safari'de var, Firefox sürümüne göre değişir; yedek yol (keyframes) aynı davranışı verir. **Doğrulanamadı:** Firefox/Safari davranışı, düşük donanımlı telefonda akıcılık.

## 4. Aşamalı uygulama planı

Test etkisi ölçüsü: `tests/e2e` içinde `side-link` 22 dosyada 72 yerde geçer; `SIFIRLA` 11 dosyada 29; `.card-title` 9 dosyada 17. Kenar çubuğunu kaldırmak bu yüzden en son ve en pahalı adımdır.

| Faz | İş | Dosyalar | Test etkisi | Risk |
|---|---|---|---|---|
| 1 (küçük) | Göz yorgunluğunu azalt: hareket jetonları + reduced-motion; kazanç/kayıp için ▲/▼ (T2); durum şeridi (rozet/yedek/fiyat zamanı tek satırda); seyrek araç kartlarını (Yedek, Oto aktarım, Hedef) Panel'in altında katlanır `<details>` yap | `src/index.css`, `src/App.tsx` (Panel, BackupCard, OtoAktarimCard) | Yedek/oto-aktarım/hedef e2e seçicileri (`.card-title` metni aynı kalırsa az) | Düşük |
| 2 (orta) | Yeni "Ana" görünümü (`HomeScreen`), **bayrak arkasında** (`?ana=1` ya da ortam değişkeni); mevcut sekmeler ve kenar çubuğu aynen durur | yeni `src/HomeScreen.tsx`, `src/App.tsx` (tek `tab` değeri) | Mevcut testler değişmez (varsayılan görünüm aynı); yeni `fagent-home-e2e.mjs` | Düşük–orta |
| 3 (orta) | Detay katmanı (`<dialog>`) mevcut bileşenleri (`Panel`, `Bugun`, `Islemler`, `Projeksiyon`, `Ajan`, `CryptoMarket`) **olduğu gibi** içine alır; Araçlar çekmecesi (Backup, OtoAktarim, hedef editörü, TeachPanel, Memory, Account, SIFIRLA); View Transitions + yedek | `src/HomeScreen.tsx`, `src/index.css` | Bayrak açıkken yeni testler; eski testler bayraksız yolda geçer | Orta (odak yönetimi, iç içe dialog) |
| 4 (büyük) | Varsayılanı "Ana" yap, kenar çubuğunu kaldır; `side-link` kullanan 22 e2e dosyasını ortak bir `openSection()` yardımcısına geçir; 1440/375 görsel kontrol betiği (T5) | `src/App.tsx`, `tests/e2e/*` (22+ dosya), `tests/` yardımcı | Geniş; kontrol sayısı azalmamalı | Yüksek |

Her faz sonunda: typecheck, build, e2e, 1440/375 ekran görüntüsü. Fazlar 1–3 bayrak sayesinde geri alınabilir.
Veri akışına dokunulmaz (`analytics.ts`, `agent.ts`, `store.ts` değişmez); yalnız görünüm.

## 5. Açık sorular — kullanıcı kararı bekliyor (varsayılan seçildi)

1. Varsayılan açılış ekranı "Ana" olsun mu? **Varsayılan:** Faz 4'e kadar eski Panel kalır, Ana bayrak arkasında.
2. Arama kutusu nerede? **Varsayılan:** katman içindeki listelere süzgeç (üst çubukta yok).
3. Kripto Piyasası ayrı sekme mi, Kripto'nun alt bölümü mü? **Varsayılan:** alt bölüm.
4. Fiyat tazeleme sunucuya taşınsın mı (IP gizliliği, ek maliyet)? **Varsayılan:** hayır, tarayıcıdan.
5. İlk açılışta "fiyatlar için dış servislere bağlanılır" tek satır bilgilendirme gösterilsin mi? **Varsayılan:** evet, durum şeridinde (yasal metin adımı 7 ile birlikte gözden geçirilmeli).
6. Kazanç/kayıp renkleri (mavi `#3fa9f5` / turuncu `#ffb07c`) Nocturne'a geçişte kesinleşsin mi? Prototipte kullanıldı; **kullanıcı kararı bekliyor** (T2/T4 ile birlikte).
7. Sınıf kartlarının yüzde değişimi hesabı gerçek veriyle nasıl alınacak? Prototipte sabit örnek; hesap `analytics.ts`'te mevcut olanla yapılır, yeni hesap yok.

## 6. Ölçümler (prototip, Chromium, dosyadan açılış)

- 1440 ve 375 px: konsol hatası 0, dış istek 0, yatay kaydırma yok (375'te `scrollWidth` = 375; katman içi de taşmıyor).
- Kontrast (hesaplanan): metin/yüzey 13,1; ikincil metin/yüzey-2 6,5; kazanç mavisi/yüzey-2 5,4; kayıp turuncusu/yüzey-2 7,7; mor bağlantı/yüzey 7,7; düğme metni/mor dolgu 5,7 (hepsi ≥ 4,5). Girdi kenarı `#7a7f9a`: zemine 4,5, yüzeye 4,0 (≥ 3 şartı geçer).
- Kazanç ile kayıp parlaklığı birbirinden uzak değil (turuncu daha açık); asıl ayrım ▲/▼ ve işaretle sağlanır.
- Klavye: sekmeler oklarla, Esc kapatır, odak bastığı karta döner (denendi).
