# Altyapı ve veri akışı — kullanıcı spesifikasyonu (24–25 Ekim 2026)

Kaynak: kullanıcının "FAGENT Claude Code prompt dizini". **Kapsam kararı (kullanıcı):** yalnızca altyapı ve veri akışı; başka iş yapılmaz.
Bu dosyaya yalnız teknik promptlar (P0, P3, P4, P5, P6, P8) alındı. Dizinin satış/vergi şartlarını içeren özel bölümleri (Ek A/B) devredilecek depoya
KONMADI; tam dosya rapor klasöründedir. Dizinin tasarım/abonelik/yasal promptları (P1, P2, P7, P9–P12) bu iş kapsamında DEĞİLDİR.
Prompt'lar sırayla verilir; her biri öncekinin kabul ölçütü sağlanmadan başlamaz.

> Not (ekip): Dizin yeni bir Next.js projesi varsayar; bu depo Vite+React'tir. Uyarlama planı: `docs/veri-akisi/mevcut-durum-ve-plan.md`.

## P0 · Ortak bağlam (`CLAUDE.md` olarak kaydet)

```
Bu proje FAGENT: bireysel yatırımcı, küçük şirket ve büyük şirket için portföy takip uygulaması. Çekirdek: brüt → net → reel getiri zinciri.

Kesin kurallar:
1. Kullanıcı verisi sunucuya gitmez. Bireysel veri tarayıcıda (IndexedDB/OPFS) kalır; ekip verisi yalnızca uçtan uca şifreli senkronize edilir, sunucu sadece şifreli blob görür. Kullanıcı verisini loglama, analitiğe gönderme.
2. Yatırım tavsiyesi dili yok: "al", "sat", "öneri", "tavsiye" kullanma. Her hesap ekranında bilgilendirme uyarısı olsun.
3. Palet siyah/antrasit/gri. Yeni renk ekleme. Tasarım dosyalarındaki CSS değişkenlerini aynen kullan.
4. Hareket üç kapıdan geçer: data-motion, prefers-reduced-motion, animation-timeline desteği. Hareket kapalıyken içerik tam görünür olmalı.
5. Dil Türkçe; sayı biçimi ₺1.349,50. Emoji yok.
6. Vergi/stopaj oranı, TÜFE, ücret ve fiyat koda gömülmez; tarih aralıklı yapılandırma dosyasından okunur, kaynağı yanında yazar.
7. Her hesap fonksiyonu için birim test yaz. Test yoksa bitmiş sayılmaz.
8. Emin olmadığın hukuki/vergisel konuda varsayım yapma; `TODO(hukuk)` veya `TODO(muhasebe)` işareti bırak ve listele.
Her görev sonunda: ne yaptın, ne yapmadın, hangi TODO'lar açık, nasıl çalıştırırım.
```

Kabul: dosya `CLAUDE.md` olarak durur, sonraki prompt'lar bunu okur.

## P3 · Yerel veri katmanı

```
Yerel öncelikli veri katmanı kur. Depolama: IndexedDB (Dexie) veya SQLite-WASM + OPFS; birini seç, gerekçeni yaz. Şema: portfolios, instruments, holdings, transactions, settings, audit_log. Her kayıt id (UUID), updatedAt, deviceId taşısın (ileride birleştirme için). Veriyi şifreli dışa aktarma (parola → AES-GCM, dosya .fagent) ve içe aktarma ekle; tarayıcı verisi silinirse tek kurtarma yolu bu olacağı için ilk açılışta yedek uyarısı göster. Sunucu çağrısı yok. Şema sürümleme ve migrasyon testleri yaz.
```

Kabul: sayfayı yenileyince veri durur; dışa aktar → sil → içe aktar akışı test ile geçer; ağ sekmesinde kullanıcı verisi giden istek yok.

## P4 · Portföy girişi ve CSV içe aktarma

```
Portföy oluşturma, varlık ekleme, işlem girişi (alış/satış, adet, fiyat, masraf, tarih, para birimi) ve CSV içe aktarma ekle. CSV için sütun eşleme ekranı yap, hatalı satırları kullanıcıya göster, hiçbirini sessizce atma. Tüm veriler P3 katmanına yazılsın. Formlar etiketli ve klavye ile kullanılabilir olsun.
```

Kabul: 500 satırlık örnek CSV içe aktarılır, hatalı satırlar listelenir.

## P5 · Fiyat ve kur veri hattı (kullanıcı verisi içermez)

```
Genel piyasa fiyatı ve kur verisi için ince bir sunucu uç noktası yaz (Vercel edge function). Bu uç nokta yalnızca herkese açık veriyi önbellekler: TCMB döviz kuru (EVDS), kripto (CoinGecko). Kullanıcı kimliği, portföy ya da işlem verisi bu uca hiç gönderilmez; istek sadece sembol listesi içerir. Anahtarlar ortam değişkeninde. Hisse/fon fiyatı için sağlayıcıyı varsayma: bir arayüz (PriceProvider) tanımla, şimdilik elle giriş ve CSV ile fiyat yüklemeyi destekle; TODO(hukuk) BIST veri lisansı.
```

Kabul: kur ve kripto fiyatı gelir; ağ günlüğünde portföy verisi yok; sağlayıcı değişince arayüz değişmez.

## P6 · Hesap motoru (brüt / net / reel)

```
Saf TypeScript hesap motoru yaz (UI'dan bağımsız): brüt getiri, masraf sonrası, vergi/stopaj sonrası net, TÜFE ile reel getiri; nominal ve para ağırlıklı (XIRR) getiri. Vergi kuralları tax_rules.json'dan, tarih aralıklı ve kaynak linkli okunsun; oranları ben muhasebeciyle doğrulayacağım, şimdilik değerleri TODO(muhasebe) işaretiyle boş/varsayılan bırak ve test fixture'ında açıkça "örnek oran" yaz. TÜFE serisi inflation.json'dan. Tasarımdaki ₺100.000 örnek yatırımı (brüt ₺148.000) test senaryosu yap. Her fonksiyon için sınır durum testleri: sıfır adet, negatif fiyat, aynı gün çoklu işlem, farklı para birimi.
```

Kabul: testler geçer; hiçbir oran koda gömülü değil.

## P8 · Ekip: uçtan uca şifreli senkron

```
Ekip portföyü için uçtan uca şifreli senkron tasarla ve uygula. Önce 1 sayfalık seçenek karşılaştırması yaz (CRDT + şifreli röle sunucusu, WebRTC eşler arası, kullanıcının kendi depolaması) ve bir seçenek öner; onayımı bekle. Genel kural: sunucu yalnızca şifreli blob ve üye listesi görür. Ekip anahtarı üye eklenince/çıkarılınca döner. Roller (yönetici, editör, görüntüleyici) istemcide ve imzalı işlem kayıtlarıyla zorlanır. Denetim izi (audit_log) ekip verisinin parçası olarak şifreli tutulur. Anahtar kaybı senaryosunu ve kurtarma yolunu yaz.
```

Kabul: iki tarayıcı arasında ekip portföyü eşitlenir; sunucu günlüğünde düz metin veri yok; üye çıkarılınca eski anahtar çalışmaz.
