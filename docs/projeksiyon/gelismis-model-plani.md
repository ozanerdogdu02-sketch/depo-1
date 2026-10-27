# Projeksiyon — gelişmiş model planı (yönetmen taslağı, 2026-10-27)

Durum: TASLAK. Kod yazılmadı. Kullanıcı onayı bekler (bölüm g).

## Sonuç önce

- Kullanıcının istediği "daha gelişmiş projeksiyon" kurallarımızla **yapılabilir**, ama "eğitilmiş model" (makine öğrenmesi) **şimdi yapılamaz**:
  2026-10-23 ertelenen teknolojiler listesiyle ve "LLM yok, anahtarsız" ilkesiyle çakışır.
- Önerilen yol iki aşamalı:
  - **Aşama A (çakışmasız, hemen yapılabilir):** rastgelelik yok. Mevcut 3 senaryoya stopaj sonrası + enflasyon sonrası (reel) değer,
    hedef tutar karşılaştırması, "getiri × enflasyon" duyarlılık tablosu ve "kötü yıllar başta gelirse" sıra senaryosu eklenir.
  - **Aşama B (kullanıcı kararına bağlı):** tarayıcıda, tohumlu (her seferinde aynı sonucu veren) **Monte Carlo senaryo dağılımı**:
    %10 / %50 / %90 bantları ve "bu varsayımlarla hedefe ulaşan senaryo payı".
- **Açık çelişki:** basit Monte Carlo (her yılın getirisini birbirinden bağımsız, rastgele çekmek) matematikte bir **rassal yürüyüştür**.
  Ertelenen listede "rassal yürüyüş kuramı" var. Bu yüzden Aşama B, kullanıcı "yasak kapsamı kuramsal modelleme/tahmindir,
  basit senaryo simülasyonu serbesttir" diye açıkça karar vermeden başlamaz (karar K1).
