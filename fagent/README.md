# FAGENT — Anahtarsız Yatırımcı Paneli

Kişisel portföy takip uygulaması — dokuz sekme: Panel, Bugün, Hisseler, Fonlar, Kripto Varlıklar,
**Kripto Piyasa**, İşlemler, Projeksiyon ve bir **Demo Ajan** (sohbet + grafik çizme + hafıza +
eğitilebilir bilgi tabanı + proaktif içgörüler).

Portföy takibinin ötesinde **gerçek finansal matematik** yapar: reel getiri (Fisher), XIRR,
Herfindahl yoğunlaşma, volatilite, maksimum düşüş, Sharpe oranı, korelasyon ve çeşitlendirme
faydası — hepsi gerçek tarihsel fiyat serisinden, anahtarsız kaynaklarla.

> FAGENT'ın BtcTurk'ün yapay zekâ asistanı **Bloki**'den nerede ayrıştığı ve neden onun
> tamamlayıcısı olduğu: [`../docs/bloki-vs-fagent.md`](../docs/bloki-vs-fagent.md)

**Temel ilke: API anahtarı gerektirmez.** Hiçbir özellik, istemci tarafında bir Anthropic/OpenAI
anahtarı olmadan çalışmayı bırakmaz. Tüm veriler yalnızca tarayıcıda (`localStorage`) tutulur —
sunucu yok, veri toplama yok.

## Kurulum ve Geliştirme

```bash
npm install
npm run dev         # http://localhost:5173
npm run typecheck   # tsc --noEmit
npm run build        # dist/ üretir (Netlify: base=fagent, build=npm run build, publish=fagent/dist)
```

## Dosya Yapısı

```
src/
  App.tsx           — tüm UI (sekmeler, formlar, grafikler, Ajan sohbet arayüzü)
  store.ts          — portföy veri modeli + actions (localStorage: fagent.portfolio.v1)
  market.ts         — döviz/kripto canlı fiyat (Frankfurter.dev, CoinGecko — anahtarsız)
  csv.ts            — varlık/işlem CSV dışa-içe aktarma
  agent.ts          — Ajan'ın YANIT MANTIĞI (saf fonksiyonlar, localStorage'a dokunmaz)
  agentMemory.ts    — Ajan'ın UZUN SÜRELİ belleği (kullanım istatistiği, localStorage)
  agentTraining.ts  — Ajan'ın EĞİTİLEBİLİR bilgi tabanı (öğretilen soru-cevaplar, localStorage)
  analytics.ts      — FİNANSAL MATEMATİK (saf): reel getiri, XIRR, HHI, volatilite,
                      maks. düşüş, Sharpe, korelasyon, kovaryansla çeşitlendirme faydası
  priceHistory.ts   — tarihsel fiyat serisi (CoinGecko market_chart + Frankfurter/ECB)
                      + risk raporu; KAPSAM ORANINI (coveragePct) açıkça döner
  cryptoMarket.ts   — Kripto Piyasa sekmesinin veri katmanı (CoinGecko, önbellekli)
  RiskPanel.tsx     — risk metrikleri arayüzü (kapsam dışı varlıkları da listeler)
  CryptoMarket.tsx  — Kripto Piyasa sekmesi (canlı liste + 7 günlük mini grafikler)
```

`analytics.ts` de `agent.ts` gibi **saftır** — I/O içermez, doğrudan test edilebilir.
`priceHistory.ts` ağ erişimi içerir ve bu ayrımı bilinçli olarak tek başına taşır.

`agent.ts` bilinçli olarak **saf** tutuldu: hiçbir I/O (localStorage, ağ) içermez, tüm veri
(portföy, geçmiş, hafıza, öğretilmiş bilgiler) parametre olarak geçirilir. Bu hem test etmeyi
kolaylaştırır hem de ileride bu dosyayı bir sunucu/LLM çağrısıyla değiştirmeyi basitleştirir
(bkz. "Gerçek AI'a geçiş" altında).

---

## Ajan — Nasıl Çalışıyor

Ajanın davranışı üç ayrı katmandan oluşuyor. Her biri farklı bir soruya cevap veriyor:

