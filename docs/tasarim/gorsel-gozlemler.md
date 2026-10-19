# Görsel gözlemler — 19 Ekim 2026, 07:32 UTC

Ekran görüntüleri `ekran/` klasöründe. Uygulamanın derlenmiş bir kopyasından, dış ağ kapalıyken
alındı (canlı fiyatlar görünmez). Hesap ekranı görüntüleri sahte Supabase ayarlı derlemeden.
Ekibin şimdiye kadar yapamadığı 1440px / 375px görsel kontrolün ilk kaydıdır.

## Sorunlar (tasarım ekibine verilecek)

1. **Hesap ekranı — bitişik bağlantılar.** "Şifremi unuttum" ve "Hesapsız devam et" arasında boşluk
   yok, tek kelime gibi okunuyor ("Şifremi unuttumHesapsız devam et"). `5-hesap-ekrani-1440.png`
2. **Telefon (375px) — menü ilk ekranı kaplıyor.** Kenar çubuğu telefonda dikey liste olarak kalıyor;
   kullanıcı portföyü görmek için 9 menü öğesini kaydırarak geçmek zorunda. Belgelerde "mobilde üstte
   yatay bara döner" yazıyor, görüntüde öyle değil. `3-panel-telefon-375.png`
3. **Yüzde biçimi.** Negatif reel getiri "%-22,69" görünüyor; Türkçe yazımda "-%22,69" daha doğal.
   `2-panel-1440.png`
4. **Ajan sekmesi — "Gerçek AI bağlantısı (opsiyonel)" kartı hâlâ görünüyor.** 3. adımda çıkarılacak
   (portföy özetini dışarı gönderiyor). `4-ajan-1440.png`

## Hedefe göre fark

Hedef görünüm (`hedef-tasarim-canli-site.html`) mor tonlu Nocturne tasarım dili; uygulama şu an koyu
lacivert ve teal vurgulu. Bu fark 6. adımda kapatılacak.
