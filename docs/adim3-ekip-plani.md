# Adım 3 — ekip planı (danışmadan geçmiş, uygulamaya hazır)

Ekip koşusu 19 Ekim 2026'da kredi bittiği için ilk kalemin ortasında **güvenli şekilde durduruldu**. 
Plan, güvenlik ve uyum danışmasından geçti; aşağıdaki kalemler aynen uygulanabilir. Yarım kalan kod 
ürün dalına girmedi. Devam etmek için: `fagent-ekip` iş akışını bu dosyadaki planla başlat 
(`args.devam = { plan: <bu kalemler>, tamamlanan: [], yarim: [] }`) ya da kalemleri sırayla tek tek uygula 
ve sonunda typecheck + build + `npm run guvenlik -- --dist` + e2e kapısını koş.

## Özet

Plan adım 3 revize edildi, 3 kalem, sıra K1 → K2 → K3 (K1 ve K2 App.tsx/agent.ts ve ortak e2e dosyalarına dokunduğu için paralel çalışmaz). Panodan kabul edilenler: #29 (fallback metni görevdeki sabit biçime çekilir, 7 e2e seçicisi K1'de güncellenir), #30 (ret mesajı yasaklı kelime taramasına girer, tek muafiyet onay mesajındaki 'emir gönderilmedi'), #31 (9 cümle küçük/büyük harf ve İ/I varyantlarıyla, kalıp normalize girdiye uygulanır), #17 (README gizlilik paragrafı doğru ifadeye çevrilir), #18'in büyük kısmı (eski anahtar ekili ayrı senaryo, context.on ve websocket dinleme, izin listesi yok). Kısıtlar #7-#16, #19-#28 ilgili kalemlerin açıklamasına işlendi. #26 ile #13/#18 arasındaki çelişki gerekçesiyle çözüldü (riskler). Dış API doğrulamaları (Frankfurter, CoinGecko, EVDS) bu ortamda yapılamaz; rapor 'sahte Supabase ile yeşil' ayrımını korur. Commit, push, stash, reset yok. Not: bu çalışma oturumunda kod yeniden okunmadı; satır numaraları önceki plandaki doğrulanmış değerlerdir, uygulayıcı kodda yeniden doğrular.

## K1 — aiAgent katmanını çıkar, eski anahtarı sil, fallback metnini sabitle, gizlilik metinlerini düzelt

**Sahip:** fagent-veri-akisi

