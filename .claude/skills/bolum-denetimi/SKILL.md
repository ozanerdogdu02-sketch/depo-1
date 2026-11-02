---
name: bolum-denetimi
description: FAGENT'ta simülasyon bölümü (A, B, C...) bittiğinde yapılan bölüm sonu kod denetiminin süreci, boyutları, skill/araç matrisi ve rapor şablonu. Bölüm sonu denetimi, "denetim", "audit" ya da "kapı yeşil mi, veri dışarı çıkıyor mu" işinde kullan.
---

# Bölüm sonu kod denetimi

Kural kaynağı: `CLAUDE.md` → "KURAL (kullanıcı, 2026-11-02)". Bu belge kendi başına yeterlidir: aşağıda adı geçen dış skill'ler
(Cloudflare, engineering, data...) devralan kişide kurulu olmayabilir; yalnız hangi kontrolleri aldığımız yazılıdır.
Hukuk/KVKK/SPK konuları kullanıcı kararıyla EN SONA bırakıldı: bu denetimde yapılmaz.

## 1. Boyutlar ve FAGENT'a uyan somut kontroller

| Boyut | Somut kontrol | Otomatik (`npm run denetim`) |
|---|---|---|
| D1 Veri dışarı çıkıyor mu | Her ağ çağrısı izinli ana bilgisayar listesinde mi (istemci: Frankfurter, CoinGecko, Supabase env; sunucu: EVDS, KAP, Borsa İstanbul). Portföy içeriği yalnız kullanıcının Supabase hesabına gider. Her depolama anahtarı `BACKED_UP_KEYS`/açıklanmış istisna mı. Yedek ve bulut gövdesinde beklenmeyen alan var mı. | ağ envanteri, depolama anahtarları, VITE_ gizli ad |
| D2 Sıkışma/taşma | localStorage kotası, önbellek ömrü ve boyutu, yedek dosyası ~10 MB sınırı, sunucuda yukarı akış gövde sınırı (`sinirliOku`), istemci başına hız sınırı kayıt tavanı, paket bütçesi (JS toplam, en büyük parça, CSS), sıkıştırılmış boyut. | paket bütçesi, sunucu gövde sınırı |
| D3 Güncel ve doğru veri | Her sayıda kaynak + tarih etiketi; eski önbellek hesaba girmez; kaynak başarısızsa "veri yok" (uydurma yok); varsayılan sabitler (enflasyon, stopaj) güncel mi; aykırı değer (negatif fiyat, sıfır kur, ani %50 sıçrama) ayıklanıyor mu. | KISMEN: betik yalnız bayat `dist/` uyarır. Gerisi ajan/lider incelemesi |
| D4 Yanlış kodlanmış yollar | `/api/<ad>` çağrısı karşılığı `api/<ad>.mjs` var mı; Netlify yönlendirmesi var mı; CSP `connect-src` ile istemci hedefleri tutarlı mı; `holdingId` yerine isimle eşleme, `todayLocalDate()` yerine `toISOString().slice(0,10)` gibi tarih/anahtar tuzakları. | api yolu, CSP uyumu, yönlendirme |
| D5 Sunucu fonksiyonu dayanıklılığı | Dış fetch'te zaman aşımı + `redirect:'error'` (ortak `yukariAkisaGit`); gövde sınırı; devre kesici; gizli anahtar yalnız ortam değişkeninde; `Math.random` ile güvenlik değeri üretilmez; modül düzeyinde kullanıcıya özgü değişken durum yok (hız sınırı kovası hariç, bilinçli). | sunucu fonksiyonu koruması |
| D6 Arayüz erişilebilirliği | Renk kontrastı, klavye, kazanç/kayıp ikinci işaret. | BEKLEMEDE: arayüz değişince (tasarım kullanıcıda) |
| D7 Hukuk | KVKK, SPK, ETBİS, avukat görüşü. | ERTELENDİ (hukuk en sona) |

## 2. Kaynak skill'lerden alınan / alınmayan maddeler

