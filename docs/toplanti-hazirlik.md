# Toplantı Hazırlığı — Bloki ↔ FAGENT

> Bu doküman üç ayrı muhatap için üç ayrı bölüm içerir. Toplantının kiminle olduğuna göre
> ilgili bölümü kullan; **Bölüm 0 (ortak sayılar)** her üçünde de geçerlidir.
>
> - **Bölüm A** — BtcTurk'e ürün sunumu (itiraz karşılama, demo akışı, entegrasyon teklifi)
> - **Bölüm B** — Yatırımcı / iş ortağı (pazar boşluğu, rekabet, savunulabilirlik)
> - **Bölüm C** — İç değerlendirme / teknik ekip (mimari, kapsam boşlukları, yol haritası)
> - **Bölüm D** — 4-5 günlük hazırlık planı (gün gün yapılacaklar)
>
> Temel karşılaştırma için: [`bloki-vs-fagent.md`](bloki-vs-fagent.md)
>
> **Toplantı günü tek sayfa okuyacaksan:** [`soru-cevap.md`](soru-cevap.md) — 24 olası soru,
> iki cümlelik cevaplar, ve senin soracakların.

---

## Bölüm 0 — Ortak zemin: ezberlenecek sayılar

Toplantıda hangi muhatap olursa olsun bu altı sayı işine yarar. Hepsi kamuya açık kaynaklı
(bkz. Bölüm E).

| Sayı | Değer | Neden önemli |
|---|---|---|
| **Yıllık enflasyon** | **%32,11** (TÜİK, Haziran 2026) | Reel getiri argümanının çıpası |
| **Toplam mevduat** | **28,26 trilyon TL** (BDDK, 2026 Ç1) | %43'ü döviz hesabı — nakit benzeri devasa bir kütle |
| **Pay senedi yatırımcısı** | **6,87 milyon** (MKK, Temmuz 2026) | Hisse tarafı |
| **Yatırım fonu yatırımcısı** | **10,7 milyon** — fon büyüklüğü 13,8 trilyon TL | Fon tarafı, rekor seviyede |
| **BtcTurk kayıtlı hesap** | **milyonlarca** ⚠️ *("5 milyon+" teyit edilemedi — bkz. §C.0)* | Kripto tarafı |
| **FAGENT ajanın maliyeti** | **0 TL / mesaj** | Kural tabanlı, sunucusuz |

### Bu sayılardan çıkan tek cümlelik argüman

> Türkiye'de 6,9 milyon hisse yatırımcısı ve 10,7 milyon fon yatırımcısı
> var (BtcTurk tarafında da milyonlarca hesap). Bu kümeler **büyük ölçüde aynı insanlar** — ve
> hiçbiri servetinin tamamını tek ekranda,
> **%32 enflasyondan arındırılmış** olarak göremiyor. Herkes kendi kutusunu gösteriyor;
> kimse toplamı göstermiyor.

### Kafadan hesaplayabileceğin örnek

100.000 TL nakdi (mevduat/döviz/stablecoin) olan bir kullanıcı, %32 enflasyonda **yılda ~32.000 TL**
alım gücü kaybeder. Bu, hiçbir ekranda kırmızı yanmaz — çünkü nominal bakiye düşmez, hatta faizle
artar. FAGENT'ın proaktif kartının yaptığı tam olarak budur: **görünmeyen kaybı görünür kılmak.**

### Fisher örneği (ezberle — her üç toplantıda da işe yarar)

> Nominal getirin %60, enflasyon %32.
> Yaygın kestirme (nominal − enflasyon): **%28**
> Doğrusu (Fisher): (1,60 / 1,32) − 1 = **%21,2**
> Fark: **6,8 puan** — kullanıcı kendini olduğundan zengin sanıyor.

---

# Bölüm A — BtcTurk'e ürün sunumu

## A.0 Kime anlatıyorsun ⭐ *(2026-08-02'de eklendi — her şeyi bu belirliyor)*

**Emir Karagüler — Head of Customer Experience, BtcTurk | Kripto.**
Geçmişi **Vodafone** ve **ING Türkiye**: telko + bankacılık müşteri deneyimi.
**CTO değil, ürün müdürü değil.**

Bu dokümanın geri kalanı büyük ölçüde teknik derinlik üzerine kurulu (415 test, saf
fonksiyonlar, kovaryans, XIRR). Bir CX liderinde bunların hiçbiri karşılık bulmaz. Onun
kariyeri boyunca ölçtüğü şeyler: **elde tutma, churn, destek yükü, güven, NPS.**

| Onda karşılık bulmaz | Onda karşılık bulur |
|---|---|
| "415 otomatik test var" | "Kullanıcı kafası karışık dönüyor" |
| "Saf fonksiyonlar, kovaryans matrisi" | "Uygulamada kalma süresi, geri dönüş sıklığı" |
| "XIRR ve Fisher hesaplıyorum" | "%60 kâr sanıyor, gerçekte reel kaybediyor" |
| Mimari üstünlük | Destek ekibine gelen "ben niye kazanamıyorum" sorusu |

