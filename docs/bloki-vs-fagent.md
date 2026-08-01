# Bloki ↔ FAGENT — Fark Neresi?

> **Tek cümlelik tez:** Bloki bir **borsa asistanı**, FAGENT bir **servet asistanı**.
> İkisi aynı işi iki farklı yerde yapmıyor — biri *işlemi* hızlandırıyor, diğeri *kararı* besliyor.

Bu doküman, BtcTurk | Kripto'nun yapay zekâ asistanı **Bloki** ile **FAGENT**'ın nerede
ayrıştığını, nerede üst üste bindiğini ve neden birbirinin rakibi değil tamamlayıcısı
olduğunu anlatır.

---

## 1. Bir bakışta fark

| Boyut | Bloki | FAGENT |
|---|---|---|
| **Kapsam** | BtcTurk hesabındaki kripto varlıklar | Tüm servet: hisse, fon, döviz, altın, mevduat, kripto |
| **Etkileşim** | Talep üzerine — komut → cevap (yazılı **ve sesli**) | Talep üzerine **+ proaktif**: kullanıcı sormadan uyarır |
| **Getiri ölçüsü** | Nominal kâr/zarar, tarih aralığı bazlı | Nominal + **reel getiri (Fisher)** + **XIRR** (para-ağırlıklı yıllık getiri) |
| **Risk ölçüsü** | Dağılım ve değişim oranları | Yıllık volatilite, maksimum düşüş, Sharpe, korelasyon, HHI yoğunlaşma |
| **Aksiyon** | **Gerçek emir + bankaya TL çekimi** | Yalnızca kullanıcının kendi defterine kayıt (Onayla/Vazgeç ile) |
| **Veri** | Kurum sunucusu, hesap + KYC | Yalnızca tarayıcı (`localStorage`) — sunucu yok, hesap yok |
| **Zekâ türü** | Doğal dil + ses (LLM tabanlı asistan) | Kural tabanlı, deterministik, kullanıcı tarafından eğitilebilir |

---

## 2. Bloki ne yapıyor

BtcTurk | Kripto'nun kamuya duyurduğu yeteneklere göre Bloki:

1. **Yazılı ve sesli komutla** çalışır — kullanıcı konuşarak da işlem yapabilir.
2. **Saniyeler içinde alım-satım** yapar: "almak/satmak istediğin tutarı söyle" yeterli.
3. **Portföyü tek komutla** gösterir: toplam varlık değeri, dağılım, değişim oranları.
4. **Piyasayı yorumlar:** "Bitcoin fiyatı neden değişti?" gibi sorulara hızlı bilgi verir.
5. **Kâr/zarar hesaplar:** belirli bir tarih aralığında hangi varlıktan ne kazanıldığını anında çıkarır.
6. **Yatırım senaryosu kurar:** "Geçen ay Ethereum yerine Bitcoin alsaydım ne olurdu?"
7. **Bankaya TL çekimi** yapar.

### Bloki'nin güçlü olduğu yer

Bu üç şey Bloki'nin doğal alanı ve FAGENT'ın alanı **değil** — olmamalı da:

- **Emir yürütme.** Bloki gerçek para hareket ettirebilir; bunun için kurum içi yetki, KYC ve
  lisans gerekir. FAGENT tarayıcıda çalışan, hesapsız bir uygulamadır; emir yürütmez.
- **Ses.** Sesli komut, mobil uygulama içinde işletim sistemi entegrasyonu ister.
- **Kurum içi veriye doğrudan erişim.** Bloki, kullanıcının BtcTurk bakiyesini ve işlem
  geçmişini kaynağından, gecikmesiz ve doğrulanmış olarak görür.

Bu bir iş bölümüdür: **işlem katmanı Bloki'nin, karar katmanı FAGENT'ın.**

---

## 3. FAGENT ne yapıyor

FAGENT, API anahtarı gerektirmeyen bir yatırımcı panelidir. Dokuz sekme: **Panel, Bugün,
Hisseler, Fonlar, Kripto Varlıklar, Kripto Piyasa, İşlemler, Projeksiyon, Ajan.**

Portföy takibinin ötesinde şunları yapar:

