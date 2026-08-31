# depo-1 — Proje Hafızası

Bu repo **üç bağımsız uygulama** içerir. Gelecek oturumlarda çalışmaya buradan başla.

- **`fagent/`** — tarayıcıda çalışan, anahtarsız yatırımcı paneli (bölüm 1)
- **`src/` + `server/`** — Aura Finance, BDT günlüğü demosu (bölüm 2)
- **`jarvis/`** — 7/24 sunucuda yaşayan Telegram finansal asistanı (bölüm 3, EN YENİ)

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

### 1.9 Geri bildirim döngüsü — 👍/👎 (`App.tsx` + `agentTraining.ts`)

Kullanıcı gerçek "sürekli gelişen ajan" için endüstri standardı adımları (geribildirim döngüsü, sentetik veri, RAG, LangChain/AutoGen) paylaştı; bunlardan yalnızca geribildirim döngüsü anahtarsız mimariyle uyumluydu (diğerleri LLM/API/sunucu gerektiriyor — bkz. `fagent/README.md` "Gerçek AI'a geçiş" bölümü), o yüzden yalnızca bu uygulandı.

- **`AgentMessage`/`AgentReply`'ye eklenenler:** `trainedFactId?`, `isFallback?` (yalnızca gerçek "anlayamadım" ve takip-cümlesi-başarısız yanıtlarında `true`), `ratable?` (karşılama mesajı hariç tüm `chatReply`/`analyzePortfolio` çıktılarında `true`), `rated?: 'up' | 'down'`.
- **👍 davranışı:** Eğer yanıt zaten öğretilmiş bir bilgiden (`trainedFactId`) ya da fallback'ten geldiyse hiçbir şey yapmaz (yapacak bir "terfi" yok / terfi ettirilecek doğru bir cevap yok). Built-in bir kuraldan geldiyse (`agentTraining.teach()` ile) o soru-cevabı OLDUĞU GİBİ öğretilmiş bilgiye terfi ettirir — bir sonraki aynı soru artık `findBestMatch` üzerinden gelir. Bu, "beğenilen ad-hoc cevapları otomatik veri setine ekleme" fikrinin anahtarsız/gerçekçi karşılığı — **model eğitimi değil**, veritabanına satır ekleme.
- **👎 davranışı:** Kaynağı ne olursa olsun (built-in kural ya da fallback), `Ajan` bileşenindeki `teachOpen`/`teachQ`/`teachA` state'ini kaldırıp `TeachPanel`'i KONTROLLÜ hale getirdi (`open`/`q`/`a` artık prop) — 👎 tıklanınca panel otomatik açılır, `Soru` alanı `findPrecedingUserText()` ile bulunan kullanıcı mesajıyla, `Cevap` alanı (öğretilmiş bir bilgiyse mevcut metinle, değilse boş) önceden doldurulur. Kullanıcı doğru cevabı yazıp "Öğret"e basar — bu, negatif geri bildirimi doğrudan düzeltme akışına bağlar.
- Her mesaj yalnızca BİR KEZ oylanabilir (`rated` set edildikten sonra butonlar `disabled`, tıklanan yön renkli/dolu, diğeri soluk kalır).
- `agent.ts` hâlâ saf: fallback'i işaretlemek dışında `chatReply`'nin imzası değişmedi.

### 1.10 Ajan aksiyon alma — Onayla/Vazgeç (`agent.ts` + `App.tsx`)

"En büyük eksik ajan sadece konuşuyor, hiçbir şey yapmıyor" tespitinden sonra eklendi. Kullanıcı
sohbette "THYAO'dan 500 TL sat" gibi bir komut yazarsa, ajan gerçekten `actions.addTxn` çağırabilir —
ama yalnızca kullanıcı açıkça onayladıktan sonra.

- **`detectTradeCommand()`** (agent.ts, SAF fonksiyon): tutar (`\d[\d.,]*` + opsiyonel "TL"/"₺") + tam
  olarak bir alış/satış fiili (`al|alış|ekle|alayım` / `sat|satış|satayım`) + metinde TAM OLARAK bir
  varlık adının geçmesi gerekir. Herhangi biri eksik/belirsizse (0 ya da >1 varlık eşleşmesi, fiil yok
  ya da ikisi birden var) `undefined` döner ve normal soru-cevap akışına düşülür — yanlış negatif,
  yanlış pozitiften (verinin yanlışlıkla değişmesi) çok daha güvenli kabul edildi.