**Teknik derinliği cebinde tut** — sorarsa çıkar, açılışta değil. Açılış cümlesi CX dilinde
olmalı: kullanıcının bilgi boşluğu → güven kaybı → churn ya da destek yükü.

**Emine Ceylan da toplantıda olacak — ve rolü tahmin edilenden önemli.** Emir'in 27 Tem 2026
tarihli e-postasındaki kendi ifadesi: *"@Emine Ceylan **Bloki projesinde yer alan takım
arkadaşım** gelecek haftaki planlama konusunda bize destek olacak."*

Yani süreci koordine eden bir hesap yöneticisi değil, **Bloki ekibinin bir üyesi.**
*(Düzeltme notu: LinkedIn'de "Account Manager" göründüğü için ilk sürümde öyle yazılmıştı;
e-posta birincil kaynak olduğu için düzeltildi.)*

**Bunun pratik sonucu — sunum dilini doğrudan etkiliyor:** masada **Bloki'yi yapan kişi**
oturuyor olabilir. Bu dokümanın baştan beri seçtiği "rakip değil tamamlayıcı" çerçevesi zaten
doğruydu; şimdi zorunlu hale geldi. Bloki'nin eksiklerini saymak yerine **senin eklediğini**
anlat, ve teknik soruların Emine'den gelebileceğini hesaba kat.