- **Proaktif içgörü kartı** — Panel açılır açılmaz, kullanıcı hiçbir şey sormadan çalışır
  (`fagent/src/agent.ts` → `proactiveInsights`).
- **Gerçek finansal matematik** — reel getiri, XIRR, Herfindahl yoğunlaşma, katkı/getiri
  ayrıştırması, volatilite, maksimum düşüş, Sharpe, korelasyon, çeşitlendirme faydası
  (`fagent/src/analytics.ts`).
- **Gerçek tarihsel fiyat serisi** — CoinGecko ve Frankfurter (ECB) uçlarından, anahtarsız
  (`fagent/src/priceHistory.ts`).
- **Grafik yorumlama** — ajan "işte grafiğin" deyip susmaz, grafiğin ne söylediğini hesaplar.
- **Ajan katmanları** — eğitilebilir soru-cevap tabanı, uzun süreli bellek, 👍/👎 geri bildirim
  döngüsü, komutla işlem → **Onayla/Vazgeç** onay akışı.

---

## 4. Farkın altı ekseni

### 4.1 Kapsam — tek borsa vs. tüm servet

Bloki, BtcTurk hesabındaki kripto varlıkları görür. FAGENT altı varlık sınıfını birden görür:
hisse, fon, döviz, altın, mevduat, kripto.

**Neden önemli:** Serveti %60 mevduat, %20 döviz, %20 kripto olan bir kullanıcı düşün.
Bloki'nin gördüğü kısım servetin %20'sidir ve o %20 içindeki dağılım mükemmel görünebilir.
Oysa kullanıcının gerçek problemi görünmeyen %80'dedir: serveti ağırlıkla getiri üretmeyen
nakit benzeri varlıklarda duruyor. **Kapsam dışında kalan bir riske uyarı verilemez.**

### 4.2 Proaktiflik — sormayan kullanıcı öğrenemez

Bloki komutla çalışır: kullanıcı sorarsa cevap alır. Bu güçlü bir arayüzdür, ama bir boşluk
bırakır — **kullanıcı doğru soruyu sormayı bilmiyorsa o bilgiye hiç ulaşmaz.**

FAGENT'ın çekirdek ayrışma noktası burası: Panel açılır açılmaz, sorulmadan çalışan bir içgörü
katmanı vardır. Ürettiği uyarılar:

- **Yoğunlaşma:** portföyün %50'sinden fazlası tek varlık sınıfındaysa uyarır.
- **Reel erime:** nakit benzeri varlıkların (mevduat + döviz + stablecoin) enflasyon karşısında
  yılda kaç TL alım gücü kaybettiğini **somut tutarla** yazar. 100.000 TL nakdi olan ve %40
  enflasyon varsayan bir kullanıcı için bu, yılda ~40.000 TL'lik görünmez bir kayıptır.
- **Denge:** dört ve üzeri sınıfa yayılmışsa bunu olumlu geri bildirim olarak söyler.

Enflasyon oranı koda gömülmez — kullanıcı düzenler; varsayılan varsayım arayüzde açıkça yazılıdır.

### 4.3 Matematik derinliği — formülü açıklamak vs. hesabı yapmak

Bir asistana "enflasyona göre gerçekte ne kazandım?" diye sorulduğunda iki farklı davranış var:
formülü açıklayıp hesabı kullanıcıya bırakmak, ya da hesabı yapıp sonucu vermek. FAGENT ikincisini
yapar ve yaygın kestirmenin neden yanlış olduğunu da gösterir:

> Nominal getirin %60, enflasyon %40 ise, yaygın "nominal − enflasyon" kestirmesi **%20** der.
> Doğrusu Fisher denklemidir: (1 + 0,60) / (1 + 0,40) − 1 = **%14,29**.
> Yüksek enflasyonda kestirme her zaman olduğundan iyimser çıkar.

Aynı yaklaşım diğer metriklerde de geçerli:

- **XIRR** — zamana yayılmış katkılar varsa "toplam % kaç kazandım" yanıltıcıdır; para-ağırlıklı
  yıllık getiri doğru ölçüttür.
- **Herfindahl (HHI) + etkin varlık sayısı** — "10 varlığım var" ile "etkin olarak 2,3 varlığım
  var" arasındaki farkı gösterir.
