# FAGENT — Olgunluk Değerlendirmesi ve Rakip Kıyaslaması

**Tarih:** 4 Ağustos 2026 · **Hazırlayan:** kod tabanından ölçüm + kamuya açık kaynak araştırması

> Bu bir pazarlama metni değil, **karar vermek için** yazılmış bir değerlendirme.
> Zayıf yönler yumuşatılmadı; ürünün en büyük açığı en üstte.

---

## 1. Tek cümlelik değerlendirme

> **FAGENT teknik olarak pazara hazır, ticari olarak prototip.**
> Analitik derinlikte Türkiye pazarında görünür bir rakibi yok; veri kapsamı, ürün yüzeyi ve
> ticari altyapıda ise rakiplerin belirgin biçimde gerisinde.

Bunun stratejik sonucu net: **bağımsız bir B2C ürünü olarak bugün rekabet edemez.**
Değerli olduğu yer, dağıtımı ve verisi olan bir kurumun içindeki **analiz katmanı**.

---

## 2. Olgunluk karnesi

Ölçek: 1 prototip · 2 çalışan ürün · 3 pazara hazır · 4 ölçeklenen · 5 kategori lideri

| Boyut | Seviye | Gerekçe |
|---|---|---|
| **Analitik derinlik** | **4 / 5** | Fisher reel getiri, XIRR, HHI + etkin varlık sayısı, kovaryans tabanlı portföy volatilitesi, maks. düşüş, Sharpe, korelasyon, çeşitlendirme faydası, vergi sonrası net getiri zinciri, %5/%25 sapma bandı. Rakiplerin hiçbirinde bu küme görünmüyor. |
| **Teknik olgunluk** | **3,5 / 5** | 5.549 satır TS, **415 uçtan uca test**, saf-fonksiyon mimarisi, yazılı mimari kurallar, tam tip güvenliği. Eksik: CI yok, kod bölme yok (685 kB bundle), hata telemetrisi yok (bilinçli). |
| **Veri kapsamı** | **2 / 5** | ⚠️ **En büyük açık.** Altı varlık sınıfının **üçü manuel**: BIST hissesi, TEFAS fonu, altın. Yalnızca kripto ve döviz canlı. |
| **Ürün yüzeyi** | **2,5 / 5** | Web-only. Mobil uygulama yok, hesap/senkronizasyon yok, fiyat alarmı yok, çoklu portföy yok, paylaşım yok. |
| **Ticari olgunluk** | **1 / 5** | Kullanıcı yok, gelir yok, iş modeli kararı yok, hukuk görüşü yok, şirket yok. Tek kişi. |

**Ağırlıklı okuma:** ürün bir *özellik* olarak olgun, bir *işletme* olarak başlangıçta.

---

## 3. Rakip haritası

> ⚠️ **Güven notu:** Rakip bilgileri **kamuya açık kaynaklardan** (siteler, basın, uygulama
> mağazası açıklamaları) 2 Ağustos 2026'da derlendi. Ürünler **birebir kullanılmadı**;
> "analitik derinlik" sütunu görünür özelliklere dayanan bir tahmindir, kesin değildir.

| Ürün | Varlık kapsamı | Canlı veri | Analitik derinlik | Dağıtım | Fark |
|---|---|---|---|---|---|
| **FAGENT** | 6 sınıf | 2/6 otomatik | **Yüksek** | **Yok** | Hesaplayan tek ürün |
| **Parafokus** | 17.000+ varlık, 7 kategori | Geniş | Düşük–orta | Var | Kapsam lideri, ücretsiz, AI analiz |
| **Finoloji** | BIST, TEFAS/BEFAS, kripto, döviz, altın, tahvil | Geniş | Düşük–orta | Var | "Veriyle konuşan AI asistan" |
| **Horyzon** | Çok varlıklı | Geniş | Düşük–orta | Var | **Hesapsız başlıyor**, Pro katmanı |
| **Finobi / Portfoy** | Çok varlıklı | Geniş | Düşük | Var | Konsolide takip |
| **Bloki** (BtcTurk) | Yalnız kripto | Tam | Düşük–orta | **Çok güçlü** | Sesli komut, **emir yürütür** |
| **BtcTurk \| Hisse** | BIST, ABD hissesi, TEFAS, halka arz | Tam | Düşük | **Çok güçlü** | SPK lisanslı aracı kurum |

### Bundan çıkan üç gerçek

1. **Konsolide takip artık emtia.** "Tüm varlıklarını tek ekranda gör" bir farklılaşma
   değil; en az beş ürün bunu yapıyor ve çoğu ücretsiz.
2. **AI asistan da emtia.** Parafokus, Finoloji ve Horyzon'un hepsinde bir AI katmanı var.
   "Yapay zekâ asistanı" demek artık kimseyi etkilemiyor.