- **`AgentReply`/`AgentMessage`'a eklenen `pendingAction?: PendingAction`** (`{ kind, holdingId,
  holdingName, amount }`) ve `actionResolved?: 'confirmed' | 'cancelled'`. `chatReply` bu durumda
  **hiçbir gerçek veri değiştirmez** — yalnızca "Bunu yapmak istediğini anladım, onaylıyor musun?"
  metnini ve `pendingAction`'ı döner; `agent.ts` bu haliyle de saf/test edilebilir kalıyor.
- **`App.tsx`'teki `resolveAction()`:** Onayla'ya basınca İşlemler sekmesindekiyle BİREBİR aynı
  güvenlik kontrolü uygulanır (varlık hâlâ var mı, `satis` tutarı güncel değeri aşıyor mu) — aşıyorsa
  onaylansa bile reddedilir ("Bakiyeyi aşamaz..."). Geçerliyse `actions.addTxn` çağrılır ve güncel
  değeri içeren bir onay mesajı eklenir. Vazgeç'e basınca hiçbir `actions.*` çağrısı yapılmaz.
- Her öneri yalnızca BİR KEZ çözümlenebilir (`actionResolved` set edilince butonlar `disabled`).
  `pendingAction` içeren mesajlarda `ratable` false'a çekilir (👍/👎 yerine Onayla/Vazgeç gösterilir).

### 1.11 Test kapsamı (scratchpad, kalıcı repo dosyası değil)

`fagent-sidebar-e2e.mjs`, `fagent-nav-e2e.mjs`, `fagent-pnl-e2e.mjs`, `fagent-live-e2e.mjs` (ağ `page.route()` ile taklit), `fagent-import-e2e.mjs`, `fagent-chart-e2e.mjs`, `fagent-validation-e2e.mjs` (ad çakışması engelleme + bakiye-aşımı engelleme testleri), `fagent-agent-e2e.mjs` (küçük sohbet, varlık bazlı sorgu, en iyi/kötü kıyaslama, üç grafik türünün sohbet içinde DOM'a çizildiğinin doğrulanması, bağlam hafızası/takip cümlesi, fallback), `fagent-memory-e2e.mjs` (localStorage'a yazma, konu/varlık sayaçları, sayfa yenileme sonrası kişiselleştirilmiş karşılama, SIFIRLA'nın hafızayı da temizlemesi), `fagent-teach-e2e.mjs` (öğretme, fuzzy eşleşme, düzeltme/üzerine yazma, built-in kuralın önüne geçme, kullanım sayacı, silme, SIFIRLA'nın öğretilen bilgiyi de temizlemesi), `fagent-feedback-e2e.mjs` (👍 ile otomatik terfi, 👎 ile önceden dolu Eğit paneli açma, fallback'te de oylama, tek-seferlik oylama kilidi), `fagent-action-e2e.mjs` (onaylanan işlemin gerçekten uygulanması, vazgeçilenin uygulanmaması, bakiye aşımının onaya rağmen reddi, belirsiz komutların normal cevaba düşmesi) — Playwright + `/opt/pw-browsers/chromium`, toplam 154 kontrol. Yeni bir davranış eklenince ilgili dosyaya test eklenmeli; store.ts'in genel API'si (`actions.*`) değişirse tüm dosyalar taranıp stale selector/mesaj metni kontrol edilmeli (örnek: `#t-holding option value` isimden ID'ye geçince `page.selectOption(..., { label })` kullanan testler etkilenmedi ama `value` ile seçen olsaydı kırılırdı).

## 2. Aura Finance (BDT günlüğü + abonelik demosu)

- **Konum:** repo kökü (`src/`) + `server/`
- İstemci: Dashboard, Eğitim, BDT Günlüğü (AI yeniden çerçeveleme), `/pricing` (demo abonelik, günde 3 AI hakkı), `/admin` (x-admin-key ile metrikler)
- Backend yokken de tamamen çalışır (yerel demo yanıtlar) — statik yayına uygun.