Alınan (yalnız fikir/kontrol; dosya kopyalanmadı):
- `cloudflare:web-perf`: paket bütçesi, gzip boyutu, tek büyük parça uyarısı, "ölç, sonra öner" ilkesi. Çalışan tarayıcıda Core Web Vitals ölçümü canlı site/önizleme gerektirir; bu ortamda ölçülmedi, "ölçülmedi" yazılır.
- `cloudflare:workers-best-practices` (yalnız sunucusuz fonksiyonlarımıza uyan): sınırsız gövde okumama (stream/sınır), zaman aşımı, gizli anahtarın kodda olmaması, `Math.random` ile güvenlik değeri üretmeme, modül düzeyi değişken istek durumu olmaması, `waitUntil`/beklenmeyen asenkron iş kalmaması.
- `cloudflare:cloudflare-one` (yalnız zero trust İLKELERİ): en az yetki (izinli ana bilgisayar listesi, `connect-src` daraltma), varsayılan ret (listede yoksa HATA), her istekte doğrula (sunucu girdi doğrulaması, ajan çıktısına güvenme). Ürün kurulumu (Access, Gateway, WARP) alınmadı.
- `engineering:code-review`: doğruluk, güvenlik, performans, okunabilirlik, hata yolları; ciddiyet etiketi.
- `engineering:deploy-checklist`: canlıya çıkmadan kapı listesi (typecheck, build, tarama, birim, e2e, denetim), geri alma yolu, ortam değişkeni listesi.
- `engineering:tech-debt`: bulguyu "kapat / bilinçli ertele (gerekçeli, tarihli)" diye sınıflama.
- `engineering:testing-strategy`: her koruma için KIRMIZI (ihlal yakalanır) ve YEŞİL (temiz geçer) test; sınır değerleri.
- `data:validate-data`: sayının kaynağı/tarihi, mantık denetimi, eski veri, uydurma değer.
- `broker-veri-kalite-ajani`: tazelik, kaynak etiketi, aykırı değer.
- `operations:risk-assessment`: bulgu için olasılık x etki, azaltma ve sahip.
- Claude Code yerleşik `security-review` ve `code-review`: lider çalıştırır.

Alınmayan (uygulanmaz):
- Cloudflare KV, D1, R2, Durable Objects, Queues, Workflows, service binding, `wrangler` yapılandırması, compatibility date, Workers Logs/Traces: FAGENT Cloudflare Workers'ta değil, Vercel (`api/*.mjs`) ve Netlify fonksiyonlarında çalışır; bu bağlayıcılar yok. Gözlemlenebilirlik karşılığı: portföy içeriği log'a yazılmaz kuralı, o yüzden yapılandırılmış log açılmaz.
- Cloudflare One ürün kurulumu (Access, Gateway, Tunnel, WARP, DLP, CASB): kullanılmıyor.
- `design:accessibility-review`: beklemede (D6).
- `legal-risk-assessment` ve diğer hukuk skill'leri: ertelendi (hukuk en sona).
- Cloudflare MCP sunucusu bu ortamda bağlanamıyor (proxy 403): canlı Cloudflare verisi çekilmez.

## 3. Matris: skill -> boyut -> kim -> kanıt

Ajanlar Skill aracını kullanamaz: lider Skill aracını kendisi çalıştırır ve çıktıyı ajana ya da rapora aktarır; ajanlar bu belgeyi okur.

| Skill / araç | Boyut | Kim çalıştırır | Kanıt biçimi |
|---|---|---|---|
| `npm run denetim` (betik) | D1, D2, D4, D5 | `fagent-test` (kapı) + lider yeniden | komut çıktısı + çıkış kodu; her HATA kuralı için `tests/unit/denetim.test.ts` KIRMIZI/YEŞİL |
| `npm run guvenlik -- --dist` | D1 (gizli anahtar, bağımlılık) | `fagent-guvenlik` | tarama çıktısı (0 kritik) |
| `security-review` (yerleşik) | D1, D5 | lider (Skill aracı) | bulgu listesi: dosya:satır, istismar, düzeltme |
| `code-review` (yerleşik) + `engineering:code-review` | D4, D5 | lider; bulguları `fagent-test` doğrular | dosya:satır + ciddiyet |
| `cloudflare:web-perf` | D2 | lider (kod/ağ analizi; trace ölçümü ortam gerektirir) | betik bütçe satırı + "ölçülmedi" notu |
| `cloudflare:workers-best-practices` | D5 | lider, `fagent-guvenlik` kontrol listesi olarak | `api/`, `netlify/` için madde madde geçti/kaldı |
| `cloudflare:cloudflare-one` (ilkeler) | D1 | `fagent-guvenlik` | izinli liste + CSP uyum çıktısı |
| `data:validate-data` | D3 | lider; `fagent-veri-akisi` kanıt üretir | örnek sayı -> kaynak/tarih izi; birim test çıktısı |
| `broker-veri-kalite-ajani` | D3 | lider | tazelik/aykırı değer tablosu |
| `engineering:testing-strategy` | tümü | `fagent-test` | KIRMIZI/YEŞİL test çıktısı |
| `engineering:deploy-checklist` | tümü | lider (bölüm sonu) | kapı listesi işaretli, ortam değişkenleri |
| `engineering:tech-debt` | tümü | lider | kapanmayan bulgu tablosu (gerekçe + tarih) |
| `operations:risk-assessment` | tümü | lider | açık bulgu için olasılık x etki satırı |
| `fagent-uyum` ajanı | ürün sınırı (tavsiye yok, sahte veri yok) | ayrı ajan | uyum bulguları |
| `design:accessibility-review` | D6 | BEKLEMEDE | - |
| `legal-risk-assessment` | D7 | ERTELENDİ (hukuk en sona) | - |

## 4. Zero trust (uygulama kuralı)

