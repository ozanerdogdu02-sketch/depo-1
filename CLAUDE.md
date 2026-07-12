# depo-1 — Proje Hafızası

Bu repo iki bağımsız uygulama içerir. Gelecek oturumlarda çalışmaya buradan başla.

## 1. FAGENT — GÜNCEL SÜRÜM (öncelikli proje)

- **Konum:** `fagent/` (kendi package.json'ı olan bağımsız Vite + React + TS uygulaması)
- **Ne:** API anahtarı GEREKTİRMEYEN yatırımcı paneli — Panel, Bugün, Hisseler, Fonlar, Kripto Varlıklar (hepsi aynı `Panel` bileşeni, `assetType` prop'uyla tür filtresi), İşlemler, Projeksiyon, Demo Ajan (analiz + sohbet, yerel kurallar, `fagent/src/agent.ts`)
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

### 1.4 Test kapsamı (scratchpad, kalıcı repo dosyası değil)

`fagent-sidebar-e2e.mjs`, `fagent-nav-e2e.mjs`, `fagent-pnl-e2e.mjs`, `fagent-live-e2e.mjs` (ağ `page.route()` ile taklit), `fagent-import-e2e.mjs`, `fagent-chart-e2e.mjs`, `fagent-validation-e2e.mjs` (ad çakışması engelleme + bakiye-aşımı engelleme testleri) — Playwright + `/opt/pw-browsers/chromium`, toplam 94 kontrol. Yeni bir davranış eklenince ilgili dosyaya test eklenmeli; store.ts'in genel API'si (`actions.*`) değişirse tüm dosyalar taranıp stale selector/mesaj metni kontrol edilmeli (örnek: `#t-holding option value` isimden ID'ye geçince `page.selectOption(..., { label })` kullanan testler etkilenmedi ama `value` ile seçen olsaydı kırılırdı).

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
