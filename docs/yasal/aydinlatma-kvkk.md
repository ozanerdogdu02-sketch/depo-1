# Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni — TASLAK (avukat onayı gerekir)

**Veri sorumlusu:** [ÜNVAN], [ADRES], [E-POSTA]. (KVKK m.10 gereği hazırlanmıştır. VERBİS yükümlülüğü ayrıca değerlendirilmelidir.)

**Hesapsız kullanım:** Portföy verileriniz yalnızca tarayıcınızda (yerel depolama ve aynı tarayıcıdaki IndexedDB ikinci kopyası) tutulur; bize iletilmez. "SIFIRLA" her iki kopyayı da siler; IndexedDB silmesi mantıksaldır, fiziksel silme tarayıcıya bağlıdır. Tarayıcı sitenin verisini tamamen temizlerse bu kopyalar da gider.

**Hesap açarsanız işlenen veriler**
| Veri | Amaç | Hukuki sebep (avukat doğrulamalı) | Saklama |
|---|---|---|---|
| E-posta, şifre (özetlenmiş) | Kimlik doğrulama, hesap güvenliği | Sözleşmenin ifası | Hesap silinene dek |
| Portföy kayıtları (varlıklar, işlemler, hedefler, vergi/enflasyon tercihleri, ajan hafızası) | Cihazlar arası eşitleme | Sözleşmenin ifası | Hesap silinene dek |
| Teknik kayıtlar (barındırma sağlayıcısı günlükleri) | Güvenlik, hata ayıklama | Meşru menfaat | [SÜRE — sağlayıcıya bağlı] |

**Aktarım.** Veriler barındırma ve veritabanı hizmet sağlayıcılarında saklanır ([SUPABASE — BÖLGE], [VERCEL]); bu sağlayıcılar yurt dışında olabilir — **yurt dışına aktarım için KVKK m.9 şartları avukatla değerlendirilmelidir.** Portföy verileriniz üçüncü taraf yapay zekâ servislerine gönderilmez. Kur ve kripto fiyatı sorguları yalnızca para birimi kodu / coin kimliği içerir, tutar veya kimlik içermez. Enflasyon verisi için sunucumuzdaki bir ara katman kullanılır; bu katman istek sınırı için IP adresini yalnızca kısa süreli bellekte (yaklaşık 1 dakika) tutar, kalıcı kayıt yoktur [AVUKAT TEYİDİ GEREKİR: IP adresinin kişisel veri sayılması ve aydınlatma kapsamı].

**Toplama yöntemi:** Kayıt formu ve uygulamayı kullanımınız (otomatik). Çerez/analiz aracı: [VARSA BELİRTİN; şu an kod tabanında analiz aracı ve çerez yoktur].

**Haklarınız (KVKK m.11):** Verilerinize erişme, düzeltme, silme, işlemeye itiraz ve zararın giderilmesini isteme. Başvuru: [E-POSTA]. Hesabınızı "Hesabımı sil" ile kendiniz silebilirsiniz. Tarayıcıdaki yerel verileri (yerel depolama ve IndexedDB kopyası) uygulamadaki "SIFIRLA" ile kendiniz silebilirsiniz. "SIFIRLA" yalnızca bu tarayıcıdaki veriyi siler (bozuk kayıt kurtarma kopyaları `fagent.recovery.*` dahil); hesaptaki kopya için "Hesabımı sil" kullanılır.