| Katman | Dosya | Soru | Kalıcı mı? |
|---|---|---|---|
| **Kısa süreli bağlam** | `App.tsx` (messages state) + `agent.ts` (intentId) | "Az önce ne konuştuk?" | Hayır — sekme/sayfa kapanınca sıfırlanır |
| **Uzun süreli bellek** | `agentMemory.ts` | "Bu kullanıcı genelde neyle ilgileniyor?" | Evet — `localStorage`, davranışı değiştirmez, yalnızca kişiselleştirir |
| **Eğitilebilir bilgi** | `agentTraining.ts` | "Kullanıcı bana ne öğretti?" | Evet — `localStorage`, davranışı DOĞRUDAN değiştirir |

### 1. `chatReply()` — Yanıt Önceliği (agent.ts)

Bir kullanıcı mesajı geldiğinde sırasıyla kontrol edilir (ilk eşleşen kazanır):

```
1. Öğretilmiş bilgi (agentTraining.findBestMatch)   ← kullanıcının öğrettiği her şey en yüksek öncelikte
2. Bellek sorgusu ("beni ne hatırlıyorsun")
3. Takip cümlesi ("devam et", "biraz daha anlat")   ← son konuşulan konuyu (intentId ile) genişletir
4. Grafik isteği (detectChartRequest)               ← "dağılımımı çiz", "yatırım grafiğim" vb.
5. En iyi/en kötü performans kıyaslaması
6. Genel niyet kuralları (CHAT_RULES — analiz, dağılım, risk, enflasyon, küçük sohbet…)
7. Varlık adıyla serbest arama (holdingLookupReply) ← "THYAO nasıl gidiyor"
8. Fallback — "anlayamadım" + öneriler
```