*(Kaynaklar: Emir Karagüler'in unvanı ve geçmişi — kamuya açık LinkedIn, 2026-08-02;
Emine Ceylan'ın rolü — 27 Tem 2026 tarihli e-posta.)*

## A.1 Tek cümlelik konumlandırma

> ⚠️ **BU BÖLÜM (A.1–A.3) ESKİDİ.** Aşağıdaki anlatı BtcTurk'ün yalnızca kripto sunduğu
> varsayımına dayanıyor; BtcTurk | Hisse bulgusundan sonra bu geçersiz (bkz. §C.0 ve
> [`bloki-vs-fagent.md` §5](bloki-vs-fagent.md)). **"Sizin göremediğiniz %80" DEME.**
> Güncel ve kullanılacak anlatı: [`toplanti-kisa-kart.md`](toplanti-kisa-kart.md).
> Aşağısı arka plan olarak duruyor, sahnede kullanılmayacak.

> **"Bloki'nin rakibi değiliz. Bloki işlemi hızlandırıyor, biz kararı besliyoruz.
> Sizin göremediğiniz %80'i görüyoruz."**

Bu cümleyi toplantının ilk 60 saniyesinde söyle. "Rakip değiliz" ifadesi savunma pozisyonundan
çıkmanı sağlar; asıl mesaj ikinci yarıda: **kapsam farkı.**

## A.2 Açılış anlatısı (90 saniye)

1. **Kabul et:** "Bloki'yi inceledim. Sesli komutla saniyeler içinde emir yürütmek, TL çekmek,
   piyasayı yorumlamak — bunlar bizim yapabileceğimiz şeyler değil ve yapmaya da çalışmıyoruz."
   *(Muhatabın savunma refleksini burada kırıyorsun.)*
2. **Boşluğu göster:** "Ama şunu soralım: BtcTurk kullanıcısının serveti sadece BtcTurk'te mi?
   6,9 milyon hisse yatırımcısı, 10,7 milyon fon yatırımcısı var; 28 trilyon TL mevduat var.
   Bloki bunların hiçbirini görmüyor — göremez, çünkü kapsamı dışında."
3. **Sonucu söyle:** "Kullanıcının servetinin %20'sinde mükemmel bir dağılım gösteriyor olabilirsiniz.
   Ama gerçek riski görünmeyen %80'de. Biz o %80'i getiriyoruz."
4. **Teklifi ver:** "Bunu size rakip olarak değil, Bloki'nin altına iliştirilebilecek bir
   **karar katmanı** olarak öneriyorum."

## A.3 İtiraz–cevap tablosu ⭐

Toplantının en kritik parçası. Her itiraza **önce kabul, sonra çerçeve değiştirme** ile cevap ver.

| İtiraz | Cevabın |
|---|---|
| **"Bloki zaten bunları yapıyor."** | "Bloki portföyü *gösteriyor*, evet. Ama gösterdiği portföy sizin borsanızdaki portföy. Ben size kullanıcının mevduatını, BIST hissesini, TEFAS fonunu, altınını da gördüğü bir katman öneriyorum. Fark 'daha iyi yapmak' değil, **daha geniş görmek**." |
| **"Bunu biz 2 ayda kendimiz yaparız."** | "Kodlaması 2 ay, doğru. Ama asıl mesele kod değil: BtcTurk'ün BIST/TEFAS/mevduat verisini kullanıcıdan toplaması, bu veriyi tutması ve **kurum olarak** bunun sorumluluğunu alması gerekir. Biz bu veriyi hiç toplamıyoruz — tarayıcıda kalıyor. Bu, sizin için regülasyon ve veri sorumluluğu açısından çok farklı bir denklem." |
| **"Kullanıcı neden verisini elle girsin?"** | "Girmesin. Kripto tarafını zaten siz doldurabilirsiniz — salt-okunur bakiye aktarımıyla. Elle girilecek kısım BIST/TEFAS/mevduat ve bunu giren kullanıcı zaten *motive* olan kullanıcı: serveti tek yerde görmek isteyen kişi. Ayrıca CSV içe aktarma var." |
| **"LLM değilmiş, o zaman gerçek AI değil."** | "Doğru, LLM değil ve bunu ürünün içinde de açıkça yazıyoruz. Bunun karşılığında: mesaj başına maliyet sıfır, gecikme sıfır, **halüsinasyon sıfır**. Finansal rakamda halüsinasyon, bir asistanın yapabileceği en pahalı hatadır. Mimari LLM'e geçişe hazır — ajanın yanıt mantığı tek dosyada izole, saf fonksiyonlar; anahtar takılınca geçiş tek noktadan yapılır." |
| **"Veri tarayıcıda, cihaz değişince ne olacak?"** | "Bugün CSV dışa/içe aktarma ile taşınıyor. Bu bilinçli bir tercih: hesap yok, KYC yok, sunucu yok → **veri sızıntısı riski de yok**. Kurumsal entegrasyonda bu değişebilir, ama o zaman veriyi kim tutuyor sorusunun cevabı da değişir; masaya o kararı birlikte koyalım." |
| **"BIST/TEFAS canlı fiyatı yoksa nasıl portföy takibi?"** | "Anahtarsız, resmî, CORS-açık bir kaynak yok — araştırdık. Uydurma fiyat göstermektense hiç göstermiyoruz; bu bir ilke. Ama **risk metriklerinde bile portföyün yüzde kaçını kapsadığımızı ekrana yazıyoruz.** Sizin veri anlaşmalarınızla bu boşluk kapanır — bu, entegrasyonun somut faydalarından biri." |
| **"Kaç kullanıcınız var?"** | Dürüst ol: bu bir çalışan ürün ve teknik olgunluk kanıtı (23 e2e test dosyası, 415 otomatik kontrol), kullanıcı tabanı değil. "Kullanıcı tabanı sizde zaten var — milyonlarca kullanıcı. Ben size dağıtım değil, **yetenek** getiriyorum." |
| **"Yatırım tavsiyesi vermiş olmuyor musunuz?"** | "Ürün hiçbir varlık için al/sat önermiyor; kullanıcının **kendi verisi üzerinde matematik** yapıyor — reel getiri, volatilite, yoğunlaşma. Yine de metinlerin hukuk onayından geçmesi gerektiğini biliyorum ve bunu entegrasyonun ilk maddesi olarak koyuyorum." *(Bkz. C.4 — bu gerçek bir açık.)* |
| **"Neden ürünü alalım, ekip alalım?"** | "İkisi de olabilir. Ama şunu unutmayın: bu ürünün mimarisi bilinçli olarak **sizin altyapınıza bağımlı olmayacak** şekilde kuruldu. Yarın entegrasyon olmasa da çalışmaya devam eder. Bu, satın alma kararınızı düşük riskli yapar." |

## A.4 Demo akışı (7 dakika, adım adım)

Demoyu **kripto ağırlıklı ama karma** bir portföyle yap — Bloki'nin göremeyeceği şeyi göstermek için
mevduat ve BIST kalemi şart.

| # | Süre | Ne yaparsın | Ne söylersin |
|---|---|---|---|
| 1 | 45 sn | Panel'i aç, **proaktif kart** ekranda | "Hiçbir şey sormadım. Panel açıldı ve bana nakdimin yılda ne kadar eridiğini söyledi. Bloki'ye bunu sormanız gerekir — burada sormuyorsunuz." |
| 2 | 60 sn | Kripto Piyasa sekmesi, canlı liste | "Canlı veri var, anahtarsız. Yani bu ürünü çalıştırmak için kimseye para ödemiyorsunuz." |
| 3 | 90 sn | Ajan'a **"reel getirim ne"** yaz | "Fisher denklemiyle hesaplıyor ve yaygın kestirmenin neden yanlış olduğunu da gösteriyor. Bu, formülü anlatıp hesabı kullanıcıya bırakmaktan farklı." |
| 4 | 60 sn | **"dağılımımı çiz"** yaz | "Grafiği çizmekle kalmıyor, Herfindahl endeksiyle okuyor: '10 varlığın var ama etkin olarak 2,3 varlığın var.'" |
| 5 | 90 sn | Risk paneli / risk metrikleri | "Volatilite, maksimum düşüş, Sharpe, çeşitlendirme faydası — gerçek tarihsel seriden. **Ve kapsamı ekranda yazıyor:** portföyün %X'i kapsandı, kalanın nedeni şu. Kapsamı gizlemiyoruz." |
| 6 | 60 sn | Ajan'a **"THYAO'dan 500 TL sat"** yaz → Onayla/Vazgeç | "Ajan aksiyon alabiliyor ama **onaysız hiçbir veri değişmiyor**. Sizin tarafta bu onay akışı emir yürütmeye bağlanabilir." |
| 7 | 45 sn | 👎 → Eğit paneli açılır | "Kullanıcı ajanı düzeltebiliyor. Öğrettiği şey yerleşik kuralların önüne geçiyor." |

**Demo öncesi kontrol listesi:** internet bağlantısı (CoinGecko/Frankfurter çağrıları gerçek ağa
çıkar), demo portföyü önceden kurulmuş, tarayıcı zoom'u yansıtma için büyütülmüş,
enflasyon varsayımı artık varsayılan olarak **%32** (C.4/1 ile düzeltildi — demoda elle değiştirmen gerekmiyor).

## A.5 Entegrasyon teklifi — üç seviye

Toplantıya tek bir "hepsi ya da hiçbiri" teklifiyle gitme. Üç kademe sun, muhatap kendi risk
iştahına göre seçsin.

**Seviye 1 — Salt-okunur bakiye aktarımı (en düşük risk)**
BtcTurk kripto pozisyonları FAGENT'a tek yönlü, salt-okunur aktarılır. Emir yetkisi aktarılmaz.
Kullanıcı kripto tarafını elle girmekten kurtulur; FAGENT'ın servet görünümü gerçek veriyle beslenir.
*BtcTurk'ün kazancı:* kullanıcı serveti tek ekranda görürken BtcTurk pozisyonu merkezde durur.

**Seviye 2 — Ortak reel getiri kartı**
Bloki'nin nominal kâr/zarar cevabının altına FAGENT'ın reel getiri hesabı iliştirilir:
*"Nominal %60 kazandın; %32 enflasyonla reel getirin %21,2."*
*BtcTurk'ün kazancı:* Bloki'nin cevapları tek hamlede finansal olarak daha derin hale gelir.

**Seviye 3 — Proaktif katmanın devri**
FAGENT'ın "sorulmadan uyar" motoru, Bloki'nin içine bir içgörü üreticisi olarak yerleşir.
*BtcTurk'ün kazancı:* doğru soruyu sormayı bilmeyen kullanıcı da kritik bilgiye ulaşır →
etkileşim ve elde tutma artar.

## A.6 Toplantıdan ne isteyeceksin (net "ask")

Toplantıyı somut bir sonraki adım olmadan bitirme. Öncelik sırasıyla:

1. **Teknik bir takip toplantısı** — Seviye 1 entegrasyonunun (salt-okunur bakiye) fizibilitesi için
   BtcTurk tarafından bir mühendisle.
2. **Pilot** — sınırlı bir kullanıcı grubuyla, FAGENT'ın proaktif kartının Bloki cevaplarının
   yanında test edilmesi.
3. **En azından:** ürün ekibinden yazılı geri bildirim ve bir sonraki görüşme tarihi.

---

# Bölüm B — Yatırımcı / iş ortağı sunumu

## B.1 Pazar boşluğu — sayılarla

Türkiye'de bireysel yatırımcı **parçalanmış** durumda:

| Nerede | Kaç kişi / ne kadar | Kim gösteriyor |
|---|---|---|
| Pay senedi | 6,87 milyon yatırımcı | Aracı kurum uygulamaları |
| Yatırım fonu (TEFAS) | 10,7 milyon yatırımcı / 13,8 trilyon TL | Banka uygulamaları |
| Mevduat | 28,26 trilyon TL (%43'ü döviz) | Banka uygulamaları |
| Kripto | BtcTurk'te milyonlarca hesap ⚠️ *(rakam teyitsiz)* | Borsa uygulamaları |

**Boşluk:** Bu dört kutunun her biri kendi içini gösteriyor. Aynı kişi dört uygulamada dört farklı
"portföy" görüyor ve **kurumların hiçbiri** toplamı vermiyor. Toplam verilmediği için de en önemli
soru cevapsız kalıyor: *"%32 enflasyonda gerçekte kazanıyor muyum, kaybediyor muyum?"*

> ⚠ **Dikkat — bu argümanı olduğu gibi kullanma.** Bağımsız yerli uygulamalar (Parafokus, Finoloji,
> Horyzon, Finobi, Portfoy) toplamı **gösteriyor**; birkaçında AI asistan da var. Boşluk "toplamı
> kimse göstermiyor" değil, **"gösterilen toplam üzerinde kimse ciddi analiz yapmıyor"**.
> Ayrıntı ve doğru cümle için B.2'nin sonundaki güncelleme kutusuna bak.

**Neden bu boşluk kapanmamış:**
- Her kurum kendi varlığını gösterme motivasyonuna sahip; rakibin varlığını göstermek istemez.
- Konsolide görünüm için veri toplamak = KVKK sorumluluğu + veri anlaşmaları + regülasyon.
- Reel getiri hesabı kurumlar için **rahatsız edici**: "mevduatınız yılda %32 eriyor" demek,
  mevduat toplayan bir bankanın söylemek isteyeceği son şeydir.

Son madde FAGENT'ın en güçlü konumlandırma argümanı: **bağımsız olduğu için söyleyebiliyor.**

## B.2 Rekabet haritası

| Kim | Ne yapıyor | Nerede yetersiz |
|---|---|---|
| **Bloki (BtcTurk)** | Kripto asistanı, emir + ses + K/Z | Yalnızca kendi borsası; reel getiri ve risk matematiği yok |
| **Banka uygulamaları** | Mevduat + fon + bazen hisse | Kurum dışı varlık yok; reel getiri uyarısı çıkar çatışması |
| **Aracı kurum uygulamaları** | Hisse + fon, teknik analiz | Kripto ve mevduat yok; servet değil işlem odaklı |
| **Yurtdışı portföy takipçileri** | Konsolide takip | TL/enflasyon bağlamı yok, TEFAS/BIST kapsamı zayıf, çoğu abonelikli |
| **FAGENT** | Altı sınıf + reel getiri + risk + proaktif | Canlı BIST/TEFAS fiyatı yok; dağıtım yok |

> ### ⚠ Bu bölüm güncellenmeli — 2026-08-01 rakip araştırması
>
> Yukarıdaki tablo **yerli bağımsız uygulamaları atlıyor** ve B.1'deki "kimse toplamı göstermiyor"
> argümanını fazla güçlü kuruyor. Gerçek durum:
>
> | Uygulama | Ne sunuyor |
> |---|---|
> | **Parafokus** | 17.000+ varlık, 7 kategori (BIST, kripto, döviz, altın, ABD borsası, emtia, fon), ortalama maliyet, **AI portföy analizi** — tamamen ücretsiz |
> | **Finoloji** | BIST + global hisse, TEFAS/BEFAS, kripto, döviz, altın, tahvil + **"veriyle konuşan yapay zekâ asistanı"**, fiyat alarmı, ekonomik takvim |
> | **Horyzon** | Hisse, ETF, kripto, emtia, nakit + pozisyon başına tez + AI içgörü — **hesap gerektirmeden başlıyor**, Pro katmanı var |
> | **Finobi / Portfoy** | Aynı konsolide çok-varlıklı takip (Portfoy: BIST, ABD, kripto, fon, altın, döviz) |
>
> **Sonuç:** Konsolide çok-varlıklı takip **ve** AI asistan artık emtia. Horyzon'un hesapsız
> başlaması, gizlilik argümanının bir kısmını da götürüyor.
>
> **Doğru konumlandırma "tek ekranda gösteren" değil, "gösterileni gerçekten analiz eden" olmalı.**
> Rakiplerin hiçbirinde görülmeyen ve FAGENT'ta zaten olan: Fisher reel getiri, XIRR, kovaryans
> tabanlı portföy volatilitesi, maksimum düşüş, Sharpe, korelasyon, çeşitlendirme faydası,
> gerçekleşmiş/gerçekleşmemiş K/Z ayrımı, ve **sorulmadan çalışan** proaktif uyarı.
>
> Tam yeniden yazım sunum aşamasına bırakıldı (kullanıcı kararı). Toplantıya kadar yapılmazsa,
> B.1'deki "kimse toplamı göstermiyor" cümlesini **kullanma** — odada biri "Parafokus zaten
> yapıyor" derse sunumun güveni sarsılır. Yerine: *"Gösteren çok; hesaplayan yok."*

**Konumlandırma cümlesi (revize edilmeli):** *"Kurumlar kendi kutusunu gösteriyor, yerli
uygulamalar toplamı gösteriyor ama hesaplamıyor, yurtdışı araçları Türkiye'nin enflasyon
gerçeğini bilmiyor. Ortada bağımsız ve TL-yerlisi bir **analiz** katmanı yok."*

## B.3 Savunulabilirlik — dürüst değerlendirme

Yatırımcı bunu mutlaka soracak: *"Bunu BtcTurk/bir banka kopyalayamaz mı?"* Dürüst cevap:
**kodu kopyalayabilirler, konumu kopyalayamazlar.**

**Savunulabilir olan:**
- **Çıkar çatışması yokluğu.** Mevduat toplayan bir kurum "mevduatınız eriyor" diyemez. FAGENT
  diyebilir. Bu, koda değil **kim olduğuna** bağlı bir avantaj.
- **Sıfır marjinal maliyet.** Kural tabanlı ajan → mesaj başına 0 TL. LLM tabanlı bir rakip her
  kullanıcı etkileşiminde para yakar. Ücretsiz katmanı sürdürülebilir kılan tek şey budur.
- **Gizlilik mimarisi.** Sunucu yok → veri sızıntısı yüzeyi yok → KVKK yükü yok. Kurumsal bir
  rakip bu mimariyi seçemez, çünkü kurumlar veriyi toplamak *ister*.
- **Türkiye'ye özgü matematik.** Fisher reel getiri, TL bazlı yıllıklandırma, TEFAS/BIST/altın/
  mevduat sınıflandırması — jenerik bir yurtdışı ürününde yok.

**Savunulabilir olmayan (yatırımcı sorarsa önce sen söyle):**
- Kod. 4.953 satır; yetkin bir ekip birkaç ayda benzerini yazar.
- Dağıtım. Kullanıcı tabanı yok; büyüme kanalı henüz belirsiz.
- Veri anlaşmaları. BIST/TEFAS canlı verisi kurumsal anlaşma ister — bu tek başına aşılamaz.

**Bu üçünün ortak cevabı aynı:** *"Bu yüzden ilk hamle bağımsız büyüme değil, BtcTurk gibi
dağıtımı olan bir kurumla ortaklık."* Zayıflığı stratejiye çeviriyorsun.

## B.4 İş modeli seçenekleri

| Model | Nasıl | Artı | Eksi |
|---|---|---|---|
| **B2B lisans** | Kurum (borsa/banka) FAGENT katmanını kendi uygulamasına gömer | Dağıtım hazır, gelir öngörülebilir | Kuruma bağımlılık, satış döngüsü uzun |
| **B2C freemium** | Temel takip ücretsiz, gelişmiş risk/rapor abonelikli | Doğrudan kullanıcı ilişkisi | Dağıtım maliyeti yüksek, TL'de düşük ödeme istekliliği |
| **Beyaz etiket** | Aracı kurumlar kendi markalarıyla sunar | Çoklu müşteri | Ürün farklılaşması zayıflar |

**Öneri:** Önce B2B (BtcTurk pilotu) → referans → beyaz etiket. B2C'yi bağımsız büyüme kanalı
olarak değil, ürün geri bildirim kanalı olarak tut.

## B.5 Zor sorular ve cevapları

| Soru | Cevap |
|---|---|
| **"Neden şimdi?"** | "%32 enflasyon reel getiriyi soyut bir kavram olmaktan çıkardı. Ayrıca kripto, hisse ve fon yatırımcı sayıları aynı anda rekor seviyede — parçalanma hiç bu kadar büyük olmamıştı." |
| **"AI değilse neden AI diyorsunuz?"** | "Demiyoruz. Ürünün içinde LLM olmadığı açıkça yazılı. Sattığımız şey model değil, **doğru finansal matematik + doğru zamanlama**." |
| **"Tek kişilik proje mi?"** | Dürüst ol. Karşılığında göster: 23 e2e test dosyası, 415 otomatik kontrol, dokümante edilmiş mimari kuralları (`AGENTS.md`). "Ölçek yok ama disiplin var." |
| **"Kullanıcı verisini elle girer mi gerçekten?"** | "Motive olan girer — ve zaten hedef kitle o. Ama tek başına yeterli değil; bu yüzden ilk hedef veri entegrasyonu olan bir kurum ortaklığı." |
| **"Çıkış (exit) senaryosu?"** | Kurum tarafından satın alınma (borsa/banka/aracı kurum) en gerçekçi yol. Ürün bilinçli olarak entegre edilebilir mimaride: ajan mantığı saf ve izole. |

---

# Bölüm C — İç değerlendirme / teknik ekip

## C.1 Mimari karşılaştırma

| Boyut | Bloki (tahmini) | FAGENT (doğrulanmış) |
|---|---|---|
| Zekâ motoru | LLM + doğal dil + ses | Kural tabanlı: düzenli ifade + Jaccard benzerliği |
| Çalışma yeri | Kurum sunucusu | Tarayıcı, sunucu yok |
| Veri kaynağı | Kurum içi, doğrulanmış | CoinGecko + Frankfurter (anahtarsız) + kullanıcı girişi |
| Kalıcılık | Kurum veritabanı | `localStorage` (3 anahtar) |
| Mesaj başına maliyet | LLM token maliyeti | 0 |
| Determinizm | Düşük (üretken model) | Tam — aynı girdi aynı çıktı |
| Test edilebilirlik | Model çıktısı testi zor | Saf fonksiyonlar → doğrudan test edilebilir |

**FAGENT'ın kritik mimari kararı:** `fagent/src/agent.ts` **saftır** — hiçbir ağ/depolama/DOM
erişimi yoktur, tüm veri parametreyle geçer. Bu iki şeyi mümkün kılar: (1) ajanı UI olmadan test
etmek, (2) LLM'e geçişte tek dosyayı değiştirmek.

## C.2 Kapsam boşlukları — dürüst envanter

| Boşluk | Neden | Kapanma yolu |
|---|---|---|
| BIST hisse canlı/tarihsel fiyat | Anahtarsız + resmî + CORS-açık kaynak yok | Kurumsal veri anlaşması ya da sunucu proxy'si |
| TEFAS fon fiyatı | Aynı | Aynı |
| Altın fiyatı | Aday kaynakların JSON şeması doğrulanamadı | Şema doğrulanınca `market.ts` desenine eklenir |
| Risk metrikleri kapsamı | Yalnızca canlı fiyata bağlı kripto/döviz | Yukarıdakiler çözülünce genişler |
| Cihazlar arası senkron | Sunucu yok | CSV ile manuel; kurumsal entegrasyonda değişir |
| Sesli komut | Kapsam dışı | — |

**Not:** Bu boşluklar ürün içinde gizlenmiyor — risk raporu portföyün yüzde kaçını kapsadığını ve
kapsam dışı her varlığın nedenini ekrana yazıyor. Toplantıda bu **zayıflık değil, dürüstlük
kanıtı** olarak sunulmalı.

## C.3 LLM'e geçiş kararı

Bugün ajan kural tabanlı. Geçişin maliyeti ve kazancı:

**Kazanç:** serbest doğal dilde esneklik, kullanıcının beklemediği soruları da cevaplayabilme.
**Maliyet:** sunucu (Render/Railway) + API anahtarı + **mesaj başına gerçek para** + gecikme +
halüsinasyon riski (finansal rakamda kabul edilemez).

**Öneri — hibrit:** Finansal hesaplamalar (reel getiri, XIRR, risk) **her zaman yerel ve
deterministik** kalsın; LLM yalnızca *ifade katmanı* olarak kullanılsın (kullanıcının serbest
sorusunu anlama ve sonucu doğal dille aktarma). Böylece halüsinasyon rakama değil yalnızca cümleye
dokunabilir. Altyapı hazır: `server/` klasöründe Anthropic proxy'si (`POST /api/ai/chat`) bekliyor.

## C.0 ⚠️ Toplantıda SÖYLENMEYECEKLER

Ürün güçlü; onu zayıflatacak tek şey doğrulanmamış bir cümle. İkisi de kolayca yakalanır:

| Söyleme | Bunun yerine | Neden |
|---|---|---|
| *"Enflasyonu TCMB'den canlı çekiyoruz."* | *"TCMB entegrasyonu kodda hazır ve testli; API anahtarı eklendiği an devreye giriyor. Şu an varsayım modunda."* | Entegrasyon yazıldı (`inflation.ts`, `evds.ts`, Netlify Function, 26 e2e kontrolü) ama anahtar henüz alınmadı. **Ekranda "varsayım (TÜİK, elle güncellenir)" yazıyor** — biri ekrana bakarsa farkı görür. |
| *"BtcTurk'ün 5 milyon+ kayıtlı hesabı var."* | *"Milyonlarca kullanıcınız."* | Bu rakam ikincil bir kaynaktan alındı, **resmî açıklamayla teyit edilemedi**. Karşı tarafın kendi şirketi hakkında yanlış rakam söylemek en kötü yerde yanlış olmaktır. |
| *"BtcTurk kripto dışını görmüyor."* / *"Sizin göremediğiniz %80"* | *"Hepsini satıyorsunuz ama kullanıcı toplamda ne kazandığını göremiyor."* | **Kesinlikle yanlış.** BtcTurk \| Hisse'de BIST, ABD hissesi, TEFAS fonu ve halka arz var; Kripto uygulamasının "Varlıklar" ekranı ABD hisselerini zaten gösteriyor. Söylersen anında düzeltilirsin. Bkz. [`bloki-vs-fagent.md` §5](bloki-vs-fagent.md) uyarı kutusu. |

Aynı ilke ürünün her yerinde geçerli ve asıl satış argümanı da bu: **doğrulanmayan hiçbir sayı
"kesin" gibi sunulmuyor.** Stopaj oranlarında kripto/altın/döviz için %0 bırakılması ve ajanın
*"oran uydurmuyorum"* demesi aynı disiplinin ürünü — sorulursa örnek olarak göster.

## C.4 Toplantı öncesi düzeltilmesi gerekenler

### Düzeltildi ✅

| # | Sorun | Ne yapıldı |
|---|---|---|
| 1 | **Varsayılan enflasyon %40 sabitlenmişti**; güncel TÜİK verisi %32,11 | İkisi de **%32**'ye çekildi (`App.tsx` `DEFAULT_INFLATION_PCT`, `agent.ts` `VARSAYILAN_ENFLASYON`) ve her ikisine kaynak + "birlikte güncelle" notu eklendi |
| 2 | Proaktif kart metni *"getiri üreten bir sınıfa kaydırmayı değerlendirebilirsin"* diyordu — yatırım tavsiyesi sınırına yakın | Betimleyici hale getirildi: *"…nominal bakiyen düşmediği için ekranda görünmeyen bir alım gücü kaybı."* Aynı sorun `analyzePortfolio`'daki konsantrasyon uyarısında da vardı (*"ağırlığı kademeli azaltmayı değerlendirebilirsin"*) → o da düzeltildi |
| 3 | `fagent/README.md` bayattı — analitik/risk modülleri geçmiyordu, test sayısı 154 yazıyordu | Güncellendi: 9 sekme, `analytics.ts`/`priceHistory.ts`/`cryptoMarket.ts`/`RiskPanel`/`CryptoMarket` dosya haritasına eklendi, **314 kontrol** ve `npm run test:e2e` komutu yazıldı, kapsam + enflasyon varsayımı sınırları belgelendi |

Doğrulama: `npm run typecheck` temiz · `npm run build` temiz · `npm run test:e2e` **355/355 geçti**.

**Not — ürün zaten üç yerde "yatırım tavsiyesi değildir" uyarısı taşıyor** (`analyzePortfolio` çıktısının
sonu, Ajan sekmesi altbilgisi, risk paneli). Sorun uyarının yokluğu değil, birkaç metnin emir kipiyle
eylem önermesiydi — o giderildi. Hukuk görüşü yine de alınmalı.

### Açık kalanlar — hazır cevap yeterli

| # | Sorun | Risk | Öncelik |
|---|---|---|---|
| 4 | Bundle 689 kB (gzip 203 kB), kod bölme yok | Mobilde ilk açılış; teknik soruda gündeme gelir | Düşük — cevabı hazır olsun |
| 5 | E2e testleri repoda ama CI yok | "Nasıl doğruluyorsunuz?" sorusuna cevap zayıflar | Düşük |

## C.5 Yol haritası — üç ufuk

**Kısa (toplantıya kadar):** C.4'teki 1–3 tamamlandı. Kalan: demo portföyünün hazırlanması ve
demo akışının iki kez prova edilmesi.

**Orta (1-3 ay, entegrasyon olursa):** Salt-okunur bakiye aktarımı (Seviye 1); risk metriklerinin
kapsam genişlemesi; CI kurulumu; hukuk onaylı metin seti.

**Uzun (3-12 ay):** Hibrit LLM katmanı (C.3); BIST/TEFAS veri anlaşması; çoklu cihaz senkronu —
ama **yalnızca** gizlilik mimarisini bozmayan bir tasarımla (uçtan uca şifreli senkron gibi).

---

# Bölüm D — 4-5 günlük hazırlık planı

| Gün | Yapılacak | Çıktı |
|---|---|---|
| **1** | ✅ **Tamamlandı** — C.4 madde 1–3 düzeltildi (enflasyon %32, tavsiye sınırı metinleri, README). Doğrulama: typecheck + build temiz, e2e 355/355 | Demo güvenli |
| **2** | Demo portföyünü kur (karma: kripto + mevduat + BIST + döviz). A.4'teki 7 adımı baştan sona **iki kez** prova et, süre tut | 7 dakikada biten akış |
| **3** | A.3 itiraz–cevap tablosunu sesli tekrar et. Bölüm 0'daki altı sayıyı ve Fisher örneğini ezberle | Notsuz konuşabilme |
| **4** | Sunum sayfasını gözden geçir, muhataba göre bölüm seç. `fagent/README.md`'yi güncelle (C.4 madde 3) | Sunum + doküman hazır |
| **5** | Yedek plan: internet kesilirse ne yapacaksın? (ekran görüntüsü seti hazırla — canlı fiyat çağrıları ağa çıkıyor). Toplantı sonrası "ask"ı (A.6) yaz | Riske dayanıklı sunum |

**Sunumda yanına alacakların:** bu doküman (yazdırılmış ya da tablette), sunum sayfası linki,
çalışan demo, ekran görüntüsü yedeği, A.6'daki net talep.

---

# Bölüm E — Kaynaklar ve doğruluk notu

**Piyasa verileri (kamuya açık, Ağustos 2026 itibarıyla):**
- Enflasyon %32,11 (Haziran 2026) — [TÜİK Veri Portalı](https://veriportali.tuik.gov.tr/tr/press/58289)
- Toplam mevduat 28,26 trilyon TL, %43 döviz — [BDDK](https://www.bddk.org.tr/BultenGunluk)
- Pay senedi yatırımcısı 6,87 milyon — [MKK Aylık Piyasa Bülteni](https://www.mkk.com.tr/veri-hizmetleri/mkk-aylik-piyasa-bulteni)
- Yatırım fonu yatırımcısı 10,7 milyon / 13,8 trilyon TL — [Türkiye'de İş Dünyası](https://turkiyedeisdunyasi.com/yatirim-fonlarinin-toplam-buyuklugu-138-trilyon-tlye-ulasti-102059/)
- BtcTurk kayıtlı hesap sayısı — [BtcTurk (Vikipedi)](https://tr.wikipedia.org/wiki/BtcTurk) ⚠️ **Vikipedi ikincil kaynaktır; resmî açıklamayla teyit EDİLEMEDİ.** Toplantıda rakam telaffuz etme (§C.0).
- BtcTurk | Hisse kapsamı ve SPK lisansı (2026-08-02 doğrulaması) — [hisse.btcturk.com](https://hisse.btcturk.com/) · [Bilgi Platformu](https://bilgiplatformu.btcturk.com/genel/hisse-btcturk-hisse-nedir/) · [Webrazzi](https://webrazzi.com/2023/07/11/btcturkten-hisse-senedi-alim-satim-uygulamasi-btcturk-hisse/)
- Muhatap profilleri (Emir Karagüler, Emine Ceylan) — kamuya açık LinkedIn, 2026-08-02

**Bloki bilgileri — yalnızca kamuya açık duyurulara dayanır.** Kaynak koduna, iç mimarisine veya
yol haritasına erişim yoktur; bu dokümandaki "Bloki (tahmini)" ifadeleri açıkça tahmindir.
Kaynaklar ve tam liste: [`bloki-vs-fagent.md`](bloki-vs-fagent.md) §6.

**FAGENT verileri — bu repodan doğrulanmıştır:** 4.953 satır kaynak kod (`fagent/src/`),
23 e2e test dosyası / 415 otomatik kontrol (`fagent/tests/e2e/`), 4 üretim bağımlılığı
(react, react-dom, recharts, lucide-react).

> **Uyarı:** Piyasa sayıları hızla değişir. Toplantıdan önce Bölüm 0'daki altı sayıyı
> güncel kaynaklardan bir kez daha teyit et — özellikle enflasyon ve yatırımcı sayılarını.
