# BtcTurk | Hisse — Test Planı ve Rapor Şablonu

> **Bağlam:** Görüşmenin ardından BtcTurk ekibi "diğer çıkardığımız uygulamayı test etmenizi
> istiyoruz" dedi. Bu doküman iki şey içerir: neye bakılacağı (test planı) ve bulguların nasıl
> yazılacağı (rapor şablonu).
>
> **Bu bir QA işi değil, bir iş örneği.** Karşı taraf muhtemelen yalnızca hata listesi değil,
> nasıl düşündüğünü de görmek istiyor. Rapor ona göre yazılmalı.

---

## 0. Önce üç sınır

**Güvenlik testi YAPMA.** Lisanslı bir aracı kurumun uygulamasına yazılı izin olmadan
penetrasyon testi, API kurcalama, oturum/token denemesi yapılmaz. Yasal sonucu olur ve
istenen şey bu değil. Kullanıcı gözüyle test et.

**Gerçek parayla dikkatli ol.** Emir akışını denerken küçük tutar kullan, ya da mümkünse
piyasa kapalıyken emir ekranına kadar gidip **göndermeden** dön. Yanlışlıkla verilmiş bir
emir hem para hem itibar kaybı.

**Kapsamı ve tarihi kendin belirle.** "Ne tür geri bildirim istiyorsunuz?" diye sor, cevap
gelmezse kendin çerçevele ve bir tarih ver. Süresiz, kapsamsız test karşılıksız emeğe döner.

---

## 1. Yaklaşım

Test iki gözle yapılacak ve rapor da bu ikiye ayrılacak:

| Bölüm | Ne arıyorsun | Neden |
|---|---|---|
| **A — Ürün bulguları** | Gerçek kusurlar, tıkanan akışlar, kafa karıştıran ekranlar | İyi niyeti ve ciddiyeti gösterir. İstedikleri şey nominal olarak bu. |
| **B — Analiz katmanı bulguları** | Uygulamanın gösterdiği ile hesaplamadığı arasındaki boşluk | Sunumda anlattığın tezin **kendi ürünlerindeki** karşılığı. Asıl değer burada. |

**Bölüm B'yi bir satış konuşmasına çevirme.** Betimleyici kal: "şu ekranda şu sayı yok" de,
"o yüzden bana ihtiyacınız var" deme. Sonucu okuyan kendi çıkarır — çıkarmazsa da rapor
zarar görmemiş olur.

**Kayıt tut.** Her bulgu için: ekran görüntüsü, hangi ekran, hangi adımlar, ne bekliyordun,
ne oldu. Sonradan hatırlamaya çalışmak zaman kaybı ve rapor kalitesini düşürür.

---

## 2. Bölüm A — Ürün testi

### A.1 İlk açılış ve hesap

- [ ] Uygulamayı **tamamen kapatıp** yeniden aç — soğuk açılış kaç saniye sürüyor?
- [ ] İlk kurulumda ne isteniyor, hangi izinler hangi gerekçeyle açıklanıyor?
- [ ] Hesap açma / kimlik doğrulama akışı: kaç adım, nerede tıkanıyor, hata mesajları anlaşılır mı?
- [ ] Oturum süresi dolduğunda ne oluyor — nazikçe mi düşüyor, veri kaybı var mı?
- [ ] Biyometrik giriş varsa: kapatıp açmak çalışıyor mu?

### A.2 Fiyatlar sekmesi

Ekran görüntülerinden bilinen yapı: **BİST · ABD · Fonlar · Piyasalar** üst sekmeleri,
Fonlar altında *Hisse Senedi Fonları, Para Piyasası, Bankacılık, Borçlanma Araçları,
Ödeyen Fonlar, Halka Arz Şirket Fonları* alt sekmeleri.

- [ ] Arama: kod (`THYAO`) ve şirket adı ile ayrı ayrı ara. Türkçe karakter (`İŞ`, `ÇİMSA`) sorun çıkarıyor mu?
- [ ] Sıralama: İSİM / FİYAT / DEĞİŞİM(1Y) / BÜYÜKLÜK başlıklarına tıkla — sıralama doğru mu, tersine dönüyor mu?
- [ ] Yıldız (favori): ekle, çıkar, uygulamayı kapatıp aç — kalıcı mı?
- [ ] Alt sekmeler arasında kaydırma akıcı mı, yoksa takılıyor mu?
- [ ] Mini grafikler (sparkline) hangi dönemi gösteriyor — bir yerde yazıyor mu?
- [ ] **Veri tazeliği:** fiyatın hangi ana ait olduğu yazıyor mu? Gecikmeli mi, canlı mı — belirtiliyor mu?
- [ ] Piyasa kapalıyken ekran ne diyor? Son kapanış olduğu anlaşılıyor mu?
- [ ] Uzun listede aşağı kaydır — sayfalama var mı, performans düşüyor mu?

