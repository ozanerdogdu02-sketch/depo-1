# Toplantı Soru–Cevap Kartı

> Toplantıdan hemen önce okunacak tek sayfa. Her cevap **iki cümlede** verilebilecek şekilde
> yazıldı; altındaki kursif satır, sıkışırsan kullanacağın kısa versiyon.
>
> **Toplantı anında bunu değil, [`toplanti-kisa-kart.md`](toplanti-kisa-kart.md)'ı önüne koy — bu kart yedek.**
>
> Strateji dokümanı: [`toplanti-hazirlik.md`](toplanti-hazirlik.md) ·
> Bloki karşılaştırması: [`bloki-vs-fagent.md`](bloki-vs-fagent.md)
>
> **Altın kural:** Bilmediğin bir şey sorulursa "bilmiyorum, bakıp döneceğim" de. Bu üründe
> dürüstlük bir özellik — uydurulmuş bir cevap tüm konumlandırmayı çürütür.

---

## A. Ürün ve kapsam

**1. "Bloki'miz zaten var. Sizin farkınız ne?"**
Bloki kripto tarafında işlemi hızlandırıyor — emir, ses, TL çekimi. Ben o tarafta yarışmıyorum.
FAGENT kullanıcının **BtcTurk dışındaki servetini de** görüyor: mevduat, döviz, altın, BIST, fon.
Ve gördüğü şeyin üzerinde matematik yapıyor — reel getiri, vergi sonrası net, risk.
*Kısa: "Bloki işlemi hızlandırıyor, biz kararı besliyoruz."*

**2. "Parafokus, Finoloji, Horyzon zaten toplamı gösteriyor. Ne farkınız var?"** ⚠️ *En kritik soru*
Haklısınız, konsolide takip artık emtia — ben de o yarışa girmiyorum. Onlar **gösteriyor**;
FAGENT **hesaplıyor**. Hiçbirinde Fisher reel getirisi, XIRR, kovaryans tabanlı portföy
volatilitesi, çeşitlendirme faydası ya da vergi sonrası net getiri zinciri yok.
*Kısa: "Gösteren çok, hesaplayan yok."*

**3. "BIST fiyatı çekemiyorsanız portföy takibi nasıl olacak?"**
Anahtarsız, resmî, ücretsiz bir BIST kaynağı yok — araştırdım, hâlâ yok. Uydurma fiyat
göstermektense hiç göstermiyoruz; bu bir ilke. Risk raporunda bile portföyün yüzde kaçını
kapsadığımızı ekrana yazıyoruz. **Bu boşluk ancak sizin gibi bir kurumun veri erişimiyle kapanır.**
*Kısa: "Bu boşluk, ortaklığın somut faydalarından biri."*

**4. "Kullanıcı bütün veriyi elle mi girecek?"**
Kripto tarafını siz doldurabilirsiniz — salt-okunur bakiye aktarımıyla. Elle girilecek kısmı giren
kullanıcı zaten motive olan kullanıcı: servetini tek yerde görmek isteyen kişi. CSV içe aktarma da var.
*Kısa: "Girmesin — o kısmı entegrasyon çözer."*

**5. "Mobil uygulamanız var mı?"**
Yok, web uygulaması — ama duyarlı tasarım, telefonda sorunsuz çalışıyor. Mobil uygulama bir dağıtım
kararı; sizin uygulamanızın içinde bir katman olarak yaşaması da mümkün.
*Kısa: "Web; ama sizin uygulamanızın içine gömülebilir."*

**6. "Fiyat alarmı / çoklu portföy / ABD hissesi var mı?"**
Yok. Bunlar takip uygulamalarının özellikleri ve o yarışta rakiplerim önde. Ben tek bir şeyde
derinleşiyorum: gösterilen sayının arkasındaki matematik.
*Kısa: "Yok — bilinçli olarak. O oyun benim oyunum değil."*

---

## B. Teknik

**7. "AI diyorsunuz ama LLM değilmiş?"**
Doğru, LLM değil ve bunu ürünün içinde de yazıyoruz. Karşılığında: mesaj başına maliyet sıfır,
gecikme sıfır, **halüsinasyon sıfır**. Finansal rakamda halüsinasyon bir asistanın yapabileceği
en pahalı hatadır. Mimari geçişe hazır — ajanın mantığı tek dosyada, saf fonksiyonlar.
*Kısa: "Rakamda halüsinasyon riski almıyoruz."*

**8. "Veri tarayıcıda. Cihaz değişince ya da tarayıcı temizlenince ne olacak?"**
Bugün CSV ile taşınıyor ve bu bilinen bir sınır — kapatmak için yedek uyarısı ekliyoruz.
Karşılığında: hesap yok, KYC yok, sunucu yok → **veri sızıntısı yüzeyi de yok**.
Kurumsal entegrasyonda bu denklem değişir; o kararı birlikte veririz.
*Kısa: "Bilinen bir sınır, ve gizliliğin bedeli."*