Yeni bir konu/kural eklemek için `agent.ts`'teki `CHAT_RULES` dizisine yeni bir `{ test: RegExp,
reply: (s) => string }` girişi eklemek yeterli. `id` alanı verirsen (`'analiz'`, `'dagilim'` gibi)
bu konu "takip cümlesi" ve "bellek" sistemleriyle de bağlantılı hale gelir.

### 2. Grafik Çizme

`agent.ts` üç grafik türü üretebilir (`ChartSpec` — `{ kind, title, data, dataKey, nameKey }`):

- `allocationChart` — pasta, sınıf dağılımı
- `investmentHistoryChart` — alan, net yatırım geçmişi (`store.investmentHistoryOf()` ile Panel'deki
  grafikle aynı veri kaynağını paylaşır)
- `pnlBarChart` — çubuk, varlık bazlı kâr/zarar

`App.tsx`'teki `AgentChartView` bunu sohbet balonu içinde Recharts ile render eder. Yeni bir grafik
türü eklemek için: (1) agent.ts'te veriyi üreten bir fonksiyon yaz, (2) `ChartSpec.kind`'a yeni bir
değer ekle, (3) `AgentChartView`'da o `kind` için bir render bloğu ekle.

**Türkçe dilbilgisi tuzağı:** "grafik" kelimesi iyelik ekiyle "grafiğimi" olur (ünsüz yumuşaması,
k→ğ). `detectChartRequest`'teki regex bu yüzden tam `grafik` yerine `graf` köküyle eşleşiyor. Yeni
Türkçe anahtar kelime eklerken bu tarz çekim farklarını unutma.

### 3. Uzun Süreli Bellek (`agentMemory.ts`)

Her sohbet turundan sonra `recordTurn(intentId, mentionedHoldingNames)` çağrılır ve şunları sayar:

- `topicCounts` — hangi `intentId` kaç kez tetiklendi
- `holdingMentions` — hangi varlık adı sohbette kaç kez geçti

Bu veri **yalnızca** karşılama mesajını kişiselleştirmek (`buildGreeting`) ve şeffaflık sorgusuna
("beni ne hatırlıyorsun") cevap vermek için kullanılır — ajanın asıl yanıt mantığını etkilemez.

### 4. Eğitilebilir Bilgi Tabanı (`agentTraining.ts`)

Kullanıcı Ajan sekmesindeki **"Ajanı Eğit"** panelinden bir soru + cevap girip öğretebilir.
Bu, `TrainedFact { id, question, answer, createdAt, timesUsed }` olarak saklanır ve `chatReply`'de
en yüksek öncelikle kontrol edilir (bkz. yukarıdaki tablo).

Eşleştirme `findBestMatch()` ile yapılır: önce tam metin eşleşmesi (normalize edilmiş), yoksa
kelime kümesi örtüşmesi (Jaccard benzerliği, eşik `0.5`). Bu **gerçek bir NLP/embedding modeli
değildir** — basit ama etkili bir kelime-örtüşmesi sezgiseli. Aynı soru tekrar öğretilirse eskisinin
üzerine yazılır (düzeltme akışı).

**Önemli — bu bir LLM eğitimi değildir.** Ortada güncellenen bir sinir ağı/model yok; kullanıcı
doğrudan sabit cevaplar ekliyor. Bu, klasik "uzman sistem" / örnek-tabanlı akıl yürütme desenidir.
UI'da ve "yardım" metninde bu açıkça belirtiliyor — yanlış beklenti yaratmamak önemli.

### 5. Geri Bildirim Döngüsü — 👍/👎

Her ratable ajan mesajının altında 👍/👎 butonları var (karşılama mesajı hariç):

- **👍** — eğer yanıt zaten öğretilmiş bir bilgiden geldiyse hiçbir şey yapmaz. Built-in bir kuraldan
  geldiyse, o soru-cevabı olduğu gibi öğretilmiş bilgiye **otomatik terfi ettirir** — bir sonraki aynı
  soru artık `findBestMatch` üzerinden (daha hızlı/kesin) gelir.
- **👎** — kaynağı ne olursa olsun (built-in kural ya da fallback), "Ajanı Eğit" panelini otomatik açar
  ve **Soru** alanını kullanıcının az önce sorduğu metinle önceden doldurur (`findPrecedingUserText`).
  Kullanıcı doğru cevabı yazıp öğretir — negatif geri bildirim doğrudan düzeltme akışına bağlanmış olur.
- Her mesaj yalnızca bir kez oylanabilir.

Bu, "beğenilen ad-hoc cevapları veri setine ekleyip modeli eğitmek" fikrinin anahtarsız/gerçekçi
karşılığıdır — **model eğitimi değil**, `agentTraining.ts`'e satır ekleme. Gerçek bir öğrenme
algoritması (RLHF, fine-tuning) burada yok; bu konudaki dürüstlük ilkesi diğer katmanlarla aynı.

### 6. Aksiyon Alma — Onayla/Vazgeç

Ajan artık salt bilgi vermekle kalmıyor, sohbette verilen bir komutu gerçekten uygulayabiliyor:
"THYAO'dan 500 TL sat" gibi bir mesaj yazarsan, ajan `detectTradeCommand()` ile bunu ayrıştırır ve
"Onaylıyor musun?" diye sorar. **Onayla**'ya basmadan hiçbir gerçek veri değişmez — `agent.ts` bu
akışta da saf kalır, `actions.addTxn` yalnızca `App.tsx`'teki `resolveAction()` içinde, onay sonrası
çağrılır. Tespit bilinçli olarak sıkı: tutar + tek anlamlı fiil (al/sat) + tam olarak bir varlıkla
eşleşme şart; biri eksikse normal soru-cevap akışına düşülür (yanlış negatif, verinin yanlışlıkla
değişmesinden çok daha güvenli). Onaylansa bile bakiye aşımı gibi durumlar İşlemler sekmesindekiyle
aynı kurala göre reddedilir.

---

## Gerçek AI'a Geçiş (henüz yapılmadı, planlı)

Şu an ajan tamamen kural tabanlı ve anahtarsız. Gerçek bir LLM'e (Anthropic API) bağlamak istersen:

1. Repo kökündeki `server/` klasörü zaten bir Anthropic proxy içeriyor (`server/ai.js`,
   `POST /api/ai/chat`) — Aura Finance projesi için yazıldı ama aynı desen FAGENT için de kullanılabilir.
2. `server/`'ı bir yere deploy et (Render/Railway/Fly.io) ve `ANTHROPIC_API_KEY`'i tanımla.
3. `agent.ts`'teki `chatReply()` çağrısını `App.tsx`'te bir `fetch('/api/ai/chat', ...)` ile
   değiştir (ya da `chatReply`'yi async yapıp önce yerel kuralları, bulunamazsa proxy'yi dene).
   `history`/`memory`/`trainedFacts` parametreleri zaten var — bunları LLM'e prompt bağlamı olarak
   geçirebilirsin (ör. "kullanıcı en çok X hakkında soruyor" gibi).
4. **Bu noktadan sonra istemci anahtarsız kalır ama arka planda artık bir sunucu + API maliyeti
   olur.** Kullanıcıya (sana) bu tradeoff önceden soruldu ve bu oturumda "anahtarsız yerel motor"
   seçildi — geri dönmek istersen yalnızca yukarıdaki adımlar gerekiyor.

**LangChain / AutoGen gibi çerçeveler** kendi başına "zeka" sağlamaz — bir LLM'i orkestra eden
kütüphanelerdir, LLM çağrısı olmadan işlevsizdirler. Yani bunları eklemek de 2. maddedeki gerçek
AI kararına bağlı; anahtarsız bir tarayıcı uygulamasında tek başlarına anlamları yok.

**RAG (Retrieval-Augmented Generation):** Gerçek RAG bir embedding modeli + vektör arama gerektirir
(API ya da ağır bir client-side model). Şu an `holdingLookupReply` + `agentTraining.findBestMatch`
zaten "anahtarsız RAG"ın basit karşılığı: anahtar kelime/kümesi tabanlı arama. Gerçek semantik arama
için ya bir embedding API'si (anahtar gerekir) ya da tarayıcıda çalışan bir embedding modeli
(transformers.js gibi — mümkün ama ağır ve karmaşık) gerekir.

---

## Veri Modeli Özeti

- `fagent.portfolio.v1` — `Holding[]` + `Txn[]` (bkz. `store.ts`)
- `fagent.agent.memory.v1` — kullanım istatistiği (bkz. `agentMemory.ts`)
- `fagent.agent.training.v1` — öğretilmiş soru-cevaplar (bkz. `agentTraining.ts`)

Sidebar'daki **SIFIRLA** üçünü de temizler.

## Bilinçli Sınırlar

- **Hisse/fon canlı fiyatı yok:** BIST/TEFAS için resmi/ücretsiz/anahtarsız bir kaynak yok
  (araştırıldı) — bu ikisi manuel-girişli kalıyor, sahte fiyat gösterilmiyor.
- **Altın canlı fiyatı yok:** Adayları (gold-api.com vb.) JSON şeması doğrulanamadığı için eklenmedi.
- Döviz/kripto canlı fiyatı Frankfurter.dev + CoinGecko ile çalışır (anahtarsız, CORS-açık).
- **Risk metrikleri portföyün tamamını kapsamaz:** tarihsel seri yalnızca canlı fiyata bağlı
  kripto/döviz için çekilebiliyor. Bu gizlenmez — risk raporu portföyün yüzde kaçını kapsadığını
  (`coveragePct`) ve kapsam dışı her varlığın nedenini arayüzde açıkça yazar.
- **Enflasyon oranı elle güncellenen bir varsayımdır** (anahtarsız/CORS-açık bir TÜİK ucu yok).
  Başlangıç değeri iki yerde tanımlı ve aynı tutulmalı: `App.tsx` → `DEFAULT_INFLATION_PCT`,
  `agent.ts` → `VARSAYILAN_ENFLASYON`. Kullanıcı arayüzden kendi oranını girebilir.

## Test Kapsamı

Playwright e2e testleri artık **repo içinde**: `fagent/tests/e2e/` — 18 dosya, **279 kontrol**.

```bash
npm run test:e2e     # Vite dev sunucusunu başlatır, tüm takımları sırayla çalıştırır
```

Kapsam: sidebar/nav, kâr-zarar muhasebesi, canlı fiyat bağlama, CSV içe/dışa aktarma, validasyon
kuralları (ad çakışması, bakiye aşımı), ajan sohbet/grafik, uzun süreli bellek, eğitilebilir bilgi
tabanı, geri bildirim döngüsü (👍/👎), aksiyon alma (Onayla/Vazgeç), proaktif içgörüler, finansal
analitik (reel getiri/XIRR/HHI), risk metrikleri, Kripto Piyasa sekmesi, projeksiyon.

**Yeni davranış eklerken ilgili takıma kontrol ekle.** Commit öncesi üç doğrulama da geçmeli:
`npm run typecheck` · `npm run build` · `npm run test:e2e`.

Detaylar için repo kökündeki `CLAUDE.md`'ye bakabilirsin (proje hafızası, her oturumda güncellenir).
