# A1 — SaaS / satış / ödeme / yasal araştırması, 1. tur (24 Ekim 2026)

**Kapsam ve sınır:** Tek ajan, 6 hedefli web araması. Kaynakların neredeyse tamamı **ikincil** (blog, rehber, haber); resmî
belge (iyzico/PayTR/Paddle fiyat sayfası, SPK tebliği, KVKK kurul kararı) okunmadı. Aşağıdaki her rakam "doğrulanmalı" etiketlidir.
Hukuki görüş değildir; satıştan ve ödeme açılışından önce avukat/mali müşavir onayı gerekir.

## 1. Değerleme (ikincil kaynak: [Beancount rehberi, Temmuz 2026](https://beancount.io/blog/2026/07/11/bootstrapped-saas-valuation-multiples-2026-acquire-com-indie-founders-guide))
- Acquire.com ilanlarında (600+ ilan) ortalama ≈ **2,6× yıllık gelir** ve ≈ **10,7× yıllık kâr**; 1 M$ ARR altı işletmeler tipik **2,5–4× yıllık gelir** (sahip bağımlıysa 4–6× SDE).
- Acquire.com'un 2024'ten beri kâr çarpanına döndüğü, ortalama SaaS kâr çarpanının ≈ 4,3× (0,63×–34×) olduğu başka bir kaynakta geçiyor (tek kaynak).
- **Gelirsiz (pre-revenue) ürünün satış fiyatı bu sonuçlarda YOK.** Önceki tahminimiz (~1–5 bin $) bu araştırmadan doğrulanmadı; hâlâ kendi çıkarımımız.
- Örnek hesap (çıkarım): 100 ücretli kullanıcı × ~3,5 $/ay ≈ 4,2 bin $/yıl gelir × 2,6 ≈ **~11 bin $**. 500 kullanıcı ≈ 55 bin $. Çarpan ücretli kullanıcıdan ve **tutma oranından (retention)** gelir.

## 2. Ödeme sağlayıcılar (hiçbiri resmî kaynaktan doğrulanmadı)
| Sağlayıcı | Bulgu | Durum |
|---|---|---|
| iyzico | Geliştirici platformunda abonelik / tekrarlayan ödeme var (üçüncü taraf katalog). Başvuru panelden; onay ≤24 saat (Yandex yanıtı). Komisyon sektöre/riske göre değişir, sabit oran yok. Şahıs şirketi belge listesi bulunamadı | **Doğrulanmadı** |
| PayTR | "Kart saklama / Abonelik" yöntemi var. Komisyon ciroya göre pazarlıklı (genel aralık %0,99–%4,00, abonelik için geçerli mi belirsiz). Şahıs işletmesi için blog listesi: imza beyannamesi, vergi levhası, banka hesabı teyidi, kimlik | **Doğrulanmadı** |
| Paddle / Lemon Squeezy (satıcı-aracı, MoR) | Paddle "200+ ülke"de satıcı destekliyor; Türkiye listede görülemedi. Lemon Squeezy banka ödemesi listesi kesik; PayPal Türkiye'de sorunlu (ikincil). Komisyon ≈ %5 + 50¢ (ikincil). Lemon Squeezy Temmuz 2024'te Stripe'a satıldı | **Türkiye desteği doğrulanmadı** |
- **Neden önemli:** Yabancı alıcıya devirde satıcı-aracı (MoR) hesabı devri ve vergi/KDV yükü farklıdır; yerel sağlayıcıda fatura/e-arşiv sizin sorumluluğunuzdadır.
- **Sorulacak sorular (destek/satış ekibine yazılı):** (1) Şahıs şirketi ile abonelik (tekrarlayan tahsilat) açılır mı? (2) Aylık/yıllık komisyon, sabit ücret, blokaj süresi? (3) Abonelik iptal/iade/başarısız ödeme webhook'ları? (4) Hesap devri (şirket el değiştirirse) mümkün mü? (5) Yazılım/abonelik kategorisi için ek belge? (6) Kart verisi hiç bize gelmeden (yönlendirmeli ödeme formu) çalışıyor mu?

## 3. Yasal (ikincil; hukuki danışmanlık gerektirir)
- **SPK:** Yatırım danışmanlığı izne tabidir ve yalnızca aracı kurum / yatırım bankası / portföy yönetim şirketleri yapabilir (SPK basın duyurusu, 2013 tebliğ). Bir **portföy takip uygulamasının** (yalnızca kayıt ve izleme) kapsama girip girmediğine dair doğrudan kaynak **bulunamadı**. Bizim tasarım güvenli tarafta: kişiye özel al/sat yok, işlem yürütme yok, "tavsiye veremem" reddi var. Yine de bir avukata "yalnız kayıt tutan ve genel hesap yapan uygulama" sorusu sorulmalı. Yerindelik testi yatırım danışmanlığına özgü.
- **KVKK:** Aydınlatma yükümlülüğü VERBİS muafiyetinden **bağımsızdır** (muafiyet yalnız kayıt yükümlülüğünü kaldırır). VERBİS eşikleri kaynaklarda **çelişiyor** (50 çalışan/25 M₺, 50/100 M₺, 2025/1572 sayılı karar vb.) → kvkk.gov.tr ve Resmî Gazete'den doğrulanmalı. Aydınlatma metni içeriği (veri sorumlusu kimliği, amaç, aktarım, toplama yöntemi, hukuki sebep, haklar) KVKK m.10'dan **kendi bilgimizdir, kaynakla doğrulanmadı**.
- **Mesafeli satış / abonelik:** Bu turda araştırılmadı → 2. tur (Mesafeli Sözleşmeler Yönetmeliği, abonelik cayma/iptal kuralları, e-arşiv fatura).

## 4. Karar/aksiyon listesi
| # | İş | Kim | Not |
|---|---|---|---|
| A1.1 | Satış biçimi: şahıs mı, şirket mi — mali müşavire sor (e-arşiv, vergi, ödeme sağlayıcı şartı) | siz | Faz 5'i belirler |
| A1.2 | iyzico + PayTR'ye yukarıdaki 6 soruyu yazılı sor | siz (ben soruları hazırladım) | |
| A1.3 | Paddle/Lemon Squeezy'nin ülke listesini resmî sayfadan Türkiye için kontrol et | ben (2. tur) veya siz | |
| A1.4 | Avukat: SPK kapsamı + KVKK aydınlatma + kullanım koşulları + mesafeli satış | siz | Metin taslaklarını ben yazarım |
| A1.5 | Gerçek kullanıcı ve retention verisi biriktir (değerlemenin asıl girdisi) | siz + ben (ölçüm) | |
