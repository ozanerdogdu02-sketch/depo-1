# FAGENT — Entegrasyon Envanteri

> Ürünün dış dünyaya değdiği **her** nokta. 3 Ağustos 2026 itibarıyla koddan taranarak
> çıkarıldı (hafızadan değil — `grep` ile doğrulandı).
>
> Toplantıda teknik soru gelirse bu sayfa yeter. Kaynak kod paketiyle birlikte okunmalı.

---

## 0. Bir bakışta

| | |
|---|---|
| Kaynak kod | **5.549 satır** TS/TSX (20 dosya) + 255 satır CSS + 79 satır Netlify Function |
| Test | **2.401 satır**, 23 dosya, **415 uçtan uca kontrol** |
| Üretim bağımlılığı | **4 tane**: react, react-dom, recharts, lucide-react |
| Sunucu | **Yok** (tek istisna: aşağıdaki EVDS proxy'si — şu an kapalı) |
| Hesap / giriş / KYC | **Yok** |
| Toplanan kişisel veri | **Yok** — telemetri, analytics, çerez izleme hiçbiri yok |
| Derleme çıktısı | 699 kB JS (gzip 207 kB) + 8,4 kB CSS — statik dosya |

---

## 1. Dış API'ler — istemciden doğrudan çağrılanlar

Hepsi **anahtarsız** ve tarayıcıdan doğrudan çağrılıyor. Anahtar gerektiren hiçbir servis
istemci koduna girmiyor (mimari kural — `AGENTS.md` §0).

| Servis | Uç | Nerede | Ne için | Durum |
|---|---|---|---|---|
| **CoinGecko** | `api/v3/simple/price` | `market.ts:53` | Tek coin anlık TL fiyatı | ✅ Çalışıyor |
| **CoinGecko** | `api/v3/coins/markets` | `cryptoMarket.ts:106` | Kripto Piyasa sekmesi listesi | ✅ Çalışıyor |
| **CoinGecko** | `api/v3/coins/{id}/market_chart` | `priceHistory.ts:54` | 90 günlük tarihsel seri (risk metrikleri) | ✅ Çalışıyor |
| **Frankfurter (ECB)** | `v1/latest` | `market.ts:38` | Döviz kuru (TRY karşılığı) | ✅ Çalışıyor |
| **Frankfurter (ECB)** | `v1/{tarih aralığı}` | `priceHistory.ts:87` | Döviz tarihsel serisi | ✅ Çalışıyor |

**Ortak davranış:** hepsi `try/catch` içinde, hata durumunda `MarketFetchError` fırlatıp
kullanıcıya anlaşılır mesaj gösteriyor. **Hiçbiri başarısız olduğunda uydurma fiyat üretmiyor.**
CoinGecko'nun ücretsiz katmanı istek sınırına takılabilir; bu durum kullanıcıya açıkça söyleniyor.

**Bilinen sınır:** CoinGecko 429 (rate limit) yanıtı CORS başlığı taşımadığı için tarayıcı
onu bloke ediyor ve istek "ağ hatası" gibi görünüyor. Kod bu dalda "istek sınırına takılmış
olabilir" diyor — `market.ts:55-59`'daki yorumda gerekçesi yazılı.

---

## 2. Netlify Function — TCMB EVDS proxy'si ⚠️ ŞU AN KAPALI

Tek sunucu tarafı bileşen. **Var olma sebebi tek başına yeterince önemli:** EVDS bir API
anahtarı istiyor, anahtar istemciye inemez.

| | |
|---|---|
| Dosya | `netlify/functions/evds.mjs` (79 satır) |
| İstemci | `src/evds.ts` → `/.netlify/functions/evds` |
| Yukarı akış | `https://evds2.tcmb.gov.tr/service/evds` |
| Anahtar | `EVDS_API_KEY` — **yalnızca Netlify ortam değişkeni**, istemciye hiç inmiyor |
| Durum | ❌ **Kapalı** — anahtar henüz alınmadı |

**Kapalıyken ne oluyor:** fonksiyon 503 döner → `evds.ts` `undefined` döner → uygulama elle
girilen enflasyon varsayımına düşer → **kullanıcıya hiçbir hata gösterilmez.** Bu yol 26 e2e
kontrolüyle doğrulandı.

**Güvenlik önlemleri (kod içinde):**
- Seri kodu biçim kısıtından geçiyor (`^[A-Z0-9]+(\.[A-Z0-9]+)+$`) — açık bir proxy'yi keyfî
  istek iletmeye çevirmemek için
- Tarih parametreleri `GG-AA-YYYY` biçimiyle doğrulanıyor
- TCMB'nin **ham hata gövdesi istemciye aktarılmıyor** (anahtarı yankılama / altyapı sızdırma riski)
- 6 saatlik önbellek başlığı — TÜFE ayda bir açıklanıyor, her açılışta TCMB'ye gitmek gereksiz

> **Gizlilik notu — toplantıda sorulursa:** Bu istek **kullanıcının portföy verisini içermiyor.**
> Sunucudan geçen tek şey TCMB'nin kamuya açık enflasyon serisi.

---

## 3. Depolama — tarayıcı `localStorage`

Sunucu olmadığı için tüm veri kullanıcının tarayıcısında. **Yedi ayrı katman:**

| Anahtar | İçerik | Yedeğe dahil? | SIFIRLA siler? |
|---|---|---|---|
| `fagent.portfolio.v1` | Portföy + işlem geçmişi | ✅ | ✅ |
| `fagent.agent.memory.v1` | Ajanın kullanım/tercih belleği | ✅ | ✅ |
| `fagent.agent.training.v1` | Kullanıcının öğrettiği soru-cevaplar | ✅ | ✅ |
| `fagent.tax.v1` | Düzenlenmiş stopaj oranları | ✅ | ✅ |
| `fagent.target.v1` | Hedef varlık dağılımı | ✅ | ✅ |
| `fagent.backup.v1` | Son yedek tarihi / erteleme | ❌ (meta) | ✅ |
| `fagent.evds.v1` | Enflasyon önbelleği (12 sa) | ❌ (yeniden üretilebilir) | — |
| `fagent.cryptomarket.cache.v2` | Kripto piyasa önbelleği | ❌ (yeniden üretilebilir) | — |
| `fagent.pricehistory.v1.*` | Fiyat serisi önbelleği | ❌ (yeniden üretilebilir) | — |

**Yedekleme:** `backup.ts` beş kalıcı katmanı tek JSON'da dışa/geri alıyor. Geri yüklemede
**beyaz liste** var — dosya dışarıdan gelebilir, tanınmayan anahtar yazılmıyor. Ayrıca
**ya hep ya hiç**: önce tamamı doğrulanıyor, sonra yazılıyor; bozuk dosya mevcut veriyi bozmuyor.

---

## 4. GitHub

| | |
|---|---|
| Depo | `ozanerdogdu02-sketch/depo-1` |
| Çalışma dalı | `claude/bloki-fagent-differences-3zkw29` |
| Varsayılan dal | `main` — ⚠️ **çalışma dalının ~20 commit gerisinde** |
| FAGENT yolu | `fagent/` (kendi `package.json`'ı olan bağımsız uygulama) |
| Dokümanlar | `docs/` |
| CI | ❌ **Yok** — `.github/workflows` dizini bulunmuyor. 415 test elle koşuyor. |

**Açık iş:** dal `main`'e merge edilmedi. Netlify'a manuel (sürükle-bırak) deploy yapıldığı için
canlı site güncel, ama repo ile yayın arasındaki otomatik bağ şu an kopuk.

---

## 5. Netlify

| | |
|---|---|
| Site | `fagentai.netlify.app` |
| Yapılandırma | `fagent/netlify.toml` (repoya eklendi) |
| Base directory | `fagent` |
| Build | `npm run build` |
| Publish | `dist` *(base'e göreli — `fagent/dist` değil)* |
| Functions | `netlify/functions` |
| Yönlendirme | `/api/evds` → `/.netlify/functions/evds` |
| Ortam değişkeni | `EVDS_API_KEY` — ⚠️ **tanımlı değil** |
| Son deploy | **Manuel (sürükle-bırak)**, 3 Ağustos 2026 |

⚠️ **Manuel deploy otomatik yayını geçersiz kılar.** Kalıcı çözüm: `main`'e merge + Netlify'da
"auto publish" yeniden açılması.

⚠️ **Sürükle-bırak deploy Netlify Function'ı yayınlamaz.** EVDS zaten kapalı olduğu için
şu an fark etmiyor, ama anahtar alınınca git tabanlı deploy'a dönmek gerekiyor.

---

## 6. Entegre OLMAYANLAR — ve neden

Bu bölüm bilinçli. Ürünün iddiası "uydurma veri göstermemek" olduğu için boşluklar gizlenmiyor.

| Kaynak | Neden yok | Durum |
|---|---|---|
| **BIST hisse fiyatı** | Anahtarsız, resmî, ücretsiz kaynak yok (araştırıldı). Bulunanlar: banka-özel API'ler, ücretli servisler, ToS riski taşıyan kazıyıcılar | Manuel giriş |
| **TEFAS fon fiyatı** | TCMB'nin 2026'da açtığı `tefas.gov.tr/api/funds/` uçları anahtarsız, **ama site WAF korumalı ve CORS durumu doğrulanamadı** | Manuel giriş |
| **Altın fiyatı** | Adaylar (goldprice.dev, freegoldapi) XAU spot veriyor; **Türkiye gram altını yerel prim taşıyor**, birebir eşit değil. Yanlış fiyat göstermektense göstermemek seçildi | Manuel giriş |
| **BtcTurk genel API** | `api/v2/ticker` ve `api/v2/ohlc` anahtar istemiyor (resmî dokümandan teyitli). **CORS doğrulanmadı.** Bakiye uçları HMAC imza istiyor → tarayıcıda güvenle yapılamaz | Entegre edilebilir |
| **LLM (Anthropic/OpenAI)** | Ajan bilinçli olarak kural tabanlı: maliyet sıfır, gecikme sıfır, **halüsinasyon sıfır**. Geçiş için altyapı hazır (`server/`), `agent.ts` saf fonksiyonlarda izole | Planlı |

**Kapsam şeffaflığı koda gömülü:** Risk raporu portföyün yüzde kaçını kapsadığını
(`RiskReport.coveragePct`) ve kapsam dışı her varlığın nedenini ekrana yazıyor.

---

## 7. Test edilemeyen / doğrulanamayan noktalar

Dürüstlük gereği ayrı başlık. Bunların hiçbiri "test edildi" diye sunulmamalı.

| Ne | Neden |
|---|---|
| **Netlify Function'ın kendisi** | Geliştirme ortamında ne netlify-cli var ne dış ağ erişimi. İstemci tarafı `page.route()` taklidiyle test edildi; fonksiyon yalnızca gerçek deploy'da doğrulanabilir |
| **EVDS seri kodu** (`TUFE_SERIES = 'TP.FG.J0'`) | EVDS arayüzünden teyit edilmedi. Yanlışsa proxy boş döner → varsayıma düşülür → **ekranda yanlış sayı çıkmaz** (fail-safe) |
| **BtcTurk / TEFAS / altın CORS** | Geliştirme ortamının çıkış politikası tüm dış hostları engelliyor (403). Test sayfası hazır: `fagentai.netlify.app/cors-test.html` |
| **Gerçek ağ üzerinden canlı fiyat** | Aynı sebep. `page.route()` ile taklit edildi; gerçek doğrulama kullanıcının tarayıcısında yapılmalı |

---

## 8. Mimari kurallar — kodun uyduğu sözleşme

Bunlar `AGENTS.md` ve `CLAUDE.md`'de yazılı ve testlerle korunuyor:

1. **API anahtarı istemci koduna asla girmez.** İstemci her zaman anahtarsız da çalışır.
2. **Uydurma veri yok.** Doğrulanamayan bir sayı gösterilmez; "veri yok" demek "yanlış veri"
   demekten iyidir. (Stopajda kripto/altın/döviz %0 bırakılması bunun örneği.)
3. **Veri tarayıcıdan çıkmaz.** Tek istisna EVDS proxy'si ve o istek portföy içermez.
4. **`agent.ts` ve `analytics.ts` SAFTIR** — I/O yok, tüm veri parametreyle gelir. Bu hem test
   edilebilirliği hem ileride LLM'e geçişi sağlıyor.
5. **Commit öncesi iki kez doğrula** — `typecheck` + `build` + `test:e2e` üçü de yeşil olmadan
   commit yok.