- Uygulayıcı ajan != doğrulayıcı ajan. Kendi yazdığın kodu kendi denetlemezsin.
- Hiçbir ajan beyanı kanıt değildir; komut çıktısı kanıttır. Her koruma için KIRMIZI (ihlal yakalandı) ve YEŞİL (temiz geçti) kanıtı.
- Lider kritik iddiaları (ağ hedefi listesi, gizli anahtar yok, kapı yeşil) komutla yeniden doğrular.
- Betiğin izinli listesi (`scripts/denetim.mjs` başı) gevşetilmez; yeni ana bilgisayar = önce Üst Kurul talebi, sonra liste + CSP.
- Dış kaynaklar bu ortamda doğrulanamaz: "gerçek ağda doğrulanmadı" yaz. Supabase: "sahte Supabase ile yeşil".
- Ajanlar commit/push yapmaz, `.env*` okumaz, süreci yalnız PID ile durdurur.

## 4b. SINIR (betik neyi yakalamaz)

`npm run denetim` STATİK METİN taramasıdır. Kararlı bir saldırganı tamamen yakalayamaz (kodlanmış/parçalı dizeler, `eval`, `Function`, bağımlılık içinden gelen çağrılar, derleme sonrası değişiklik vb.). Betik yalnız dikkatsiz/yanlış kodlamayı ve bilinen kaçış yollarını (dolaylı `fetch`, `host@evil`, protokolsüz `//host`, dinamik `import()`, `eval(`/`new Function(`) yakalar. Asıl çalışma zamanı koruması CSP `connect-src`/`script-src`'dir (tarayıcı uygular). Bu üçü birlikte işler: betik + CSP + insan/ajan incelemesi. "Betik temiz" tek başına "güvenli" demek değildir.

CSP `script-src 'self'` `eval`, uzak `import()`, `new Worker`/`createElement('script')` ile yüklenen dış kodu çalışma zamanında da engeller; ama `location` yönlendirmesini CSP engellemez (navigasyon `connect-src`/`script-src` kapsamında değildir). Bu yüzden betikte `ag-yonlendirme` kuralı var; `ag-worker`, `ag-script-elemani`, `ag-dinamik-import`, `kod-dinamik-calistirma` kuralları ise CSP'ye ek ikinci katmandır. `FN_URL` sabitleri yalnız `/api/<ad>` (ve `api/<ad>.mjs` var) olabilir (`ag-fn-url`).

İstisnalar (`IZIN_DINAMIK_CAGRI`) dosya + satırın TAM metniyle eşleşir; satır değişirse ya da başka çağrı eklenirse istisna kendiliğinden düşer ve `url` kaynağı ayrıca izlenir. Yeni istisna gerekçesiyle eklenir; toptan muafiyet yok.

## 5. Sıra

1. `npm run typecheck`, `npm run build`, `npm run guvenlik -- --dist`, `npm run denetim`, `npm run test:unit`, e2e.
   Not: `npm run denetim` bölüm sonunda build'den SONRA koşulur (paket bütçesi `dist/` ölçer; eski `dist/` bayat uyarısı verir).
   Ağ kuralları: istemcide her fetch hedefi izinli host içeren sabit, buna çözülen sabit ya da `/api/...` olmalı; XHR/WebSocket/EventSource/sendBeacon/new Image/window.open varsayılan HATA; `host@evil` biçimi HATA; sunucuda her fetch çağrısı kendi nesnesinde signal + redirect:'error' taşır; `index.html` ve `public/*.html` dış bağlantıları izinli değilse HATA.
2. Ajan incelemeleri (güvenlik, uyum, veri akışı) ayrı ajanlarda.
3. Lider Skill aracıyla: `security-review`, `code-review`, web-perf, workers-best-practices, cloudflare-one, validate-data, broker-veri-kalite-ajani.
4. Rapor yaz; bulgular kapanmadan sonraki bölümün commit'i atılmaz.

## 6. Rapor şablonu: `docs/denetim/bolum-<X>-denetim.md`

```
# Bölüm <X> kod denetimi (tarih)
## Kapsam ve commit/çalışma ağacı durumu
## Kapı sonuçları (komut, sonuç satırı)   typecheck / build / guvenlik / denetim / test:unit / e2e
## D1 Veri dışarı çıkıyor mu              ağ envanteri tablosu, depolama anahtarı tablosu, yedek/bulut gövdesi
## D2 Sıkışma ve taşma                    kota, önbellek, bütçe sayıları
## D3 Güncel ve doğru veri                kaynak/tarih etiketi örnekleri, uydurma taraması
## D4 Yanlış kodlanmış yollar
## D5 Sunucu fonksiyonları
## Skill çıktıları                        her skill: çalıştı mı, bulgu sayısı (çalışmayan: neden)
## Bulgular                               no | ciddiyet | dosya:satır | açıklama | durum (açık/kapandı/bilinçli ertelendi + gerekçe)
## KIRMIZI/YEŞİL kanıtları
## Doğrulanamayanlar                     gerçek ağ, gerçek Supabase, Core Web Vitals, görsel
## Ertelenenler                          hukuk (en sona), erişilebilirlik (arayüz değişince)
## Lider yeniden doğrulama               komut + sonuç
```