Önce bu kalem çalışır. Yapılacaklar:
(1) src/aiAgent.ts silinir.
(2) src/App.tsx: satır ~32 import; Ajan() içindeki aiUrl, aiUrlDraft, aiOpen, aiUrlError, aiTestState, aiBusy state'leri; saveAiUrl, clearAiUrl, testAiConnection (~1719-1750); send() içindeki wantsAi/aiMsgId/askAi/history bloğu (~1794-1837); aiGenerated rozeti ve aiPending göstergesi (~1922-1930); ipucundaki aiUrl dalı (~1993-1997); 'Gerçek AI Bağlantısı (opsiyonel)' kartı (~2000-2050); kenar çubuğundaki isAiConfigured() rozeti (~2122-2129) sabit 'ANAHTARSIZ MOD' olur; resetAll yorumundaki 'AI adresi' kalkar. Kullanılmayan importlar yalnızca başka yerde kullanılmıyorsa kaldırılır. Satır numaraları kodda yeniden doğrulanır.
(3) src/agent.ts: yalnızca tip/yorum temizliği (AgentMessage'daki id, aiPending, aiGenerated; satır 3, 36-39, 1158 AI yorumları). Mantık değişmez; agent.ts saf kalır (fetch, localStorage, DOM, import yok).
(4) Fallback metni (agent.ts ~1194-1203) 'Bunu yanıtlayamam; şunları sorabilirsin:' biçimine çevrilir. Eski 'tam olarak anlayamadım' seçicileri 7 e2e dosyasında (agent, teach, parser, analytics, risk, vergi ve varsa diğeri; grep ile tamamı bulunur) AYNI kalemde yeni metne güncellenir. Kontrol sayısı azalmaz. [#29, #21]
(5) src/localData.ts: fagent.ai.proxyurl.v1 import/resetAiProxyUrl kalkar. Yerine yalnızca silinecek bir LEGACY_KEYS=['fagent.ai.proxyurl.v1'] listesi ve purgeLegacyKeys() eklenir: try/catch'li, idempotent; src/main.tsx'te render öncesi bir kez ve clearLocalUserData içinde çalışır. Anahtar BACKED_UP_KEYS, snapshotUserData, whitelistUserData ve cloud.ts senkron kümesine GİRMEZ; portföy vb. kullanıcı verisi anahtarlarına dokunulmaz. [#19]
(6) src/backup.ts:24 yorumu güncellenir; BACKED_UP_KEYS değişmez.
(7) Metinler: Account.tsx:79 'bağladığın AI adresi' çıkar. README: 72-73 'bağlanan AI adresi' kalkar; 146'daki 'sunucu/LLM çağrısıyla değiştirmeyi basitleştirir' atfı kalkar; 250-267 'Gerçek AI'a Geçiş (planlı)' bölümü 'ürün dışı — dış AI bağlantısı yok' diye yeniden yazılır. Bu bölümde ANTHROPIC_API_KEY tanımlama, var olmayan server/ai.js proxy'si ve fetch('/api/ai/chat') talimatları KALMAZ; metinde gizli anahtar adı/örnek değeri geçmez (guvenlik taramasının atanmis-gizli-degisken kuralı temiz kalır). [#7, #22]
(8) README:23-27 paragrafı düzeltilir: 'Hesap kurulumda kapalıdır; hesap açılmadıkça veri hiçbir sunucuya eşitlenmez. Fiyat sorguları (Frankfurter, CoinGecko) yalnızca döviz kodu ya da coin kimliği içerir, tutar içermez; enflasyon oranı için kendi /api/evds fonksiyonumuz çağrılır.' 'Veri tarayıcıdan çıkmaz' tipi iddialar bulut senkronuyla çelişmeyecek biçimde bırakılır. Yalnızca metin. [#17, #22]
(9) Sökümden sonra src/, netlify/functions, scripts, docs, tests içinde dış AI/worker/proxy/LLM çağrısı, URL sabiti veya bahsi kalmaz (docs/entegrasyonlar.md:146 'LLM … Planlı' satırı dahil: tek satırlık metin düzeltmesi bu kalemde yapılır; karar günlüğü kaydı insana bırakılır). Hiçbir AI anahtarı/adresi VITE_ değişkenine konmaz. [#20]
Kısıtlar: tests/e2e/fagent-auth-e2e.mjs:200, 276-278, 359-368 silinmez ve gevşetilmez; bunlar buluttan gelen beyaz liste dışı anahtar kontrolüdür, proxyurl açısından kendiliğinden geçer, cryptomarket/evds/cloud.owner kapsamını taşımaya devam eder; gerekirse yorumla belgelenir. [#8] public/cors-test.html kapsam dışı, dokunulmaz; adım 8'de kaldırılması değerlendirilir. [#9]

**Dosyalar:** `src/aiAgent.ts`, `src/App.tsx`, `src/agent.ts`, `src/localData.ts`, `src/main.tsx`, `src/backup.ts`, `src/Account.tsx`, `README.md`, `docs/entegrasyonlar.md`, `tests/e2e/fagent-agent-e2e.mjs`, `tests/e2e/fagent-teach-e2e.mjs`, `tests/e2e/fagent-parser-e2e.mjs`, `tests/e2e/fagent-analytics-e2e.mjs`, `tests/e2e/fagent-risk-e2e.mjs`, `tests/e2e/fagent-vergi-e2e.mjs`, `tests/e2e/fagent-sidebar-e2e.mjs`

**Kabul ölçütleri:**

- src/aiAgent.ts yok; grep -rn 'aiAgent\|askAi\|AiProxy\|proxyurl\|aiPending\|aiGenerated' src/ yalnızca localData.ts'teki LEGACY_KEYS satırını verir
- BACKED_UP_KEYS, snapshotUserData, whitelistUserData ve cloud.ts senkron kümesinde proxyurl yok
- Ajan sekmesinde 'Gerçek AI Bağlantısı' kartı ve 'Worker adresi' alanı DOM'da yok; kenar çubuğunda her durumda 'ANAHTARSIZ MOD' görünür
- fagent.ai.proxyurl.v1 ekili açılışta anahtar silinir; fagent.portfolio.v1 ve fagent.cryptomarket.cache.v2 korunur
- Tanınmayan soru tek bir yerel 'Bunu yanıtlayamam; şunları sorabilirsin:' balonu üretir; ikinci balon veya yükleniyor göstergesi yok
- 7 e2e dosyasındaki fallback seçicileri yeni metne güncellendi, kontrol sayısı azalmadı; auth e2e satır 200/276-278/359-368 değişmedi ve yeşil
- README ve Account.tsx'te 'AI adresi', 'Gerçek AI'a Geçiş (planlı)', ANTHROPIC_API_KEY, server/ai.js, /api/ai/chat yok; README:23-27 doğru gizlilik ifadesini taşır
- src/, netlify/functions, scripts, docs, tests içinde fetch/URL sabiti/'worker'/'LLM' ile dış AI bahsi kalmadı (grep çıktısı raporda)
- npm run typecheck, npm run build ve npm run guvenlik -- --dist temiz (npm audit çalışmazsa 'doğrulanamadı' diye raporlanır)

## K2 — Ajan dilini 'deftere kayıt'a çevir, tavsiye reddini 9 cümleye genişlet, değer yargılarını betimle

**Sahip:** fagent-tasarim

K1 bittikten sonra başlar.
(a) Metinler: agent.ts ~945-947 yardım satırı → '"THYAO'dan 500 TL sat" yazarsan defterine satış kaydı ekleyebilirim.'; agent.ts ~1123-1129 → '${holdingName} için ${fmtTL(amount)} tutarında ${alış|satış} kaydı ekleyeyim mi? (Yalnızca defterine yazılır.)' (kind'a göre); App.tsx düğmeleri 'Deftere ekle' / 'Vazgeç', çözülmüş etiketler 'Deftere eklendi ✓' / 'Vazgeçildi'; onay sonrası mesaj 'Deftere kaydedildi — aracı kurumuna emir gönderilmedi. {holding} güncel değer: ₺X.' (tek muaf ifade); iptal 'Kayıt eklenmedi; defterin değişmedi.'; 'işlemi uygulayamadım/uygulamadım' cümleleri 'kaydı ekleyemedim/kayıt eklenmedi'; App.tsx ~1124/1130 'Bugün defterine kayıt eklenmedi.'; agent.ts ~927 'TAM YEDEK (önerilen)' 'öneri' kökü taşımayan bir ifadeye. Tüm metinler betimleyici kipte; yasak kökler: öneri, uygula, işlendi, emir (onay mesajı hariç), -malısın, -melisin. Yardım metni ve onay balonu aracı kuruma bağlanma yeteneği ima etmez. [#12, #23]
(b) Tavsiye kalıbı (agent.ts ~600-623): şu 9 cümleyi yakalar ve ret mesajı verir: 'hangisi daha iyi', 'şimdi girmeli miyim', 'kaç lot almalıyım', 'stop koymalı mıyım', 'altın alayım mı', 'hisse satayım mı', 'THYAO almalı mıyım', 'portföyümü dengele', 'bu hisse alınır mı'. Kurallar: \b yok (AGENTS.md §3); girdi toLocaleLowerCase('tr-TR') ile normalize edilip kalıp normalize girdiye uygulanır, ayrıca İ/I/ı varyantları sınanır ('THYAO ALMALI MIYIM' çalışır); kalıp ReDoS'a kapalı: iç içe nicelik yok, art arda birden fazla sınırsız .* yok, sözcük arası \s*/\s+ veya sınırlı \S{0,20}; 'al'/'sat' kökü tek başına kullanılmaz; kalıp CHAT_RULES içinde işlem ayrıştırıcısından ÖNCE kalır ve hiçbir koşulda pendingAction döndürmez. Ret metni 'tavsiye veremem' ve 'SPK' içerir; 'öneri/uygula/işlendi/emir/-malısın/-melisin' içermez (taramaya girecek). Yakalanmaması gerekenler: "THYAO'dan 500 TL sat", 'THYAO 1000 TL al', 'satışı iptal et', 'vazgeç', 'dağılımım nasıl', 'hedeften sapmam ne', 'THYAO nasıl gidiyor'. [#10, #11, #24, #31]
(c) Değer yargıları: agent.ts ~141 likidite cümlesi yalnızca oranı söyler ('rahatlatır' yok); ~152-157 'Son N işlemin X'i satış, Y'si alış.' (panik, sağlam disiplin yargısı çıkar). Her sayı kullanıcı verisinden hesaplanır, sabit varsayım uydurulmaz; analiz çıktılarında 'yatırım tavsiyesi değildir' uyarısı korunur. [#25]
(d) Defter yazımı yalnızca 'Deftere ekle' DÜĞMESİYLE olur; yazıyla onay ('evet', 'ekle', 'tamam') EKLENMEZ; resolveAction'daki tek yazma yolu ve bakiye aşımı kontrolü korunur. [#10]
(e) Kendi değiştirdiği metinlerin seçicileri bu kalemde güncellenir: fagent-action-e2e (satır ~28, 29, 31, 35, 52, 60, 66), fagent-cryptodemo-e2e (~90, 91, 94, 96), fagent-parser-e2e (~36, 44, 49, 61, 65, 67, 69); 'Onayla' düğme adı bu üç dosyada eksiksiz 'Deftere ekle' olur (grep ile doğrulanır). Kontrol sayısı azalmaz. [#25]

**Dosyalar:** `src/agent.ts`, `src/App.tsx`, `tests/e2e/fagent-action-e2e.mjs`, `tests/e2e/fagent-cryptodemo-e2e.mjs`, `tests/e2e/fagent-parser-e2e.mjs`

**Kabul ölçütleri:**

- "THYAO'dan 500 TL sat" balonunda 'satış kaydı ekleyeyim mi? (Yalnızca defterine yazılır.)' ve 'Deftere ekle'/'Vazgeç' görünür; 'Deftere ekle' sonrası 'Deftere kaydedildi — aracı kurumuna emir gönderilmedi.' gelir ve İşlemler'de kayıt oluşur
- Vazgeç sonrası 'Kayıt eklenmedi; defterin değişmedi.' gelir, işlem sayısı değişmez; yazıyla 'evet' kayıt eklemez
- Bugün sekmesinde işlem yokken 'Bugün defterine kayıt eklenmedi.' görünür
- 9 cümlenin her biri küçük harf, büyük harf ve İ/I varyantlarıyla 'tavsiye veremem' ve 'SPK' içeren ret verir ve 'Deftere ekle' düğmesi çıkmaz
- Kayıt komutları ve 'satışı iptal et', 'vazgeç', 'THYAO nasıl gidiyor', 'dağılımım nasıl', 'hedeften sapmam ne' reddedilmez (mevcut parser-e2e 82-85 dahil yeşil)
- grep -n '\\b' src/agent.ts tavsiye kalıbında sonuç vermez; kalıpta iç içe nicelik ve art arda sınırsız .* yok
- Analiz çıktısında 'panik', 'sağlam', 'rahatlatır' yok; işlem sayısı cümlesi 'Son N işlemin X'i satış, Y'si alış.' biçiminde
- action, cryptodemo, parser e2e dosyalarında eski metin/'Onayla' seçicisi kalmadı, hepsi yeşil, kontrol sayıları azalmadı
- typecheck ve build temiz

## K3 — Uyum e2e paketi: eski anahtar, katı ağ izolasyonu, 9 tavsiye cümlesi, yasaklı kelime taraması

**Sahip:** fagent-test

K1 ve K2'den sonra çalışır. Yeni dosya tests/e2e/fagent-uyum-e2e.mjs (run-e2e.mjs '-e2e.mjs' ile biteni kendisi bulur; dist/, port 4200). Mevcut hiçbir kontrol silinmez, yeni kontroller 582'nin üstüne eklenir. Dosyada gizli anahtar desenine benzeyen sahte değer olmaz (sk-…, eyJ… JWT, sb_secret_); sahte adres yalnızca *.example veya *.workers.dev. [#16]
Senaryolar:
A) Anahtar temizliği: temiz açılışta fagent.ai.proxyurl.v1 yok. Ekili senaryoda anahtar addInitScript ile YALNIZCA BİR KEZ ekilir (tek seferlik işaretle sınırlı, yenilemede yeniden ekilmez) ve sayfa yeniden yüklenmeden aynı yüklemede silindiği doğrulanır; aynı anda fagent.portfolio.v1 (BACKED_UP_KEYS'ten) ve fagent.cryptomarket.cache.v2 (beyaz liste dışı) korunduğu AYRI check satırlarıyla gösterilir. [#15, #26]
B) Ağ izolasyonu (temiz profil): dinleyici context.on('request') ile (popup/worker dahil) ve page.on('websocket') ile, Ajan sekmesine geçildikten sonra ve ilk sohbet mesajından önce açılır; ölçüm kapsamı testte 'sohbet sırasında' diye yazılır, başlangıç anı belgelenir. Sohbet: analiz, dağılım, tanınmayan soru, kayıt komutu + Deftere ekle, 9 tavsiye cümlesi. Köken karşılaştırması new URL(u).origin === BASE (startsWith yok); data: ve blob: istisnası açıkça yazılır; İZİN LİSTESİ YOK (Frankfurter/CoinGecko/font isteği de başarısızlıktır); kaydedilen dış köken listesi (boş olmalı) teste yazdırılır. [#13, #18]
C) Davranışsal söküm kanıtı: eski anahtar 'https://worker.example.workers.dev' ile ekili; açılış, Ajan sekmesi, tanınmayan soru (fallback). Bu adrese ve başka hiçbir dış kökene istek gitmediği, fallback balonunun yerel çıktığı AYRI check satırlarıyla gösterilir. [#14, #18]
D) Tavsiye: 9 cümlenin HER BİRİ ayrı check satırı; her biri küçük harf, büyük harf ('THYAO ALMALI MIYIM') ve İ/I varyantıyla; 'tavsiye veremem' ve 'SPK' görünür, 'Deftere ekle' çıkmaz. Meşru komutlar bozulmamış: "THYAO'dan 500 TL sat" kayıt balonu açar, 'THYAO nasıl gidiyor' reddedilmez. Uzun/tekrarlı girdiyle (ReDoS) tavsiye kalıbının kısa sürede döndüğü bir kontrol. [#11]
E) Yasaklı kelime taraması: yardım, analiz, dağılım, risk, kayıt önerisi balonu, iptal, fallback, Bugün sekmesi, tavsiye ret mesajı çıktıları toplanır; /öneri|uygula|işlendi|emir|malısın|melisin/i (İ/ı varyantlarıyla) bulunmaz. Tek muafiyet: onay mesajındaki tam 'aracı kurumuna emir gönderilmedi' ifadesi, kod yorumunda gerekçesiyle belgelenir. Ret mesajı MUAF DEĞİLDİR; kelime taşımadığı kanıtlanır. Kontrol sayısı test çıktısına yazılır. [#23, #27, #30]
Kapı: npm run typecheck, npm run build, npm run guvenlik -- --dist (0 kritik), CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e. Rapor: dış API'ler (Frankfurter, CoinGecko, EVDS) bu ortamda doğrulanamadı; sonuç 'sahte Supabase ile yeşil'; npm audit çalışmadıysa 'doğrulanamadı'. [#16, #28]

**Dosyalar:** `tests/e2e/fagent-uyum-e2e.mjs`

**Kabul ölçütleri:**

- fagent-uyum-e2e.mjs koşucuda otomatik bulunur ve tüm kontrolleri yeşil; toplam 582 + yeni kontrol, hiçbiri silinmeden
- Eski anahtarın aynı yüklemede silindiği, portföy ve cryptomarket anahtarlarının korunduğu ayrı check satırları
- Sohbet sırasında context.on('request') + page.on('websocket') ile kaydedilen dış köken listesi boş ve çıktıya yazdırılıyor; izin listesi yok
- Worker adresi ekili senaryoda o adrese ve başka dış kökene istek gitmediği ayrı check satırı
- 9 tavsiye cümlesi ayrı check satırı, küçük/büyük harf/İ-I varyantlarıyla
- Yasaklı kelime taraması ret mesajını da kapsar; tek muafiyet onay mesajındaki 'emir gönderilmedi' ve kod yorumunda belgeli
- typecheck, build, guvenlik -- --dist ve test:e2e yeşil; dış API doğrulamasının yapılamadığı raporda açık

## Riskler

- ÇELİŞKİ KARARI #26 vs #13/#18: uyum dinleyicinin Ajan sekmesine geçildikten sonra açılmasını, güvenlik daha erken açılabileceğini söylüyor. Karar: dinleyici Ajan sekmesine geçildikten sonra, ilk mesajdan önce açılır (kapsam 'sohbet sırasında' diye yazılır, başlangıç anı belgelenir); ölçüm yine context.on + websocket ile, izin listesiz ve katıdır. Gerekçe: iki talebi de karşılar; güvenlik'in dayanağı (setInterval ve dış font yok, fiyat istekleri kullanıcı tetiklemeli) sayesinde katı ölçüm kararlıdır. Açılış istekleri ölçüm dışıdır ve bu sınır testte yazılıdır; açılışta kendi kökenine giden /api/evds zaten dış köken değildir.
- İtiraz #29 kabul edildi, ertelenen madde kaldırıldı. Risk: fallback metni 7 e2e dosyasında seçici; biri gözden kaçarsa kapı kırmızı kalır. K1 kabul ölçütü tüm eski seçicilerin grep ile sıfırlanmasını ister.
- İtiraz #30 kabul edildi (önceki plandaki ret mesajı muafiyeti kaldırıldı). Risk: ret metni 'öneri/uygula/emir/-malısın' kelimelerini yanlışlıkla taşırsa K3 kırılır; metin K2'de bu kelimeler olmadan yazılır, 'tavsiye veremem' ve 'SPK' korunur.
- Tavsiye kalıbı kullanıcı girdisine her mesajda uygulanır ve işlem ayrıştırıcısından önce çalışır: fazla geniş kalıp ('al'/'sat' kökü, 'dengele') meşru kayıt komutlarını reddeder, fazla dar kalıp tavsiye cümlesini kaçırır, kötü yapılmış kalıp ReDoS açar. Önlem: normalize girdi, sınırlı sözcük arası kalıp, 'yakalanmaması gerekenler' listesi ve ReDoS kontrolü.
- Türkçe büyük/küçük harf: /i bayrağı İ/ı dönüşümünü doğru çözmez; toLocaleLowerCase('tr-TR') normalizasyonu ve İ/I varyant testleri zorunlu (#31).
- K1 ve K2 App.tsx, agent.ts ve ortak e2e dosyalarına dokunur; paralel yürütülürse çakışır. Sıra K1 → K2 → K3.
- Auth e2e'deki proxyurl kontrolleri (200, 276-278, 359-368) gevşetilmez; anahtar açılışta silindiği için kontrol kendiliğinden geçer. Yanlışlıkla silinirse beyaz liste dışı anahtar koruması zayıflar (#8).
- Kayıt dili 'aracı kuruma bağlanırım' gibi yetenek ima etmemeli; tek muaf ifade 'aracı kurumuna emir gönderilmedi' (#12). Yazıyla onay ('evet') eklenmesi bir yazma yolu açar ve eklenmez (#10).
- Bu ortamda ağ dış API'leri engelliyor: Frankfurter, CoinGecko, EVDS doğrulanamaz; sonuç 'sahte Supabase ile yeşil' diye raporlanır, npm audit çalışmazsa 'doğrulanamadı' yazılır.
- Plan satır numaraları önceki doğrulamadan taşındı ve kayabilir; uygulayıcılar her değişiklikten önce kodda yeniden doğrular.

## Danışma notları (güvenlik + uyum kısıtları, ham)

```json
{
 "planOnayli": true,
 "kisitlar": [
  {
   "kalemId": "K1",
   "ciddiyet": "yuksek",
   "kisit": "Eski anahtar 'fagent.ai.proxyurl.v1' yalnızca silinecek bir LEGACY listesinde geçer. BACKED_UP_KEYS, snapshotUserData, whitelistUserData ve cloud.ts senkron kümesine girmez. Silme try/catch'li ve idempotent olur, main.tsx'te render öncesi bir kez çalışır ve clearLocalUserData içinde de çalışır. Kullanıcı verisi anahtarlarına (portföy vb.) dokunulmaz."
  },
  {
   "kalemId": "K1",
   "ciddiyet": "kritik",
   "kisit": "Sökümden sonra src/, netlify/functions, scripts, docs ve tests içinde dış AI/worker/proxy çağrısı kalmaz (fetch, URL sabiti, 'worker', 'LLM' bahisleri dahil). Ajan sekmesi yalnızca uygulama kökenine istek atar. agent.ts saf kalır: fetch, localStorage, DOM veya import yok. Anahtar VITE_ değişkenine konmaz ve istemciye hiçbir AI anahtarı ya da adresi girmez."
  },
  {
   "kalemId": "K1",
   "ciddiyet": "orta",
   "kisit": "Fallback metni görevde sabit 'Bunu yanıtlayamam; şunları sorabilirsin…' olarak istenmiş. Plan bunu erteliyor. Metin görevdeki biçime çekilir ve 7 e2e dosyasındaki seçici aynı kalemde güncellenir. Kontrol sayısı azalmaz."
  },
  {
   "kalemId": "K1",
   "ciddiyet": "orta",
   "kisit": "Kenar çubuğu rozeti her durumda sabit 'ANAHTARSIZ MOD' olur. Gizlilik metni (Account.tsx, README) 'AI adresi' ibaresini ve 'Gerçek AI'a Geçiş (planlı)' bölümünü içermez. README 'veri tarayıcıdan çıkmaz' tipi iddiaları bulut senkronuyla çelişmeyecek biçimde bırakılır."
  },
  {
   "kalemId": "K2",
   "ciddiyet": "kritik",
   "kisit": "Ajan çıktıları ve düğmeler kayıt dilinde olur: ('emir', 'uygula', 'işlendi', 'öneri', '-malısın', '-melisin') yok. Tek istisna onay mesajındaki sabit 'aracı kurumuna emir gönderilmedi' ifadesidir. Bu istisna kod yorumunda ve testte belgelenir. 'TAM YEDEK (önerilen)' ifadesi de değiştirilir. Metinler betimleyici kipte yazılır."
  },
  {
   "kalemId": "K2",
   "ciddiyet": "kritik",
   "kisit": "Tavsiye kalıbı 9 cümleyi yakalar ve kayıt komutlarını yakalamaz. Kalıp işlem ayrıştırıcısından önce çalıştığı için 'al/sat' kökü tek başına kullanılmaz. Meşru olarak geçmesi gerekenler: \"THYAO'dan 500 TL sat\", 'THYAO 1000 TL al', 'satışı iptal et', 'vazgeç', 'dağılımım nasıl', 'hedeften sapmam ne', 'THYAO nasıl gidiyor'. Regex'te \\b yok. Girdi toLocaleLowerCase('tr') ile ve I/İ/ı varyantlarıyla denenir. Ret metni 'tavsiye veremem' ve 'SPK' içerir."
  },
  {
   "kalemId": "K2",
   "ciddiyet": "orta",
   "kisit": "Değer yargıları sayı betimlemesine çevrilir (panik, sağlam, rahatlatır, disiplin gibi sözler çıkar). Her sayı kullanıcı verisinden hesaplanır, sabit varsayım uydurulmaz. Analiz çıktılarında 'yatırım tavsiyesi değildir' uyarısı korunur. 'Onayla' düğme adı action, cryptodemo ve parser e2e dosyalarında eksiksiz güncellenir."
  },
  {
   "kalemId": "K3",
   "ciddiyet": "yuksek",
   "kisit": "Ağ izolasyonu testinde dinleyici Ajan sekmesine geçildikten sonra açılır ve ölçüm kapsamı testte 'sohbet sırasında' diye yazılır. Dış istekler başarısız olsa da ölçüm 'istek gönderildi mi' üzerinedir. Eski anahtar addInitScript ile yalnızca bir kez ekilir (sayfa yenilemede yeniden ekilmez), yoksa silme doğrulanamaz. Başka bir fagent.* anahtarının korunduğu ayrı kontrolle gösterilir."
  },
  {
   "kalemId": "K3",
   "ciddiyet": "orta",
   "kisit": "Yasaklı kelime taramasında tavsiye ret mesajı muaf tutulmaz. Ret metni 'öneri/uygula/işlendi/emir/-malısın' içermiyorsa taramaya girmeli ve bunu kanıtlamalıdır. Muafiyet yalnızca onay mesajındaki tam 'emir gönderilmedi' metni için olur. Her tavsiye cümlesi ayrı check satırıdır. Yeni kontroller mevcut 582'nin üstüne eklenir."
  },
  {
   "kalemId": "K3",
   "ciddiyet": "dusuk",
   "kisit": "Kapıdaki dış API doğrulamaları (Frankfurter, CoinGecko, EVDS) bu ortamda yapılamaz. Rapor bunu açıkça yazar ve 'sahte Supabase ile yeşil' ayrımını korur. Commit, push, stash ve reset yapılmaz."
  }
 ],
 "itirazlar": [
  {
   "kalemId": "K1",
   "gerekce": "Plan, görevdeki sabit cevabı ('Bunu yanıtlayamam; şunları sorabilirsin…') ertelemiş ve mevcut 'tam olarak anlayamadım' metnini yeterli saymış. Kullanıcı kararı ve görev metni sabit cevabı açıkça istiyor. Seçicilerin kırılması, istenen davranışı atlamak için gerekçe olmaz.",
   "oneri": "Fallback metnini 'Bunu yanıtlayamam; şunları sorabilirsin:' biçimine çevir. Mevcut 7 e2e dosyasındaki 'tam olarak anlayamadım' seçicilerini aynı kalemde yeni metne güncelle. Kontrol sayısı azalmaz. Bunu ertelenenler listesinden çıkar."
  },
  {
   "kalemId": "K3",
   "gerekce": "Planın yasaklı kelime taramasında tavsiye ret mesajını muaf tutması gereksiz bir açık bırakır. Ret metni yasaklı kelimeleri taşımıyorsa taranabilir. Tarama dışı bırakılırsa ret metnine ileride 'öneri' ya da '-malısın' girse de test yakalamaz.",
   "oneri": "Ret mesajını da tara. Muafiyeti yalnızca onay mesajındaki 'emir gönderilmedi' ile sınırla. Ret metni kelime içeriyorsa muafiyeti tam metinle belgele."
  },
  {
   "kalemId": "K2",
   "gerekce": "Planda 'THYAO almalı mıyım' için büyük/küçük harf riski not edilmiş ama kabul ölçütüne girmemiş. /i bayrağı Türkçe İ/ı dönüşümünü doğru çözmez. Girdi 'THYAO' gibi büyük harfle gelebilir. Bu, ret mesajının gelmemesine ve tavsiye benzeri yanıt üretilmesine yol açabilir.",
   "oneri": "Kabul ölçütüne ekle: 9 cümle hem küçük hem büyük harfle (örn. 'THYAO ALMALI MIYIM') ve İ/I varyantlarıyla test edilir. Kalıp, normalize edilmiş (toLocaleLowerCase('tr')) girdiye uygulanır."
  }
 ]
}
```

```json
{
 "planOnayli": true,
 "kisitlar": [
  {
   "kalemId": "K1",
   "kisit": "Kanıt: `npm run build` ✓ ve `npm run guvenlik -- --dist`: 91 dosya + dist/, npm audit çalıştı, 0 kritik, 0 uyarı. Kalem bittikten sonra bu tarama yeniden koşulur. dist/ içinde `fagent.ai.proxyurl`, `workers.dev`, `askAi` ve `AI BAĞLI` dizgeleri kalmamalı (`grep -r` ile dist/assets/*.js üzerinde doğrulanır). Bu, dosyanın silindiğinin derleme çıktısındaki kanıtıdır.",
   "ciddiyet": "yuksek"
  },
  {
   "kalemId": "K1",
   "kisit": "Eski anahtar temizliği yalnızca TAM ADLI, sabit bir listeyle yapılır (`LEGACY_KEYS = ['fagent.ai.proxyurl.v1']` gibi). Önek/joker kullanılmaz (`fagent.ai.*`, `startsWith('fagent.')` yok). Kullanıcının başka bir katmanı yanlışlıkla silinmemeli. Fonksiyon her `removeItem` çağrısını try/catch içine alır, idempotent olur ve `main.tsx`'te `createRoot().render`'dan ÖNCE çalışır. Çağrı cloud/onboarding okumalarından önce gelmeli. Temizlik kodu src/agent.ts ve src/analytics.ts'e girmez (§0.6).",
   "ciddiyet": "yuksek"
  },
  {
   "kalemId": "K1",
   "kisit": "`LEGACY_KEYS` hiçbir beyaz listeye girmez: BACKED_UP_KEYS, `whitelistUserData`, `applyUserData`, `SYNCED_LAYERS`. BACKED_UP_KEYS diff'te değişmemeli. Doğruladım: cloud.ts:164 ve backup.ts:121/150 yalnızca BACKED_UP_KEYS'i yazıyor. Bu yüzden eski bir yedek dosyası ya da bulut satırı anahtarı geri getiremez. Bu garanti korunur.",
   "ciddiyet": "yuksek"
  },
  {
   "kalemId": "K1",
   "kisit": "src/ içinde AI katmanından kalan hiçbir ağ yolu kalmaz. `grep -rn \"fetch(\" src` çıktısı yalnızca market.ts, priceHistory.ts, cryptoMarketData.ts ve evds.ts satırlarını göstermeli. Sabit hostlar: api.frankfurter.dev, api.coingecko.com ve aynı kökenli /api/evds. Kullanıcının girdiği metinden URL kuran yeni bir yol eklenmez. send() senkron kalır; sohbet akışında Promise/fetch zinciri kalmaz.",
   "ciddiyet": "yuksek"
  },
  {
   "kalemId": "K1",
   "kisit": "Gizlilik metni gerçek veri akışıyla tutarlı olmalı (KVKK). Account.tsx:79 → 'Eşitlenmeyenler: fiyat önbellekleri ve bu tarayıcıdaki oturum bilgisi.' README:72-73'teki eşitlenmeyenler listesinden AI adresi çıkar. Yeni metin 'hiç dış istek yok' DEMEZ. Kullanıcı başlatınca giden fiyat sorguları (Frankfurter, CoinGecko) yalnızca döviz kodu ya da coin kimliği taşır; tutar veya portföy içeriği taşımaz. Metin bunu doğru biçimde söyler.",
   "ciddiyet": "orta"
  },
  {
   "kalemId": "K1",
   "kisit": "README 'Gerçek AI'a Geçiş' bölümü 'ürün dışı' diye yeniden yazılırken LLM'i geri bağlama talimatı kalmaz. Kaldırılacaklar: `ANTHROPIC_API_KEY` tanımla, var olmayan `server/ai.js` proxy'si ve `fetch('/api/ai/chat')` adımları. README:146'daki 'bu dosyayı bir sunucu/LLM çağrısıyla değiştirmeyi basitleştirir' atfı da kalkar. Metinde gizli anahtar adı ve örnek değeri bulunmaz; guvenlik taramasının `atanmis-gizli-degisken` kuralı temiz kalmalı.",
   "ciddiyet": "orta"
  },
  {
   "kalemId": "K1",
   "kisit": "fagent-auth-e2e.mjs:200, 276-278 ve 359-368 silinmez, gevşetilmez. (b) bulut satırından gelen beyaz liste dışı anahtar kontrolüdür ve değeri sürer. (a)'da anahtar artık açılışta temizlendiği için kontrol bu anahtar açısından kendiliğinden geçer. Aynı kontroldeki diğer anahtarlar (cryptomarket, evds, cloud.owner) beyaz liste kapsamını taşımaya devam eder. Gerekirse bu durum yorumla belgelenir.",
   "ciddiyet": "orta"
  },
  {
   "kalemId": "K1",
   "kisit": "Kapsam dışı, dokunulmaz, kayda geçer: public/cors-test.html dist/'e girip üçüncü taraf uçlara (BtcTurk, TEFAS, goldprice, CoinGecko, Frankfurter) istek atan bir geliştirici sayfası. Portföy verisi taşımıyor ama üretim yüzeyinde gereksiz. Ayrı bir iş olarak (adım 8, devir paketi) kaldırılması değerlendirilir.",
   "ciddiyet": "dusuk"
  },
  {
   "kalemId": "K2",
   "kisit": "Defter yazımı yalnızca 'Deftere ekle' DÜĞMESİYLE olur. Metin değişikliği sırasında yazıyla onay ('evet', 'ekle', 'tamam') eklenmez. `resolveAction`'daki tek yazma yolu ve bakiye aşımı kontrolü korunur. Tavsiye kuralı hiçbir durumda `pendingAction` döndürmez ve CHAT_RULES içinde işlem ayrıştırıcısından önce kalır (§0.2, §0.3).",
   "ciddiyet": "yuksek"
  },
  {
   "kalemId": "K2",
   "kisit": "Tavsiye regex'i kullanıcı girdisine her mesajda uygulanır, bu yüzden ReDoS'a açık yapı içermez. İç içe nicelik (`(a+)+`, `(.*)*`) ve birden fazla sınırsız `.*` art arda gelmez. Kelime arası boşluk için `\\s*`/`\\s+` ya da sınırlı `\\S{0,20}` kullanılır. Türkçe için `\\b` kullanılmaz (AGENTS.md §3). Büyük harfli girdi için girdi `toLocaleLowerCase('tr-TR')` ile normalize edilir ya da kalıp hem İ hem I yazımıyla sınanır.",
   "ciddiyet": "orta"
  },
  {
   "kalemId": "K2",
   "kisit": "Dokunulan metinlerde gerçek işlem izlenimi kalmaz. 'Deftere kaydedildi — aracı kurumuna emir gönderilmedi.' ifadesi zorunlu. Yanlış güvence de verilmez: yardım metni ve onay balonu 'aracı kuruma bağlanırım' gibi bir yetenek ima etmez.",
   "ciddiyet": "orta"
  },
  {
   "kalemId": "K3",
   "kisit": "Ağ izolasyonu `page.on('request')` yerine `context.on('request')` ile ölçülür, böylece popup ve worker istekleri de yakalanır. Ayrıca `page.on('websocket')` dinlenir. Köken karşılaştırması `new URL(u).origin === BASE` ile yapılır, `startsWith` kullanılmaz. `data:` ve `blob:` istisnası açıkça yazılır. Kaydedilen dış köken listesi teste yazdırılır. İzin listesi eklenmez: sohbet sırasında Frankfurter, CoinGecko ya da font istekleri de başarısızlık sayılır. Doğruladım: App'te setInterval yok, index.html/CSS'te dış font yok, fiyat istekleri kullanıcı tetiklemeli (App.tsx:130). Bu yüzden katı ölçüm kararlı olmalı.",
   "ciddiyet": "yuksek"
  },
  {
   "kalemId": "K3",
   "kisit": "Ağ izolasyonu testi EKİLİ eski anahtarla da koşar: `fagent.ai.proxyurl.v1 = 'https://worker.example.workers.dev'`. Tanınmayan soru (fallback) gönderildiğinde bu adrese ve başka hiçbir dış adrese istek gitmediği ayrı bir check satırıyla gösterilir. Bu, katmanın gerçekten söküldüğünün davranışsal kanıtıdır.",
   "ciddiyet": "yuksek"
  },
  {
   "kalemId": "K3",
   "kisit": "`addInitScript` her navigasyonda yeniden çalışır. Anahtar oradan ekilirse silinme kontrolü sayfa yeniden yüklenmeden aynı yüklemede yapılır, ya da ekim tek seferlik bir işaretle sınırlanır. Aksi halde test yanlış negatif verir. Korunacak anahtar olarak BACKED_UP_KEYS'ten biri (fagent.portfolio.v1) ve beyaz liste dışı biri (fagent.cryptomarket.cache.v2) birlikte kontrol edilir; temizliğin aşırı geniş olmadığı böylece gösterilir.",
   "ciddiyet": "orta"
  },
  {
   "kalemId": "K3",
   "kisit": "Test dosyası gizli anahtar desenine benzeyen sahte değer içermez (sk-…, eyJ… JWT, sb_secret_). Sahte adres olarak yalnızca `*.example` veya `*.workers.dev` alan adı kullanılır. Kapıda `npm run guvenlik -- --dist` 0 kritik vermeli. 'npm audit ÇALIŞMADI' çıkarsa 'temiz' değil 'doğrulanamadı' diye raporlanır.",
   "ciddiyet": "orta"
  }
 ],
 "itirazlar": [
  {
   "kalemId": "K1",
   "gerekce": "README:27 'Hesap kurulumda kapalıdır ve açılmadıkça hiçbir ağ isteği atılmaz.' diyor. Bu gerçek veri akışıyla çelişiyor: Frankfurter ve CoinGecko'ya fiyat istekleri, açılışta da /api/evds isteği (App.tsx:2103) gidiyor. K1 zaten bu bölümün gizlilik metnini güncelliyor. Bu cümle düzeltilmeden bırakılırsa KVKK aydınlatmasıyla tutarsız bir gizlilik iddiası ürün dalında kalır. Adım 7'deki aydınlatma metni de buna dayanacak.",
   "oneri": "README:23-27 paragrafını K1'in metin işine kat. Cümle 'Hesap kurulumda kapalıdır; hesap açılmadıkça veri hiçbir sunucuya eşitlenmez. Fiyat sorguları (Frankfurter, CoinGecko) yalnızca döviz kodu ya da coin kimliği içerir, tutar içermez; enflasyon oranı için kendi /api/evds fonksiyonumuz çağrılır.' gibi doğru bir ifadeye çevrilir. Kod değişikliği gerekmez, yalnızca metin."
  },
  {
   "kalemId": "K3",
   "gerekce": "Planda dinleyicinin 'Ajan sekmesine geçildikten sonra' açılması, açılıştaki istekler ölçüme karışmasın diye konmuş. Ama kod bu ihtiyacı doğurmuyor: setInterval yok, dış font yok, fiyat istekleri kullanıcı tetiklemeli. Planda bir de ekili eski anahtarla fallback senaryosu yok. Oysa 'AI katmanı söküldü' iddiasının tek davranışsal kanıtı, adres tanımlıyken bile o adrese istek gitmemesidir. Mevcut planda bu, anahtarın silinmesi testine dolaylı olarak bağlanmış.",
   "oneri": "Dinleyici sohbetten önce açılabilir; başlangıç anı testte belgelenir. İzin listesi olmadan katı ölçüm yapılır. Eski anahtar ekili, ayrı bir senaryo eklenir: açılış, Ajan sekmesi, tanınmayan soru. Bu senaryoda worker adresine ve başka hiçbir dış kökene istek gitmediği ayrı bir check satırında gösterilir. Kontrol `context.on('request')` ve `page.on('websocket')` ile yapılır."
  }
 ]
}
```

