# TÜBİTAK 2209-A hazırlık dosyası (Consensus'a yapıştırmak için)

Tarih: 2026-11-05. Durum: TASLAK. Aşağıdaki 2209-A kuralları hafızadan yazıldı; güncel çağrı metniyle doğrulanmadı.
[DOLDUR] işaretli yerleri yalnız proje sahibi bilir; uydurulmadı.

## 0. İki ayrı yol

| | Araştırma yolu (2209-A) | Satış yolu (Acquire.com) |
|---|---|---|
| Amaç | Ölçülebilir bir araştırma sorusunu yanıtlamak | Gelir getiren, devredilebilir ürün |
| Fagent'ın rolü | Deney aracı (ölçüm ortamı) | Ürünün kendisi |
| Veri | Resmî API (TCMB/EVDS) + katılımcı yanıtları (anonim, kimliksiz) | Aynı, ek olarak hesap/ödeme (kapalı) |
| Kazıma (KAP/BİST) | YOK (projede kullanılmaz) | Kod var, canlıda kapalı |
| Hesap, ödeme, bulut | YOK | Kod var, kapalı; sonra açılır |
| Dal önerisi | `arastirma/2209a` (donmuş ölçüm sürümü) | `urun/birlesik` (devam eder) |
| Hukuk | Etik kurul + KVKK (katılımcı verisi) | KVKK/SPK/ETBİS, alıcıya devir |

