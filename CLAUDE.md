# depo-1 — Proje Hafızası

Bu repo iki bağımsız uygulama içerir. Gelecek oturumlarda çalışmaya buradan başla.

## 1. FAGENT — GÜNCEL SÜRÜM (öncelikli proje)

- **Konum:** `fagent/` (kendi package.json'ı olan bağımsız Vite + React + TS uygulaması)
- **Ne:** API anahtarı GEREKTİRMEYEN yatırımcı paneli — Panel, Bugün, Hisseler, Fonlar, Kripto Varlıklar (hepsi aynı `Panel` bileşeni, `assetType` prop'uyla tür filtresi), İşlemler, Projeksiyon, Demo Ajan (analiz + geniş kapsamlı sohbet + grafik çizme, yerel kurallar, `fagent/src/agent.ts` — bkz. 1.5)
- **Yerleşim:** sol sabit menü (Fintables'tan yerleşim ilhamı, `.sidebar`/`.side-nav`/`.side-link` — `fagent/src/index.css`), mobilde üstte yatay bara döner. Sidebar'da canlı arama kutusu (Panel/tür sekmeleri + İşlemler geçmişini filtreler, toplam tutarı etkilemez). AJAN linkinde "YENİ" rozeti. İşlemler sekmesinde her zaman görünür "Nasıl İşlem Eklerim?" rehber kartı var.
- **Bilinçli sınır — hisse/fon:** BIST hisse ve TEFAS fon verisi için resmi/ücretsiz/anahtarsız bir kaynak YOK (araştırıldı, 2026-07-12) — bulunanlar banka-özel API'ler, ücretli servisler ya da .gov.tr kazıyan kırılgan/ToS-riskli araçlar. Bu ikisi manuel-girişli kalmaya devam ediyor; sahte fiyat gösterilmeyecek.
- **Canlı fiyat — döviz/kripto:** `fagent/src/market.ts` — Frankfurter.dev (döviz, ECB günlük kur) ve CoinGecko genel ucu (kripto), ikisi de anahtarsız/CORS-açık. Varlık eklerken opsiyonel "Canlı Fiyata Bağla" kutusu (miktar + sembol seçilir), sonra varlık satırındaki yenile ikonuyla güncellenir. `Holding.quantity`/`symbol`/`lastFetchedAt` bu amaçla eklendi — tamamen opsiyonel, diğer türler etkilenmez. **Not:** bu kum havuzu ortamının ağ proxy'si dış API'lere erişimi engelliyor (netlify.app'te de aynı sorun); test edilirken `page.route()` ile ağ taklit edildi — gerçek ağ doğrulaması kullanıcının kendi tarayıcısında yapılmalı.
- **Kâr/Zarar takibi:** `Holding.costBasis` (maliyet) ile `amount` (güncel değer) ayrı tutulur. Alışta ikisi artar; satışta maliyet ağırlıklı ortalama yöntemiyle orantılı azalır. Güncel değeri kullanıcı `actions.updateHoldingValue()` ile KENDİSİ günceller (kalem ikonu) — otomatik fiyat çekilmez. Eski (costBasis'siz) localStorage verisi yüklenirken otomatik göç eder (`fagent/src/store.ts` → `load()`).
- **CSV dışa/içe aktarma:** `fagent/src/csv.ts` — Varlıklar ve İşlemler dışa aktarılır (Panel/İşlemler kartlarındaki "CSV" butonu); Varlıklar için içe aktarma da var ("İçe Aktar" butonu, `parseHoldingsCsv` + `actions.importHoldings` — mevcut varlıklara ekler, üzerine yazmaz, hem eksik/geçersiz satırları hem isim çakışmalarını ayrı ayrı sayıp raporlar).
- **Denenip eklenmeyen:** Altın için canlı fiyat (gold-api.com vb.) — JSON şeması bu ortamdan doğrulanamadığı (ağ engelli) için "hatasız kodlama" gereği eklenmedi. İleride API şeması netleşirse `market.ts`'e aynı desenle eklenebilir.
- **Net Yatırım Tutarı Geçmişi grafiği:** Panel'de, yalnızca kendi işlem geçmişinden (piyasa fiyatı YOK) türetilen kümülatif çizgi grafik — "ne kadar yatırdın" gösterir, "portföyün ne kadar değerdeydi" değil. `actions.addHolding` artık örtük bir 'alış' işlem kaydı da düşüyor (önceden Panel'den varlık eklemek İşlem Geçmişi'nde görünmüyordu — düzeltildi).
- **Veri:** yalnızca tarayıcıda (`localStorage`, anahtar: `fagent.portfolio.v1`)
- **Korunan sürüm:** `fagent-stable` dalı = commit `e753c56` (fagent v1.0.0, sol menü öncesi). Bu dalı silme/üzerine yazma — `main` bundan sonra da güncellenmeye devam edebilir.
- **Canlı site hedefi:** https://fagentai.netlify.app (kullanıcının Netlify hesabı)
- **Netlify ayarları:** Base directory `fagent` · Build command `npm run build` · Publish directory `fagent/dist`
- **Geliştirme:** `cd fagent && npm install && npm run dev` · doğrulama: `npm run typecheck && npm run build`
- Kullanıcının Bolt'ta yaptığı orijinal FAGENT'a erişilemedi; bu, ekran görüntüsüne sadık sıfırdan yazımdır.

### 1.1 Veri modeli (`fagent/src/store.ts`)

- `Holding`: `id`, `name`, `type` (`hisse|fon|doviz|altin|kripto|mevduat`), `amount` (güncel değer, TL), `costBasis` (net yatırılan tutar, TL), opsiyonel `quantity`/`symbol`/`lastFetchedAt` (yalnızca canlı fiyata bağlı döviz/kripto).
- `Txn`: `id`, `date` (yerel takvim günü, `YYYY-MM-DD`), `holdingId` (KESİN eşleşme — hangi varlığa ait olduğunu isimle değil ID ile belirler), `holdingName` (işlem anındaki ad; varlık silinse/adı değişse de bu kayıt sabit kalır — muhasebe defteri mantığı), `kind` (`alis|satis`), `amount`.
- `todayLocalDate()` / `localDateString()`: UTC değil, kullanıcının kendi yerel takvim günü döner — `toISOString().slice(0,10)` gece yarısına yakın (TR UTC+3) yanlış günü verirdi; tüm tarih üretimi (Bugün sekmesi dahil) bunu kullanır.
- Ad çakışması karşılaştırması `normalizeName()` ile büyük/küçük harf ve baş/son boşluk duyarsız yapılır (`'tr-TR'` locale).

### 1.2 `actions` — davranış sözleşmesi

- `addHolding(name, type, amount, quantity?, symbol?)`: yeni varlık + örtük `alis` işlem kaydı oluşturur (İşlem Geçmişi ve Net Yatırım grafiği için). Ad tekilliğini KENDİSİ kontrol ETMEZ — çağıran (UI) önce `holdingNameExists()` ile kontrol etmeli.
- `holdingNameExists(name)`: ad çakışması var mı (case-insensitive) — Panel'in "Ekle" formu bunu submit öncesi kontrol eder, çakışma varsa `nameError` gösterip `addHolding` çağrılmaz.
- `importHoldings(rows)`: `{ imported, duplicates }` döner. Mevcut varlıklarla VE aynı dosya içindeki tekrarlarla çakışan satırlar atlanır ve `duplicates` sayılır (satır bazlı geçersizlik — `parseHoldingsCsv`'nin `skipped`'i — ayrı sayılır, ikisi UI'da ayrı ayrı raporlanır).
- `removeHolding(id)`: varlığı siler, ilişkili işlem kayıtları geçmişte kalır (silinmez).
- `updateHoldingValue(id, newAmount)`: kullanıcının elle girdiği güncel değer — maliyeti değiştirmez, `lastFetchedAt`'e dokunmaz, `newAmount < 0` ise 0'a clamp edilir.
- `applyLivePrice(id, newAmount)`: canlı kaynaktan (market.ts) çekilen değer — `lastFetchedAt`'i günceller, yalnızca `quantity`/`symbol`'ü olan varlıklarda UI tarafından çağrılır.
- `addTxn(holdingId, kind, amount)`: **holdingId ile eşleşir, isimle DEĞİL** — iki varlık aynı adı taşısa bile karışmaz. Varlık o sırada silinmişse sessizce no-op (savunma amaçlı `if (!holding) return`). UI, `kind==='satis'` için `amount > holding.amount` durumunu ÖNCEDEN kontrol edip engellemeli (store bunu clamp eder ama UI'da "Bakiyeyi aşamaz" hatası göstermek daha doğru UX) — bkz. `Islemler` bileşeni. Alışta `amount`+`costBasis` birlikte artar; satışta `amount` düşer, `costBasis` kalan pozisyon oranına göre orantılı azaltılır (ağırlıklı ortalama maliyet — kâr/zarar YÜZDESİ satıştan etkilenmez).

### 1.3 UI validasyon kuralları (`fagent/src/App.tsx`)

- **Panel — varlık ekleme:** ad boşsa veya tutar `<= 0`/sayı değilse "Ekle" devre dışı. Ad, mevcut bir varlıkla (case-insensitive) çakışıyorsa kırmızı `nameError` gösterilir ve ekleme engellenir; ad alanı değiştirildiğinde hata temizlenir. `h-name`/`h-amount` alanlarında Enter tuşu da "Ekle"yi tetikler.
- **İşlemler — yeni işlem:** varlık seçimi artık `<select>` `value`'sunda **holdingId** taşır (isim değil — aynı isimli iki varlık olsa da doğru olana uygulanır). `kind==='satis'` iken girilen tutar seçili varlığın güncel `amount`'ını aşarsa kırmızı "Bakiyeyi aşamaz — …" hatası gösterilir ve `actions.addTxn` ÇAĞRILMAZ; `t-amount` input'unda satışta native `max` de seçili varlığın tutarına ayarlanır. `t-amount` alanında Enter "Kaydet"i tetikler.
- **Canlı fiyata bağlama:** `h-live-qty` alanında Enter, "Hesapla ve Doldur"u tetikler.
- **CSV içe aktarma:** `csv.ts`'de başlık satırı algılama artık TAM eşleşmeye dayanır (`parseCsvLine(lines[0])[0]` birebir `'varlık'` mı) — önceki `/varlık/i.test(lines[0])` gevşek alt-metin eşleşmesi, adı "Varlık" geçen bir varlık başlıksız dosyanın ilk satırı olduğunda onu yanlışlıkla başlık sayıp atlayabilirdi; artık yalnızca ilk hücre birebir "varlık" ise (case/boşluk-duyarsız) başlık kabul edilir.
- **Bugün sekmesi:** "bugün" tanımı `todayLocalDate()` ile hesaplanır (yerel takvim günü) — UTC tabanlı eski hesap gece yarısına yakın saatlerde yanlış günü gösterebiliyordu.

### 1.5 Demo Ajan — sohbet motoru (`fagent/src/agent.ts`)

Kullanıcı isteği üzerine ("sadece analiz yapan değil, seninle konuştuğum gibi konuşmak istiyorum") ajan, anahtarsız kalacak şekilde genişletildi. Gerçek bir LLM'e (Anthropic API) bağlamak da bir seçenekti ama kullanıcıya bunun kendi API anahtarını + `server/` proxy'sinin bir yere (Render/Railway) deploy edilmesini + mesaj başına gerçek para maliyetini gerektireceği soruldu; kullanıcı yerel motorun daha da geliştirilmesini seçti (2026-07-12). "GitHub'da buna benzer kendi kendini geliştiren bir ajan" için link verilmedi — spesifik olmayan bir repoyu tahmin ederek çekmek güvenli olmadığından entegre edilmedi; link gelirse ayrıca değerlendirilir.

- **Niyet algılama:** `chatReply(s, userText, history)` artık `AgentReply` (`{ text, chart?, intentId? }`) döner. Sırayla kontrol edilir: takip cümlesi → grafik isteği → en iyi/en kötü kıyaslama → genel niyet kuralları (`CHAT_RULES`, artık küçük sohbet: merhaba/teşekkür/görüşürüz/yardım dahil) → varlık adıyla serbest arama → fallback.
- **Bağlam hafızası (kısa süreli):** Her `AgentMessage`'a opsiyonel `intentId` etiketlenir (`analiz`, `dagilim`, `grafik-dagilim`, `grafik-yatirim`, `grafik-pnl`). Kullanıcı "devam et / biraz daha anlat / detaylandır / peki" gibi bir takip cümlesi yazarsa, `lastIntentFrom(history)` son etiketlenmiş ajan mesajını bulur ve o konuyu genişletir (metin tekrar analiz üretir ya da aynı grafiği büyütür). Konuşma geçmişi App.tsx'te zaten tutulan `messages` state'inden geçirilir — ayrı bir depolama yok.
- **Varlık bazlı sorgular:** `holdingLookupReply` kullanıcı serbest metinde bir varlık adı geçiyorsa (ör. "THYAO nasıl gidiyor") o varlığın güncel değer/maliyet/kâr-zarar durumunu döner. `bestWorstReply` "en çok kazandıran/kaybettiren ne" gibi sorularda kâr/zarar yüzdesine göre en iyi/en kötü varlığı bulur.
- **Sohbet içinde grafik çizme:** `detectChartRequest` kullanıcı "grafik/çiz/görselleştir/pasta" gibi bir kelime kullandığında üç türden birini üretir: `allocationChart` (pasta, sınıf dağılımı), `investmentHistoryChart` (alan, net yatırım geçmişi — `store.ts`'teki paylaşılan `investmentHistoryOf()` ile Panel'deki aynı grafikle birebir aynı veriyi kullanır, veri tekrarı yok), `pnlBarChart` (çubuk, varlık bazlı kâr/zarar — yeni, yalnızca ajanda var). Sonuç `ChartSpec` olarak mesaja eklenir; `App.tsx`'teki `AgentChartView` bunu sohbet balonu içinde Recharts ile render eder (`.msg-agent` içinde sabit 260px genişlikte, `ResponsiveContainer` küçülmesin diye).
- **Kritik dilbilgisi notu:** Türkçe iyelik eki "grafik" kelimesini ünsüz yumuşamasıyla "grafiğimi/grafiğini" yapar (k→ğ) — bu yüzden regex'ler tam `grafik` yerine `graf` köküyle eşleşir. Yeni Türkçe anahtar kelime eklerken bu tür kök/çekim farklarını e2e testiyle doğrulamadan varsayma.
- Gerçek AI'a geçiş planı (`server/`) değişmedi — bu motor, ileride `/api/ai/chat` proxy'sine geçilene kadarki anahtarsız varsayılan olmaya devam ediyor; `chatReply`'nin imzası (`s, userText, history, memory?`) gerçek AI çağrısına da taşınabilir (history ve memory zaten var).

### 1.6 Uzun süreli ajan belleği (`fagent/src/agentMemory.ts`)

Kullanıcı "GitHub'da buna benzer kendi kendini geliştiren bir ajan vardı" diyerek Microsoft'un "AI Agents for Beginners" dersinin 13. bölümünü (Ajan Belleği, Türkçe çeviri metni) paylaştı. O ders Mem0/Cognee/Azure AI Search gibi API anahtarı + sunucu gerektiren araçları anlatıyor — FAGENT'ın anahtarsız ilkesiyle doğrudan çelişiyor. Bunun yerine dersteki KAVRAM (gözlemle → çıkar → kalıcı depola → gelecekte kullan, "insight agent" deseni) tamamen yerel/kuralsal biçimde uygulandı:

- **Kısa süreli bellek** (dersteki "session" karşılığı): App.tsx'teki `messages` state'i + her mesajın `intentId` etiketi — yalnızca o sekme oturumu boyunca yaşar, sayfa yenilenince sıfırlanır (zaten 1.5'te vardı).
- **Uzun süreli + öğe (entity) belleği** (yeni): `agentMemory.ts`, `localStorage` anahtarı `fagent.agent.memory.v1` altında `{ topicCounts, holdingMentions, totalTurns, firstSeenAt, lastSeenAt }` saklar. `recordTurn(intentId, mentionedHoldingNames)` her sohbet turundan sonra çağrılır (App.tsx'teki `send()`/`runAnalysis()`); `extractMentionedHoldings()` (agent.ts) kullanıcı metninde geçen varlık adlarını çıkarır.
- **Kişiselleştirilmiş karşılama:** `buildGreeting(memory)` (agent.ts) — 3+ tur biriktiren dönen kullanıcıyı "Tekrar merhaba! ... en çok X hakkında konuşmuştuk" diyerek karşılar; ilk ziyarette ya da az geçmişte varsayılan karşılamaya düşer.
- **Şeffaflık:** kullanıcı "beni ne hatırlıyorsun" / "hakkımda ne biliyorsun" yazarsa `memoryQueryReply` profildeki en çok sorulan konuyu + en çok bahsedilen varlığı döner ve bunun yalnızca tarayıcıda saklandığını açıkça belirtir (KVKK'ya bu repodaki genel yaklaşımla tutarlı — bkz. Aura Finance bölümü).
- **SIFIRLA tutarlılığı:** Sidebar'daki "SIFIRLA" (portföyü sıfırlayan `actions.reset()`) artık `agentMemory.resetMemory()`'yi de çağırıyor — tam veri sıfırlama beklentisiyle tutarlı, kalıntı davranış profili bırakmıyor.
- Bu katman `chatReply`'den ayrı, saf olmayan (localStorage'a dokunan) tek modül — `agent.ts` hâlâ test edilebilir/saf kalıyor, `chatReply`'ye `memory?: AgentMemoryProfile` opsiyonel parametre olarak geçiliyor.

### 1.8 Eğitilebilir bilgi tabanı (`fagent/src/agentTraining.ts`)

Kullanıcı "kendi kendini geliştirsin ve o yapay zekayı eğitmek istiyorum" dedi — 1.6'daki uzun süreli bellek yalnızca KULLANIM İSTATİSTİĞİ tutuyordu (ajanın davranışını değiştirmiyordu). Bu katman farklı: kullanıcının doğrudan öğrettiği soru-cevap çiftlerini saklar ve bunlar ajanın GERÇEK yanıtlarını değiştirir. Dürüstlük notu: bu bir LLM eğitimi/ağırlık güncellemesi değildir — klasik "uzman sistem" / örnek-tabanlı eşleştirmedir (kelime örtüşmesi / Jaccard benzerliği); UI'da ve `chatReply`'nin "yardım" metninde bu açıkça belirtilir.

- **Veri modeli:** `TrainedFact { id, question, answer, createdAt, timesUsed }`, `localStorage` anahtarı `fagent.agent.training.v1`.
- **Öğretme akışı:** Ajan sekmesinde katlanır/açılır "Ajanı Eğit" paneli (`TeachPanel`, `App.tsx`) — soru + cevap girilip "Öğret"e basılır. Aynı soru (normalize edilmiş — büyük/küçük harf ve noktalama duyarsız) tekrar öğretilirse ESKİSİNİN ÜZERİNE YAZILIR (düzeltme akışı, `teach()` içinde `normalize(f.question) === normalize(q)` kontrolü).
- **Eşleştirme ve öncelik:** `findBestMatch()` (agentTraining.ts, SAF fonksiyon — I/O yok) önce tam normalize eşleşmeye, yoksa kelime kümesi Jaccard benzerliğine (`MATCH_THRESHOLD = 0.5`) bakar. `chatReply()`'de (agent.ts) bu kontrol **built-in kurallardan (CHAT_RULES, grafik, analiz, vb.) hatta küçük-sohbet kurallarından bile ÖNCE** çalışır — kullanıcı "merhaba" gibi var olan bir kalıbı bile yeniden öğretip ezebilir. Bu bilinçli bir tasarım: kullanıcının öğrettiği şey davranışı gerçekten değiştirmeli, yoksa "eğitim" anlamsız olurdu.
- **Kullanım sayacı:** Her öğretilen bilgi kullanıldığında `recordFactUse(id)` çağrılır (App.tsx `send()` içinde, `reply.trainedFactId` doluysa) ve panel state'i (`setFacts(getTrainedFacts())`) yeniden okunur — bu adım atlanırsa sayaç DB'de artar ama panelde eskisi görünür (geliştirme sırasında yakalanan gerçek bir bug, düzeltildi).
- **Silme + SIFIRLA:** Panelden tek tek silinebilir (`deleteFact`); sidebar'daki SIFIRLA artık `resetTraining()`'i de çağırıyor (1.6'daki `resetMemory()` ile birlikte) — tam veri sıfırlama üç katmanı da (portföy + kullanım istatistiği + öğretilen bilgi) temizliyor.
- `agent.ts` hâlâ saf/test edilebilir: `chatReply(s, userText, history, memory?, trainedFacts?)` — trainedFacts dışarıdan (App.tsx, `getTrainedFacts()` ile) geçiriliyor, agent.ts içinde localStorage'a hiç dokunulmuyor.

### 1.9 Test kapsamı (scratchpad, kalıcı repo dosyası değil)

`fagent-sidebar-e2e.mjs`, `fagent-nav-e2e.mjs`, `fagent-pnl-e2e.mjs`, `fagent-live-e2e.mjs` (ağ `page.route()` ile taklit), `fagent-import-e2e.mjs`, `fagent-chart-e2e.mjs`, `fagent-validation-e2e.mjs` (ad çakışması engelleme + bakiye-aşımı engelleme testleri), `fagent-agent-e2e.mjs` (küçük sohbet, varlık bazlı sorgu, en iyi/kötü kıyaslama, üç grafik türünün sohbet içinde DOM'a çizildiğinin doğrulanması, bağlam hafızası/takip cümlesi, fallback), `fagent-memory-e2e.mjs` (localStorage'a yazma, konu/varlık sayaçları, sayfa yenileme sonrası kişiselleştirilmiş karşılama, SIFIRLA'nın hafızayı da temizlemesi), `fagent-teach-e2e.mjs` (öğretme, fuzzy eşleşme, düzeltme/üzerine yazma, built-in kuralın önüne geçme, kullanım sayacı, silme, SIFIRLA'nın öğretilen bilgiyi de temizlemesi) — Playwright + `/opt/pw-browsers/chromium`, toplam 132 kontrol. Yeni bir davranış eklenince ilgili dosyaya test eklenmeli; store.ts'in genel API'si (`actions.*`) değişirse tüm dosyalar taranıp stale selector/mesaj metni kontrol edilmeli (örnek: `#t-holding option value` isimden ID'ye geçince `page.selectOption(..., { label })` kullanan testler etkilenmedi ama `value` ile seçen olsaydı kırılırdı).

## 2. Aura Finance (BDT günlüğü + abonelik demosu)

- **Konum:** repo kökü (`src/`) + `server/`
- İstemci: Dashboard, Eğitim, BDT Günlüğü (AI yeniden çerçeveleme), `/pricing` (demo abonelik, günde 3 AI hakkı), `/admin` (x-admin-key ile metrikler)
- Backend yokken de tamamen çalışır (yerel demo yanıtlar) — statik yayına uygun.

## Background/Sunucu Scripti (`server/` — İLERİDE LAZIM)

Express sunucusu; şu an yayında kullanılmıyor ama **gerçek AI'a geçişte devreye girecek**:

- `server/index.js` — uçlar: `POST /api/auth/session` (anonim JWT), `POST /api/ai/chat`
  (Anthropic proxy; anahtar yalnızca `.env`'de), `POST /api/events`, `GET /api/metrics/me`,
  `GET /api/admin/metrics`. Rate limit: AI 10/dk, olaylar 60/dk.
- `server/ai.js` — Anthropic çağrısı (`claude-opus-4-8`), girdi doğrulama, anahtarsızsa demo yanıt.
- `server/analytics.js` — KVKK-uyumlu beyaz listeli olay kaydı (JSONL) + metrik hesapları.
- Çalıştırma: `cp .env.example .env` doldur → `npm run server` (kökten).
- FAGENT'a gerçek AI eklemek için plan: bu sunucuyu Render/Railway'e koy,
  `fagent/src/agent.ts` içindeki `analyzePortfolio`/`chatReply` çağrılarını
  `/api/ai/chat` proxy çağrısıyla değiştir; anahtar yoksa mevcut yerel kurallara düş.

## Kurallar

- Model: `claude-opus-4-8` (server/ai.js, `AI_MODEL` env ile değiştirilebilir)
- API anahtarları asla istemci koduna girmez; istemci her zaman anahtarsız da çalışmalı.
- Analitik asla serbest metin loglamaz (KVKK) — `server/analytics.js` beyaz listesi.
