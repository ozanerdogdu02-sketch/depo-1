# depo-1 — Proje Hafızası

Bu repo iki bağımsız uygulama içerir. Gelecek oturumlarda çalışmaya buradan başla.

## 1. FAGENT — GÜNCEL SÜRÜM (öncelikli proje)

- **Konum:** `fagent/` (kendi package.json'ı olan bağımsız Vite + React + TS uygulaması)
- **Ne:** API anahtarı GEREKTİRMEYEN yatırımcı paneli — Panel, Bugün, Hisseler, Fonlar, Kripto Varlıklar (hepsi aynı `Panel` bileşeni, `assetType` prop'uyla tür filtresi), İşlemler, Projeksiyon, Demo Ajan (analiz + sohbet, yerel kurallar, `fagent/src/agent.ts`)
- **Yerleşim:** sol sabit menü (Fintables'tan yerleşim ilhamı, `.sidebar`/`.side-nav`/`.side-link` — `fagent/src/index.css`), mobilde üstte yatay bara döner. Sidebar'da canlı arama kutusu (Panel/tür sekmeleri + İşlemler geçmişini filtreler, toplam tutarı etkilemez). AJAN linkinde "YENİ" rozeti. İşlemler sekmesinde her zaman görünür "Nasıl İşlem Eklerim?" rehber kartı var.
- **Bilinçli sınır — hisse/fon:** BIST hisse ve TEFAS fon verisi için resmi/ücretsiz/anahtarsız bir kaynak YOK (araştırıldı, 2026-07-12) — bulunanlar banka-özel API'ler, ücretli servisler ya da .gov.tr kazıyan kırılgan/ToS-riskli araçlar. Bu ikisi manuel-girişli kalmaya devam ediyor; sahte fiyat gösterilmeyecek.
- **Canlı fiyat — döviz/kripto:** `fagent/src/market.ts` — Frankfurter.dev (döviz, ECB günlük kur) ve CoinGecko genel ucu (kripto), ikisi de anahtarsız/CORS-açık. Varlık eklerken opsiyonel "Canlı Fiyata Bağla" kutusu (miktar + sembol seçilir), sonra varlık satırındaki yenile ikonuyla güncellenir. `Holding.quantity`/`symbol`/`lastFetchedAt` bu amaçla eklendi — tamamen opsiyonel, diğer türler etkilenmez. **Not:** bu kum havuzu ortamının ağ proxy'si dış API'lere erişimi engelliyor (netlify.app'te de aynı sorun); test edilirken `page.route()` ile ağ taklit edildi — gerçek ağ doğrulaması kullanıcının kendi tarayıcısında yapılmalı.
- **Kâr/Zarar takibi:** `Holding.costBasis` (maliyet) ile `amount` (güncel değer) ayrı tutulur. Alışta ikisi artar; satışta maliyet ağırlıklı ortalama yöntemiyle orantılı azalır. Güncel değeri kullanıcı `actions.updateHoldingValue()` ile KENDİSİ günceller (kalem ikonu) — otomatik fiyat çekilmez. Eski (costBasis'siz) localStorage verisi yüklenirken otomatik göç eder (`fagent/src/store.ts` → `load()`).
- **CSV dışa/içe aktarma:** `fagent/src/csv.ts` — Varlıklar ve İşlemler dışa aktarılır (Panel/İşlemler kartlarındaki "CSV" butonu); Varlıklar için içe aktarma da var ("İçe Aktar" butonu, `parseHoldingsCsv` + `actions.importHoldings` — mevcut varlıklara ekler, üzerine yazmaz, geçersiz satırları sessizce atlar).
- **Denenip eklenmeyen:** Altın için canlı fiyat (gold-api.com vb.) — JSON şeması bu ortamdan doğrulanamadığı (ağ engelli) için "hatasız kodlama" gereği eklenmedi. İleride API şeması netleşirse `market.ts`'e aynı desenle eklenebilir.
- **Veri:** yalnızca tarayıcıda (`localStorage`, anahtar: `fagent.portfolio.v1`)
- **Korunan sürüm:** `fagent-stable` dalı = commit `e753c56` (fagent v1.0.0, sol menü öncesi). Bu dalı silme/üzerine yazma — `main` bundan sonra da güncellenmeye devam edebilir.
- **Canlı site hedefi:** https://fagentai.netlify.app (kullanıcının Netlify hesabı)
- **Netlify ayarları:** Base directory `fagent` · Build command `npm run build` · Publish directory `fagent/dist`
- **Geliştirme:** `cd fagent && npm install && npm run dev` · doğrulama: `npm run typecheck && npm run build`
- Kullanıcının Bolt'ta yaptığı orijinal FAGENT'a erişilemedi; bu, ekran görüntüsüne sadık sıfırdan yazımdır.

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
