# Veri akışı: mevcut durum, çelişkiler ve geçiş planı

Durum: PLAN (2026-10-25). `src/` ve `tests/` değiştirilmedi. Spesifikasyon: `docs/veri-akisi/spec.md`. Kapsam: `CLAUDE.md` → KAPSAM KARARI.
Her satır numarası bu belgenin yazıldığı gün kodda doğrulandı; kayabilir, kullanmadan önce `grep -n` ile yeniden doğrula.
Ölçülmeyen şey "doğrulanamadı" diye yazıldı. Dış API'ler ve gerçek Supabase bu ortamda doğrulanamaz.

## 1. Mevcut veri akışı envanteri

### 1.1 Kalıcı depolama (yalnız localStorage; IndexedDB/OPFS kullanımı yok: `grep -rn indexedDB src` boş)

| Anahtar | Ne | Yazan / okuyan | Yedek+bulut listesinde |
|---|---|---|---|
| `fagent.portfolio.v1` | portföy, varlıklar, işlemler, realizedPnl | `src/store.ts:56` (KEY), okuma `:127`, yazma `commit` `:156`, silme `:190`; ayrıca `src/ErrorBoundary.tsx:23` okur | evet |
| `fagent.agent.memory.v1` | ajan kullanım/tercih belleği | `src/agentMemory.ts:12` | evet |
| `fagent.agent.training.v1` | öğretilen soru-cevap | `src/agentTraining.ts:10` | evet |
| `fagent.tax.v1` | kullanıcının düzenlediği stopaj oranları | `src/taxRates.ts:14` | evet |
| `fagent.target.v1` | hedef dağılım | `src/targetAllocation.ts:14` | evet |
| `fagent.backup.v1` | yedek hatırlatma meta verisi | `src/backup.ts:16` | hayır (bilerek) |
| `fagent.cloud.owner.v1`, `fagent.cloud.base.v1` | bulut sahiplik işareti ve son eşitleme hash'i | `src/localData.ts:25,28` | hayır |
| `fagent.evds.v1` | TÜFE önbelleği | `src/evds.ts:16` | hayır |
| `fagent.cryptomarket.cache.v2` | kripto piyasa önbelleği | `src/cryptoMarketData.ts:37` | hayır |
| `fagent.pricehistory.v1.*` (önek) | fiyat geçmişi önbelleği; anahtarda sembol var | `src/priceHistory.ts:17` | hayır |
| `fagent.ai.proxyurl.v1` | ÇIKARILMIŞ özelliğin artığı; yalnız silinir | `src/localData.ts:54` (LEGACY_KEYS) | hayır |
| `sb-*-auth-token`, `sb-*-code-verifier` | Supabase oturumu (yalnız env doluysa) | `src/cloud.ts:510-520` | hayır |
| sessionStorage `fagent.cloud.reloaded.v1` | bulut sonrası tek yenileme bayrağı | `src/cloud.ts:332,340` | hayır |

Ek (bellek içi, kalıcı değil): enflasyon durumu `src/inflation.ts:30` (modül değişkeni; SIFIRLA'da `resetInflation` `:83`). Kullanıcının girdiği enflasyon oranı yenilemede KAYBOLUR, kalıcı değil. Bu bir veri kaybı değil, mevcut davranış (kullanıcı kararı: P3'te `settings` içine alınsın mı, bkz. §5).

Tek yazma noktası: `src/store.ts` içindeki `actions.*` (sözleşme: `docs/karar-gunlugu.md` §1.1–1.2). Diğer katmanlar kendi modülünde yazar ve `notifyUserDataChanged()` (`src/backup.ts:166`) ile bulut kaydını tetikler. Toplu temizlik: `clearLocalUserData` / `clearForSignOut` (`src/localData.ts:63,79`).
Veri şekli: `Holding` `src/store.ts:9`, `Txn` `:21`, `PortfolioState` `:34`. Tek portföy var; para birimi alanı yok (her tutar TL); işlem kaydında adet/birim fiyat yok (`amount` + isteğe bağlı `commission`). `id` değerleri `h${Date.now()}` / `t${Date.now()}` (`src/store.ts:195,204,257,295`): UUID değil ve aynı milisaniyede çakışabilir.

Eski veriyle uyumluluk zaten var: `load()` (`src/store.ts:125-150`) eksik `costBasis`, `holdingId`, `realizedPnl` alanlarını tamamlıyor. Bu desen korunur.

### 1.2 Dış ağ istekleri (`grep -rn "fetch(" src`, 6 adet istemci + 1 sunucu)

| Çağrı | Konum | Hedef | Giden bilgi |
|---|---|---|---|
| `fetchTryRate` | `src/market.ts:38` | `api.frankfurter.dev/v1/latest?base=<KOD>&symbols=TRY` | para birimi kodu (portföyde o kur takip ediliyor) |
| `fetchCryptoTryPrice` | `src/market.ts:53` | `api.coingecko.com/api/v3/simple/price?ids=<coin>` | coin kimliği |
| `fetchCryptoHistory` | `src/priceHistory.ts:57` | CoinGecko `market_chart` | coin kimliği, gün sayısı |
| `fetchFxHistory` | `src/priceHistory.ts:92` | Frankfurter aralık sorgusu | kur kodu, tarih aralığı |
| `fetchTopCoins` | `src/cryptoMarketData.ts:119` | CoinGecko `coins/markets` | sabit liste isteği (kişiye özel değil) |
| `fetchInflationPct` | `src/evds.ts:85` | AYNI KÖKEN `/api/evds` → `api/evds.mjs` → `netlify/functions/evds.mjs:81` → TCMB EVDS | seri kodu `TP.FG.J0` + tarih aralığı (kişiye özel değil); EVDS anahtarı yalnız sunucuda |
| Supabase | `src/cloud.ts` (istemci dinamik import `:88`; `.from(TABLE)` `:303`, `:362`; `auth.*` `:524-657`; `rpc('delete_my_account')` `:712`) | `*.supabase.co` (yalnız `cloudEnabled`, `src/cloud.ts:62`) | e-posta, parola (Supabase Auth), TÜM kullanıcı verisi düz metin JSON |