Çakışma riski (Consensus yanıtlayamaz, TÜBİTAK duyurusu ve üniversite TTO'sundan sorulur):
destekli projenin çıktılarının fikri mülkiyeti ile Acquire.com satışı birbirini engeller mi?

## 1. Sorulara yanıtlar

### 1.1 Bilgi tabanı
- Elimizde: Fagent kod tabanı ve belgeleri (`docs/`), 446 birim + 901 uçtan uca test, denetim raporu (`docs/denetim/`).
- Eksik: 2209-A çağrı duyurusu, başvuru formu, değerlendirme ölçütleri, kabul almış örnek projeler. Proje sahibi yüklemeli.
- Literatür: Consensus ile aranacak (bölüm 4).

### 1.2 Bölüm ve danışman
- [DOLDUR] Bölüm/sınıf. [DOLDUR] Danışman ve alanı.
- Öneri: Bankacılık-Finans, İşletme (Finans) ya da Yönetim Bilişim Sistemleri. Danışman olarak davranışsal finans ya da finansal okuryazarlık çalışan bir öğretim üyesi (konu bölüm 1.3).

### 1.3 Konu seçimi (karar: B ana konu, C destek, A ikinci aşama)
- **Ana konu (B):** "Enflasyon ve vergi sonrası (reel) getiri gösteriminin, bireysel yatırımcının getiri algısı ve karar niyeti üzerindeki etkisi: yüksek enflasyonlu ekonomide kontrollü çevrimiçi deney."
  - Neden: ölçülebilir hipotez, küçük örneklem yeter, lisans düzeyine uygun, Fagent'ın brüt → net → reel hesabı doğrudan deney düzeneği.
  - Tavsiye sınırı: deney kişiye yatırım önerisi vermez; "karar niyeti" kurgusal senaryoyla ölçülür.
- **Destek (C):** Resmî veri hattında güncellik ve doğruluk güvencesi (yöntem bölümü: ölçüm aracının doğruluğu).
- **İkinci aşama (A):** Cihazda çalışan açık kaynak dil modeliyle portföy açıklaması. Şimdi DIŞARIDA: SPK riski, avukat görüşü yok, proje sahibinin açık "başla" onayı yok.

Taslak hipotezler:
- H1: Reel getiri gösterilen grup, yalnız nominal getiri gösterilen gruba göre getiriyi daha düşük ve daha doğru algılar.
- H2: Vergi sonrası gösterim, algılanan getiri ile hesaplanan reel getiri arasındaki sapmayı azaltır.
- H3: Etki, finansal okuryazarlık düzeyine göre değişir.
Taslak desen: gruplar arası, 3 koşul (nominal / net / reel), kurgusal senaryo, sonra algı ve niyet ölçeği. Güç analizi ile örneklem: [Consensus + danışman].

### 1.4 "Sistem değişti"
Proje sahibi ayrıca ne kastettiğini yazabilir. Koddan görülen değişimler:
1. Üç sürüm tek ürün dalında birleşti (`urun/birlesik`).
2. Veri hattı ortak çatıya taşındı: TCMB/EVDS, KAP, BİST bağdaştırıcıları (sunucuda, kazıma varsayılan kapalı).
3. Bölüm sonu kod denetimi ve `npm run denetim` eklendi; Bölüm A denetimi kapandı.
4. Ürün tasarımı PDF'e bağlandı (görsel tasarım proje sahibinde).
5. Hesap/bulut kodu repoda duruyor, canlıda kapalı.

## 2. Sistemsel analiz (koddan çıkarılan mevcut yapı)

Boyut: yaklaşık 12.000 satır TS/TSX, `src/` altında ~40 dosya. Çalışma bağımlılıkları 5: react, react-dom, recharts, lucide-react, @supabase/supabase-js. Test: 22 birim test dosyası (446 test), 29 e2e dosyası (901 kontrol, hesap kısmı sahte Supabase ile). Sunucu uçları 3: `/api/evds`, `/api/kap`, `/api/bist` (Vercel + Netlify aynası).

| Katman | Dosyalar | Görev |
|---|---|---|
| Arayüz | `App.tsx` (~2100 satır), `RiskPanel.tsx`, `CryptoMarket.tsx`, `Account.tsx` | Sekmeler: Panel, Bugün, Hisseler, Fonlar, Kripto, Kripto Piyasası, İşlemler, Projeksiyon, Ajan |
| Alan mantığı | `store.ts`, `projection.ts`, `analytics.ts`, `taxRates.ts`, `vergiKurallari.ts`, `inflation.ts`, `agent.ts` | Portföy, brüt/net/reel hesap, projeksiyon, kural tabanlı ajan (LLM yok) |
| Veri hattı | `kaynaklar/{tcmb,kap,bist,kayit,onbellek,tip}.ts`, `evds.ts`, `market.ts`, `priceHistory.ts` | Kaynak/tarih etiketli veri; eski veri hesaba girmez |
| Kalıcılık | localStorage (doğruluk kaynağı), IndexedDB aynası, `backup.ts`, `recovery.ts`, `karantina.ts`, `sekmeSenkron.ts`, `yazmaDurumu.ts`, `portfoySema.ts` | Veri cihazda; yedek, kurtarma, çok sekme güvenliği |
| Bulut (isteğe bağlı) | `cloud.ts`, `surum.ts`, migration | Supabase senkronu; env boşken kapalı |
| Güvence | `scripts/denetim.mjs`, `guvenlik-tarama.mjs`, CSP, 3 tur bağımsız doğrulama | Ağ envanteri, gizli anahtar, paket bütçesi |
| Ayar dosyaları | `config/tax_rules.json`, `varsayimlar.json` | Tarihli, sürümlü varsayımlar; hepsi `dogrulandi:false` |

Araştırma açısından güçlü yönler:
- Yerel-öncelikli mimari: katılımcı verisi sunucuya gitmeden deney yapılabilir.
- Her değer kaynak, tarih ve "resmî / varsayım / senin girdin" etiketli (ölçüm geçerliliği için önemli).
- Kural tabanlı, deterministik hesap: aynı girdi aynı çıktı (tekrarlanabilirlik).
- Test ve denetim altyapısı: ölçüm aracının doğruluğu kanıtlanabilir.

Araştırma açısından zayıf yönler (panelist bakışıyla):
1. Varsayılan getiri senaryoları (%20/%35/%50), mevduat faizi (%45) ve enflasyon yedeği (%30) kaynaksız, `dogrulandi:false`. Deneyde kullanılacaksa kaynaklandırılmalı.
2. Gerçek EVDS verisi hiç doğrulanmadı (seri kodu `TP.FG.J0`, anahtar Vercel'de yok). Deney için canlı doğrulama şart.
3. Projeksiyon Aşama A'da; stopaj düşümü, hedef karşılaştırması ve duyarlılık tablosu planlı. Monte Carlo onaylanmadı.
4. `App.tsx` tek dosyada ~2100 satır: değişiklik riski, deney sürümünü dondurmak zor.
5. Gerçek kullanıcı denemesi yok; yalnız otomatik test var. Araştırmanın asıl katkısı bu olacak.
6. Hukuk/etik (KVKK, SPK, etik kurul) ertelendi.

Mevcut yapıdan çıkan araştırma boşluğu: ürün "reel getiriyi göster" diyor ama bunun kullanıcı algısını gerçekten değiştirdiği ölçülmedi. 2209-A'nın özgün değeri burada.

## 3. Panelist ön değerlendirmesi (bugünkü durum, puansız)

| Başlık | Durum | Eksik |
|---|---|---|
| Özgün değer | Orta | Literatürde boşluğun gösterilmesi (Consensus) |
| Yöntem | Zayıf | Hipotez, desen, örneklem, ölçekler, analiz planı henüz yazılmadı |
| Proje yönetimi | Zayıf | İş-zaman paketi (12 ay), risk ve B planı, bütçe yok |
| Yaygın etki | Orta | Finansal okuryazarlık, açık kaynak ölçüm aracı; hedef kitle yazılmalı |
| Etik/yasal | Eksik | Etik kurul, aydınlatılmış onam, tavsiye sınırı |

## 4. Consensus sorguları (İngilizce; her biri bir iddiayı kaynaklandırır)

Çıktı biçimi isteği: "Her bulgu için: yazar, yıl, dergi, örneklem, ana sonuç, sınırlılık; Türkiye ya da yüksek enflasyonlu ülke çalışmalarını ayrıca işaretle."

1. Does displaying inflation-adjusted (real) returns instead of nominal returns change retail investors' perceived returns or investment intentions? (money illusion, framing experiments)
2. What is the evidence on money illusion among individual investors in high-inflation economies, including Turkey, Argentina, Brazil, Israel?
3. How does showing after-tax returns versus pre-tax returns affect investor perception and decisions? (tax salience)
4. What validated measures exist for financial literacy and numeracy (e.g. "Big Three" questions by Lusardi and Mitchell), and have they been used in Turkey?
5. How do scenario ranges and fan charts, compared with single point projections, change retail investors' understanding of long-term outcomes? Include sequence-of-returns risk communication.
6. Which online between-subjects experiment designs and sample sizes are typical for studying framing effects in personal finance (effect sizes, power analysis)?
7. What are the ethical and regulatory boundaries between financial education tools and investment advice, with a focus on retail investors?
8. (İkinci aşama, şimdilik beklemede) How accurate and safe are small on-device open-source language models at explaining portfolio data to non-experts, and what is the hallucination risk in financial contexts?
9. Which methods ensure data quality and timeliness in official statistics APIs used by consumer finance apps?

Doğrulanacak aday kaynaklar (hafızadan, doğrulanmadı): Shafir, Diamond ve Tversky "Money Illusion" (QJE, 1997); Lusardi ve Mitchell finansal okuryazarlık derlemeleri. Consensus bunları bulamazsa projeye girmez.

## 5. Sonraki adımlar
1. Proje sahibi: 2209-A belgelerini, bölüm ve danışman bilgisini yükler.
2. Consensus sonuçları getirilir; boşluk (research gap) cümlesi yazılır.
3. İlk tam taslak yazılır, panelist puanlar, döngü uygun düzeye gelene kadar sürer.
4. Fagent'ta araştırma sürümü: `arastirma/2209a` dalı, kazıma ve hesap kapalı, varsayımlar kaynaklandırılmış, EVDS canlı doğrulanmış.