3. **Analitik derinlik emtia DEĞİL.** Reel getiri, vergi sonrası net, kovaryans tabanlı risk —
   bunları hesaplayan görünür bir ürün yok. **Tek savunulabilir alan burası.**

---

## 4. Nerede öndesin

| | Neden savunulabilir |
|---|---|
| **Getiri zincirinin tamamı** | Brüt → stopaj → net → enflasyon → reel. Bankalar bunu yapmak *istemez* (kendi stopajını görünür kılar); bağımsız ürün yapabilir. |
| **Gerçek finans matematiği** | Fisher, XIRR, kovaryans. Kopyalanabilir ama kimse kopyalamamış — çünkü kullanıcı talebi değil, doğru olan bu. |
| **Proaktif uyarı** | Kullanıcı sormadan içgörü. Rakiplerde soru-cevap var, sormadan uyarı yok. |
| **Dürüstlük disiplini** | Doğrulanamayan veri gösterilmiyor, kapsam oranı ekranda yazıyor, stopajda uydurma oran yok. Kurumsal bir alıcı için **risk azaltıcı**. |
| **Gizlilik mimarisi** | Hesap yok, sunucu yok, KVKK yükü yok. Kurumsal entegrasyonda pazarlık gücü. |

---

## 5. Nerede geridesin

| | Ne kadar ciddi |
|---|---|
| **BIST / TEFAS / altın manuel** | 🔴 **Kritik.** Kullanıcının en çok tuttuğu varlıklar bunlar. Bu boşluk kapanmadan bağımsız B2C mümkün değil. |
| **Kullanıcı tabanı yok** | 🔴 **Kritik.** Ürün-pazar uyumu hakkında hiçbir kanıt yok. Tüm konumlandırma varsayım. |
| **Mobil uygulama yok** | 🟠 Yüksek. Bu kategoride kullanım ağırlıklı olarak telefonda. |
| **İş modeli belirsiz** | 🟠 Yüksek. B2B lisans mı, gelir paylaşımı mı, satın alma mı — karar verilmedi. |
| **Tek kişi** | 🟠 Yüksek. Devralınabilirlik için mimari hazır ama "otobüs faktörü" 1. |
| **Hukuk görüşü yok** | 🟡 Orta. SPK sınırı için metinler betimleyici yazıldı, avukat onayı alınmadı. |
| **CI yok** | 🟡 Düşük. 415 test var ama elle koşuyor. |
| **LLM değil** | 🟡 Düşük — hatta bazı alıcılar için artı (halüsinasyon riski sıfır). |

---

## 6. Seviye atlatacak üç hamle

Etki/maliyet sırasına göre:

1. **Veri ortaklığı** — BIST/TEFAS fiyatına erişim. Anahtarsız kaynak yok; bu **ancak bir
   kurumla** ya da ücretli bir sağlayıcıyla çözülür. Veri kapsamını 2/5'ten 4/5'e taşır ve
   diğer her şeyin önünü açar.
2. **Dağıtım ortaklığı** — Kullanıcı tabanı olan bir kurumun içine katman olarak girmek.
   Ticari olgunluğu 1/5'ten yukarı taşıyan tek gerçekçi yol; sıfırdan B2C büyütmek yıllar alır.
3. **Mobil** — Web zaten duyarlı; asıl mesele dağıtım kanalı. Ortaklık olursa kurumun
   uygulamasının içinde çözülür, olmazsa ayrı bir yatırım.

> **Üçünün de ortak noktası:** hiçbiri daha fazla kod yazarak çözülmüyor.
> Ürün tarafındaki iş büyük ölçüde bitmiş; sıradaki darboğaz **ticari**.

---

## 7. Sonuç

FAGENT'ın yaptığı şeyi kimse yapmıyor, ama FAGENT'ın yapmadığı çok şeyi herkes yapıyor.

Bu, bağımsız bir ürün için kötü; **bir kurumun içine girecek katman için ise tam olarak
doğru profil.** Kurumda zaten olan (veri, dağıtım, lisans, mobil) FAGENT'ta yok;
FAGENT'ta olan (analitik derinlik) kurumda yok.

**Bu yüzden BtcTurk görüşmesi bir satış görüşmesi değil, doğru stratejik hamle.**

---

### Ölçüm kaynakları

- **FAGENT sayıları:** bu depodan doğrudan ölçüldü (4 Ağustos 2026) — 5.549 satır TS/TSX,
  415 uçtan uca kontrol / 22 dosya, 4 üretim bağımlılığı, 685 kB bundle.
- **Rakip bilgileri:** kamuya açık kaynaklar, 2 Ağustos 2026 · ürünler birebir kullanılmadı.
- **BtcTurk | Hisse ve Bloki:** resmî sayfalar ve basın duyuruları — bkz.
  [`bloki-vs-fagent.md`](bloki-vs-fagent.md) §5 ve §6.
