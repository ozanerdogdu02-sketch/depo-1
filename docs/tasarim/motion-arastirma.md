# Kaydırmaya bağlı hareket: araştırma ve kararlar (24 Ekim 2026)

Tasarım: https://claude.ai/artifact/XuUAneWPTxzrH1L2uF7gG1 (Design tipi, tek sayfa web sitesi; tasarım sistemi "Fagent", Nocturne).
Kaynak dosya artifact'ın içindedir (`project/Main.dc.html`). `src/` ve `tests/` değişmedi.

## Bulgular (ve güven düzeyi)

| # | Bulgu | Kaynak türü | Güven |
|---|---|---|---|
| 1 | CSS `animation-timeline: scroll()/view()` Chrome 115+ ve Safari 26+'da var. Safari 26.4'ten itibaren kaydırma kaynaklı animasyonlar compositor iş parçacığında çalışır. | WebKit blogu, Chrome dokümanı, caniuse (arama özeti) | Orta-yüksek. Doğrudan sayfalar bu ortamda açılamadı. |
| 2 | Firefox: caniuse özetinde çelişki (161 "destekli" / 160 `scroll()`). MDN "sınırlı kullanılabilirlik" diyor. | caniuse, MDN (arama özeti) | **Düşük. Doğrulanmadı.** `@supports` yedeği zorunlu. |
| 3 | Kaydırmayla ek hareket WCAG 2.3.3 (AAA) kapsamında; parallax tipik örnek. Çözüm: `prefers-reduced-motion` + sayfa içi kapatma anahtarı. | W3C C39 / Understanding 2.3.3 | Yüksek |
| 4 | Sabit (sticky) sahne + kaydırmayla ilerleyen zaman çizelgesi: Apple ürün sayfaları, CSS-Tricks, CodeFronts örnekleri. "Bir bölüm = bir fikir"; kaydırma uzunluğu istenen dikkatle orantılı. | Tasarım yazıları | Orta (yorum ağırlıklı) |
| 5 | Kaydırmayla bağlı hareket yalnızca durum değişimi/ilerleme okumayı kolaylaştırıyorsa; süs için değil. Basit statik grafik yeterliyse kullanılmaz. | Scrollytelling rehberleri | Orta |
| 6 | Finansta brüt → net → reel için hazır bir "köprü (waterfall)" anlatımı yaygın; reel getiri için Fisher denklemi `(1+r)/(1+i)-1`. | Eğitim sayfaları | Orta |
| 7 | Sayı sayma animasyonunun güven/doğruluk algısına etkisini ölçen çalışma **bulunamadı**; yalnızca ürün pazarlama metinleri ("bir kez çalışsın, tabular rakam"). | — | Kanıt yok |
| 8 | Robinhood: önce tek ana sayı, ayrıntı kullanıcı grafiğe dokununca. Material: sekmeler arası geçişte "paylaşılan eksen" (yön, sıra izler). | Vaka yazıları, Material dokümanı | Orta |
| 9 | Türk fintech siteleri (Midas, Papara vb.) için tasarım/hareket analizi **bulunamadı**. | — | Boşluk |

## Kararlar

1. **Köprü grafiği, "düşen/yükselen grafik" isteğinin karşılığıdır.** Aşağı kaydırınca brüt çubuk yükselir; stopaj ve enflasyon farkları düşer; net ve reel çubuklar önceki seviyeden gerçek değerlerine iner (oranlar hesaplı: 148/140,8 ve 140,8/108,308). Yukarı kaydırınca ters yönde yükselir. Hareket süs değil, bilgi taşır.
2. **Hero grafiği** aşağı kaydırınca en çok 56 px geriye çöker (parallax), yukarı kaydırınca geri yükselir.
3. **Üç kapı:** sistem "hareketi azalt" demedi + tarayıcı destekliyor (`@supports`) + sayfadaki anahtar açık. Biri kapalıysa her şey son halinde, hareketsiz.
4. **Hareket bilgi taşımaz:** her değer yazıyla (₺, ▲/▼, işaret) ve `aria-label` ile verilir.
5. **Paneller arası geçiş:** paylaşılan eksen, 220 ms, yön sekme sırasını izler.
6. **Sayı sayma yok.** Kanıtı yok; konsept prototipindeki sayma bu tasarıma alınmadı.
7. Yalnızca `opacity`, `transform`, `stroke-dash*`. Yeni bağımlılık yok; JS yalnızca sekme durumu ve anahtar.

## Proje kuralıyla gerilim (kullanıcı kararı gerekir)

- `hareket-kurallari` skill'i "≤300 ms" der. Kaydırmaya bağlı hareketin süresi yoktur (kaydırma hızını izler); kural yorumu gerekir.
- Önceki tasarım sistemi `EjU89…` "süs hareketi yok" der; bu tasarımda hareket veriyi taşıdığı için kullanılmadı.
- Sabit sahne için bölüm 380vh uzar: sayfa uzunluğu artar. Telefonda/kısa pencerede sabit sahne kapanır, grafik görünür alana girerken çalışır.

## Doğrulanmadı

Tarayıcıda görsel kontrol yapılmadı (Design tipi kuralı gereği). Firefox, düşük donanımlı telefon akıcılığı, 1440/375 yerleşimi ve gerçek kaydırma hissi **doğrulanmadı**.

## Veri notu

Eski prototipteki (`ana-ekran-prototip.html`) sınıf yüzdeleri toplamla tutarsızdı (ör. Hisseler +%17,5 ama varlıkların ağırlıklı ortalaması farklı). Yeni tasarımda maliyet ve değerden hesaplanmış tutarlı bir örnek set kullanıldı: toplam ₺140.000, maliyet ₺125.000, ▲ +₺15.000 (+%12,0); Hisse +%14,8, Fon +%14,3, Kripto +%5,3.
