# Birleşik yol haritası: tek ekran Projeksiyon, arka plan motorları ve çok kaynaklı veri

Yazan: yönetmen, 2026-10-27 (2. sürüm, kullanıcının "toplu ve detaylı" isteğiyle yeniden yazıldı). Durum: **PLAN. Kod yok, commit yok.**
Dayanak: `CLAUDE.md` → "KARARLAR (2026-10-27/28)", "KAPSAM KARARI", "EKİP HAFIZASI"; `AGENTS.md` §0;
`docs/veri-akisi/spec.md`, `docs/veri-akisi/mevcut-durum-ve-plan.md`, `docs/veri-akisi/cok-kaynakli-veri-plani.md`,
`docs/projeksiyon/gelismis-model-plani.md`. Satır numaraları 27.10'da kodda doğrulandı. Satır numaraları kayar; kullanmadan önce `grep -n` ile yeniden bulunmalı.
**Tasarım bu planın DIŞINDA:** ekran görünümünü kullanıcı kendisi hazırlıyor. Bu belge yalnızca motorların tasarıma vereceği
veri/arayüz sözleşmesini tanımlar (§11).

## 0. Özet (sade dille)

1. Ekranda tek pano kalacak: **Projeksiyon**. Diğer sekmelerin hesapları silinmeyecek; ekransız "motor" modüllerine taşınacak ve projeksiyonu besleyecek.
2. Sıra: yerel veri katmanını bağla → projeksiyon motoru → TCMB/EVDS ve kur → KAP → BİST → paylaşılan veri önbelleği → panelleri motora çevir → kenar çubuğunu en son kaldır.
3. Yerel veri katmanı (`src/storage/`) yazıldı ama uygulamaya bağlı değil; önce beş açık (Y1–Y5) kapanacak.
4. Kazıma tarayıcıdan yapılamaz; her kaynak için ayrı sunucu fonksiyonu (`api/*.mjs`) gerekir. Bu geliştirme ortamı kaynak sitelere ulaşamıyor; gerçek deneme Vercel önizlemesinde yapılır.
5. Portföy hiçbir adımda sunucuya gitmez. Sunucu yalnızca herkese açık, kişiselleştirilmemiş tabloları çeker. Tabloyu süzme işi tarayıcıda yapılır.
6. KAP ve BİST kazımasının hukuki riski açık. Kullanıcı kararıyla ilerlenir, `TODO(hukuk)` olarak işaretlenir, satışta alıcıya yazılı açıklanır.
7. `AGENTS.md` §0.4 bugün "BİST hisse fiyatı elle girilir" diyor. BİST adımından önce bu cümleyi kullanıcının onaylayıp güncellemesi gerekir.
8. Her adımın sonunda "elle denetim" listesi var. Kullanıcı her adımı ayrı ayrı onaylar.

| Adım | İş | Durum (27.10) | Sahip rol | Büyüklük |
|---|---|---|---|---|
| YH-1a…1e | P3 açıkları Y1, Y2, Y3, Y4, Y5 | Açık; çalışma ağacında incelenmemiş düzeltme görüldü (bkz. YH-1 notu) | veri-akışı; güvenlik inceler | Her biri küçük |
| YH-1f | P3 bağlama (store.ts → IndexedDB, açılış göçü, SIFIRLA, gerçek tarayıcı e2e) | Başlamadı | veri-akışı, test, güvenlik | Büyük |
| YH-2 | Projeksiyon Aşama A motoru (tasarım hariç) | Plan var | veri-akışı, uyum, test | Orta |
| YH-3 | TCMB/EVDS + kur bağdaştırıcısı | Kısmen: TÜFE ucu var, anahtar yok | veri-akışı, güvenlik, uyum, test; anahtar: kullanıcı | Orta |
| YH-4 | KAP bağdaştırıcısı (kazıma) | Başlamadı | veri-akışı, güvenlik, uyum, test | Büyük |
| YH-5 | BİST bağdaştırıcısı (kazıma, gün sonu) | Başlamadı; kaynak sayfa belirlenmedi | veri-akışı, güvenlik, uyum, test | Büyük |
| YH-6 | Paylaşılan herkese açık veri önbelleği | Başlamadı; Üst Kurul talebi gerekir | veri-akışı, güvenlik, Üst Kurul | Orta |
| YH-7 | Eski panellerin motora dönüşmesi (9 alt bölüm) | Başlamadı | veri-akışı, test | Orta (toplam büyük) |
| YH-8 | Kenar çubuğunu ve eski sekmeleri kaldırma (en son) | Başlamadı | test, veri-akışı; tasarım kullanıcıda | Büyük |

## 1. Her adımda geçerli ortak kurallar

- İşler ekip akışıyla (`.claude/workflows/fagent-ekip.js`, küçük koşu) yürür. Yönetmen kod yazmaz. Ajanlar commit atmaz. İncelenmemiş iş `/home/user/FAGENT-Raporlar/02-degisiklikler/` altına yama dosyası olarak konur.
- İstemler `docs/istem-iskeleti.md` biçimiyle yazılır. OKU bölümüne `CLAUDE.md` → EKİP HAFIZASI ve ilgili skill'in satır aralığı (`veri-akisi-haritasi`, `e2e-kosu`, `uyum-dili`, `turkce-regex`, `belge-kod-tutarliligi`) eklenir.
- **Kapı** (her adımın sonunda): `npm run typecheck` · `npm run build` · `npm run guvenlik -- --dist` (0 kritik) · `npm run test:unit` ·
  `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e` (sonuç "sahte Supabase ile yeşil" diye raporlanır) ·
  e2e kontrol sayısı azalmaz (son kayıt 699; bu oturumda koşulmadı).
- Yeni bağımlılık ya da servis gerekirse önce Üst Kurul talebi açılır (`docs/ust-kurul.md`).
- Dış kaynaklar bu ortamda `page.route()` ile taklit edilir. Raporda "gerçek ağda doğrulanmadı" yazar.
- Kullanıcıya görünen sayının yanında kaynak ve tarih bulunur. Uydurma sayı gösterilmez. Emir kipi ve "öneri/tavsiye" kullanılmaz.

## 2. Hedef mimari

```
Kaynaklar:  TCMB EVDS │ CoinGecko │ KAP │ BİST (gün sonu)
              │ yalnız sunucu, kaynak başına ayrı dosya: api/evds.mjs · api/prices.mjs · api/kap.mjs · api/bist.mjs
              │ ortak çatı: hız sınırı · önbellek · devre kesici · zaman aşımı · şema/mantık kontrolü
              │ (YH-6) isteğe bağlı paylaşılan depo: yalnız herkese açık piyasa verisi
Tarayıcı:   src/kaynaklar/  (KaynakSonucu<T>, kayıt defteri, önbellek KvStore üzerinden)
            src/motor/*     (saf: React/window/ağ yok; girdi parametreyle)
            src/storage/    (IndexedDB; portföy yalnız burada + localStorage aynası)
Ekran:      Projeksiyon (tek pano) + giriş çekmecesi — GÖRÜNÜM KULLANICIDA (§11 sözleşmesi)
```

Ortak sonuç tipi önerisi (`cok-kaynakli-veri-plani.md` §2.1 ile aynı): `KaynakSonucu<T> = { kaynak, durum: 'guncel'|'eski'|'ulasilamadi'|'kapali'|'veri_yok', veri?, donem?, alindi?, hata? }`.
Bağdaştırıcılar hata fırlatmaz (`src/evds.ts` deseni). Biri çökerse yalnızca o kaynağın bölümü etkilenir.

---

## YH-1 · P3 bağlama (yerel veri katmanı)

Genel bağlam: `src/storage/` (idb.ts, resilient.ts, migrate.ts, schema.ts, local.ts, types.ts, txnFields.ts) yazılıp onaylandı.
`src/storage/index.ts:2` "henüz store.ts'e BAĞLI DEĞİL" diyor. Birim testleri sahte IndexedDB ile çalışıyor (`tests/unit/depolama.test.ts:26` `fakeIdb`).
`tests/e2e` altında IndexedDB testi yok (`grep -rn indexedDB tests/e2e` boş). Giriş koşulları: `mevcut-durum-ve-plan.md` son bölüm.

> **Not (27.10, yazım sırasında):** Çalışma ağacında `src/storage/` altında 5 dosyada commit'lenmemiş değişiklik göründü
> (`git diff --stat`: idb.ts, index.ts, migrate.ts, resilient.ts, schema.ts). `resilient.ts` farkında "kirli anahtar", "version/blocked yedeğe düşmez"
> ve `lastDegraded` temizliği var; yani Y1–Y5 için başka bir koşu çalışıyor gibi. Aşağıdaki "Bugünkü durum" satırları HEAD (`4db0087`)
> içindir. O değişiklik incelenip kabul edilirse YH-1a…1e "incelemede/kapandı" olur. Kabul ölçütleri ve elle denetim listeleri aynen geçerli kalır.