### A.3 Al / Sat

> Emir göndermeden önce **piyasa kapalıyken** akışı denemek en güvenlisi.

- [ ] Emir tipleri neler (piyasa, limit, kademeli)? Aralarındaki fark açıklanıyor mu?
- [ ] **Komisyon ve masraflar emir ekranında görünüyor mu**, yoksa onay sonrası mı?
- [ ] Bakiye yetmeyince hata mesajı ne diyor — sorunu ve çözümü söylüyor mu?
- [ ] Kesirli hisse alınabiliyor mu (ABD tarafında minimum $1 deniyor) — TL karşılığı nasıl gösteriliyor?
- [ ] Emir iptali / düzeltme akışı var mı, kaç adım?
- [ ] ABD hissesi alırken **kur** hangi anın kuru? Ekranda yazıyor mu?
- [ ] Onay ekranında toplam maliyet net mi (fiyat + komisyon + varsa vergi)?

### A.4 Yatır / Çek

- [ ] Para yatırma yöntemleri ve her birinin süresi/limiti yazıyor mu?
- [ ] Çekim: ne zaman hesapta olur — açıkça söyleniyor mu?
- [ ] Hafta sonu / mesai dışı davranışı belirtiliyor mu?
- [ ] Bir işlem sırasında ağı kapat: uygulama ne yapıyor? (Çift işlem riski var mı?)

### A.5 Varlıklarım

**Bu ekran raporun en değerli kısmı — hem A hem B bölümüne malzeme verecek.**

- [ ] Hangi bilgiler var: güncel değer, maliyet, kâr/zarar, adet, ağırlık?
- [ ] Kâr/zarar **yüzde mi tutar mı**, ikisi birden mi?
- [ ] Gerçekleşmiş / gerçekleşmemiş kâr ayrımı var mı?
- [ ] Geçmiş: portföyün zaman içindeki değişimi gösteriliyor mu, hangi dönem?
- [ ] BIST + ABD + Fon **tek toplamda** mı görünüyor, ayrı ayrı mı?
- [ ] Kripto tarafındaki varlıklar burada görünüyor mu? (Kripto uygulamasının "Varlıklar"
      ekranı ABD hisselerini gösteriyor — ters yön de çalışıyor mu?)

### A.6 Dayanıklılık ve erişilebilirlik

- [ ] Uçak modunda aç: hata mesajı anlaşılır mı, uygulama çöküyor mu?
- [ ] Ağı işlem ortasında kes ve geri aç — durum tutarlı kalıyor mu?
- [ ] Telefonun yazı tipi boyutunu en büyüğe al: metinler taşıyor mu, butonlar kayboluyor mu?
- [ ] Koyu/açık tema geçişi bozuluyor mu?
- [ ] Ekran okuyucu (TalkBack/VoiceOver) açıkken ana ekran kullanılabiliyor mu?
- [ ] Uygulamayı arka plana alıp dön: yeniden yükleme yapıyor mu, kaldığın yerde mi?

---

## 3. Bölüm B — Analiz katmanı bulguları

Buradaki her madde bir **soru** ve cevabı büyük ihtimalle "hayır". Önemli olan **hayırı
kanıtlamak** — ekran görüntüsüyle, nerede olması gerektiğini söyleyerek.

### B.1 Getiri gerçekten getiri mi?

- [ ] Gösterilen kâr/zarar **nominal** mi? Enflasyondan arındırılmış bir sayı var mı?
- [ ] Fon sayfalarındaki "Değişim (1Y)" **brüt mü, stopaj sonrası mı**? Ekranda yazıyor mu?
- [ ] TEFAS fonlarında **%17,5 stopaj** (27.03.2026 tarihli 11107 sayılı Karar, 01.05.2026'dan
      itibaren) hiçbir yerde görünüyor mu? BIST pay senedinde stopaj yok — bu fark kullanıcıya
      anlatılıyor mu?
- [ ] Aynı ekranda hem stopajlı hem stopajsız varlık varken toplam nasıl gösteriliyor?

### B.2 ABD hissesinde kur etkisi ⭐

**En keskin bulgu adayı bu.** Bir ABD hissesi dolar bazında yükselirken TL bazında düşmüş
olabilir, ya da tersi.

- [ ] Getiri **TL bazında mı, dolar bazında mı** gösteriliyor? İkisi ayrıştırılıyor mu?
- [ ] Kullanıcı "hisse mi kazandırdı, kur mu?" sorusunun cevabını görebiliyor mu?
- [ ] Toplam portföy TL'ye çevrilirken hangi kur, hangi an kullanılıyor?

### B.3 Zaman ve para akışı