CSP `connect-src` bu üç dış sunucuyu açıkça listeliyor (`vercel.json`, `netlify.toml`): Frankfurter, CoinGecko, `*.supabase.co`.
Tarayıcıdan üçüncü tarafa gidenler: kullanıcının IP adresi, tarayıcı User-Agent'ı, `Origin`/`Referer` (Referrer-Policy `strict-origin-when-cross-origin` olduğundan yalnız köken) ve yukarıdaki sembol/kimlik. Tutar, adet, varlık adı, işlem gitmiyor (URL'ler okundu). Ama hangi kur/coin'in takip edildiği görünüyor; bu portföy hakkında bir bilgidir (bkz. §2 kural 1 ve P5).

### 1.3 Bulut senkronu (`src/cloud.ts`, `src/Account.tsx`, `supabase/migrations/20261018000000_...sql`)
- Tamamen opsiyonel: env boşsa `cloudEnabled=false`, Supabase kütüphanesi bile yüklenmez (`src/cloud.ts:62,85-87`).
- Açıkken: `BACKED_UP_KEYS` içindeki 5 katmanın düz metin JSON'u `portfolios.data` (jsonb) sütununa, kullanıcı başına tek satır, koşulsuz `upsert` ile yazılır (`src/cloud.ts:285-306`). Sunucu portföyü düz metin görür. İstemci boyut sınırı 1,5 MB (`:68`); RLS yalnız satır sahibine izin verir (migration), DB boyut kısıtı 2 MB.
- Çakışma: `cakisma` durumu ve `resolveConflict` var (`src/cloud.ts:462`); iki cihazda son yazan kazanır (CLAUDE.md zorunlu liste #27).
- Gerçek Supabase'e karşı doğrulanmadı; testler `page.route()` taklidi.

### 1.4 Sayısal özet
- Kalıcı localStorage anahtarı: 5 kullanıcı katmanı + 1 yedek meta + 2 bulut işareti + 3 önbellek (biri önek) + 1 çıkarılmış artık = 12, artı dinamik `sb-*` ve 1 sessionStorage bayrağı.
- `BACKED_UP_KEYS`: 5 (`src/backup.ts:26-32`).
- İstemci `fetch(`: 6 (`src/market.ts` 2, `src/priceHistory.ts` 2, `src/cryptoMarketData.ts` 1, `src/evds.ts` 1); sunucuda 1 (`netlify/functions/evds.mjs:81`). Dış ana bilgisayar: 2 (Frankfurter, CoinGecko) + `*.supabase.co`; kendi kökenimiz: `/api/evds`.
- e2e: `tests/e2e` altında 26 dosya (`ls tests/e2e | wc -l`). `grep -rln localStorage tests/e2e` = 11 dosya (analytics, oto-aktarim, agent, memory, vergi, auth, hedef, action, teach, cryptomarket, yedek). `fagent.portfolio.v1` anahtarına 33 başvuru, `agent.training` 10, `target` 13, `tax` 10, `agent.memory` 7, `cloud.owner` 7, `backup` 4, `cryptomarket.cache` 6, `evds` 2, `pricehistory` 3, ve çıkarılmış `ai.proxyurl` 9 (artık-silme testi).
- `page.route()` ile CoinGecko/Frankfurter taklidi yapan test dosyası: 4 (cryptodemo, cryptomarket, live, risk).
- Toplam kontrol sayısı: görev metni 699 diyor; `CLAUDE.md` son kaydı 674 (sahte Supabase ile). Bu oturumda koşulmadı, 699 doğrulanamadı.
- Birim test dosyası: 0 (`package.json` yalnız `test:e2e`; test çerçevesi bağımlılığı yok).
- Ortam: Node v22.22.0; `node --test` ile `.ts` dosyası doğrudan koşuluyor (bu oturumda denendi: `.ts` uzantılı içe aktarma çalışıyor, uzantısız içe aktarma `ERR_MODULE_NOT_FOUND`). Node'da `indexedDB` yok, `crypto.subtle` var.

## 2. Çelişki ve uyum tablosu (spec P0)

| # | Kural | Durum | Fark / kanıt |
|---|---|---|---|
| 1 | Kullanıcı verisi sunucuya gitmez; yalnız ekip verisi uçtan uca şifreli | KISMEN ✗ | (a) Hesapsız varsayılan derleme: sunucuya veri gitmiyor (✓, `dist/` Supabase'siz derleniyor, `tests/run-e2e.mjs`). Env doluysa 5 katman düz metin jsonb olarak sunucuda (`src/cloud.ts:285-306`, migration `data jsonb`): ÇELİŞKİ. Ek: e-posta kimliktir. Ayrıca sembol/kimlik üçüncü tarafa gidiyor (§1.2). (b) Yerel depolama IndexedDB/OPFS değil localStorage: kural metni "IndexedDB/OPFS" der, fark var. (c) Log/analitik: bu depoda analitik yok (`grep -rniE "gtag|sentry|plausible|mixpanel|posthog" src index.html` boş; harici betik taraması `npm run guvenlik` ile ayrıca doğrulanmalı). |
| 2 | Tavsiye dili yok; her hesap ekranında bilgilendirme uyarısı | KISMEN ✓ | Adım 3'te tavsiye kalıpları temizlendi. "Yatırım tavsiyesi değildir" ifadesi yalnız bazı ekranlarda (`src/App.tsx:410,1695,1921`); "her hesap ekranında" şartı doğrulanmadı, ekran envanteri yapılmadı. Tasarım kapsamı dışında, burada yalnız not. |
| 3 | Palet siyah/antrasit/gri, yeni renk yok | İNCELENMEDİ | Kapsam kararı tasarımı kapsamıyor. Not: `src/index.css:7` `--bg:#131722` (mavimsi koyu); spec ile uyumu tasarım işidir. |
| 4 | Hareket: data-motion, reduced-motion, animation-timeline | KISMEN | `prefers-reduced-motion` var (`src/index.css:264,285,310`); `data-motion` yok (grep boş). Kapsam dışı. |
| 5 | Türkçe; sayı biçimi ₺1.349,50 | KISMEN ✗ | `fmtTL` `maximumFractionDigits: 0` (`src/store.ts:358-359`): ₺1.349 yazar, kuruş yok. Ondalık yüzde `fmtDec` doğru (virgül). P6 çıktısı kuruşlu biçim ister; mevcut `fmtTL`'nin davranışını değiştirmek çok sayıda e2e metin eşleşmesini kırar, ayrı `fmtTLKurus` eklenmeli (bkz. P6). |
| 6 | Vergi/stopaj, TÜFE, ücret, fiyat koda gömülmez; tarih aralıklı yapılandırmadan, kaynak yanında | ✗ | Kodda gömülü: `DEFAULT_TAX_RATES` `src/analytics.ts:507-521` (fon 17,5, mevduat 17,5, diğerleri 0; tarih aralığı yok, kaynak yorum satırında); `UNVERIFIED_TAX` `:523`; `VARSAYILAN_ENFLASYON_PCT = 30` `src/inflation.ts:20`; AYNI sayı ikinci kez `src/agent.ts:318` (`VARSAYILAN_ENFLASYON = 30`) ve yorum olarak `src/App.tsx:142`; metin içinde "%17,5" / "11107 sayılı" `src/App.tsx:290`, `src/agent.ts:707`; `SCENARIOS` (projeksiyon senaryo getirileri) `src/App.tsx:1292`. Fiyat: koda gömülü canlı fiyat yok (elle girilir), örnek veri `SAMPLE`/`CRYPTO_SAMPLE` `src/store.ts` üst bölüm (tutarlar örnek). Ücret: `commission` kullanıcı girişidir, oran gömülü değil. |
| 7 | Her hesap fonksiyonu için birim test | ✗ | Birim test altyapısı yok. `src/analytics.ts` ~30 dışa aktarılan fonksiyon (xirr, afterTaxOf, realReturnPct, ...) yalnız e2e içinden dolaylı sınanıyor. |
| 8 | Emin olunmayan hukuki/vergisel konuda `TODO(hukuk)` / `TODO(muhasebe)` | ✗ | Kodda hiç işaret yok (`grep -rn "TODO(hukuk)\|TODO(muhasebe)" src` boş); yalnız spec'te geçiyor. Mevcut "doğrulanamadı" etiketleri (UNVERIFIED_TAX) aynı niyeti taşıyor ama işaretle listelenmiyor. Adaylar §5. |

Ek çelişki (P5 ↔ mevcut): spec "TCMB döviz kuru (EVDS)" der; mevcut kur kaynağı Frankfurter (AB Merkez Bankası referans kuru), TCMB değil. Bu ürün davranışı değişikliğidir (kur değerleri farklı olabilir). EVDS kur serisi kodları doğrulanamadı (bu ortamdan EVDS'e erişilemiyor, API anahtarı da yok).

(d) P5 gizlilik sorusu özetle: bugün tarayıcı doğrudan üçüncü taraflara gidiyor, kullanıcının IP'si Frankfurter ve CoinGecko'ya ulaşıyor; portföy tutarı/adı/işlemi gitmiyor, takip edilen kur kodu ve coin kimliği gidiyor. Ara sunucu (proxy) üçüncü tarafa IP göstermez ama BİZİM sunucumuz (Vercel) IP + istek içeriğini görür. Sembol listesi göndermek P0.1'in "portföy bilgisi sunucuya gitmez" ruhuyla gerilimlidir; çözüm önerisi P5'te (sabit tablo çek, süzmeyi istemcide yap).

## 3. Eşleme ve geçiş stratejisi

Ortak ilkeler (hepsi için):
- `store.ts` API'si (`actions.*`, `getPortfolio`, `subscribePortfolio`, `usePortfolio`) DEĞİŞMEZ; bileşenler dokunulmaz. Değişiklik `store.ts` içinde ve altında kalır.
- 699 testi koruma yolu "uyumluluk aynası": beş `BACKED_UP_KEYS` anahtarı localStorage'a yazılmaya devam eder (aynı JSON biçimi), yeni katman yanında ek kalıcılık sağlar. Mirror ancak testler yeni katmana taşındıktan SONRA ve ayrı onayla kaldırılır.
- Kontrol sayısı azalmaz; metin değişirse seçiciler aynı kalemde güncellenir (EKİP HAFIZASI).
- Yeni bağımlılık: yok önerilir. Çıkarsa Üst Kurul talebi (`docs/ust-kurul.md` biçimi).

### P3 — Yerel veri katmanı
**Öneri: bağımlılıksız ince IndexedDB sarmalayıcı (~150-250 satır), Dexie değil.** Gerekçe: (1) şema küçük (6 nesne deposu), Dexie'nin getirdiği sorgu/`liveQuery` ihtiyacı yok; (2) sıfır yeni bağımlılık, Üst Kurul/lisans/`npm audit` yükü yok, bağımlılık sayısı bu depoda 5 (supabase-js, lucide-react, react, react-dom, recharts); (3) sürümleme için yerleşik `onupgradeneeded` yeterli ve geçiş mantığı SAF fonksiyonlara (`migrate(v, kayıt)`) ayrılırsa `node --test` ile IndexedDB'siz sınanır; (4) SQLite-WASM+OPFS ikili dosya ve worker getirir, bu boyutta aşırı. Dexie'nin artıları (bakımlı geçiş/test deneyimi, çoklu sekme olayları) doğrudur; bakım yükü bizde kalır. Karar kullanıcıya ait; Dexie seçilirse aşağıdaki talep taslağı kullanılır.

```
TALEP: Dexie (sürüm: kurulum anında en güncel kararlı; lisans ve boyut doğrulanamadı, npm audit + lisans özeti şart)
NE İÇİN: P3 yerel veri katmanı (IndexedDB üstünde şema sürümleme)
NEDEN: onupgradeneeded'i elle sarmak istenmezse
ALTERNATİF: ince IndexedDB sarmalayıcı (bağımlılıksız), kullanmamanın maliyeti ~1-2 gün ek bakım
VERİ AKIŞI: kullanıcı verisi dışarı çıkmaz; istemci paketine girer (anahtar yok)
MALİYET/LİSANS: lisans doğrulanmalı (npm'den), ücret yok
```

Şema eşlemesi (spec: portfolios, instruments, holdings, transactions, settings, audit_log; her kayıtta id, updatedAt, deviceId):
- `portfolios`: bugün tek, örtük. Göçte tek kayıt "Varsayılan portföy" üretilir.
- `instruments`: bugün `Holding.type/symbol` içinde gömülü. Göçte sembolü olanlar (döviz/kripto) ayrı kayda çıkar; yoksa boş.
- `holdings`, `transactions`: `Holding`, `Txn` alanları aynen; yeni alanlar isteğe bağlı (`portfolioId`, `updatedAt`, `deviceId`). Mevcut `id` değerleri DEĞİŞTİRİLMEZ (opak dize olarak kalır; spec "UUID" der, sapma açıkça not: eski id'ler `h1722...`). Yeni kayıtlar `crypto.randomUUID()`. Bu aynı zamanda `Date.now()` çakışmasını çözer.
- `settings`: `fagent.agent.memory.v1`, `training`, `tax`, `target`, enflasyon tercihi (şimdi kalıcı değil, bkz. §5) ayrı anahtarlar halinde.
- `audit_log`: yeni; `actions.*` her çağrıda satır ekler (kimin değil NE yapıldığı: tür, kayıt id'si, zaman, deviceId; tutar yok ya da yerel olduğu için var, bkz. §5).
- `deviceId`: ilk açılışta `crypto.randomUUID()`, `settings` içinde.

Mimari: `store.ts` bellekte senkron durumu tutmaya devam eder (React `useSyncExternalStore`, `commit()` senkron). `commit()` sonunda (1) localStorage aynası aynen yazılır (bugünkü davranış), (2) IndexedDB'ye kuyruklu write-through. Açılışta `main.tsx`, `initDataLayer()` bitene kadar render'ı bekletir: IndexedDB boşsa ve localStorage'da v1 anahtarlar varsa göç et (localStorage SİLİNMEZ); ikisi de doluysa aynadaki hash ile IndexedDB meta'sındaki "son yazılan ayna hash'i" karşılaştırılır; farklıysa ayna dışarıdan düzenlenmiş demektir (test `page.evaluate`, yedekten geri yükleme, eski sekme) ve ayna içeri alınır. Bu kural testlerin "localStorage'a yaz, yeniden yükle" kalıbını korur.
- Etkilenen dosyalar: yeni `src/db/` (adapter, şema, göç, denetim izi), `src/store.ts` (commit/load), `agentMemory.ts`, `agentTraining.ts`, `taxRates.ts`, `targetAllocation.ts` (kalıcılık çağrıları), `backup.ts` (şifreli dışa/içe aktarma), `localData.ts` (temizlik IndexedDB'yi de silmeli), `main.tsx`, `App.tsx` (ilk açılış yedek uyarısı: `shouldNudge` `src/backup.ts:212` zaten var, metin gözden geçirilir).
- Şifreli dışa aktarma: WebCrypto (`PBKDF2` → `AES-GCM`, rastgele tuz+IV, sürüm başlığı, `.fagent`). Kendi kripto algoritması yazılmaz. PBKDF2 yineleme sayısı için güncel öneri doğrulanamadı (ağ yok); karar `TODO(güvenlik)` ve Üst Kurul güvenlik mercek. Düz JSON yedek dosyası biçimi (`fagentBackup: 1`, `src/backup.ts:34`) içe aktarmada desteklenmeye devam eder (geri uyum).
- Bulut: `snapshotUserData` / `applyUserData` (`src/backup.ts:131,148`) 5 anahtarlı düz metin sözleşmesini korur; IndexedDB geçişi bulut kodunu etkilemez (ayna sayesinde).
- Testler: değişen: `fagent-yedek-e2e` (yeni .fagent akışı eklenir, mevcutlar kalır), `fagent-auth-e2e` DEĞİŞMEZ (beyaz liste kontrolleri korunur). Yeni: `tests/e2e/fagent-yerel-veri-e2e.mjs` (yenile, dışa aktar, sil, içe aktar, ağ günlüğünde kullanıcı verisi yok) ve `node --test` ile şema göç testleri.
- Riskler: açılış sırası (async hazırlık, ilk boyama gecikmesi); iki sekme eşzamanlı yazma (`BroadcastChannel` ya da son-yazan-kazanır belgelenir); tarayıcı IndexedDB'yi tahliye edebilir (`navigator.storage.persist()` istenir, reddedilirse uyarı); gizli sekmede IndexedDB kısıtlı olabilir (bellek-içi düşüş, uyarı). Ayna kaldırılana kadar iki kopya tutarsız kalabilir, hash kuralı bunun içindir.
- Efor: BÜYÜK (3-4 iş birimi). Alt sırası: adapter+şema+göç (orta), write-through+açılış (orta), şifreli dışa/içe aktarma (küçük-orta), denetim izi (küçük).

### P4 — Portföy girişi ve CSV
Mevcut: `src/csv.ts` varlık CSV'si içe aktarır (`parseHoldingsCsv` `:98`, noktalı virgül ayırıcı, sabit sütun sırası, hatalı satırları SAYAR ama listelemez: "Geçersiz satırlar sessizce atlanır, sayılır"); işlem CSV'si yalnız dışa aktarılır (`exportTxnsCsv` `:46`), içe aktarılamaz. `otoAktarim.ts` ayrı bir JSON sözleşmesi (`fagent-aktarim.json`, şema sürüm 1, `docs/aktarim-semasi.md`); ikisi aynı hedefe (portföy durumu) yazar, çakışmaz ve korunur.
Fark: spec sütun eşleme ekranı, satır bazlı hata listesi ("hiçbirini sessizce atma"), işlem girişi (adet, fiyat, masraf, para birimi) ve 500 satırlık örnek ister.
Eşleme: yeni `src/importer/` (saf: ayırıcı algılama, başlık eşleme, satır doğrulama, hata kodu+satır no) + yeni bir "İçe aktar" eşleme arayüzü; `parseHoldingsCsv` imzası KORUNUR (içeride yeni çekirdeği çağırır) ki `fagent-import-e2e` ve `App.tsx` `OtoAktarimCard`/`BackupCard` aynı kalsın. Hata listesi mevcut özet cümlesinin ALTINA eklenir; "1 varlık eklendi, 3 satır eksik/geçersiz veri nedeniyle atlandı" metni (`tests/e2e/fagent-import-e2e.mjs:51,68`) korunur.
Veri modeli sorunu (EN BÜYÜK TEKİL RİSK): `Txn` bugün adet/birim fiyat/para birimi taşımıyor; tüm hesap TL tutar merkezli (`costBasis` işlemlerden türetilir, `src/store.ts` `actions`). Spec'in işlem formu bunları ister. Öneri: `Txn`'e İSTEĞE BAĞLI alanlar (`quantity`, `unitPrice`, `currency`, `fxRateToTry`), TL `amount` hesaplanıp saklanmaya devam eder; analytics değişmeden TL ile çalışır. Çoklu para birimli hesaplamanın (kur tarihi, FIFO maliyet) tasarımı P6'ya bırakılır.
- Etkilenen: `src/csv.ts`, `src/store.ts` (yeni alanlar, `addTxn` imza genişlemesi isteğe bağlı), `src/App.tsx` (`BackupCard` ~428, `Islemler` ~1145, `OtoAktarimCard` ~528; grep ile doğrula), `docs/aktarim-semasi.md` (alan eklenirse sürüm 2 notu).
- Testler: değişen `fagent-import-e2e` (yalnız eklemeler), yeni `fagent-csv-esleme-e2e` (500 satır, hatalı satır listesi, klavye ile erişim); saf ayrıştırıcı için `node --test`.
- Risk: CSV biçim çeşitliliği (virgül/noktalı virgül, ondalık virgül, tarih biçimi); ReDoS'tan kaçınmak için regex yerine el yazması ayırıcı; 500+ satır performansı.
- Efor: ORTA-BÜYÜK. Sıra: P3'ten sonra (hedef depo orası).

### P5 — Fiyat ve kur hattı
Mevcut: tarayıcı doğrudan Frankfurter/CoinGecko'ya gidiyor (§1.2); EVDS için zaten sunucu ucu var (`api/evds.mjs`, mantık `netlify/functions/evds.mjs`, Vercel'de anahtarsız 503 `anahtar_yok` gözlendi; gerçek veriyle doğrulanmadı, kullanıcı `EVDS_API_KEY` eklemeli).
Hedef: `api/prices.mjs` (Vercel; spec "edge function" der, mevcut `api/*.mjs` Web-standart işleyici düzeni izlenir, edge çalışma zamanı seçimi Vercel tarafında doğrulanmalı) — kimliksiz, yalnız herkese açık veri, önbellekli (`Cache-Control`/`s-maxage`).
Gizlilik tasarımı: sembol listesi göndermek yerine SABİT, kişiselleştirilmemiş tablolar çekilir (TRY bazlı tüm kurlar; piyasa değerine göre ilk N coin) ve süzme istemcide yapılır. Sunucu hangi varlığı tuttuğunu öğrenmez. Tabloda olmayan coin için sembol parametreli yol isteğe bağlı kalır (kullanıcı kararı §5).
Arayüz: `src/prices/PriceProvider.ts`: `getQuote(symbols, kind) -> Promise<Quote[] | undefined>` (başarısızlıkta `undefined`, throw yok; AGENTS.md §0 / `src/evds.ts` deseni). Uygulamalar: `ManualProvider` (bugünkü elle giriş), `CsvPriceProvider` (P4 çekirdeğini kullanır), `ServerFxProvider`, `ServerCryptoProvider`. `fetchTryRate`/`fetchCryptoTryPrice`/`fetchTopCoins`/geçmiş fonksiyonları (`src/market.ts`, `priceHistory.ts`, `cryptoMarketData.ts`) imzalarıyla kalır, içeride sağlayıcıyı çağırır. Hisse/fon sağlayıcısı VARSAYILMAZ: `TODO(hukuk)` BIST veri lisansı.
Kur kaynağı sorusu: Frankfurter (ECB) mi, TCMB (EVDS) mi; spec TCMB ister. Karar kullanıcıda (§5); EVDS kur seri kodu doğrulanamadı.
- Etkilenen: yeni `api/prices.mjs` (+ Netlify aynası `netlify/functions/`, mevcut çiftli düzen için), `src/market.ts`, `src/priceHistory.ts`, `src/cryptoMarketData.ts`, `vercel.json` + `netlify.toml` (CSP `connect-src` dış sunucular kalkar: sıkılaşır; `fagent-csp-e2e` bekleneni güncellenir), `.env.example` benzeri belge (anahtar adı; `.env*` okunmadı).
- Testler: URL'ye bağlı `page.route()` taklidi kullanan 4 dosya (`cryptodemo`, `cryptomarket`, `live`, `risk`) hedef URL'yi `**/api/prices*` yapacak şekilde güncellenir; yanıt gövdeleri korunur, sahte veri gerçekmiş gibi gösterilmez. Yeni: ağ günlüğü kontrolü (istek URL'sinde portföy verisi yok). Gerçek ağda doğrulanmadı.
- Risk: `api/` yoluna taşıyınca yerel geliştirmede (`vite dev`) uç yok, sağlayıcı hatasında "veri yok" davranışı korunmalı (şu an var); CoinGecko ücretsiz kota sunucu IP'sinde paylaşılır (önbellek bunu azaltır); Vercel/Netlify çift barındırma bakımı.
- Efor: ORTA.

### P6 — Hesap motoru
Mevcut: `src/analytics.ts` zaten büyük ölçüde saf (`xirr` `:56`, `realReturnPct` `:30`, `afterTaxOf` `:553`, tarih/ay hesapları), brüt → stopaj → net → reel zinciri kurulu. Boşluklar: oranlar gömülü (kural 6), tarih aralıklı yapı yok, çoklu para birimi yok, "masraf sonrası" yalnız `commission` ile kısmen, birim test yok, ₺100.000 → ₺148.000 senaryosu tanımlı değil.
Eşleme: yeni `src/engine/` (saf TS; yalnızca `import type` ve `.ts` uzantılı içe aktarma kullanır ki Node doğrudan koşsun) + `src/config/tax_rules.json` + `src/config/inflation.json` (+ `fees` gerekirse). Şema: `{ assetType, from, to, ratePct, sourceUrl, sourceTitle, verifiedAt, status: "dogrulandi"|"dogrulanamadi" }`. `status` `UNVERIFIED_TAX` kümesinin yerini alır. Mevcut değerler (fon 17,5; mevduat 17,5; hisse 0; diğerleri 0 doğrulanamadı) AYNEN taşınır ve `TODO(muhasebe)` ile işaretlenir; yeni oran UYDURULMAZ. `analytics.ts` `DEFAULT_TAX_RATES`'i JSON'dan türetip dışa aktarmaya devam eder (içe aktaranlar kırılmaz). `inflation.ts` ve `agent.ts:318` aynı JSON'dan okur (iki ayrı sabit tek kaynağa iner). `src/App.tsx:290` ve `src/agent.ts:707` metinleri oran/kaynağı JSON'dan basar; değerler aynı kaldığı için e2e metinleri değişmez.
Birim test koşucusu: bağımlılıksız `node --test` (Node 22.22'de `.ts` doğrudan koşuyor, bu oturumda denendi). Komut: `"test:unit": "node --test \"src/**/*.test.ts\""` (yeni script; `package.json` değişikliği izin ister). Kısıt: test edilen modüller `.ts` uzantılı içe aktarma kullanmalı; mevcut `analytics.ts` uzantısız (`'./store'`) içe aktarıyor, bu yüzden motor `store.ts`'e değer olarak bağlı olmamalı (yalnız `import type`). `analytics.ts`'in saf kısımları motora taşınır, `analytics.ts` aynı adlarla yeniden dışa aktarır (bileşenler/agent değişmez). vitest/jest eklenmez (Üst Kurul gerektirir, gereksiz).
Test içeriği: sınır durumlar (sıfır adet, negatif fiyat, aynı gün çoklu işlem, farklı para birimi), ₺100.000 → ₺148.000 senaryosu `fixture`'da "örnek oran" etiketiyle, XIRR için bilinen sonuçlu akışlar, tarih aralığı kural seçimi (kural değişim günü).
- Etkilenen: `src/analytics.ts`, `src/inflation.ts`, `src/agent.ts` (sabit + metin), `src/App.tsx:142,290`, `src/taxRates.ts` (`DEFAULT_TAX_RATES` kaynağı), `tsconfig.app.json` (`resolveJsonModule`; mevcut dosyada yok, JSON içe aktarma için gerekir, Vite zaten destekler), `package.json` (script).
- e2e koruma: kullanıcıya görünen sayı ve metinler değişmez; `fagent-vergi`, `fagent-insight`, `fagent-analytics`, `fagent-projection` aynen geçmeli. Enflasyon değeri `30` tekrarı testlerde de var (EKİP HAFIZASI: `grep -rn` ile ara).
- `TODO(muhasebe)` / `TODO(hukuk)`: §5.
- Risk: çoklu para birimi tasarımı (kur hangi tarihte, maliyet yöntemi); XIRR'in mevcut davranışı (`undefined` dönüşleri) birim testle donmalı; `fmtTL` kuruş sorunu (kural 5) ayrı `fmtTLKurus` ile çözülür.
- Efor: ORTA (yapılandırma+test koşucusu: küçük; çoklu para birimli motor: büyük).

### Uygulama sırası (öneri)
1. P0/6 kapsamında yapılandırma dışarı alma + `node --test` koşucusu + `TODO` işaretleri (küçük, davranış değişmez, hızlı kanıt).
2. Supabase düz metin senkronuna sert koruma (derleme/çalışma kilidi, bkz. §4 seçenek 2; küçük).
3. P3 yerel veri katmanı.
4. P4 CSV ve işlem girişi (veri modeli genişlemesi).
5. P5 fiyat/kur hattı.
6. P6 motor (çoklu para birimi, masraf, reel).
7. P8 yalnız kullanıcı onayından sonra.
Spec sırası P3, P4, P5, P6 ve "öncekinin kabulü olmadan başlamaz" der. 1. ve 2. adımlar spec dışı hazırlıktır; kullanıcı onayı bekler (§5).

## 4. Mevcut Supabase hesap katmanı: 3 seçenek (KARAR KULLANICIYA AİT)

| | A) Kaldır | B) Askıya al (bayrak arkasında, sert kilitle) | C) P8'in şifreli senkronuna dönüştür |
|---|---|---|---|
| Ne | `src/cloud.ts` (741 satır), `src/Account.tsx` (401), migration, `@supabase/supabase-js`, CSP `*.supabase.co` silinir | Kod kalır, env boşken zaten kapalı. Ek: derleme/çalışma anında düz metin yazımı bir açık bayrak olmadan engellenir | Auth kalır; `portfolios.data` içine yalnız AES-GCM şifreli blob yazılır, anahtar istemcide kalır |
| Artı | P0.1 ile tam uyum; saldırı yüzeyi ve bağımlılık azalır; KVKK yükü küçülür | Hızlı, geri alınabilir, kod yatırımı kaybolmaz; satışta "hazır altyapı" olarak gösterilebilir | Veri taşıma ihtiyacına (çoklu cihaz) cevap verir; Supabase/RLS yatırımı değerlenir; P8 seçenek 1 için temel |
| Eksi | 96 kontrollük hesap testi (`fagent-auth-e2e`, ayrı `dist-e2e-cloud` derlemesi, port 4201) silinir ya da emekliye ayrılır: "kontrol sayısı azalmaz" kuralı ve beyaz liste kontrolleri (`fagent-auth-e2e.mjs` ~200, 276-278, 359-368) kullanıcı kararı gerektirir; çoklu cihaz yolu kapanır | Düz metin kodu yüzeyde kalır (yanlış env ile açılabilir); bakım borcu sürer; açık sorunlar (#27, #33-35, #41) çözülmez | En büyük iş: anahtar yönetimi, parola kaybı=veri kaybı, cihazlar arası anahtar dağıtımı, çakışma çözümü; e-posta ve meta veri sunucuda kalır (P0.1 "yalnız şifreli blob" katı okunursa e-posta ayrıca ele alınmalı) |
| Test etkisi | `fagent-auth-e2e` kaldırılır/arşivlenir, koşucu tek derlemeye iner, CSP testi güncellenir | `fagent-auth-e2e` aynen kalır (96 kontrol sahte Supabase ile yeşil); yeni küçük kontrol: bayraksız derleme düz metin senkronunu reddeder | auth testi güncellenir: sunucuya giden gövde şifreli olmalı (beyaz liste kontrolleri anlam değiştirir, gevşetilmeden yeniden yazılmalı); yeni anahtar/kurtarma testleri |
| Devir/satış | Devralan için daha sade ve "veri bizde yok" iddiası net; fakat Supabase hesabı devri kalmaz | Alıcıya iki yol bırakır; ancak belgelerde "kapalı, düz metin" açıkça yazılmalı | En güçlü satış hikâyesi ("sunucu veri göremez") ama doğrulanmamış kriptografi iddiası sorumluluk yaratır; güvenlik incelemesi ve avukat metni şart |
| Efor | küçük | küçük | büyük |

**KARAR (2026-10-27, kullanıcı): kod açık kalır; B'nin sert kilidi uygulanmaz, A da yapılmaz. Supabase kodu isteğe bağlı katman olarak durur.**

Öneri (karar sizin): BUGÜN B (askıya al + sert kilit), çünkü hiçbir şeyi silmez, kural 1 ile fiilen çelişen yolu kapatır, 96 kontrol yerinde kalır. Sonraki karar P8 seçimine bağlıdır: P8'de "şifreli röle" seçilirse C doğal devamdır; "kullanıcının kendi depolaması" ya da "WebRTC" seçilirse A anlamlıdır. Hangisi seçilirse seçilsin, `docs/` altındaki gizlilik/yasal iddiaları (`belge-kod-tutarliligi` skill'indeki grep'ler) aynı kalemde güncellenir.

## 5. Açık kararlar ve TODO adayları

### Kullanıcı kararı bekliyor
1. Supabase hesap katmanı: A / B / C (§4). Varsayılan: B.
2. P3 depolama: ince IndexedDB sarmalayıcı (önerilen) mi, Dexie mi, SQLite-WASM mi.
3. Eski `id` değerleri (`h<ms>`, `t<ms>`) UUID'ye çevrilsin mi (öneri: çevrilmesin, yalnız yeni kayıtlar UUID).
4. Uyumluluk aynası (localStorage'a eşzamanlı yazım) ne zamana kadar kalsın (öneri: P3 kabulünden sonra ayrı onayla).
5. P5 sembol gizliliği: sabit tablo çek + istemcide süz (önerilen) mi, sembol listesi gönder (spec metni) mi.
6. Kur kaynağı: Frankfurter/ECB'de kalsın mı, TCMB EVDS'e geçilsin mi (değerler farklı olabilir; EVDS kur seri kodu doğrulanamadı).
7. `Txn` genişlemesi (adet, birim fiyat, para birimi, kur) ve çoklu para birimi kapsamı; P6'da hangi maliyet yöntemi (ortalama / FIFO).
8. Enflasyon tercihi ve denetim izi (`audit_log`) içeriği: kullanıcı enflasyon tercihi kalıcı olsun mu (şu an kalıcı değil); denetim izi tutar içersin mi (yerelde evet, ekip senkronunda şifreli).
9. `fmtTL` kuruşlu biçim (₺1.349,50): yeni `fmtTLKurus` yalnız yeni ekranlar için mi, hepsi için mi (hepsi ise çok sayıda e2e metni değişir).
10. Sıra: §3'teki 1. ve 2. adımların (spec dışı hazırlık) spec sırasından önce yapılması.
11. Birim test: `package.json`'a `test:unit` script'i ve `tsconfig.app.json` `resolveJsonModule` eklenmesi onayı.
12. P8 seçeneği (`docs/veri-akisi/p8-senkron-secenekleri.md`); uygulama onay olmadan başlamaz.
13. Barındırma: Vercel yanında Netlify aynası (`netlify/`, `netlify.toml`) korunsun mu (P5 ucu iki yerde bakım ister).

### TODO(hukuk) adayları (hukuki hüküm verilmedi)
- BIST hisse fiyat verisi lisansı/redistribution (spec P5).
- TEFAS fon verisinin kullanım koşulları (şu an elle giriş).
- CoinGecko ve Frankfurter ücretsiz sürüm kullanım koşulları, sunucu tarafı önbellekleme ve yeniden dağıtım (doğrulanamadı).
- TCMB EVDS verisinin yeniden yayınlanması ve anahtar kullanım şartları.
- Bulut senkronu açılacaksa KVKK aydınlatma ve açık rıza, veri işleyen (Supabase) sözleşmesi, yurt dışına aktarım; hesap silme akışının hukuki yeterliliği.
- Ekip senkronunda (P8) işletmeci ve veri işleyen rolleri, denetim izi saklama süresi.
- Yedek dosyasında kişisel veri (şifreli dosyanın ele geçmesi) bilgilendirme metni.

### TODO(muhasebe) adayları (oran/vergi hükmü verilmedi)
- Fon katılma payı stopajı %17,5 ve 11107 sayılı karar (`src/analytics.ts:498`): kaynağı ve geçerlilik tarihi muhasebeci doğrulaması.
- TL mevduat stopajı vade basamakları (6 ay %17,5 / 1 yıl %15 yorumda); `Holding`'de vade bilgisi yok, varsayım 6 ay.
- BIST pay senedi alım-satım kazancında stopaj 0 (GVK geç. 67) ve hisse yoğun fon istisnası.
- Kripto, altın, döviz, tahvil, BES, gayrimenkul: oran doğrulanamadı, 0 + etiket (`UNVERIFIED_TAX`, `src/analytics.ts:523`).
- Enflasyon: TÜİK Eylül 2026 yıllık TÜFE %29,73 haber kaynaklı (`src/inflation.ts:17-20`), birincil kaynakla doğrulanmadı; TÜFE seri kodu `TP.FG.J0` gerçek veriyle doğrulanmadı.
- Komisyon/masraf vergisel işlenişi (maliyete eklenir mi, BSMV/KDV) ve çoklu para birimli kazançta kur farkı.
- Projeksiyon senaryo getirileri (`SCENARIOS`, `src/App.tsx:1292`): kaynaksız varsayım olduğu belgelenmeli.

## 6. Kabul ölçütleri (spec cümlelerinden ölçülebilir kontrol listesi)

### P0 / ortak
- [ ] `grep -rn "TODO(hukuk)\|TODO(muhasebe)" src` en az §5'teki adayları kapsar; bir `docs/veri-akisi/todo-listesi` ya da bu belgenin §5'i güncel.
- [ ] Gömülü vergi/enflasyon sabiti kalmadı: `grep -rn "17[.,]5\|VARSAYILAN_ENFLASYON" src` yalnız yapılandırma yükleyicide/JSON'da ve test fixture'ında eşleşir.
- [ ] Hesapsız derlemede `dist/` içinde Supabase adresi yok (koşucu zaten doğruluyor, `tests/run-e2e.mjs`).
- [ ] Analitik/telemetri/log'a kullanıcı verisi gitmediğine dair ağ günlüğü e2e kontrolü var.

### P3
- [ ] Sayfa yenilenince portföy, ajan belleği, öğretilen bilgi, vergi, hedef durur (IndexedDB'den; aynı kontrol ayna kapalıyken de geçer).
- [ ] Dışa aktar (.fagent, parola) → tüm veriyi sil → içe aktar → `snapshotUserData()` çıktısı eşit (e2e).
- [ ] Yanlış parolayla içe aktarma açık hata verir, veri değişmez; bozuk/kesik dosya veriyi ezmez.
- [ ] Ağ sekmesinde kullanıcı verisi taşıyan istek yok (e2e `page.on('request')` ile).
- [ ] Şema sürüm geçişi (v0 → v1, ileride vN) için `node --test` birim testi; mevcut `fagent.*.v1` localStorage verisi kayıpsız göç eder (eski verili fixture).
- [ ] Her kayıtta `id`, `updatedAt`, `deviceId` var (yeni kayıtlar; eski id'ler dokunulmadan).
- [ ] İlk açılışta yedek uyarısı görünür.
- [ ] Mevcut tüm e2e (699 kayıtlı, doğrulanamadı) değişiklik sonrası yeşil; kontrol sayısı azalmadı.

### P4
- [ ] 500 satırlık örnek CSV içe aktarılır; süre ve arayüz donmaz (ölçüm yazılır).
- [ ] Hatalı satırlar numarası ve nedeniyle LİSTELENİR; hiçbiri sessizce atılmaz; özet cümlesi mevcut biçimde korunur.
- [ ] Sütun eşleme ekranı: başlık otomatik önerilir, kullanıcı değiştirebilir.
- [ ] Tüm formlar etiketli ve yalnız klavye ile tamamlanır (e2e).
- [ ] İçe aktarılan veri P3 katmanına yazılır, yenilemede durur.

### P5
- [ ] Kur ve kripto fiyatı `/api/prices` üzerinden gelir (taklit ağda yeşil; GERÇEK AĞDA DOĞRULANMADI olarak raporlanır).
- [ ] Ağ günlüğünde istek URL'sinde/gövdesinde portföy, işlem, tutar, kimlik yok (e2e).
- [ ] Sağlayıcı değişince `PriceProvider` arayüzü değişmez: sahte ikinci sağlayıcıyla birim test.
- [ ] Kaynak başarısızsa "veri yok" gösterilir, sayı uydurulmaz (mevcut davranış korunur).
- [ ] Anahtarlar yalnız sunucu ortam değişkeninde; `npm run guvenlik -- --dist` 0 kritik.
- [ ] Hisse/fon elle girişle ve CSV fiyat yüklemesiyle çalışır; BIST lisansı `TODO(hukuk)` olarak durur.
- [ ] CSP `connect-src` dış fiyat sunucuları olmadan geçer (csp e2e güncel).

### P6
- [ ] `npm run test:unit` (`node --test`) yeşil; her dışa aktarılan hesap fonksiyonunun en az bir testi var.
- [ ] Sınır durum testleri: sıfır adet, negatif fiyat, aynı gün çoklu işlem, farklı para birimi.
- [ ] ₺100.000 yatırım, ₺148.000 brüt senaryosu fixture'da; brüt, masraf sonrası, net, reel adım adım doğrulanır; fixture "örnek oran" etiketli.
- [ ] Hiçbir oran koda gömülü değil: kural 6 grep'i temiz; tarih aralığı sınırı (kural değişim günü) testli.
- [ ] `tax_rules.json` her satırda `sourceUrl` ve `status` taşır; doğrulanamayan oranlar `TODO(muhasebe)` ile işaretli.
- [ ] XIRR bilinen akışla eşleşir; çözülemeyen durumda `undefined`, throw yok.
- [ ] Mevcut kullanıcı görünen metin/sayılar değişmedi (e2e yeşil).

### P8 (onay sonrası)
- [ ] İki tarayıcı arasında ekip portföyü eşitlenir.
- [ ] Sunucu günlüğünde düz metin kullanıcı verisi yok.
- [ ] Üye çıkarılınca eski anahtar çalışmaz (anahtar dönüşü testi).
- [ ] Rol zorlaması: görüntüleyici yazamaz, imzasız işlem reddedilir.
- [ ] Anahtar kaybı ve kurtarma senaryosu yazılı ve denenmiş.

## P3 bağlama adımı — GİRİŞ KOŞULLARI (güvenlik 2. tur, 2026-10-27)

`src/storage/` yazıldı ve onaylandı ama uygulamaya BAĞLI DEĞİL. Bağlamadan önce kapanacaklar:

- **Y1 (orta):** `resilient.ts` — IndexedDB geçici `io`/`quota` hatasında yeni değer yalnızca yedeğe yazılıyor, sonraki okuma eski değeri getirebilir. `version`/`blocked` hatasında yazma yedeğe düşmemeli; yedeğe yazılan anahtar "kirli" işaretlenip okumada önce o kullanılmalı. Test ekle.
- **Y2:** `schema > CURRENT` kayıtta `set` `fail('version')` dönmeli, `fromRecord` okumayı reddetmeli.
- **Y3:** `db.onclose` işlenmeli; InvalidStateError'da bağlantı önbelleği sıfırlanmalı.
- **Y4:** `lastDegraded()` asıl depo başarılı olunca temizlenmeli (ya da "son hata" diye belgelenmeli).
- **Y5:** `migrate.ts` geri alma (`deleteIfEquals`) sonucu rapora yansımalı.
- **Ayrıca:** SIFIRLA ve çıkış IndexedDB'yi de silmeli; `load()` bozuk kayıtta boş duruma düşüp ilk kayıtta ezmemeli (`corrupt` ayrı ele alınmalı); yedek ve bulut için tek gerçek kaynak yazılı belirlenmeli; gerçek tarayıcıda (Playwright) IndexedDB e2e testi yazılmalı. Birim testler yalnızca sahte IndexedDB ile yeşil.