### YH-1a · Y1: geçici hatada eski değerin geri okunması
- **Amaç:** IndexedDB geçici hata (`io`/`quota`) verdiğinde yedeğe yazılan yeni değer, sonraki okumada eski IndexedDB değerine yenilmesin.
- **Neden bu sırada:** Bağlamadan önce kapanmalı. Bağlandıktan sonra bu hata sessiz veri kaybı olarak görünür.
- **Bugünkü durum:** `src/storage/resilient.ts:22-26` `via()` fonksiyonu asıl depo hata verince yedeğe yazıyor; "kirli" işareti yok. Bir sonraki `get` önce asıl depoya bakıyor (`:31`) ve oradaki eski değeri döndürüyor.
- **Yapılacaklar:** (1) Yedeğe düşen `set` için anahtar "kirli" kümesine alınır (bellekte; isteğe bağlı olarak yedekte ayrı işaret anahtarı). (2) `get` kirli anahtarda önce yedeği okur. (3) Asıl depo yeniden yazılabilince kirli değer asıl depoya aktarılır ve işaret kalkar. (4) `version` ve `blocked` hataları yedeğe DÜŞMEZ; hata çağırana döner.
- **Dokunulmayacaklar:** `corrupt` davranışı (`:23`), `delete`'in yedeğe düşmemesi kuralı (`:39-43`), `KvStore` arayüzü (`types.ts`).
- **Kabul ölçütü:** `npm run test:unit` içinde "io hatasından sonra okuma yeni değeri verir", "version hatası yedeğe yazmaz" ve "blocked hatası yedeğe yazmaz" testleri geçer.
- **Testler:** Birim (sahte IndexedDB ile hata enjeksiyonu). Gerçek tarayıcı testi YH-1f'de yapılır.
- **Güvenlik/uyum:** Veri kaybı riskini azaltır. Uyum riski yok.
- **Bağımlılıklar:** Yok.
- **Geri alma:** Değişiklik `resilient.ts` içinde kalır. Uygulama henüz bağlı olmadığı için ürüne etkisi yoktur; yama geri alınır.
- **Elle denetim:**
  - [ ] Ekip raporunda `npm run test:unit` çıktısında Y1 testlerinin adı ve "ok" yazısı var.
  - [ ] Raporda "version/blocked yedeğe düşmez" cümlesi ve ilgili test adı var.