**9. "Ölçeklenir mi? Sunucu maliyetiniz ne?"**
Sunucu yok — uygulama tamamen tarayıcıda çalışıyor, statik dosya olarak dağıtılıyor. Kullanıcı
başına marjinal maliyet sıfır. LLM tabanlı bir rakip her mesajda para yakar, biz yakmıyoruz.
*Kısa: "Marjinal maliyet sıfır. Ölçek sorunumuz yok."*

**10. "Nasıl test ediyorsunuz?"**
415 uçtan uca otomatik kontrol, 23 test dosyası, gerçek tarayıcıda çalışıyor. Her davranış
değişikliğinde tamamı koşuyor. *(Dürüst ek: CI kurulu değil, elle çalıştırılıyor — kuruluyor.)*
*Kısa: "415 otomatik kontrol, gerçek tarayıcıda."*

**11. "Bizim sistemimizle nasıl entegre olur?"** ⭐ *Bugünkü araştırmanın ürünü*
Genel API'nizi inceledim: `api/v2/ticker` ve `api/v2/ohlc` kimlik doğrulama istemiyor ve OHLC
tarihsel seri veriyor. Kripto fiyatlarını CoinGecko yerine doğrudan sizden, TRY bazında
çekebiliriz — bu bugün yapılabilir, sizden bir şey gerektirmez.
Bakiye tarafı farklı: hesap uçları HMAC imza istiyor, bu tarayıcıda güvenle yapılamaz.
**Orası sizin tarafınızda bir salt-okunur yetkilendirme akışı gerektirir — asıl konuşmak istediğim bu.**
*Kısa: "Fiyat tarafı bugün, bakiye tarafı sizin izninizle."*

**12. "API anahtarlarımızı nasıl saklayacaksınız?"** ⭐
Saklamayacağız — **saklayamayız**, sunucumuz yok. Tarayıcıda tutulan bir gizli anahtar zaten
güvenli değildir ve bunu önermem. Bakiye erişimi olacaksa yetki sizin tarafınızda, kullanıcının
iptal edebileceği salt-okunur bir izinle verilmeli.
*Kısa: "Hiç almıyoruz. Yetki sizin tarafınızda kalmalı."*

---

## C. Regülasyon ve sorumluluk

**13. "Yatırım tavsiyesi vermiş olmuyor musunuz?"**
Hayır. SPK'ya göre genel yatırım tavsiyesi yalnızca aracı kurum, banka ve portföy yönetim
şirketlerince paylaşılabilir. Bu yüzden ürün hiçbir varlık için al/sat/kaydır **önermiyor**;
kullanıcının kendi verisi üzerinde **betimleyici** matematik yapıyor. Metinler bu ayrıma göre
gözden geçirildi ve üç ayrı yerde "yatırım tavsiyesi değildir" uyarısı var.
*Kısa: "Ne olduğunu söylüyoruz, ne yapılacağını değil."*

**14. "KVKK açısından durumunuz ne?"**
Kişisel veri toplamıyoruz. Hesap yok, e-posta yok, telemetri yok, sunucu yok — veri kullanıcının
tarayıcısından çıkmıyor. Bu, KVKK yükünü ortadan kaldıran bir mimari tercih.
*Kısa: "Veri toplamıyoruz, o yüzden işlemiyoruz da."*

**15. "Vergi hesabınız yanlış çıkarsa sorumluluk kimde?"** ⭐
Ürün bunu **tahmin** olarak sunuyor ve ekranda böyle yazıyor: oranların hangi karara dayandığı
(11107 sayılı CB Kararı), vade ve fon türünün sonucu değiştirdiği, ve **beyanname olmadığı**
açıkça belirtiliyor. Doğrulayamadığımız sınıflarda oran uydurmak yerine %0 varsayıp bunu
kullanıcıya söylüyoruz.
*Kısa: "Tahmin olduğunu ekranda yazıyoruz; oran uydurmuyoruz."*

---

## D. Ticari

**16. "Kaç kullanıcınız var?"**
Kullanıcı tabanı yok — dürüst cevabı bu. Getirdiğim şey dağıtım değil, **yetenek**. Dağıtım
zaten sizde: milyonlarca kullanıcı.
*Kısa: "Yok. Dağıtım sizde, yetenek bende."*
> Rakam telaffuz etme (bkz. `toplanti-hazirlik.md` §C.0) — "5 milyon" teyit edilemedi.

**17. "İş modeliniz ne?"**
Önceliğim B2B: katmanın kurum uygulamasına gömülmesi. B2C'yi bağımsız büyüme kanalı olarak değil,
ürün geri bildirimi için tutuyorum.
*Kısa: "B2B lisans; pilot ile başlayalım."*

**18. "Bunu biz 2 ayda kendimiz yaparız."**
Kodlaması 2 ay, doğru. Asıl mesele kod değil: BIST/TEFAS/mevduat verisini kullanıcıdan toplamak,
tutmak ve **kurum olarak** sorumluluğunu almak. Biz bu veriyi hiç toplamıyoruz. Sizin için
regülasyon açısından bambaşka bir denklem.
*Kısa: "Kod 2 ay; veri sorumluluğu 2 ay değil."*

