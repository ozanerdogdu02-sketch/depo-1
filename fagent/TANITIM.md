# FAGENT — Tanıtım Kartı

Birine uygulamayı anlatırken elinin altında dursun diye hazırlanmış özet. Teknik detay için
`fagent/README.md`, proje hafızası için kökteki `CLAUDE.md`.

## Tek cümlede

FAGENT, yatırımlarını tek yerden takip ettiğin, **API anahtarı istemeyen** ve **verini hiçbir yere
göndermeyen** (her şey tarayıcında kalıyor) bir yatırımcı paneli — üstüne konuşabildiğin,
grafik çizen ve öğretebildiğin bir ajanı var.

## Ne yapar

| Bölüm | Ne işe yarar |
| --- | --- |
| **Panel** | Toplam portföy, kâr/zarar, sınıf dağılımı, net yatırım geçmişi grafiği |
| **Bugün** | O günün işlemleri (yerel takvim gününe göre, UTC kaymasi yok) |
| **Hisseler / Fonlar / Kripto Varlıklar** | Tür bazlı filtrelenmiş görünüm |
| **Kripto Piyasası** | CoinGecko'dan 250 coin, 7 günlük mini grafikler, arama + sıralama, tek tıkla portföye ekleme |
| **İşlemler** | Alış/satış kaydı, komisyon, bakiye aşımı koruması, CSV dışa/içe aktarma |
| **Projeksiyon** | Düşük/orta/yüksek üç senaryo + **enflasyona göre reel getiri** (alım gücü) |
| **Ajan** | Sohbet, analiz, sohbet içinde grafik çizme, öğretme, 👍/👎, komutla işlem (onay şart) |

## Ayrıştığı noktalar

- **Anahtar yok, hesap yok, sunucu yok.** Aç ve kullan; veriler `localStorage`'ta.
- **Reel getiri.** "Yüzde 40 kazandım" değil, "enflasyon sonrası cebine ne kaldı".
- **Gerçek risk metrikleri.** Yıllık volatilite, maksimum düşüş (90 gün), Sharpe oranı,
  çeşitlendirme faydası — uydurma değil, fiyat geçmişinden hesaplanıyor.
- **Kâr/zarar muhasebesi doğru.** Maliyet (`costBasis`) ile güncel değer ayrı; satışta maliyet
  ağırlıklı ortalamayla azalıyor, yüzde satıştan bozulmuyor. Gerçekleşmiş / gerçekleşmemiş ayrı.
- **Ajan gerçekten iş yapabiliyor.** "THYAO'dan 500 TL sat" → ajan anlıyor, **Onayla** demeden
  hiçbir veri değişmiyor; onaylasan bile bakiye aşımı reddediliyor.
- **Ajanı eğitebiliyorsun.** Soru-cevap öğretiyorsun, öğrettiğin built-in kuralların önüne geçiyor.
- **Dürüstlük ilkesi.** BIST hisse ve TEFAS fon için anahtarsız/güvenilir kaynak olmadığı için
  o ikisi manuel giriş — sahte fiyat gösterilmiyor. Ajan da bir LLM değil, kural tabanlı;
  arayüzde bu açıkça yazıyor.

## Sık gelecek sorular

- **"Verilerim nereye gidiyor?"** Hiçbir yere. Tarayıcının localStorage'ında; SIFIRLA hepsini siler.
- **"Hisse fiyatları canlı mı?"** Döviz ve kripto canlı (Frankfurter.dev + CoinGecko, anahtarsız).
  BIST/TEFAS manuel — çünkü ücretsiz ve yasal bir kaynak yok.
- **"Ajan ChatGPT mi?"** Hayır. Yerel, kural tabanlı bir motor — bedava, anahtarsız ve offline
  çalışır. Gerçek LLM'e bağlama yolu `README.md`'de planlı ama sunucu + maliyet gerektiriyor.
- **"Ücretli mi?"** Hayır.

## Arkadaşa atılacak mesaj (kopyala-yapıştır)

> Kanka bi şey yaptım, denemeni istiyorum: **FAGENT** — yatırım takip paneli.
>
> Kısaca: hisse, fon, döviz, altın, kripto... hepsini tek yerden takip ediyorsun. Üyelik yok,
> API anahtarı yok, ücret yok — verilerin hiçbir yere gitmiyor, tamamen kendi tarayıcında duruyor.
>
> Bende en çok işe yarayanlar:
> - Kâr/zararı doğru tutuyor (maliyet ayrı, gerçekleşmiş/gerçekleşmemiş ayrı)
> - **Reel getiri** gösteriyor — enflasyon sonrası gerçekten kazandın mı, onu
> - Risk paneli var: volatilite, maksimum düşüş, Sharpe, çeşitlendirme faydası
> - Kripto Piyasası sekmesinde 250 coin canlı, 7 günlük grafikleriyle; beğendiğini tek tıkla portföye atıyorsun
> - Bir de **Ajan** var: "dağılımımı çiz", "en çok ne kazandırdı" diye yazıyorsun cevap veriyor,
>   grafik çiziyor. Hatta "X'ten 500 TL sat" desen işlemi yapıyor (onayını almadan bir şey değiştirmiyor).
>
> Senden isteğim: 10 dakika kurcalayıp bana şunları söyle —
> 1) İlk açtığında ne yapacağını anladın mı, nerede takıldın?
> 2) Eksik bulduğun/olsa süper olurdu dediğin şey ne?
> 3) Ajanla konuşurken anlamadığı bir şey oldu mu (varsa aynen yaz, ekleyeceğim)
>
> Dürüst ol, "güzel olmuş" deme 😄