- **Volatilite, maksimum düşüş, Sharpe, korelasyon** — gerçek tarihsel fiyat serisinden hesaplanır,
  tahmin edilmez.
- **Çeşitlendirme faydası** — kovaryans matrisiyle hesaplanan portföy volatilitesi ile
  "hiç çeşitlendirme yokmuş gibi" ağırlıklı ortalama arasındaki farktır; çeşitlendirmenin
  kullanıcıya kaç puan kazandırdığını sayı olarak verir.

FAGENT bu hesapların **hangi varlıkları kapsadığını da yazar**: risk raporu, portföyün yüzde
kaçının tarihsel veriyle kapsandığını (`coveragePct`) ve kapsam dışında kalan her varlığın
nedenini ("BIST hissesi için anahtarsız tarihsel fiyat kaynağı yok" gibi) açıkça gösterir.

### 4.4 Aksiyon yetkisi — gerçek para vs. kendi defteri

Bloki gerçek emir gönderir ve bankaya TL çeker. FAGENT bunu yapmaz ve yapmamalıdır: tarayıcıda
çalışan, hesapsız bir uygulamanın kullanıcının parasına dokunma yetkisi olmaz.

FAGENT'ın aksiyonu kendi defteriyle sınırlıdır ve orada bile onay ister: "THYAO'dan 500 TL sat"
yazıldığında ajan komutu ayrıştırır, **"onaylıyor musun?"** diye sorar ve **Onayla**'ya basılmadan
hiçbir veri değişmez. Komut algılama bilinçli olarak sıkıdır — tutar + tek anlamlı fiil + tam
olarak bir varlık eşleşmesi şarttır; biri eksikse normal soru-cevaba düşer. Yanlış anlaşılan bir
"işlem", cevapsız kalan bir soruyla kıyaslanamayacak kadar pahalıdır.

### 4.5 Veri ve gizlilik

FAGENT'ın tüm verisi kullanıcının tarayıcısında (`localStorage`) durur. Sunucu yok, hesap yok,
telemetri yok, API anahtarı yok. Bu bilinçli bir gizlilik/KVKK tasarım kararıdır — kullanıcı
hiçbir yere kayıt olmadan, hiçbir veri paylaşmadan tüm servetini tek yerde görebilir.

Bloki'nin modeli farklıdır ve öyle olmak zorundadır: emir yürüten bir asistan kurum sunucusunda,
kimliği doğrulanmış bir hesap üzerinde çalışır.

### 4.6 Zekâ türü ve dürüstlük ilkesi

**FAGENT'ın ajanı bir LLM değildir.** Kural tabanlıdır (düzenli ifade eşleştirme + kelime kümesi
benzerliği). Bu, arayüzde ve dokümantasyonda açıkça yazılıdır; "model eğittik" gibi ifadeler
kullanılmaz.

Bunun getirdikleri:

- **Deterministik** — aynı soru aynı cevabı verir, halüsinasyon üretmez.
- **Maliyetsiz ve gecikmesiz** — sunucu çağrısı yok, mesaj başına ücret yok.
- **Eğitilebilir** — kullanıcı doğrudan soru-cevap öğretebilir ve öğrettiği bilgi yerleşik
  kuralların önüne geçer. 👎 verilen bir cevap, düzeltme panelini önceden doldurulmuş olarak açar.

Bunun karşılığında serbest doğal dilde bir LLM'in esnekliğine sahip değildir. FAGENT'ın mimarisi
bu geçişe hazır tutulmuştur: ajanın yanıt mantığı saf fonksiyonlar halinde tek dosyada izole
edilmiştir (`fagent/src/agent.ts` — hiçbir ağ/depolama erişimi içermez), böylece bir LLM
proxy'sine geçiş tek noktadan yapılabilir.

---

## 5. Neden rakip değil, tamamlayıcı katman

İki asistanın güçlü olduğu yerler örtüşmüyor:

| Kullanıcının ihtiyacı | Kim daha iyi cevap veriyor |
|---|---|
| "BTC'den 5.000 TL sat" | **Bloki** — emri saniyeler içinde yürütür |
| "Bitcoin neden düştü?" | **Bloki** — piyasa bilgisine kaynağından erişir |
| "Kripto portföyümde ne kazandım?" | **Bloki** — kendi verisi, kesin ve gecikmesiz |
| "Tüm servetim enflasyona karşı ne durumda?" | **FAGENT** — mevduat + döviz + altını da görür |
| "Farkında olmadığım bir riskim var mı?" | **FAGENT** — sorulmadan uyarır |
| "Gerçekte yıllık kaç kazandım?" | **FAGENT** — XIRR + Fisher reel getiri |