- **Kapsam notu:** 2026-10-25 kapsam kararı "yalnızca altyapı ve veri akışı" diyor. Kullanıcı 2026-10-27'de projeksiyonu bu kapsama
  ekledi ("Tasarım kısmında sadece projeksiyon ele alınabilir"). Bu belge o eklemeye dayanır; diğer tasarım işleri kapsam dışı kalır.
  `CLAUDE.md` KAPSAM KARARI bölümüne bu istisnanın kullanıcı tarafından yazılması/onaylanması gerekir (yönetmen CLAUDE.md'yi değiştirmez).

## (a) Bugünkü projeksiyon ne yapıyor

Kaynak: `src/App.tsx` `Projeksiyon()` ve `projectFinalValue()` (grep: `function Projeksiyon`), oranlar `src/config/varsayilanlar.ts` → `SCENARIO_DEFAULT_RATES_PCT`.

1. Başlangıç = portföyün bugünkü toplam değeri (`totalValue`); kullanıcı aylık katkı (vars. 5.000 TL) ve süre (1–30 yıl) seçer.
2. Üç **sabit** yıllık getiri: Düşük %20, Orta %35, Yüksek %50 (kaynaksız varsayım, kullanıcı değiştirebilir; dosyada `TODO(muhasebe)`).
3. Yıllık oran aylığa çevrilir; her ay `değer × (1 + aylık oran) + katkı` ile bileşik büyütülür.
4. Süre sonu nominal değer ve enflasyonla bugüne indirgenmiş "bugünkü alım gücü" gösterilir (enflasyon: EVDS ya da yedek %30, kullanıcı değiştirebilir).
5. Grafik: 3 çizgi (renk aynı, desenle ayrışır). Uyarı metni: "Sabit getiri varsayımıyla bileşik hesap … taahhüt değildir."
6. Eksikler: **stopaj hiç düşülmüyor** (`afterTaxOf` başka ekranda var, burada kullanılmıyor); dalgalanma/kötü yıl sırası yok;
   hedef tutar yok; hesap `App.tsx` içinde (saf modülde değil, birim testi yok); varsayımlar "varsayım/resmî/kullanıcı" diye etiketlenmiyor.
7. Testler: `tests/e2e/fagent-projection-e2e.mjs` (13 kontrol: girişler, 3 çizgi, desen, eksen yazısı, reel değer).

## (b) "Gelişmiş / eğitilmiş model" — üç olası yorum

| # | Yorum | Ne demek | Yasak listeyle çakışma |
|---|---|---|---|
| Y1 | **Makine öğrenmesi modeli** (piyasa verisiyle eğitilmiş, getiriyi "öngören") | Geçmiş fiyatlardan gelecek getiri tahmini | ❌ Çakışır: zaman serisi/gecikmeli değişken, transfer öğrenme (ertelenen liste); "şu olacak" tahmini (uyum); BIST/TEFAS için anahtarsız resmî veri yok → eğitim verisi yok (sahte veri riski). |
| Y2 | **Olasılıklı senaryo motoru** (Monte Carlo: binlerce olası yol, bantlar) | "Şu varsayımlarla sonuçlar şu aralıkta dağılıyor" | ⚠️ Kısmen: bağımsız rastgele getiriler = rassal yürüyüş. Uyum açısından "senaryo dağılımı" diye sunulursa sorunsuz. Kullanıcı kararı gerekir (K1). |
| Y3 | **Daha zengin kural tabanlı hesap** (vergi, enflasyon, hedef, duyarlılık, sıra riski) | Rastgelelik yok; daha çok "eğer … ise" senaryosu | ✅ Çakışmaz. Mevcut ilkelerle birebir uyumlu. |

Not: Repoda "eğitilmiş" sözcüğünün tek karşılığı `src/agentTraining.ts` — kullanıcının öğrettiği soru-cevap kaydı (ağırlık güncellemesi yok).
"Eğitilmiş model" ifadesi kullanıcıya bu anlamda da kullanılmamalı; arayüzde "model eğitildi" denmez.

## (c) Kurallara uyan öneri: "senaryo dağılımı" (tahmin değil)

Adlandırma: arayüzde **"Senaryo dağılımı"**, asla "tahmin", "beklenen getiri", "olasılıkla kazanırsın". Her sayı yanında varsayım etiketi.

**Aşama A — rastgelelik yok (Y3)**
- A1. Hesabı saf modüle taşı: `src/projection.ts` (React/window yok; AGENTS §0.6 ile aynı saflık), `projectFinalValue` buraya.
- A2. Stopaj sonrası: kazanç kısmına varlık türüne göre oran (`DEFAULT_TAX_RATES` / kullanıcının `fagent.tax.v1` oranları). Doğrulanmamış oranlar
  (`UNVERIFIED_TAX`) "doğrulanmadı, 0 alındı" diye gösterilir.
- A3. Üç değer yan yana: nominal → stopaj sonrası → reel (bugünkü alım gücü). Sıra P6 hesap motoruyla aynı ("brüt / net / reel").
- A4. Etiketler: her girdi yanında `resmî` (EVDS'den gelen TÜFE), `varsayım` (ürünün varsayılanı), `senin girdin` (kullanıcı değiştirdi).
- A5. Hedef karşılaştırma: kullanıcı isterse hedef tutar girer (varsayılan hedef **önerilmez**, alan boş başlar). Çıktı betimleyici:
  "Orta senaryo varsayımıyla süre sonu reel değer, girdiğin hedefin %N'i."
- A6. Duyarlılık tablosu: getiri (kullanıcının düşük/orta/yüksek değeri) × enflasyon (girdi −10 / girdi / +10 puan) → 3×3 reel değer.
- A7. Sıra riski (deterministik): aynı ortalama getiri, iki sıra — "kötü yıllar başta" ve "kötü yıllar sonda"; fark gösterilir. Rastgelelik yok.

**Aşama B — Monte Carlo senaryo dağılımı (Y2; K1 onayından sonra)**
- Tarayıcıda, Web Worker gerekmeden (10 bin yol × 360 ay ≈ 3,6 milyon basit işlem; ölçülmeli) saf fonksiyon.
- **Tohumlu sözde-rastgele üreteç** (ör. mulberry32/xorshift — 10 satırlık, kendi yazdığımız fonksiyon, bağımlılık yok). Aynı girdi + aynı tohum = aynı sonuç;
  testler bu sayede sabit sayı doğrular. Tohum ekranda gösterilir ("senaryo no: 42").
- Girdi kaynakları (kullanıcı seçer, etiketlenir):
  1. **Kullanıcı varsayımı:** ortalama yıllık getiri + yıllık dalgalanma (%). Varsayılan dalgalanma da `varsayilanlar.ts`'e "kaynaksız varsayım" etiketiyle girer.
  2. **Kendi geçmişinden:** yalnızca canlı fiyat geçmişi olan varlıklar (kripto, döviz; `priceHistory.ts`, 90 gün). 90 gün yıllık dağılım için **yetersiz**;
     ekranda "kısa geçmiş, yalnızca bilgi amaçlı" uyarısı. Hisse/fon için geçmiş yok → bu kaynak onlarda kapalı (sahte veri yok).
- Çıktı: %10 / %50 / %90 bant grafiği (yelpaze), nominal ve reel; "girdiğin hedefe ulaşan senaryo payı: N/10.000" (yüzde değil sayı + yüzde, "olasılık" yerine "senaryo payı").
- Sabit uyarı (uyum-dili şablonu): "Bu, girdiğin varsayımlarla üretilmiş senaryoların dağılımıdır; gelecek getiriyi göstermez. Yatırım tavsiyesi değildir."

## (d) Gerçek "eğitilmiş ML modeli" ne gerektirir, neden ertelendi

Gerekenler: (1) yıllara yayılan, lisanslı, temiz fiyat verisi (BIST/TEFAS için anahtarsız resmî kaynak yok; P5 `TODO(hukuk)` BIST veri lisansı);
(2) gecikmeli değişkenli zaman serisi modeli ya da önceden eğitilmiş modelin aktarımı (transfer öğrenme); (3) model eğitimi/barındırma (sunucu ya da büyük tarayıcı paketi);
(4) geriye dönük test ve model riskinin belgelenmesi; (5) hukuki değerlendirme — bireye özel getiri öngörüsü SPK yatırım danışmanlığı sınırına yaklaşır.
Çakışma: (2) doğrudan ertelenen liste (zaman serisi/lag, transfer öğrenme); (1) sahte veri kuralı; (3) anahtarsız/local-first ilkesi; (5) "şu olacak" yasağı.
Yeniden değerlendirme koşulu (ertelenen listedeki ile aynı): ürün satıldıktan sonra ya da gelir varken; ayrıca lisanslı veri kaynağı + hukuk görüşü + Üst Kurul onayı olmadan açılmaz.

## (e) Gereken veri ve bağımlılıklar

| Kaynak | Ne için | Durum |
|---|---|---|
| P3 yerel depo (`src/storage/*`, `fagent.portfolio.v1`) | Başlangıç değeri, varlık türü dağılımı (tür bazında stopaj) | Var. Projeksiyon ayarları (aylık katkı, süre, hedef, tohum) bugün **kalıcı değil**; kalıcı olacaksa yeni katman → `BACKED_UP_KEYS` + SIFIRLA + yedek kuralı (veri-akisi-haritasi). Öneri: ilk sürümde kalıcı yapma (karar K3). |
| P5 fiyat hattı (`priceHistory.ts`) | Aşama B "kendi geçmişinden" dalgalanma | Yalnız kripto/döviz, 90 gün; dış API bu ortamda doğrulanamaz. Hisse/fon: yok. |
| P6 hesap motoru (`analytics.ts` `afterTaxOf`, `realReturnPct`; `varsayilanlar.ts`) | Stopaj ve reel hesap | Kısmen var. Oranlar `TODO(muhasebe)`, tarih aralıklı `tax_rules.json` yok. Projeksiyon P6'yı yeniden yazmaz, aynı fonksiyonları çağırır. |
| Enflasyon (`inflation.ts`, EVDS `TP.FG.J0`) | Reel değer | EVDS anahtarı Vercel'de yok → yedek %30 (doğrulanmadı). Etiket "varsayım" olmalı, EVDS gelirse "resmî". |

Ağ: projeksiyon **hiç yeni dış istek yapmaz**; portföy verisi tarayıcıdan çıkmaz.

## (f) İş listesi (küçükten büyüğe)

| # | İş | Sahip rol | Kabul ölçütü | Test | Uyum riski | Efor |
|---|---|---|---|---|---|---|
| 1 | Hesabı saf `src/projection.ts`'e taşı, davranış aynı | veri-akışı | Ekran sayıları birebir aynı; modülde React/window yok | Birim: bilinen girdi → sabit sonuç (aylık bileşik, 0 katkı, 1 yıl, %0 getiri). e2e: mevcut 13 kontrol değişmeden yeşil | Düşük | S |
| 2 | Varsayım etiketleri (resmî/varsayım/senin girdin) | tasarım + uyum | Her girdinin yanında etiket; EVDS yoksa enflasyon "varsayım" | e2e: etiket metinleri; EVDS taklidiyle "resmî" | Düşük (metin `uyum-dili`ne uymalı) | S |
| 3 | Stopaj sonrası değer (nominal → net → reel) | veri-akışı (+ muhasebe TODO) | Kazanç yoksa vergi 0; doğrulanmamış oran "doğrulanmadı" yazar | Birim: kazanç/zarar/0 sınırları, tür karışımı. e2e: "Stopaj sonrası" görünür | Orta: oranlar doğrulanmadı → etiket şart | S–M |
| 4 | Hedef tutar karşılaştırması (alan boş başlar) | tasarım + uyum | Hedef girilmezse hiçbir şey gösterilmez; cümle betimleyici | e2e: boşken yok, girilince "%N'i" metni; yasak kelime taraması | Orta: "hedefe ulaşmak için şunu yap" dili yasak | S |
| 5 | Duyarlılık tablosu 3×3 | veri-akışı + tasarım | Tablo değerleri birim testle aynı; 375px'te taşmaz | Birim: köşe hücreleri; e2e: 9 hücre | Düşük | M |
| 6 | Sıra riski (deterministik iki sıra) | veri-akışı | Aynı ortalama, iki farklı sonuç; açıklama metni | Birim: iki sıra farkı sabit sayı; e2e: iki değer görünür | Düşük | M |
| 7 | (K1 onayı sonrası) Tohumlu üreteç + Monte Carlo çekirdeği | veri-akışı; güvenlik inceler | Aynı tohum = aynı bantlar; 10 bin yol tarayıcıda < ~1 sn (ölçülür) | Birim: üreteç dizisi sabit; dalgalanma 0 iken bantlar = deterministik sonuç; %10 ≤ %50 ≤ %90 | Orta: "tahmin/olasılık" dili | M |
| 8 | Yelpaze grafiği + hedef senaryo payı | tasarım + uyum | %10/%50/%90 bantları, "senaryo payı N/10.000", sabit uyarı metni | e2e: bant sayısı, uyarı metni, tohum görünür; yasak kelime taraması | Yüksek: en çok "tahmin" gibi algılanabilecek parça | M–L |
| 9 | (İsteğe bağlı) "Kendi geçmişinden" dalgalanma (kripto/döviz) | veri-akışı | Geçmiş yoksa seçenek kapalı; "kısa geçmiş" uyarısı | e2e: route taklidiyle geçmiş; birim: `annualizedVolatilityPct` yeniden kullanımı | Orta: 90 gün yanıltıcı olabilir | M |

Her adım sonunda kapı: `npm run typecheck`, `npm run build`, `npm run test:unit`, `npm run test:e2e` (sahte Supabase ile yeşil), `uyum-dili` grep kontrolü.
Ekip akışıyla yürür (`fagent-ekip`); yönetmen kod yazmaz.

**Yeni bağımlılık yok.** Üreteç, yüzdelik hesap ve yelpaze grafiği mevcut araçlarla (kendi fonksiyonumuz + Recharts `Area`) yapılır.
Bir ekip üyesi kütüphane (ör. istatistik/rastgele sayı paketi) isterse `docs/ust-kurul.md` üzerinden talep açılır; bu plan böyle bir talep içermez.

## (g) Kullanıcıdan gereken kararlar

1. **K1 — Monte Carlo serbest mi?** Ertelenen "rassal yürüyüş kuramı" yasağı, basit senaryo simülasyonunu da kapsıyor mu?
   *Önerim:* Aşama A'yı şimdi yap; Aşama B'yi "kuramsal tahmin değil, varsayıma dayalı senaryo simülasyonu" diye istisna olarak onayla ya da A bitince karar ver.
2. **K2 — Kapsam istisnası:** Projeksiyon, "yalnızca altyapı ve veri akışı" kapsamına resmen eklensin mi (CLAUDE.md'ye senin onayınla satır)?
   *Önerim:* Evet, yalnızca Projeksiyon sekmesi; diğer tasarım işleri kapsam dışı kalır.
3. **K3 — Ayarlar kalıcı olsun mu?** Aylık katkı/süre/hedef sayfa yenilenince dursun mu?
   *Önerim:* İlk sürümde hayır (yeni veri katmanı = yedek/SIFIRLA/bulut işleri doğurur); sonra ayrı iş.
4. **K4 — Dalgalanma kaynağı (Aşama B):** yalnız senin girdiğin varsayım mı, kripto/döviz için 90 günlük geçmiş de mi?
   *Önerim:* Önce yalnız varsayım (etiketli); geçmişten türetme adım 9'a, isteğe bağlı.