- **Doğrulanamayanlar:** Gerçek tarayıcının kota davranışı (YH-1f'de denenir).

### YH-1b · Y2: daha yeni şemalı kayıt
- **Amaç:** Daha yeni bir uygulama sürümünün yazdığı kaydı (schema > 1) eski kod ne ezsin ne de yanlış okusun.
- **Neden bu sırada:** Sürüm geri alındığında (geri alma planları buna dayanır) veri bozulmasın.
- **Bugünkü durum:** `src/storage/schema.ts:20` daha yeni şemalı kaydın alanlarını koruyarak YAZIYOR. `fromRecord` (`:29-34`) daha yeni şemayı da okuyor. Güvenlik turu ikisinin de reddedilmesini istedi.
- **Yapılacaklar:** `set`, mevcut kayıt `schema > CURRENT_RECORD_SCHEMA` ise `fail('version')` döner. `fromRecord` (ya da `get`) böyle kaydı okumayı reddeder ve `version` döner. `mergeRecord`'un davranışı belgelenir ya da kaldırılır; seçim gerekçesiyle rapora yazılır.
- **Dokunulmayacaklar:** v0 (zarfsız) kayıtların okunması (`:30`).
- **Kabul ölçütü:** Birim testleri: "schema 2 kayıt üstüne set → version", "schema 2 kayıt get → version", "v0 düz metin okunur".
- **Testler:** Birim.
- **Güvenlik/uyum:** Düşük risk.
- **Bağımlılıklar:** Yok. YH-1a ile aynı koşuda yapılabilir.
- **Geri alma:** Uygulama bağlı olmadığı için yama geri alınır.
- **Elle denetim:**
  - [ ] Raporda üç test adı ve "ok" yazısı var.
- **Doğrulanamayanlar:** Yok.

### YH-1c · Y3: bağlantının beklenmedik kapanması
- **Amaç:** Tarayıcı IndexedDB bağlantısını kendiliğinden kapatırsa (depolama temizliği, sekme askıya alma), sonraki işlem yeni bağlantı açsın.
- **Neden bu sırada:** Bağlandıktan sonra bu durum "kaydedilmedi" hatası olarak kullanıcıya yansır.
- **Bugünkü durum:** `src/storage/idb.ts:50` yalnızca `onversionchange` olayını işliyor; `db.onclose` yok. `run()` önbelleği yalnızca açılış başarısız olunca sıfırlıyor (`:69`). `InvalidStateError` sonrası bağlantı önbelleği sıfırlanmıyor.
- **Yapılacaklar:** `openDb` içinde `db.onclose = onClose`. `run()` içinde `InvalidStateError` yakalanınca `dbP = undefined` yapılır ve işlem bir kez yeniden denenir.
- **Dokunulmayacaklar:** `blocked` ve `version` eşlemesi (`:52-58`).
- **Kabul ölçütü:** Birim testi: "kapanan bağlantıdan sonraki set başarılı ve yeni open çağrıldı".
- **Testler:** Birim (sahte IndexedDB'ye `close` olayı). Gerçek tarayıcıda YH-1f.
- **Güvenlik/uyum:** Düşük risk.
- **Bağımlılıklar:** Yok.
- **Geri alma:** Yama geri alınır.
- **Elle denetim:**
  - [ ] Raporda test adı ve "ok" yazısı var.
- **Doğrulanamayanlar:** Tarayıcıların `onclose` olayını ne zaman tetiklediği (tarayıcıya göre değişir, bu ortamda ölçülmedi).

### YH-1d · Y4: "son düşüş" bilgisinin temizlenmesi
- **Amaç:** Yedeğe düşüş uyarısı, asıl depo yeniden çalışınca kaybolsun; ekranda sürekli "sorun var" görünmesin.
- **Neden bu sırada:** YH-1a ile aynı dosyada; bağlama sonrası ekrana çıkacak uyarının doğru olması için önce kapanır.
- **Bugünkü durum:** `src/storage/resilient.ts` içindeki `last` bir kez dolunca hiç temizlenmiyor (`:24,37,42`).
- **Yapılacaklar:** Asıl depoda başarılı bir `set` sonrası `last = undefined`. Ya da (seçim gerekçesiyle) ad "son hata" olarak değiştirilip belgelenir. Öneri: temizleme.
- **Dokunulmayacaklar:** `onFallback` bildirimi.
- **Kabul ölçütü:** Birim testi: "hata → başarılı yazma → lastDegraded() undefined".
- **Testler:** Birim.
- **Güvenlik/uyum:** Yok.
- **Bağımlılıklar:** YH-1a ile aynı dosya; aynı koşuda yapılır.
- **Geri alma:** Yama geri alınır.
- **Elle denetim:**
  - [ ] Raporda test adı ve "ok" yazısı var.
- **Doğrulanamayanlar:** Yok.

### YH-1e · Y5: göç geri almasının rapora yansıması
- **Amaç:** Yarım kalan göçün temizlenip temizlenmediği raporda görünsün.
- **Neden bu sırada:** Bağlamadaki ilk göç bu fonksiyonla yapılır; yarım göç görünmezse sorun izlenemez.
- **Bugünkü durum:** `src/storage/migrate.ts:42` `deleteIfEquals` sonucu kullanılmıyor.
- **Yapılacaklar:** `MigrateEntry`'ye geri alma sonucu eklenir (ör. `geriAlindi: true|false|'hata'`). Hata durumunda rapor `ok: false` kalır.
- **Dokunulmayacaklar:** Göçün "kaynağı asla silme" ve "farklı değerin üstüne yazma" kuralları (`:1-8`).
- **Kabul ölçütü:** Birim testi: "doğrulama okuması hata → geri alma denendi ve raporda görünüyor".
- **Testler:** Birim.
- **Güvenlik/uyum:** Yok.
- **Bağımlılıklar:** Yok.
- **Geri alma:** Yama geri alınır.
- **Elle denetim:**
  - [ ] Raporda test adı ve "ok" yazısı var.
- **Doğrulanamayanlar:** Yok.

### YH-1f · Bağlama: uygulama verisini IndexedDB'ye taşıma
- **Amaç:** Portföy ve diğer 4 kullanıcı katmanı IndexedDB'de kalıcı olsun. localStorage bir süre "ayna" olarak yazılmaya devam eder.
- **Neden bu sırada:** Projeksiyonun ve tüm motorların okuduğu tek gerçek kaynak burası. Sonraki adımlar sağlam bir zemine ihtiyaç duyuyor. Kullanıcının sırası da bu.
- **Bugünkü durum:** `src/store.ts:131-158` `load()` localStorage'dan okuyor. JSON bozuksa `catch` içinde boş durum (`EMPTY`) dönüyor (`:155-157`); ilk `commit()` (`:160-163`) bozuk kaydın üstüne yazıyor. SIFIRLA (`src/localData.ts:63-77`) ve çıkış (`:79-87`) yalnız localStorage'ı temizliyor. `src/main.tsx` açılışta bekleme yapmıyor.
- **Yapılacaklar:**
  1. `src/main.tsx`: render öncesi `initDataLayer()` çalışır. Göç hedefi doğrudan `createIdbStore()` olur (`src/storage/index.ts:5-6` notu). IndexedDB boşsa localStorage v1 anahtarları kopyalanır (`migrateKeys`). Kaynak silinmez.
  2. İki kopya da dolu ve farklıysa kural yazılıp test edilir (plan §3: "son yazılan ayna hash'i"). Ayna dışarıdan değişmişse (yedekten geri yükleme, e2e `page.evaluate`) ayna içeri alınır.
  3. `store.ts` `commit()`: önce IndexedDB'ye kuyruklu yazma, sonra ayna. IndexedDB başarısızsa kullanıcıya bildirilir (sessiz değil).
  4. `agentMemory.ts`, `agentTraining.ts`, `taxRates.ts`, `targetAllocation.ts`: aynı yazma yolunu kullanır.
  5. `load()` bozuk kayıtta `corrupt` durumuna geçer. Bozuk kopya ayrı anahtara saklanır ve ilk kayıtta ezilmez. Kullanıcıya "kayıt okunamadı" iletisi gösterilir (`ErrorBoundary.tsx:23` deseni).
  6. `localData.ts` `clearLocalUserData` / `clearForSignOut` IndexedDB kayıtlarını da siler.
  7. "Tek gerçek kaynak" kuralı yazılı olur: yedek (`backup.ts` `snapshotUserData` `:149`) ve bulut (`cloud.ts`) aynadan değil, depodan okur. Ayna kaldırılana kadar ikisi eşittir; eşitlik test edilir.
  8. `navigator.storage.persist()` istenir. Reddedilirse ya da gizli sekmede IndexedDB yoksa yedek alma uyarısı gösterilir.
  9. Gerçek tarayıcı e2e dosyası `tests/e2e/fagent-yerel-veri-e2e.mjs` eklenir.
- **Dokunulmayacaklar:** `store.ts` dış API'si (`actions.*`, `getPortfolio`, `subscribePortfolio`, `usePortfolio`). `BACKED_UP_KEYS` (`backup.ts:26`). `src/cloud.ts` mantığı (27.10 kararı: Supabase kodu açık kalır). `tests/e2e/fagent-auth-e2e.mjs` beyaz liste kontrolleri. Bileşenler.
- **Kabul ölçütü:** (1) Kapı yeşil, kontrol sayısı azalmadı. (2) Yeni e2e şunları gösterir: yenileme sonrası 5 katman IndexedDB'den geliyor, ayna anahtarı silinse bile; SIFIRLA sonrası IndexedDB boş; bozuk JSON ezilmiyor; ağ günlüğünde kullanıcı verisi taşıyan istek yok. (3) `grep -rn "indexedDB" src` yalnız `src/storage/` içinde.
- **Testler:** Birim (göç kuralı, iki kopya kuralı). **Gerçek Chromium'da IndexedDB e2e** (Playwright, sahte değil). Mevcut 26 e2e dosyası değişmeden yeşil.
- **Güvenlik/uyum:** Veri kaybı riski en yüksek adım. Açılış gecikmesi ve iki sekmenin aynı anda yazması riskleri var (son yazan kazanır; `BroadcastChannel` ayrı karar). Uyum riski yok.
- **Bağımlılıklar:** YH-1a…1e kapalı olmalı. Yeni paket yok (Dexie seçilmedi, bağımlılıksız katman yazıldı).
- **Geri alma:** Ayna sürdüğü için geri dönüş mümkün. Bağlama `src/config/` altında tek bir sabit bayrağa bağlanır (öneri ad: `YEREL_DB_ACIK`; ortam değişkeni değil). Kapatılınca uygulama bugünkü gibi localStorage'dan okur. IndexedDB'deki kopya silinmez.
- **Elle denetim:**
  - [ ] Önizlemeyi aç, örnek portföy yükle, sayfayı yenile: varlıklar duruyor.
  - [ ] Tarayıcıda F12 → "Application" → "IndexedDB" → `fagent` → `kv` aç: `fagent.portfolio.v1` satırı görünüyor.
  - [ ] SIFIRLA'ya bas, aynı yere tekrar bak: kayıtlar silinmiş.
  - [ ] Yedek dosyası indir, SIFIRLA, yedeği geri yükle: varlıklar geri geldi.
  - [ ] Gizli pencerede aç: uygulama çalışıyor, yedek uyarısı görünüyor.
- **Doğrulanamayanlar:** Safari ve Firefox'ta davranış (ortamda yalnız Chromium var). Tarayıcının depoyu tahliye etme politikası.

---

## YH-2 · Projeksiyon Aşama A motoru (tasarım hariç)

- **Amaç:** Projeksiyon hesabını saf ve test edilebilir bir modüle taşımak. Stopaj sonrası değer, reel değer, varsayım etiketleri, hedef karşılaştırması, 3×3 duyarlılık ve deterministik sıra riski hesaplarını eklemek. Ekran görünümü kullanıcının işidir; bu adım yalnız hesap ve veri sözleşmesi üretir.
- **Neden bu sırada:** Tek ekran Projeksiyon olacağı için bütün motorların hedefi bu modül. Önce bu modülün girdi sözleşmesi belli olmalı ki diğer motorlar ona göre çıktı versin.
- **Bugünkü durum:** Hesap `src/App.tsx` içinde: `projectFinalValue` (`:1285`), `SCENARIOS` (`:1294` civarı), `Projeksiyon()` (`:1301`). Stopaj düşülmüyor. Oranlar `src/config/varsayilanlar.ts:58` (`SCENARIO_DEFAULT_RATES_PCT`, kaynaksız). e2e: `tests/e2e/fagent-projection-e2e.mjs` (12 `check(` çağrısı; plan belgesi 13 diyor, sayım farkı doğrulanmalı).
- **Yapılacaklar:**
  1. `src/projection.ts` (saf, `import type` + `.ts` uzantılı içe aktarma): `projeksiyonYollari(girdi)` aylık bileşik yol, `sonDeger`, `reelDeger(nominal, enflasyon, yil)`.
  2. `stopajSonrasi(girdi, oranlar)`: yalnız kazanç kısmına, varlık türü ağırlığıyla (`analytics.ts:527` `afterTaxOf` mantığı yeniden kullanılır). `UNVERIFIED_TAX` türleri `dogrulanmadi: true` döner.
  3. `etiketler`: her girdi için `'resmi' | 'varsayim' | 'kullanici'` (enflasyon `inflation.ts:20` `InflationSource` ile eşlenir).
  4. `hedefKarsilastirma(sonuc, hedef?)`: hedef yoksa `undefined`. Varsayılan hedef yok.
  5. `duyarlilik3x3(girdi)`: getiri (düşük/orta/yüksek) × enflasyon (−10/girdi/+10 puan) → reel değer.
  6. `siraRiski(girdi)`: aynı ortalama getiri, "kötü yıllar başta" ve "kötü yıllar sonda" iki deterministik sıra.
  7. `App.tsx` `Projeksiyon()` bu modülü çağırır. Ekrandaki mevcut sayılar değişmez. Yeni sonuçlar şimdilik ekrana konmaz (yalnız motor + test). Tasarım hazır olunca bağlanır.
- **Dokunulmayacaklar:** Ekran yerleşimi, renkler, grafik (kullanıcıda). Senaryo varsayılan oranları (değişirse eski sayı `grep -rn` ile testlerde aranır). Monte Carlo (Aşama B; ayrı onay).
- **Kabul ölçütü:** `npm run test:unit` içinde bilinen girdi → sabit sonuç (0 getiri, 0 katkı, 1 yıl; kazanç yokken vergi 0; köşe hücreler). `grep -n "Math.pow" src/App.tsx` projeksiyon bölümünde boş. `fagent-projection-e2e` değişmeden yeşil.
- **Testler:** Birim (her dışa aktarılan fonksiyon için en az bir test + sınır durumlar). e2e mevcut kontroller.
- **Güvenlik/uyum:** Orta uyum riski: sonuç adları ve metinlerde "tahmin", "beklenen getiri", "hedefe ulaşmak için" geçmez (`uyum-dili` skill'i). Oranlar doğrulanmadı → `TODO(muhasebe)`.
- **Bağımlılıklar:** YH-1f önerilir (başlangıç değeri depodan gelir), ama teknik olarak bağımsızdır.
- **Geri alma:** `Projeksiyon()` eski satır içi hesaba döner; modül kalabilir.
- **Elle denetim:**
  - [ ] Projeksiyon sekmesini aç: sayılar adım öncesindeki ekran görüntüsüyle aynı (ekip öncesi/sonrası görüntü ekler).
  - [ ] Raporda `src/projection.ts` fonksiyon listesi ve her biri için test adı var.
  - [ ] Raporda yasak kelime taramasının (`uyum-dili`) temiz çıktısı var.
- **Doğrulanamayanlar:** Stopaj oranlarının doğruluğu (muhasebeci). Senaryo getirilerinin kaynağı (yok, varsayım).
- **Yapıldı (Aşama A motoru, 2026-10-28):** `src/projection.ts` (saf; React/DOM/localStorage yok). Dosya adı kullanıcı talimatıyla `projection.ts` (plan `projeksiyon.ts` diyordu). `App.tsx` `Projeksiyon()` artık `sonDeger`, `reelDeger`, `projeksiyonYollari` çağırıyor; eski `projectFinalValue` ve satır içi döngüler silindi, ekrandaki sayı/metin değişmedi (eşdeğerlik `tests/unit/projeksiyon.test.ts` içinde taşıma öncesi formül kopyasıyla `Object.is` düzeyinde kanıtlı). Yeni sabit: `SIRA_RISKI_SAPMA_PP = 15` (`varsayilanlar.ts`, kaynaksız ürün varsayımı; vergi/mevzuat iddiası yok, muhasebe doğrulaması gerekmez). Arayüze bağlanmayan: `senaryoSonucu`, `stopajSonrasiDeger`, `turAgirliklari`, `hedefeUlasmaSuresi`, `getiriEnflasyonTablosu`, `siraRiski`, `birlestirKaynak`, `enflasyonEtiketi`.
- **Kalan işler (YH-2):** (1) e2e `fagent-projection-e2e` koşusu (test ajanı); (2) yeni sonuçların arayüze bağlanması + etiket metinleri (tasarım oturumu, `uyum-dili`); (3) "hedefin %N'i" cümlesi için betimleyici oran fonksiyonu (arayüz kararı gelince); (4) stopaj oranlarının muhasebe doğrulaması (sıra riski sapması ürün varsayımıdır, bu kapsamda değil); (5) Aşama B (Monte Carlo) ayrı onaya bağlı, YAPILMADI; (6) enflasyon kaynağı etiketi `enflasyonEtiketi(inf.source)` ile bağlanacak.

---

## YH-3 · TCMB/EVDS + kur bağdaştırıcısı

- **Amaç:** Enflasyon (TÜFE) ve döviz kurunu tek kaynaktan, "TCMB (EVDS üzerinden)" çekmek. Ortak bağdaştırıcı çatısını (KaynakSonucu, kayıt defteri, önbellek, devre kesici) kurmak. CoinGecko çağrısını sunucu ucuna almak.
- **Neden bu sırada:** Resmî, belgelenmiş, anahtarlı tek kaynak bu. Kazıma adımlarının kullanacağı çatı riski düşük bir kaynakla kurulup sınanır.
- **Bugünkü durum:** `src/evds.ts:74` `fetchInflationPct` → aynı köken `/api/evds` → `api/evds.mjs` → `netlify/functions/evds.mjs`. Beyaz listede yalnız `TP.FG.J0` var (`netlify/functions/evds.mjs:25`). Vercel'de `EVDS_API_KEY` yok (`CLAUDE.md` 27.10). Kur Frankfurter'dan geliyor (`src/market.ts:36`, `src/priceHistory.ts:86`). Kripto doğrudan CoinGecko'dan (`src/market.ts:52`, `src/cryptoMarketData.ts:111`). CSP `connect-src` bu iki dış sunucuyu açıkça içeriyor (`vercel.json:13`).
- **Yapılacaklar:**
  1. (Kullanıcı) `EVDS_API_KEY` Vercel `fagent` projesine eklenir. `TP.FG.J0` gerçek yanıtla doğrulanır.
  2. `src/kaynaklar/tip.ts`: `KaynakSonucu`, saf `kaynakDurumMetni(sonuc)`, saf TTL ve geri çekilme hesapları.
  3. `src/kaynaklar/kayit.ts`: kaynakları bağımsız çağırır (`Promise.allSettled` mantığı). Önbellek `KvStore` arayüzü üzerinden tutulur (YH-1 bitince IndexedDB).
  4. `src/kaynaklar/tcmb.ts`: TÜFE (mevcut `fetchInflationPct` sarılır) ve kur. Kur seri kodları gerçek yanıtla doğrulanınca `IZINLI_SERILER`'e eklenir. Kurların tamamı tek sabit tablo olarak çekilir; süzme istemcide yapılır.
  5. `api/prices.mjs`: CoinGecko için sabit "ilk N coin" tablosu, `s-maxage` önbelleği. İstemci sembol göndermez.
  6. `src/market.ts`, `src/priceHistory.ts`, `src/cryptoMarketData.ts` imzalarını korur, içeride bağdaştırıcıyı çağırır.
  7. Frankfurter otomatik yedek OLMAZ (kullanıcı kararı). CSP'den Frankfurter ve CoinGecko çıkar.
  8. Durum satırı metinleri (`cok-kaynakli-veri-plani.md` §2.5'teki 5 durum) saf fonksiyondan üretilir.
- **Dokunulmayacaklar:** `InflationState` içindeki `kullanici` önceliği (`inflation.ts`). Vergi oranları (bu kaynak vergi oranı vermez). Netlify aynası (silinip silinmeyeceği ayrı karar).
- **Kabul ölçütü:** (1) e2e'de `/api/evds` 502 taklit edilince kripto bölümü çalışıyor, enflasyon "ulaşılamadı + son bilinen değer/varsayım" metnini gösteriyor. (2) Ağ günlüğü kontrolü: istek URL'sinde ve gövdesinde portföy, tutar ya da sembol listesi yok. (3) `grep -n "frankfurter\|coingecko" vercel.json` boş. (4) `fagent-csp-e2e` güncel ve yeşil. (5) Önizlemede `/api/evds` 200 dönüyor ve yıllık TÜFE TÜİK açıklamasıyla aynı (elle kontrol).
- **Testler:** Birim (TTL, devre kesici, 5 durum metni). e2e: kaynak başına arıza taklidi. Değişen taklitler: URL'ye bağlı 4 dosya (`cryptodemo`, `cryptomarket`, `live`, `risk`). Gerçek ağ kontrolü yalnız önizlemede yapılır.
- **Güvenlik/uyum:** Sunucu ucu girdiyi beyaz listeyle doğrular, keyfi URL almaz. Anahtar yalnız sunucuda durur. TCMB kuru ECB'den farklı çıkar; testlerdeki sabit sayılar `grep -rn` ile aranır. `TODO(hukuk)`: EVDS şartlarının ticari/abonelikli üründe gösterime izin verip vermediği.
- **Bağımlılıklar:** Kullanıcının anahtarı eklemesi. YH-1 (önbellek IndexedDB'ye taşınır; o zamana kadar `createLocalStore`).
- **Geri alma:** Bağdaştırıcılar imzaları koruduğu için eski `fetch` gövdesine dönülebilir. CSP değişikliği aynı yamada geri alınır.
- **Elle denetim:**
  - [ ] Vercel → `fagent` → Settings → Environment Variables: `EVDS_API_KEY` görünüyor (değeri gösterilmez).
  - [ ] Önizlemede enflasyon değerinin yanında "Kaynak: TCMB EVDS · dönem …" yazıyor.
  - [ ] Bir döviz varlığında kurun yanında TCMB kaynağı ve tarihi yazıyor.
  - [ ] F12 → "Network": `frankfurter` ya da `coingecko` adresine giden istek yok, yalnız `/api/...` istekleri var.
- **Doğrulanamayanlar:** EVDS kur seri kodları. İstek kotası. evds2 → evds3 geçiş tarihi. TÜFE seri kodunun doğruluğu (anahtar gelmeden).

---

## YH-4 · KAP bağdaştırıcısı (kazıma)

- **Amaç:** KAP'tan herkese açık bildirimleri (başlık, tarih, şirket kodu, bağlantı) çekmek. Portföydeki hisselere ait bildirimleri tarayıcıda süzüp yorumsuz listelemek. Projeksiyona yalnız betimleyici olay olarak ("X için D tarihinde bildirim var") bağlamak.
- **Neden bu sırada:** YH-3'teki çatıyı kullanır. KAP bildirimleri herkese açık metin olduğundan fiyat lisansı konusuna göre daha az belirsizdir, bu yüzden BİST'ten önce gelir. Yine de risk yüksek.
- **Bugünkü durum:** Kodda KAP yok. Resmî, belgelenmiş, ücretsiz geliştirici API'si bulunamadı. Topluluk araçları sitenin iç uçlarını (`kap.org.tr/tr/api/...`) kullanıyor (`cok-kaynakli-veri-plani.md` §4, bağlantılar orada). Bu ortamdan `kap.org.tr` erişimi reddedildi.
- **Yapılacaklar:**
  1. Ortak sunucu çatısı `api/_kazima.mjs` (öneri ad): sabit hedef listesi; istekler arası bekleme; zaman aşımı (8 sn önerisi); en çok 2 yeniden deneme; devre kesici (15 dk); kimliği belli User-Agent (ürün adı + iletişim adresi, devirde değişir); robots.txt kontrolü; yanıt şeması ve mantık kontrolü; hata durumunda `KaynakSonucu` biçimi.
  2. `api/kap.mjs`: kullanıcıdan girdi almaz. "Son N genel bildirim" tablosunu çeker ve `s-maxage` ile önbelleğe alır (30 dk önerisi).
  3. `src/kaynaklar/kap.ts`: tabloyu alır, portföydeki hisse kodlarıyla tarayıcıda süzer.
  4. Ayrıştırıcı kaydedilmiş örnek yanıtlarla (fixture) test edilir. Fixture ortamda erişim olmadığı için kullanıcının ya da önizleme loglarının sağladığı gerçek yanıttan alınır. Uydurma fixture "örnek" diye etiketlenir.
  5. Metin şablonu: "ŞİRKET · tarih · bildirim başlığı · KAP bağlantısı". Yorum, özet ya da yön yok.
- **Dokunulmayacaklar:** Ajanın tavsiye dili kuralları. Hiçbir kullanıcı verisi (sembol listesi dahil) sunucuya gönderilmez.
- **Kabul ölçütü:** (1) e2e'de `/api/kap` 502 taklit edilince yalnız KAP bölümü "ulaşılamadı" diyor, diğer kaynaklar çalışıyor. (2) Ağ günlüğünde `/api/kap` isteğinde parametre yok. (3) Ayrıştırıcı birim testleri bozuk/eksik yanıtta `veri_yok` ya da `okunamadi` döndürüyor, hata fırlatmıyor. (4) `grep -rn "TODO(hukuk)" api/kap.mjs` en az bir satır veriyor.
- **Testler:** Birim (ayrıştırıcı, süzme). e2e (taklit). Gerçek kaynak denemesi yalnız önizlemede, elle.
- **Güvenlik/uyum:** **Yüksek.** `TODO(hukuk)`: iç uçları sunucudan çağırmanın kullanım koşullarına uygunluğu, MKK izni ya da lisans gereği, yeniden yayın. `TODO(hukuk)` SPK: portföye göre bildirim listelemenin danışmanlık sayılıp sayılmadığı. Güvenlik: SSRF (sunucu taraflı istek sahteciliği) riskine karşı hedef sabit, kullanıcı girdisi yok. Yanıt boyutuna üst sınır konur.
- **Bağımlılıklar:** YH-3 çatısı. Kullanıcının S0 hukuk okuması (öneri: başlamadan önce; kullanıcı kararıyla ilerlenebilir). HTML ayrıştırma gerekirse önce Üst Kurul talebi (iç uçlar JSON dönüyorsa gerekmez; doğrulanamadı).
- **Geri alma:** Kaynak kayıt defterinden çıkarılır (tek satır). `api/kap.mjs` silinir. Diğer kaynaklar etkilenmez.
- **Elle denetim:**
  - [ ] Önizlemede portföye bildiği bir hisse ekle: KAP bölümünde o şirketin son bildirimleri tarih ve bağlantıyla listeleniyor.
  - [ ] Bağlantıya tıkla: KAP'ın kendi sayfası açılıyor.
  - [ ] Listede "al/sat/öneri" ya da yorum cümlesi yok.
  - [ ] Hukuk metinlerini okuyup kararını `docs/karar-gunlugu.md`'ye yazdırdın.
- **Doğrulanamayanlar:** İç uçların adresi, biçimi ve kararlılığı. KAP'ın Vercel IP'lerini engelleyip engellemediği. KAP kullanım/yasal metni (bulunamadı).

---

## YH-5 · BİST bağdaştırıcısı (kazıma, gün sonu)

- **Amaç:** Hisse fiyatını otomatik getirmek, böylece elle giriş zorunluluğunu azaltmak. Öneri kapsam: yalnız gün sonu kapanış. Elle/CSV giriş her zaman yedek yol olarak kalır.
- **Neden bu sırada:** Hukuki ve teknik açıdan en belirsiz kaynak. Çatı ve önbellek bu noktada sınanmış olur.
- **Bugünkü durum:** Hisse fiyatı elle giriliyor (`App.tsx` `Panel` `:767` `updateHoldingValue`; `AGENTS.md` §0.4). Lisanssız ücretsiz resmî yol bulunamadı (`cok-kaynakli-veri-plani.md` §4). Hangi herkese açık sayfadan çekileceği **belirlenmedi**. Borsa İstanbul sitesinde gün sonu bülten dosyası olup olmadığı bu ortamda doğrulanamadı.
- **Yapılacaklar:**
  1. (Kullanıcı + uyum) Kaynak sayfa seçilir. Seçim ölçütleri: herkese açık, kullanım koşulu okunmuş, gün sonu, tüm hisseler tek tabloda.
  2. `api/bist.mjs`: YH-4 çatısıyla tüm hisselerin gün sonu tablosunu çeker. Günde bir kez, `s-maxage` ile önbelleğe alır. Kullanıcıdan girdi almaz.
  3. `src/kaynaklar/bist.ts`: tabloyu alır, portföydeki kodlarla süzer, `KaynakSonucu` döner.
  4. `src/motor/fiyat.ts` (YH-7.2): fiyat kaynağı önceliği şu sırayla: kullanıcı girişi → BİST bağdaştırıcısı. Kullanıcının elle girdiği değer onay almadan ezilmez. Her değerin yanında kaynak ve tarih bulunur.
  5. Mantık kontrolü: önceki kapanışa göre günlük ±%20 dışı değer `mantik_disi` sayılır ve gösterilmez (eşik `varsayilanlar.ts`'e yazılır).
- **Dokunulmayacaklar:** TEFAS fon fiyatı (kapsamda yok, elle kalır). Gün içi ya da gerçek zamanlı veri.
- **Kabul ölçütü:** (1) Taklit tabloyla hisse değeri "Kaynak: … · kapanış tarihi …" etiketiyle güncelleniyor. (2) Elle girilmiş değer onaysız değişmiyor. (3) Kaynak çökünce son bilinen değer tarihiyle görünüyor ya da elle değer kalıyor. (4) Ağ günlüğünde sembol listesi yok.
- **Testler:** Birim (ayrıştırıcı, öncelik kuralı, mantık kontrolü). e2e (taklit). Gerçek kaynak yalnız önizlemede.
- **Güvenlik/uyum:** **En yüksek risk.** BİST verisi lisanslı dağıtıcılar üzerinden yayılıyor. `TODO(hukuk)`: gecikmeli ya da gün sonu verinin üçüncü taraf uygulamada lisanssız gösterimi; ücretli üründe (adım 8) gösterim; satışta alıcıya açıklama. `AGENTS.md` §0.4 güncellenmeden başlanmaz (§13).
- **Bağımlılıklar:** YH-4 çatısı. §0.4 güncellemesi. Kaynak sayfa kararı. Gerekirse HTML ayrıştırıcı için Üst Kurul talebi.
- **Geri alma:** Kaynak kayıt defterinden çıkarılır. Fiyat motoru elle girişe döner. Kullanıcının girdiği değerler zaten korunuyor.
- **Elle denetim:**
  - [ ] Önizlemede bildiğin bir hissenin gösterilen kapanışı, aynı gün başka bir kaynaktan baktığın kapanışla aynı.
  - [ ] Değerin yanında kaynak adı ve kapanış tarihi yazıyor.
  - [ ] Elle değer girdiğin hisse kendi kendine değişmedi.
  - [ ] §0.4 cümlesinin yeni hâlini onayladın.
- **Doğrulanamayanlar:** Kaynak sayfa. Lisans gereği. Vercel IP engeli. Tatil günleri ve yarım gün seansın tabloya yansıması.

---

## YH-6 · Paylaşılan herkese açık veri önbelleği

- **Amaç:** Büyük ve herkese açık veri gruplarını (gün sonu fiyat geçmişi, bildirim arşivi, TÜFE ve kur serileri) kullanıcıdan bağımsız tek bir depoda biriktirmek. Kaynaklara her kullanıcı için ayrı ayrı gidilmez.
- **Neden bu sırada:** Hangi verinin biriktirileceği YH-3/4/5 sonrasında belli olur. Daha önce kurulursa boş bir altyapı olarak kalır.
- **Bugünkü durum:** Sunucu tarafında veri deposu yok. Yalnız HTTP önbelleği var (`api/evds.mjs` → 6 saat). Supabase yalnız hesap için kullanılıyor (`supabase/migrations/20261018000000_portfolios_and_account_deletion.sql`) ve canlıda env tanımlı değil.
- **Seçenekler:** (a) yalnız CDN önbelleği: yeni servis gerekmez, ama geçmiş birikmez. (b) **Ayrı Supabase projesi** ve `piyasa_verisi` tablosu: geçmiş birikir, bilinen bir araç. (c) Vercel Blob/Edge Config: yeni servis, sorgu yeteneği sınırlı. **Öneri:** YH-3'te (a). Geçmiş gerekince (b), kullanıcı hesap projesinden **ayrı** proje olarak.
- **Yapılacaklar (b seçilirse):**
  1. Üst Kurul talebi (aşağıda taslak).
  2. Tablo önerisi: `piyasa_verisi(kaynak, anahtar, donem, alindi, veri jsonb, birincil anahtar (kaynak, anahtar, donem))`. RLS açık, anonim erişim yok. Okuma ve yazma yalnız sunucu fonksiyonundan, servis anahtarıyla yapılır.
  3. Zamanlanmış iş (Vercel Cron önerisi): kaynak başına ayrı iş. Biri çökerse diğerleri etkilenmez.
  4. `api/*.mjs` önce depoya bakar, yoksa kaynağa gider. Tarayıcı yalnız `/api/*` okur; `VITE_SUPABASE_*` gerekmez.
- **Dokunulmayacaklar:** Hesap katmanı (`cloud.ts`, `Account.tsx`, mevcut migration). Canlı-öncesi zorunlu liste (34+33, 35, 41, 27). Kullanıcı verisi.
- **Kabul ölçütü:** (1) Tabloda kullanıcı kimliği, IP ya da portföy alanı yok (şema incelemesi). (2) Depo boşken ya da erişilemezken uygulama YH-3 davranışıyla çalışıyor (e2e taklit). (3) `npm run guvenlik -- --dist` servis anahtarını istemci paketinde bulmuyor. (4) `scripts/build.mjs` `sb_secret_`/service_role içeren `VITE_*` değerinde derlemeyi durdurmaya devam ediyor.
- **Testler:** Sunucu fonksiyonu birim testi (depo var/yok/bozuk). e2e taklit. Gerçek depo yalnız önizlemede.
- **Güvenlik/uyum:** Servis anahtarı yalnız Vercel ortam değişkeninde durur. Vercel loglarında istek IP'leri görünür; log saklama ayarı KVKK açısından not edilir (`TODO(hukuk)`). Yeniden yayın riski YH-4/5 ile aynı.
- **Bağımlılıklar:** Üst Kurul onayı. Kullanıcının ayrı Supabase projesini açması. YH-3…5'ten en az biri.
- **Geri alma:** `api/*.mjs` depo okumasını atlar (tek bayrak) ve CDN önbelleğine döner. Depo silinebilir; içinde kullanıcı verisi olmadığı için kayıp yok.
- **Elle denetim:**
  - [ ] Supabase panelinde yeni projeyi aç: `piyasa_verisi` tablosunda yalnız kaynak, tarih ve piyasa verisi sütunları var.
  - [ ] Hesap projesinden ayrı olduğunu proje adından gör.
  - [ ] Vercel → Cron Jobs: işlerin son çalışma zamanı görünüyor.
- **Doğrulanamayanlar:** Vercel Cron sıklık ve plan sınırları. Supabase ücretsiz katman kotası. Maliyet.

Üst Kurul talep taslağı:
```
TALEP: Vercel Cron + ayrı Supabase projesi (sunucu tarafı, servis anahtarıyla)
NE İÇİN: YH-6 paylaşılan herkese açık piyasa verisi önbelleği
NEDEN: CDN önbelleği geçmiş biriktiremez; her istemcinin kaynağa gitmesi kazıma yükünü artırır
ALTERNATİF: yalnız CDN önbelleği (geçmiş yok) / Vercel Blob (sorgu sınırlı)
VERİ AKIŞI: kullanıcı verisi yok; istemciye anahtar girmez; istemci yalnız /api/* okur
MALİYET/LİSANS: ücretsiz katman sınırları doğrulanamadı; veri yeniden yayını TODO(hukuk)
```

---

## YH-7 · Eski panellerin motora dönüşmesi

Genel kural: Her motor `src/motor/<ad>.ts` içinde saf modül olur (React, window ve ağ yok; `AGENTS.md` §0.6 gibi). Mevcut fonksiyonlar
**taşınmaz, yeniden dışa aktarılır**: `analytics.ts` ve `agent.ts` aynı adlarla kalır, bileşenler kırılmaz. Ekran bu adımda DEĞİŞMEZ.
Görünüm YH-8'de ve kullanıcının tasarımıyla değişir. Her alt bölümün kabul ölçütü ortaktır: motor için birim test, kapı yeşil, ekranda sayı değişmemiş.
Ortak geri alma: motor dosyası kaldırılır, bileşen eski çağrıya döner (imzalar korunduğu için tek yamadır).

### YH-7.1 · Panel (genel görünüm) → `motor/degerleme`
- **Girdi:** `PortfolioState` (`store.ts:40`), hedef dağılım (`targetAllocation.ts`).
- **Çıktı:** `{ toplam, maliyet, kz: Pnl, dagilim: AllocationSlice[], yogunlasma, sapma: DriftResult, yatirimGecmisi }` → projeksiyonun başlangıç değeri ve tür ağırlıkları.
- **Taşınan/sarılan fonksiyonlar:** `totalValue`, `totalCost`, `pnlOf`, `investmentHistoryOf` (`store.ts:335-353`); `allocation`, `concentrationOf`, `driftOf`, `attributionOf`, `contributionOf`, `investmentPaceOf`, `xirrOf` (`analytics.ts:86-310`).
- **Kalacak kod:** `Panel` (`App.tsx:625`) ekranı YH-8'e kadar kalır. Giriş işlevleri (varlık ekleme `:694-699`, CSV `:746-751`, değer düzenleme `:767`, silme `:989`) motor değil, **giriş çekmecesi** sözleşmesine girer (§11). `store.ts` `actions.*` aynen kalır.
- **Kaldırılacak kod (YH-8'de, onayla):** Panel kartlarının görsel bileşenleri (pasta, yatırım grafiği).
- **Elle denetim:** [ ] Panel sekmesindeki toplam, maliyet ve K/Z adımdan önceki görüntüyle aynı.

### YH-7.2 · Hisseler / Fonlar / Kripto → `motor/fiyat`
- **Bugünkü durum:** Üçü de aynı `Panel` bileşeni, `assetType` süzgeciyle çalışıyor (`App.tsx:2073-2075`). Canlı fiyat yalnız döviz ve kripto için var (`fetchLiveTl` `:129`, `refreshPrice` `:726`, `actions.applyLivePrice` `store.ts:247`).
- **Girdi:** varlıklar, `KaynakSonucu` (tcmb kur, coingecko, YH-5 bist).
- **Çıktı:** her varlık için `{ deger, kaynak: 'elle'|'tcmb'|'coingecko'|'bist', tarih, durum }`.
- **Taşınan:** `fetchLiveTl` mantığı (UI dışı kısmı), fiyat kaynağı öncelik kuralı (YH-5 madde 4).
- **Kalacak kod:** `actions.applyLivePrice`, `updateHoldingValue`. Fon elle girişi.
- **Kaldırılacak (YH-8):** Üç ayrı sekme (süzgeç ayrıntı görünümüne dönüşebilir; karar K4).
- **Elle denetim:** [ ] Bir kripto varlıkta "fiyatı yenile" eskisi gibi çalışıyor ve yanında kaynak/tarih yazıyor.

### YH-7.3 · Kripto Piyasası → `kaynaklar/coingecko` (yalnız önbellek)
- **Bugünkü durum:** `CryptoMarket.tsx:62` `loadTopCoins`. Önbellek `fagent.cryptomarket.cache.v2`.
- **Girdi/çıktı:** İlk N coin tablosu. **Projeksiyona doğrudan katkısı yok.** YH-7.2'nin kripto fiyatı aynı tablodan süzülür.
- **Kalacak kod:** `cryptoMarketData.ts` (YH-3'te `/api/prices`'a bağlanır).
- **Kaldırılacak (YH-8):** `CryptoMarket.tsx` ekranı (onayla). Arka planda yalnız portföyde kripto varsa ya da Aşama B dalgalanması onaylanırsa çalışır; aksi halde gereksiz istek yapılmaz.
- **Elle denetim:** [ ] Portföyde kripto yokken F12 → Network'te coin tablosu isteği yok (YH-8 sonrası).

### YH-7.4 · İşlemler → `motor/defter`
- **Bugünkü durum:** `Islemler` (`App.tsx:1146`). Kayıt `actions.addTxn` (`store.ts:259`), `actions.addIncome` (`:299`). Dışa aktarma `exportTxnsCsv` (`App.tsx:1260`). Ajan da `actions.addTxn` çağırıyor (`App.tsx:1811`, yalnız kullanıcı onayıyla).
- **Girdi:** `txns`, `holdings`.
- **Çıktı:** `{ gerceklesenKz, maliyetTabani, aylikKatkiGecmisi, gelirler }` → projeksiyonda "geçmişteki gerçek aylık katkı" betimlemesi (varsayılan katkı önerilmez).
- **Taşınan:** işlem özetleri (bugün bileşen içinde hesaplanıyor), `investmentPaceOf` sarmalayıcısı.
- **Kalacak kod:** `actions.addTxn/addIncome` ("deftere kayıt" dili), CSV dışa aktarma (çekmeceye geçer).
- **Kaldırılacak (YH-8):** İşlemler sekmesi ekranı. Liste çekmecede salt okunur kalır (K1).
- **Elle denetim:** [ ] Bir işlem ekle: gerçekleşen K/Z eskisiyle aynı hesaplanıyor.

### YH-7.5 · Bugün → `motor/olaylar`
- **Bugünkü durum:** `Bugun` (`App.tsx:1076-1145`): bugünün alış ve satış toplamı, toplam değer, K/Z.
- **Girdi:** `txns`, değerleme çıktısı, (YH-4) KAP süzülmüş bildirimleri.
- **Çıktı:** `{ bugunAlis, bugunSatis, olaylar: { tarih, tur: 'islem'|'kap', metin, kaynak }[] }` → projeksiyon yanındaki durum satırı.
- **Kaldırılacak (YH-8):** Bugün sekmesi ekranı.
- **Elle denetim:** [ ] Bugün eklenen alış işlemi olaylar listesinde görünüyor.

### YH-7.6 · Ajan → `motor/icgoru` (+ sohbet)
- **Bugünkü durum:** `agent.ts` saf (`analyzePortfolio` `:102`, `proactiveInsights` `:171`, `chatReply` `:1089`). Ekran `Ajan` (`App.tsx:1706`), `ProactiveInsightsCard` (`:158`). Kalıcı katmanlar: `agentMemory.ts`, `agentTraining.ts`.
- **Girdi:** `PortfolioState`, enflasyon `KaynakSonucu` (parametre olarak), vergi oranları, hedefler.
- **Çıktı:** `Insight[]` (betimleyici; `level: 'uyari'|'iyi'|'bilgi'`) → projeksiyon yanında içgörü satırları. Kaynak `durum !== 'guncel'` ise "son bilinen değer" ibaresi eklenir.
- **Kalacak kod:** `agent.ts` tamamı (saf kalır), `foldTr`. Sohbet ve öğretme ekranı çekmecede kalır ya da kalkar (K1).
- **Dokunulmayacak:** 9 tavsiye kalıbı taraması, "deftere kayıt" onay akışı.
- **Elle denetim:** [ ] İçgörü metinlerinde "al/sat/-malısın" yok. Enflasyon cümlesinde kaynak ve tarih var.

### YH-7.7 · Vergi → `motor/vergi`
- **Bugünkü durum:** `afterTaxOf` (`analytics.ts:527`), oranlar `config/varsayilanlar.ts:22,37`, kullanıcı oranları `taxRates.ts` (`fagent.tax.v1`). Ekran `AfterTaxCard` (`App.tsx:213`).
- **Çıktı:** tür bazında stopaj oranı + `dogrulanmadi` işareti → YH-2 `stopajSonrasi`.
- **Sonraki iş (spec P6):** tarih aralıklı `tax_rules.json` (bu yol haritasında ayrı adım değil; `mevcut-durum-ve-plan.md` P6).
- **Elle denetim:** [ ] Vergi kartındaki stopaj sonrası değer adımdan önceki görüntüyle aynı.

### YH-7.8 · Enflasyon → `motor/enflasyon`
- **Bugünkü durum:** `inflation.ts` (modül durumu, `:33-82`), `evds.ts`, varsayılan %30 (`varsayilanlar.ts:45`). Kullanıcı girişi kalıcı değil.
- **Çıktı:** `{ pct, kaynak: 'resmi'|'varsayim'|'kullanici', donem, alindi, durum }` → YH-2 reel değer ve etiket.
- **Açık:** Kullanıcının girdiği enflasyonun kalıcı olup olmayacağı (`mevcut-durum-ve-plan.md` §5 karar 8). Kalıcı olursa yeni katman `BACKED_UP_KEYS`, SIFIRLA ve bulut kurallarına girer.
- **Elle denetim:** [ ] Enflasyonu elle değiştir: projeksiyon reel değeri değişiyor ve etiket "senin girdin" oluyor.

### YH-7.9 · Risk paneli → `motor/risk`
- **Bugünkü durum:** `RiskPanel.tsx:34` `buildRiskReport` (`priceHistory.ts:190`), risksiz faiz %45 varsayımı (`varsayilanlar.ts:52`). Yalnız kripto ve döviz için 90 günlük geçmiş var.
- **Çıktı:** `RiskReport` (oynaklık, düşüş, kapsanmayan varlıklar) → yalnız Aşama B onaylanırsa projeksiyon dalgalanma girdisi. Aksi halde ayrıntı görünümü.
- **Elle denetim:** [ ] Risk kartı sayıları adımdan önceki görüntüyle aynı.

### YH-7 ortak alanlar
- **Neden bu sırada:** Veri kaynakları oturmadan motor çıktısı sabitlenemez. Ekran değişmeden yapıldığı için riski düşük.
- **Dokunulmayacaklar:** Ekran, `store.ts` API'si, `agent.ts` saflığı, e2e seçicileri.
- **Testler:** Motor başına birim test. Mevcut e2e değişmeden.
- **Güvenlik/uyum:** Düşük. İçgörü metinleri `uyum-dili` taramasından geçer.
- **Bağımlılıklar:** YH-2 (projeksiyon girdi sözleşmesi). YH-3 (KaynakSonucu).
- **Doğrulanamayanlar:** Yok (saf hesap). Dış veri bağlı kısımlar ilgili YH adımında.

---

## YH-8 · Kenar çubuğunu ve eski sekmeleri kaldırma (EN SON)

- **Amaç:** Ekranda yalnız Projeksiyon ve giriş çekmecesi kalsın. Görünüm kullanıcının tasarımından gelir.
- **Neden en son:** e2e testleri bugünkü gezinmeye sıkı bağlı: `side-link` 22 e2e dosyasında geçiyor (`grep -rln side-link tests/e2e | wc -l` = 22). Erken kaldırma yüzlerce kontrolü aynı anda kırar. "Kontrol sayısı azalmaz" kuralı bu kontrollerin motor birim testlerine ya da yeni ekrana taşınmasını gerektirir.
- **Bugünkü durum:** `type Tab` (`App.tsx:66`), `SideLink` (`:1938`), gezinme (`:2044-2053`), sekme seçimi (`:2071-2079`). `fagent-nav-e2e` ve `fagent-sidebar-e2e` doğrudan gezinmeyi sınıyor.
- **Yapılacaklar:**
  1. Yeni tek ekran **bayrak arkasında** eklenir (kullanıcının tasarımı entegre edilir). Bayrak kapalıyken eski arayüz birebir korunur.
  2. Her eski kontrol için eşleme tablosu hazırlanır: hangi kontrol hangi motor testine ya da yeni ekran kontrolüne taşınıyor. Tablo rapora konur, sayı eşit ya da fazla olur.
  3. Bayrak varsayılan açık olur. Eski sekmeler kaldırılır ya da ayrıntı görünümüne dönüşür (K4).
  4. Giriş çekmecesi: varlık/işlem ekleme, CSV, yedek, (K1'e göre) ajan sohbeti, SIFIRLA.
- **Dokunulmayacaklar:** Hesap ekranı (`Account.tsx`, env boşken görünmez). `fagent-auth-e2e` beyaz liste kontrolleri.
- **Kabul ölçütü:** Kapı yeşil. Kontrol sayısı ≥ önceki. Eşleme tablosunda boş satır yok. Klavyeyle giriş → projeksiyon akışı e2e ile sınanıyor. "Yatırım tavsiyesi değildir" uyarısı ekranda.
- **Testler:** Tam e2e, yeni ekran e2e'si, 375px ve 1440px ekran görüntüsü (ortamda ölçülebilir; insan incelemesi kullanıcıda).
- **Güvenlik/uyum:** Uyarı metni her hesap ekranında görünmeli (spec P0.2).
- **Bağımlılıklar:** YH-7 tamamı. Kullanıcının tasarımı. K1 ve K4 kararları.
- **Geri alma:** Bayrak kapatılır, eski arayüz döner (bayrak kaldırılana kadar). Bayrak kaldırma ayrı ve son onaydır.
- **Elle denetim:**
  - [ ] Önizlemeyi aç: yalnız Projeksiyon ekranı ve "Ekle" düğmesi görünüyor.
  - [ ] "Ekle"den bir varlık ekle: projeksiyon başlangıç değeri değişiyor.
  - [ ] Telefonda aç: ekran taşmıyor.
  - [ ] Raporda eski/yeni kontrol sayısı ve eşleme tablosu var.
- **Doğrulanamayanlar:** Gerçek kullanıcıların akışı anlayıp anlamadığı (kullanıcı testi yok).

---

## 11. Tasarım oturumuna devir notu (motorların sağlayacağı sözleşme)

Görünüm kullanıcıda. Tasarımın kullanabileceği veri yuvaları (ad önerisi; YH-2 ve YH-7 bitince kesinleşir):

| Yuva | Kaynak motor | İçerik |
|---|---|---|
| Başlangıç değeri, maliyet, K/Z | `motor/degerleme` | TL, `fmtTL` biçimi |
| Senaryo yolları (3 çizgi) | `projection.ts` | yıl başına nominal değer |
| Nominal → stopaj sonrası → reel | `projection.ts` + `motor/vergi` + `motor/enflasyon` | üç sayı + `dogrulanmadi` işareti |
| Varsayım etiketleri | `projection.ts` | `resmi` / `varsayim` / `kullanici` |
| Hedef karşılaştırma | `projection.ts` | hedef boşsa yok; "hedefin %N'i" |
| 3×3 duyarlılık, sıra riski | `projection.ts` | 9 hücre; iki sıra sonucu |
| Kaynak durum satırı | `src/kaynaklar` | 5 durum metni, kaynak + tarih |
| İçgörü satırları | `motor/icgoru` | `Insight[]` |
| Olaylar | `motor/olaylar` | işlem + KAP bildirimi (yorumsuz) |
| Giriş çekmecesi eylemleri | `store.ts` `actions.*` | ekle/düzenle/sil/işlem/CSV/yedek/SIFIRLA |
| Zorunlu metin | — | "Yatırım tavsiyesi değildir" |

### `src/projection.ts` sözleşmesi (tasarım oturumu için)

Tipler: `KaynakEtiketi = 'resmi' | 'varsayim' | 'kullanici'`; `EtiketliSayi = { deger: number; kaynak: KaynakEtiketi }`.
Türetilmiş sayının etiketi girdilerinin en zayıfıdır (`birlestirKaynak`: biri `varsayim` ise `varsayim`, yoksa biri `kullanici` ise `kullanici`, hepsi `resmi` ise `resmi`).
Ortak girdi alanları: `baslangic` (TL), `aylikKatki` (TL), `yil`, `getiriPct`, `enflasyonPct`; isteğe bağlı `kaynaklar?: Partial<{baslangic, aylikKatki, getiri, enflasyon}>` (varsayılan: başlangıç/katkı `kullanici`, getiri/enflasyon `varsayim`). EVDS enflasyonu için `enflasyonEtiketi(inf.source)` (`evds` → `resmi`).

| Fonksiyon | İmza (özet) | Çıktı |
|---|---|---|
| `sonDeger` | `(baslangic, aylikKatki, yillikPct, yil)` | `number` (ekranda kullanılıyor) |
| `reelDeger` | `(nominal, enflasyonPct, yil)` | `number`: nominal / (1+e)^yıl (ekranda kullanılıyor) |
| `projeksiyonYollari` | `({baslangic, aylikKatki, getiriPct:{dusuk,orta,yuksek}, yil})` | `{yil, dusuk, orta, yuksek}[]` yuvarlanmış (ekranda kullanılıyor) |
| `senaryoSonucu` | `ProjeksiyonGirdisi` | `{yatirilan, nominal, reel}`: hepsi `EtiketliSayi` |
| `stopajSonrasiDeger` | `ProjeksiyonGirdisi & {agirliklar: Partial<Record<AssetType,number>>, oranlar?, oranKaynagi?}` | `{brut, kazanc, vergi, net, agirlikliOranPct: EtiketliSayi, dogrulanmadi: boolean}` |
| `turAgirliklari` | `({type, amount}[])` | tür → tutar toplamı |
| `hedefeUlasmaSuresi` | `({baslangic, aylikKatki, getiriPct, hedef?, enflasyonPct?, azamiYil?})` | hedef boş: `null`; aksi `{ay: EtiketliSayi \| null, ulasilabilir}` (`ay` null = 100 yılda ulaşılamaz; `enflasyonPct` verilirse reel karşılaştırma) |
| `getiriEnflasyonTablosu` | `({baslangic, aylikKatki, yil, getiriPct:{dusuk,orta,yuksek}, enflasyonPct})` | 3 satır × 3 hücre: `{enflasyonPct (−10/0/+10 puan, alt sınır 0), reel: EtiketliSayi}` |
| `siraRiski` | `({baslangic, aylikKatki, yil, ortalamaPct, sapmaPP?})` | `{kotuYillarBasta[], kotuYillarSonda[], sapmaPP, basta, sonda, fark}`; deterministik, aynı aritmetik ortalama |

Örnek (elle doğrulanabilir): `stopajSonrasiDeger({baslangic:100000, aylikKatki:0, yil:1, getiriPct:20, enflasyonPct:30, agirliklar:{fon:1}})` → brüt 120.000, kazanç 20.000, vergi 3.500 (%17,5), net 116.500, `dogrulanmadi:false`, etiket `varsayim`.
`hedefeUlasmaSuresi({baslangic:1000, aylikKatki:100, getiriPct:0, hedef:2000})` → `ay.deger = 10`.
Sıra riski notu: aylık katkı varken "kötü yıllar sonda" sonucu genelde "başta"dan düşük çıkar (`fark` genelde < 0). Nedeni betimleyicidir: bakiye büyüdükçe sonraki, yüksek getirili yıllar toplam sonuçta daha çok ağırlık alır. Katkısızken fark 0'dır. Çerçeve: iki dizi de aynı aritmetik ortalamaya sahiptir; ±15 puan sapma varsayımsal bir örnektir (varsayım etiketli, `SIRA_RISKI_SAPMA_PP`); sonuç olasılık ya da öngörü değildir. Ekran metni "Yatırım tavsiyesi değildir" ile birlikte verilir ve hüküm içermez.
Tasarım notları: (D1) kullanıcı kendi stopaj oranını verse bile `UNVERIFIED_TAX` türleri için `dogrulanmadi` kalır; bu durumun metni tasarımda düşünülmelidir. (D3) `HEDEF_AZAMI_YIL = 100` ve `TABLO_ENFLASYON_ADIMI_PP = 10` ekrana yansırsa ürün varsayımı olarak etiketlenmelidir.
Girdi sınırları (güvenli varsayılan, `projection.ts`): yıl ve `azamiYil` sonlu değilse 0, aksi halde 0..100 tam sayı (kesir atılır); getiri/enflasyon/ortalama oranı sonlu değilse 0, aksi halde −99..1000 aralığına kısılır; tutarlar ve ağırlıklar sonlu değilse 0 sayılır. Ekranın aralığında (1–30 yıl, 0–200 oran) hiçbir değer değişmez.
Dil: sonuç adları ve metinlerde "tahmin", "beklenen getiri", "hedefe ulaşmak için" geçmez (`uyum-dili`).

Not: `docs/tasarim/YENI-OTURUM-DEVIR-NOTU.md` ve `ana-ekran-konsepti.md` "Ana ekran" fikrini anlatıyor. Kullanıcı kararıyla ana ekran artık Projeksiyon; "araçlar çekmecesi" giriş çekmecesine dönüşüyor.

## 12. Açık kararlar (kullanıcı)

| # | Karar | Önerim |
|---|---|---|
| K1 | Giriş çekmecesi: varlık/işlem/CSV/yedek + salt okunur liste. Ajan sohbeti çekmecede mi kalsın, yalnız içgörü satırı mı? | Çekmece + liste; sohbet çekmecede ayrı sekme |
| K2 | BİST kapsamı yalnız gün sonu mu? §0.4 nasıl güncellensin? | Yalnız gün sonu, etiketli; §13 metni |
| K3 | Paylaşılan önbellek: önce CDN, geçmiş gerekince ayrı Supabase projesi | Evet, Üst Kurul talebiyle |
| K4 | Eski sekmeler tamamen kalksın mı, "ayrıntı" bölümü olarak mı dursun? | Ayrıntı bölümü (doğruluk görünür kalır, test geçişi küçülür) |
| K5 | Projeksiyon Aşama B (Monte Carlo) | Ayrı karar; rassal yürüyüş ertelemesiyle çelişki notu `gelismis-model-plani.md` K1 |

Önceki belgelerde açık kalanlar: `mevcut-durum-ve-plan.md` §5 (enflasyon kalıcılığı, `Txn` genişlemesi, `fmtTL` kuruş, Netlify aynası).

## 13. Kullanıcıdan beklenen işler

- [ ] Vercel `fagent` projesine `EVDS_API_KEY` ekle (eski Netlify projesinde olabilir). YH-3'ün ön koşulu.
- [ ] Birincil hukuk metinlerini oku ya da avukata ilet: EVDS şartları, TCMB site şartları, KAP yasal metni, Borsa İstanbul veri yayını (bağlantılar `cok-kaynakli-veri-plani.md` sonu). YH-4 ve YH-5'in önünde.
- [ ] **`AGENTS.md` §0.4 güncellemesi** (yönetmen ve ajanlar değiştirmez). Bugünkü metin: "BIST hisse ve TEFAS fon fiyatı için anahtarsız resmî kaynak yok; bunlar elle girilir." Öneri metin: "BIST hisse fiyatı, kullanım koşulu incelenmiş herkese açık kaynaktan sunucu üzerinden gün sonu olarak çekilebilir; her değer kaynak ve tarihle etiketlenir, kaynak yoksa elle girilir. TEFAS fon fiyatı elle girilir. Kazıma hukuki riski `TODO(hukuk)` olarak kayıtlıdır."
- [ ] YH-6 için ayrı Supabase projesi aç (karar K3 kabul edilirse).
- [ ] Tek ekran tasarımını hazırla (§11 yuvalarıyla).
- [ ] Her adımın "elle denetim" listesini işaretle; işaretlenmemiş adım bir sonrakine geçmez.

## 14. Sözlük (yeni terimler)

| Terim | Sade anlamı |
|---|---|
| Motor | Ekranı olmayan, yalnız hesap yapan kod parçası |
| Saf modül | Dışarıyla (internet, ekran, tarayıcı) konuşmayan, aynı girdiye hep aynı sonucu veren kod |
| Bağdaştırıcı (adapter) | Bir veri kaynağıyla konuşan ve sonucu ortak biçime çeviren ara parça |
| Kazıma (scraping) | Bir sitenin sayfasından ya da iç adresinden veriyi program ile okumak |
| CORS | Tarayıcının başka sitelere izinsiz istek yapmasını engelleyen güvenlik kuralı |
| Sunucu fonksiyonu | Vercel'de çalışan küçük program (`api/*.mjs`); anahtarı saklar, kaynağa o gider |
| Önbellek / TTL | Son okunan verinin saklandığı yer / saklama süresi |
| Devre kesici | Sürekli hata veren kaynağa bir süre hiç gitmeme kuralı |
| Hız sınırı | Kaynağa saniyede/dakikada en çok kaç istek atılacağı |
| IndexedDB | Tarayıcının içindeki, localStorage'dan büyük ve sağlam yerel veritabanı |
| Ayna (mirror) | Geçiş süresince aynı verinin eski yerde (localStorage) de tutulması |
| Göç (migration) | Veriyi eski biçimden/yerden yenisine kopyalama |
| Bayrak (flag) | Bir özelliği kod silmeden açıp kapatan anahtar |
| Birim test / e2e | Tek fonksiyonu sınayan test / uygulamayı gerçek tarayıcıda baştan sona sınayan test |
| Fixture | Testte kullanılan kayıtlı örnek veri |
| CDN önbelleği (`s-maxage`) | Vercel'in yanıtı bir süre saklayıp kaynağa tekrar gitmemesi |
| Cron | Belirli aralıklarla kendiliğinden çalışan zamanlanmış iş |
| RLS | Supabase'de satır bazlı erişim kuralı |
| Servis anahtarı | Supabase'in tam yetkili gizli anahtarı; yalnız sunucuda durur |
| User-Agent | İsteği yapan programın kendini tanıttığı ad |
| robots.txt | Sitenin otomatik okuyuculara hangi sayfalara girebileceğini söylediği dosya |
| SSRF | Sunucunun kötü niyetle istenmeyen adreslere istek attırılması saldırısı |
| Deterministik | Rastgelelik içermeyen, her seferinde aynı sonucu veren |

## 15. Genel doğrulanamayanlar

Ortamın ağ politikası belgesi (environment.network) okunmadı. Bilinen tek şey: 27.10'da `tcmb.gov.tr`, `evds2/evds3.tcmb.gov.tr`,
`kap.org.tr`, `borsaistanbul.com` erişimi vekil sunucuca reddedildi. 699 e2e kontrolü bu oturumda koşulmadı.
EVDS kur kodları, KAP iç uçları, BİST kaynak sayfası, Vercel Cron/Supabase kotaları ve hukuki durum doğrulanmadı.