**19. "Neden ürünü alalım, ekip alalım?"**
İkisi de olabilir. Ama bu ürün bilinçli olarak sizin altyapınıza bağımlı olmayacak şekilde kuruldu —
entegrasyon olmasa da çalışır. Bu, kararınızı düşük riskli yapar.
*Kısa: "Bağımsız çalışıyor; riski düşük."*

---

## E. Zor ve beklenmedik

**20. "Rakamlarınızın güncel olduğunu nereden bileceğiz?"**
Otomatik çekilebilenler canlı; çekilemeyenler (enflasyon, stopaj oranları) **varsayım olarak
etiketli** ve kullanıcı düzenleyebiliyor. Kaynağı ve tarihi ekranda yazıyor. Enflasyon için
TCMB EVDS entegrasyonu **kodda hazır ve testli** — anahtar tanımlandığı an ekranda "TCMB EVDS"
yazmaya başlıyor; şu an "varsayım" modunda çünkü anahtar henüz alınmadı.
*Kısa: "Varsayım olanı varsayım diye yazıyoruz."*

> ⚠️ **Şu an canlı DEĞİL.** "Enflasyonu TCMB'den çekiyoruz" DEME. Doğru cümle:
> *"TCMB entegrasyonu hazır, anahtar eklendiği an devreye giriyor."* Ekranda "varsayım"
> yazdığı için teknik bir muhatap farkı görür.

**20b. "Sunucunuz yok demiştiniz — bu proxy de ne?"**
Portföy verisi hiçbir zaman tarayıcıdan çıkmıyor; o istek kullanıcının verisini içermiyor.
Sunucudan geçen tek şey TCMB'nin **kamuya açık** enflasyon serisi — API anahtarı istemciye
inmesin diye orada duruyor.
*Kısa: "Portföy çıkmıyor; çıkan tek şey TCMB'nin herkese açık serisi."*

**21. "Neden BtcTurk?"**
Çünkü kripto tarafında zaten en güçlü konumdasınız ve Bloki ile asistan fikrine yatırım yaptınız.
Eksik olan parça kullanıcının **diğer %80'i** — orada rakip değil tamamlayıcıyım.
*Kısa: "Bloki'nin göremediği yeri getiriyorum."*

**22. "Somut olarak bize ne kazandırır?"**
Kullanıcı servetinin tamamını sizin ekranınızda görürse, uygulamada kalma süresi ve geri dönüş
sıklığı artar. Ayrıca "sormadan uyarı" mekanizması, doğru soruyu sormayı bilmeyen kullanıcıyı da
etkileşime sokar.
*Kısa: "Elde tutma ve etkileşim."*

**23. "Yarın vazgeçerseniz ne olacak?"**
Kod ve mimari dokümante edilmiş durumda; ajanın mantığı saf fonksiyonlar halinde izole, testlerle
korunuyor. Devralınabilir bir ürün — bu bilinçli bir tasarım kararı.
*Kısa: "Devralınabilir şekilde yazıldı."*

**24. Cevabını bilmediğin bir şey sorulursa**
"Bunu şu an uydurmak istemiyorum, bakıp size döneceğim." — Bu ürünün tüm iddiası dürüstlük
üzerine kurulu; bir soruya uydurma cevap vermek, sunumun kendisiyle çelişir.

---

## F. Senin soracakların

Toplantı tek yönlü olmasın. Bunları sormak hem ciddiyet gösterir hem sonraki adımı netleştirir:

1. Bloki'nin yol haritasında **kripto dışı varlıklar** var mı? (Varsa konumlandırmam değişir.)
2. Genel API'nizde **salt-okunur bakiye erişimi** için bir plan var mı? Yoksa yaratılabilir mi?
3. Kullanıcılarınızın ne kadarı **başka kurumlarda da** yatırım tutuyor — bu veriye sahip misiniz?
4. Bir pilot için **teknik muhatap** kim olur, ve süreç nasıl işler?
5. Bu görüşmeden sonraki adım ne — ve **ne zamana kadar**?

---

## G. Yanına alacakların

- Çalışan demo (internet kesilirse diye **ekran görüntüsü yedeği**)
- Bu kart + [`toplanti-hazirlik.md`](toplanti-hazirlik.md)
- Net talep: teknik takip toplantısı → pilot → yazılı geri bildirim (bu sırayla)

> **Doğrulama notu:** BtcTurk genel uçları (`api/v2/ticker`, `api/v2/ohlc`) ve hız sınırları
> resmî dokümandan teyitlidir. **Tarayıcıdan çağrılabilirlik (CORS) doğrulanmamıştır** — resmî
> dokümanda CORS'a dair bir ifade yok ve geliştirme ortamından test edilemedi. Toplantıda
> "entegre edilebilir" de, "entegre ettik" deme.