- [ ] Getiri hesabı **para giriş-çıkışlarını** hesaba katıyor mu (XIRR benzeri), yoksa basit
      başlangıç-bitiş farkı mı? Düzenli alım yapan kullanıcıda ikisi ciddi biçimde ayrışır.
- [ ] "Şu tarihten beri" gibi bir dönem seçimi var mı?

### B.4 Risk ve yoğunlaşma

- [ ] Portföy volatilitesi, çeşitlendirme, korelasyon — herhangi biri var mı?
- [ ] "Portföyünün %60'ı tek hissede" gibi bir yoğunlaşma uyarısı var mı?
- [ ] Fon sayfalarında fonun kendi riski (standart sapma, Sharpe) gösteriliyor mu?
      *(Not: BtcTurk bilgi platformunda Sharpe oranını anlatan bir yazı var — üründe karşılığı
      var mı, buna özellikle bak.)*

### B.5 Proaktiflik

- [ ] Uygulama kullanıcı **sormadan** bir şey söylüyor mu? (Nakit erimesi, yoğunlaşma,
      hedeften sapma...) Yoksa yalnızca sorulanı mı gösteriyor?
- [ ] Bildirimler sadece işlem bildirimi mi (yatırma/çekme/emir), yoksa içgörü de var mı?

---

## 4. Rapor şablonu

> Aşağıdaki iskeleti doldurup gönder. **Uzun olmasın** — 2 sayfa okunur, 10 sayfa okunmaz.
> Bulguları öncelik sırasına diz, en önemlisi en üstte.

```markdown
# BtcTurk | Hisse — Kullanıcı Testi Notları

Test eden: Ozan Erdoğdu
Tarih: [gg.aa.yyyy]
Cihaz / sürüm: [ör. Android 15, uygulama v2.x]
Test süresi: [ör. ~3 saat, iki oturum]

## Özet

[Üç-dört cümle. Genel izlenim + en önemli iki bulgu. Olumlu olanla başla — varsa gerçekten
iyi olan bir şeyi söyle, yağ çekmek için değil, dengeli okunması için.]

## Bölüm A — Ürün bulguları

| # | Öncelik | Ekran | Bulgu | Beklenen |
|---|---|---|---|---|
| 1 | Yüksek | Al/Sat | [ne oluyor] | [ne olmalı] |
| 2 | Orta | Fiyatlar | | |
| 3 | Düşük | Varlıklarım | | |

### Ayrıntılar

**#1 — [başlık]**
Adımlar: 1) ... 2) ... 3) ...
Gözlem: ...
Etkisi: [kullanıcı için ne anlama geliyor]
Ekran görüntüsü: [ek]

## Bölüm B — Gözlemler: gösterilen ve hesaplanan

[Bu bölüm hata listesi değil, gözlem. Her madde: ne var, ne yok, kullanıcı için sonucu ne.]

- **Getiri nominal gösteriliyor.** [ekran] — enflasyon sonrası karşılığı hiçbir ekranda yok.
  Kullanıcı %X kazandığını görüyor; %32 enflasyonda bunun reel karşılığı farklı.
- **Fon getirilerinde stopaj görünmüyor.** TEFAS fonlarında %17,5 stopaj var, BIST pay
  senedinde yok. Aynı listede yan yana duran iki ürünün net getirisi bu yüzden farklı.
- **ABD hissesinde kur etkisi ayrıştırılmıyor.** [varsa ekran] — kullanıcı hissenin mi kurun
  mu kazandırdığını göremiyor.
- [diğerleri]

## Kapanış

Bulguların bir kısmı görüşmede konuştuğumuz konuyla örtüşüyor. İsterseniz bunları ayrıca
konuşabiliriz.

[İmza]
```

---

## 5. Gönderirken

- **Tarih ver ve tut.** "Önümüzdeki hafta içinde iletirim" dediysen o hafta içinde gönder.
- **Ekran görüntülerini ekle**, metne göm — "şurada bir sorun var" tek başına zayıf.
- **Öncelik sırasını sen koy.** Neyin önemli olduğuna karar verebilmek, bulmak kadar değerli.
- **Kapanış cümlesi ikinci toplantıyı ister, sen değil.** Fark önemli.
- Raporu **PDF ya da e-posta gövdesi** olarak gönder; ek dosya indirtmek okunma oranını düşürür.

## 6. Bu raporun asıl işlevi

Bulunan hatalar değerli ama geçici. Kalıcı olan şu: karşı taraf senin **nasıl düşündüğünü**
görecek. Bölüm A ciddiyetini, Bölüm B ise neden var olduğunu anlatıyor.

Sunumda "gösteren çok, hesaplayan yok" dedin. Bu rapor, aynı cümleyi **kendi ürünlerinin
ekran görüntüleriyle** tekrar söylüyor — ve bu sefer iddia değil, gözlem.