## 3. FİNANSAL JARVİS (`jarvis/`) — sunucu tarafı asistan

- **Konum:** `jarvis/` (kendi package.json'ı, kendi Docker yığını olan bağımsız Node+TS projesi)
- **Ne:** Kullanıcının isteği (2026-08-31): ["Kendime Jarvis Yaptım!"](https://www.youtube.com/watch?v=Tx9Tdf3m-ME)
  videosundaki gibi 7/24 sunucuda yaşayan kişisel asistan — ama **yalnızca finansal versiyonu**.
  Kullanıcı açıkça belirtti: "fagent bambaşka bir proje bu da bambaşka bir proje olacak."
  **`fagent/`'tan HİÇBİR dosya import edilmez, hiçbir kod paylaşılmaz.**
- **Kullanıcının seçtiği mimari (soruldu, cevaplandı):** Telegram botu · VPS'te **yerel Ollama
  modeli** (API anahtarı yok) · Docker ile her yere kurulabilir · **kayıt + plan + alarm,
  gerçek borsa emri YOK**.
- **FAGENT'tan ayrıldığı nokta:** FAGENT tarayıcıda çalıştığı için (a) kullanıcı sekmeyi
  açmazsa çalışmaz, (b) CORS yüzünden BIST/TEFAS verisine erişemez. Jarvis sunucuda
  yaşadığı için ikisi de çözülüyor. FAGENT'ın en büyük kısıtı burada mimari olarak yok.

### 3.1 Temel tasarım kararı — deterministik çekirdek, dil katmanı sadece "deri"

Kullanıcı beyin olarak yerel Ollama modelini seçti. Küçük yerel modeller **sayı uydurur**.
Bu yüzden sorumluluk keskin ayrıldı ve bu kural PAZARLIKSIZ:

- `src/core/` ve `src/data/` — tüm finans matematiği ve veri. **LLM'e hiç bağlı değil.**
- `src/brain/` — model YALNIZCA iki iş yapar: (a) serbest Türkçe → JSON niyet, (b) hazır
  taslağı doğallaştırma. **Asla aritmetik yapmaz, asla rakam üretmez.**

Modelin uydurmasına karşı üç somut kilit (`nlu.ts` + `nlg.ts`, hepsi testli):
1. Model portföyde olmayan bir varlık adı üretirse niyet düşürülür.
2. İşlem/alarm/dengeleme tutarı kullanıcının KENDİ cümlesinde geçmiyorsa niyet düşürülür
   (`amountIsGrounded`). "5000 TL sattım" cümlesinden 50.000 üreten model defteri bozamaz.
3. Doğallaştırılmış metin, taslakta olmayan bir sayı içeriyorsa reddedilir (`isSafeRewrite`).

`llm.ts`'te devre kesici var: 3 ardışık hatadan sonra dil katmanı 5 dakika devre dışı kalır,
yanıtlar anında kural tabanlı yoldan gelir. Ollama tamamen kapalıyken Jarvis eksiksiz çalışır.

### 3.2 Veri kaynakları (hepsi anahtarsız, sunucu tarafı)

| Varlık | Kaynak | Kritik ayrıntı |
| --- | --- | --- |
| Döviz | TCMB `today.xml` (resmî) | `<Unit>` her zaman 1 DEĞİL — JPY'de 100. Bölünmezse yen 100 kat pahalı görünür (testli) |
| BIST | Yahoo Finance chart ucu (`THYAO.IS`) | Resmî değil; TRY dışı para birimi gelirse reddedilir |
| Fon | `tefas.gov.tr/api/DB/BindHistoryInfo` | Resmî değil; Referer + X-Requested-With başlığı şart; 10 günlük pencere (bayram tatili için) |
| Kripto | CoinGecko genel uç | Hız sınırı gerçek sorun → TEK toplu istek + kalıcı önbellek |
| Altın | ons ÷ 31,1034768 × USD/TRY | Türetilmiş, spot. Çeyrek/tam altın primi UYDURULMAZ |

**SAHTE VERİ YOK** (FAGENT'tan devralınan kural): kaynak düşerse `DataError`, tahmini fiyat yok.
Önbellekten dönen değer her zaman `stale: true` ile işaretlenir ve kullanıcıya "eski veri" denir.

> **Bu uçların hiçbiri geliştirme ortamından doğrulanamadı** — sandbox'ın ağ politikası
> hepsini 403'lüyor. `npm run doctor` tam olarak bunun için yazıldı: gerçek doğrulama
> kullanıcının makinesinde oluyor. Şema sapması çıkarsa düzeltme tek dosyayla sınırlı.

### 3.3 Muhasebe sözleşmesi (`core/portfolio.ts`)

- İşlemler **holdingId ile eşleşir, isimle DEĞİL**; işlem kaydına o anki ad da yazılır
  (`holding_name`) — varlık silinse de defter okunabilir kalır.
- **Ağırlıklı ortalama maliyet:** satışta maliyet kalan pozisyon oranında azalır → kısmi
  satış kâr/zarar YÜZDESİNİ değiştirmez (testli).
- Bakiyeyi aşan satış **sessizce kırpılmaz**, hata fırlatır. Sessiz kırpma kullanıcının
  defterini gerçeklikten koparırdı.
- Tarih üretimi `localDateString(date, timezone)` ile — `toISOString()` UTC verir ve
  konteyner UTC'de çalıştığı için TSİ gece yarısından sonra yazılan işlem düne düşerdi.

### 3.4 Türkçe regex tuzağı (GERÇEK BİR HATA — tekrar etme)

JavaScript'in `\b` sınırı **ASCII'dir**: `ç ğ ı ö ş ü` harflerini kelime karakteri saymaz.
Sonuç: `/\bçıkarsa\b/` Türkçe metinde **eşleşmez**, `/\bgeçmiş\b/` "geçmiş" kelimesini
bulamaz — ve hiçbir hata vermez, sadece sessizce çalışmaz. Aşama 2'de 5 komut bu yüzden
bozuktu, testler yakaladı.

Çözüm: `src/brain/parse.ts` içindeki `stemRe()` (baş sınırlı, son serbest — Türkçe sondan
eklemeli) ve `wordRe()` (iki taraf sınırlı). **Yeni kalıp yazarken `\b` KULLANMA.**
Hatanın kendisi `tests/brain.test.ts`'te regresyon testiyle belgelendi.

### 3.5 Güvenlik

- `OWNER_CHAT_ID` allowlist **en dıştaki ara katman** — yetkisiz istek handler'lara hiç
  ulaşmaz ve **sessizce** yok sayılır (cevap vermek botun canlı olduğunu doğrulardı).
- Onay kayıtları veritabanında (bellekte değil): yeniden başlatmada butonlar çalışır.
  Çift tıklama koşullu `UPDATE ... WHERE resolved IS NULL` ile kilitlenir; 30 dk zaman aşımı.
- Long polling → **açık port/alan adı/TLS yok**.
- Gerçek emir yok: hiçbir borsa/aracı kurum API'si projeye girmez (kullanıcı kararı).

### 3.6 Komutlar ve test

```bash
cd jarvis && npm install
npm run demo        # Telegram/Ollama/ağ olmadan hattı uçtan uca çalıştır (örnek portföy)
npm run doctor      # EN ÖNEMLİ: sistem+ayar+DB+5 kaynak+Ollama+Telegram+ses sınar
npm run typecheck
npm test            # 146 test, tamamen çevrimdışı (fixture'lara karşı)
docker compose up -d                     # Jarvis + Ollama
docker compose --profile voice up -d     # + ses (Whisper/Piper, ~2 GB)
```

`doctor`, `OWNER_CHAT_ID` boşsa Telegram `getUpdates`'ten kullanıcının chat id'sini bulup söyler.

### 3.7 Ses (opsiyonel, `voice/`)

Ayrı Python konteyneri: faster-whisper (STT) + Piper (TTS) + ffmpeg (Piper WAV üretir,
Telegram OGG/Opus ister). Python seçildi çünkü Node'dan whisper.cpp derlemek çok daha
kırılgandı. Whisper'da **dil `tr` olarak zorlanıyor** — otomatik tespit kısa sesli
mesajlarda İngilizce sanıp alakasız çıktı üretiyor. `--profile voice` arkasında: kapalıyken
imaj derlenmez, model inmez, çekirdek etkilenmez.


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