### Birleşme noktaları

1. **Salt-okunur portföy aktarımı.** BtcTurk kripto pozisyonlarının FAGENT'a tek yönlü, salt-okunur
   aktarılması. Kullanıcı kripto tarafını elle girmekten kurtulur; FAGENT'ın servet görünümü
   gerçek veriyle beslenir. Emir yetkisi aktarılmaz — yalnızca bakiye görünürlüğü.
2. **Ortak reel getiri kartı.** Bloki'nin nominal kâr/zarar cevabının yanına FAGENT'ın reel
   getiri hesabı eklenir: "Nominal %60 kazandın; %40 enflasyonla reel getirin %14,29."
3. **Proaktif katmanın devri.** FAGENT'ın "sorulmadan uyar" motoru, Bloki'nin cevaplarının altına
   iliştirilebilecek bir içgörü üreticisi olarak konumlanır — kullanıcı doğru soruyu sormayı
   bilmese de kritik bilgiye ulaşır.

**Konumlandırma özeti:** Bloki kullanıcıyı **hızlı** yapar, FAGENT **bilinçli** yapar.
Birlikte, işlemi hızlı ve kararı bilinçli bir yatırımcı deneyimi çıkar.

---

## 6. Kaynaklar ve doğruluk notu

**Bloki tarafı — yalnızca kamuya açık duyurulara dayanır.** Bu dokümanı hazırlarken Bloki'nin
kaynak koduna, iç mimarisine veya yayınlanmamış yol haritasına erişim olmamıştır. Aşağıdaki
kaynaklarda duyurulan yetenekler esas alınmıştır:

- [BtcTurk Bilgi Platformu — BtcTurk | Kripto'nun Yapay Zekâ Asistanı: Bloki](https://bilgiplatformu.btcturk.com/btcturk-kripto/btcturk-kriptonun-yapay-zeka-asistani-bloki/)
- [Anadolu Ajansı — BtcTurk Kripto yapay zeka asistanı Bloki'yi kullanıma sundu](https://www.aa.com.tr/tr/isdunyasi/finans/btcturk-kripto-yapay-zeka-asistani-blokiyi-kullanima-sundu/702604)
- [DHA — BtcTurk | Kripto'dan 'Kriptopara yapay zeka asistanı: Bloki'](https://www.dha.com.tr/kurumsal/btcturk-kriptodan-kriptopara-yapay-zeka-asistani-bloki-2884127)

Bloki'nin yetenekleri duyurudan bu yana genişlemiş olabilir; bu dokümandaki karşılaştırma
**1 Ağustos 2026** tarihli bilgilerle sınırlıdır ve Bloki geliştikçe güncellenmelidir.

**FAGENT tarafı — bu repodaki kodla doğrulanmıştır.** Her iddianın karşılığı:

| İddia | Kaynak dosya |
|---|---|
| Proaktif içgörüler, grafik yorumlama, işlem komutu algılama | `fagent/src/agent.ts` |
| Reel getiri (Fisher), XIRR, HHI, volatilite, Sharpe, korelasyon, çeşitlendirme faydası | `fagent/src/analytics.ts` |
| Tarihsel fiyat serisi ve kapsam oranı (`coveragePct`) | `fagent/src/priceHistory.ts` |
| Eğitilebilir bilgi tabanı ve uzun süreli bellek | `fagent/src/agentTraining.ts`, `fagent/src/agentMemory.ts` |
| Sekmeler, Onayla/Vazgeç akışı, 👍/👎 geri bildirimi | `fagent/src/App.tsx` |
| Veri modeli, `localStorage`, sunucusuz mimari | `fagent/src/store.ts` |

Mimari kurallar ve tasarım gerekçeleri için: [`AGENTS.md`](../AGENTS.md), [`fagent/README.md`](../fagent/README.md), [`CLAUDE.md`](../CLAUDE.md).
