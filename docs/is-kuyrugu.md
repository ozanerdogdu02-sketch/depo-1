# FAGENT İş Kuyruğu

Ürünü satışa hazırlamak için bekleyen işlerin tek listesi. Yeni iş, hedef ya da tasarım isteği buraya
eklenir; ekip koşuları buradan iş alır. Durumlar: **Bekliyor** · **Sürüyor** · **Tamam** · **Reddedildi**.

Kaynaklar: araştırma sentezi (19 Ekim 2026, yönetmen + 5 rol), canlı öncesi zorunlu liste (`CLAUDE.md`),
görsel kontrol (19 Ekim 2026). Ayrıntılı gerekçe ve kaynaklar geliştirme raporları klasöründe
(`05-arastirma/00-SENTEZ-oncelikli-iyilestirmeler.md`).

## Nasıl iş eklenir

Tabloya yeni bir satır ekle: kısa başlık, neden, plan adımı (1–8 ya da "yeni"), öncelik (yüksek/orta/düşük),
efor (küçük ≤2 saat / orta ≤1 gün / büyük >1 gün), durum **Bekliyor**. Kurallara (`AGENTS.md` §0) aykırı
iş eklenmez. Ekip bir işi bitirince durumunu **Tamam** yapar ve commit'i yazar.

## Öncelikli işler

| # | İş | Plan adımı | Öncelik | Efor | Durum | Kaynak |
|---|---|---|---|---|---|---|
| 1 | aiAgent katmanını tümüyle çıkar | 3 | yuksek | orta | Planlandı (bkz. docs/adim3-ekip-plani.md) | araştırma: fagent-uyum, fagent-guvenlik, fagent-veri-akisi |
| 2 | Ajan işlem komutu: 'deftere kayıt' dili | 3 | yuksek | kucuk | Planlandı (bkz. docs/adim3-ekip-plani.md) | araştırma: fagent-uyum, fagent-tasarim |
| 3 | Tavsiye reddi regex'ini genişlet ve normatif ajan yorumlarını betimleyici yap | 3 | yuksek | kucuk | Planlandı (bkz. docs/adim3-ekip-plani.md) | araştırma: fagent-uyum |
| 4 | #40 Derleme kapısı: gizli anahtarı reddet | 4 | yuksek | kucuk | Bekliyor | araştırma: fagent-veri-akisi, fagent-guvenlik, fagent-test |
| 5 | #43/16 Güvenlik başlıkları (vercel.json) ve cors-test.html'in üretimden çıkarılması | 4 | yuksek | kucuk | Bekliyor | araştırma: fagent-guvenlik, fagent-veri-akisi, fagent-test |
| 6 | Migration'a authenticated için açık grant ekle | 5 | yuksek | kucuk | Bekliyor | araştırma: fagent-guvenlik |
| 7 | #35 Başka sekmeden çıkışta kaydedilmemiş yerel kopyayı karantinaya al | 2 | yuksek | kucuk | Bekliyor | araştırma: fagent-veri-akisi, fagent-test |
| 8 | #41 Geri yükleme: 2 MB sınırı ve hata durumunda eski veriye dönüş | 2 | yuksek | orta | Bekliyor | araştırma: fagent-veri-akisi, fagent-test |
| 9 | #34/33 SIFIRLA: dürüst onay modalı; yeniden kurulumda buluttaki kopyayı ezme | 2 | yuksek | orta | Bekliyor | araştırma: fagent-tasarim, fagent-veri-akisi, fagent-test |
| 10 | #27 Koşullu güncelleme: portfolios.version | 5 | yuksek | orta | Bekliyor | araştırma: fagent-veri-akisi, fagent-guvenlik, fagent-test |
| 11 | #47 KVKK: aydınlatma ile rızayı ayır; devredilebilir veri sorumlusu yapılandırması | 7 | yuksek | orta | Bekliyor | araştırma: fagent-tasarim, fagent-uyum, fagent-test |
| 12 | Şifre sıfırlamada veri inişini ertele, diğer oturumları kapat | 2 | orta | kucuk | Bekliyor | araştırma: fagent-guvenlik |
| 13 | Bitişik hesap bağlantıları ve dokunma hedefi boyutu | 6 | yuksek | kucuk | Bekliyor | araştırma: fagent-tasarim |
| 14 | Mobil gezinme: alt çubuk ve 'Daha fazla' | 6 | yuksek | orta | Bekliyor | araştırma: fagent-tasarim, fagent-test |
| 15 | EVDS'yi Vercel fonksiyonuna taşı (SSRF sıkılaştırmasıyla) | 4 | yuksek | orta | Bekliyor | araştırma: fagent-veri-akisi, fagent-guvenlik |
| 16 | Yedek enflasyon değerini kaynaklı güncelle | 4 | yuksek | kucuk | Bekliyor | araştırma: fagent-veri-akisi, fagent-uyum |
| 17 | Stopaj kaynak atfını düzelt, fon türü uyarısı ekle | 3 | yuksek | kucuk | Bekliyor | araştırma: fagent-veri-akisi, fagent-uyum |
| 18 | RLS ve delete_my_account için pgTAP testi, CI'da yerel Supabase | 5 | yuksek | orta | Bekliyor | araştırma: fagent-test, fagent-guvenlik |
| 19 | Supabase proje ayarları: şifre ≥12, yönlendirme listesi, e-posta doğrulaması, bölge ve aktarım | 5 | orta | kucuk | Bekliyor | araştırma: fagent-guvenlik, fagent-uyum |
| 20 | Çakışma kartı ve hesap silme onayı: sonucu söyleyen düğmeler | 6 | orta | kucuk | Bekliyor | araştırma: fagent-tasarim |
| 21 | Saf birim testleri: Fisher, XIRR (NPV≈0), HHI | 8 | orta | kucuk | Bekliyor | araştırma: fagent-test, fagent-veri-akisi |
| 22 | HHI ve hedef sapması etiketleri: kaynaksız eşikler ve betimleyici dil | 3 | orta | kucuk | Bekliyor | araştırma: fagent-veri-akisi |
| 23 | Eski gizlilik iddialarını dokümanlarda düzelt | 3 | orta | kucuk | Bekliyor | araştırma: fagent-uyum |
| 24 | 'Tavsiye değildir' alt bilgisi ve 'demo' dilinin temizlenmesi | 7 | orta | orta | Bekliyor | araştırma: fagent-uyum |
| 25 | Nocturne renk belirteçleri (kontrastı doğrulanmış) | 6 | orta | orta | Bekliyor | araştırma: fagent-tasarim |
| 26 | Mobil ölçüm ve axe erişilebilirlik e2e'si | 6 | orta | orta | Bekliyor | araştırma: fagent-test |
| 27 | Tedarik zinciri: aksiyonları SHA ile sabitle; Dependabot, CodeQL, SECURITY.md, tam npm audit | 8 | orta | orta | Bekliyor | araştırma: fagent-guvenlik, fagent-test |
| 28 | Acquire ilan ve devir metninde iddia-kod tutarlılığı | 8 | orta | kucuk | Bekliyor | araştırma: fagent-uyum |
| 29 | Kurulum ve Hedefler ekranları | 6 | orta | buyuk | Bekliyor | araştırma: fagent-tasarim |
| 30 | Splinter 0029'u kabul edilmiş risk olarak belgele | 5 | dusuk | kucuk | Bekliyor | araştırma: fagent-guvenlik |
| 31 | e2e koşucusunda kararsız test raporu ve Node matrisi | 8 | dusuk | kucuk | Bekliyor | araştırma: fagent-test |
| 32 | fast-check ile mülk tabanlı testler (xirr, whitelistUserData) | 8 | dusuk | orta | Bekliyor | araştırma: fagent-test |
| 33 | İsteğe bağlı TOTP ile iki adımlı doğrulama | plan dışı (adım 8 sonrası) | dusuk | orta | Bekliyor | araştırma: fagent-guvenlik |
| 34 | agent.ts için Stryker mutasyon testi | plan dışı | dusuk | buyuk | Bekliyor | araştırma: fagent-test |
| G1 | Hesap ekranı: 'Şifremi unuttum' ile 'Hesapsız devam et' bitişik | 6 | orta | küçük | ✅ Tamam (index.css) | görsel kontrol |
| G2 | Telefon (375px): menü ilk ekranı kaplıyor; alt sekme çubuğu + 'Daha fazla' | 6 | yüksek | orta | Bekliyor | görsel kontrol |
| G3 | Yüzde biçimi: '%-22,69' yerine '-%22,69' | 6 | düşük | küçük | Bekliyor | görsel kontrol |

## Ekibe verilecek hazır görev metinleri (yönetmen)

Her biri `fagent-ekip` iş akışına görev olarak verilebilir. Görev metnindeki "wip dalına kaydedilir"
ifadesi yönetmenin önerisidir; uygulanan süreç: kapı yeşil ve güvenlik incelemesi temizse ürün dalına
commit, değilse rapor klasörüne yedek.

### Görev 1 — **Planlandı — `docs/adim3-ekip-plani.md`; koşu kredi nedeniyle durduruldu**

[fagent-uyum + fagent-veri-akisi] Plan adım 3, sıra 1: `aiAgent` katmanını tümüyle çıkar. Silinecek: src/aiAgent.ts. Temizlenecek: App.tsx:32,1719-1750,1800-1837,1994,2128 (kurala uymayan soru artık sabit bir 'bunu yanıtlayamam; şunları sorabilirsin…' cevabına düşer); localData.ts:18 (fagent.ai.proxyurl.v1); README.md:23-27'deki AI bahsi. Kullanıcıda eski anahtar kaldıysa ilk açılışta silinsin. e2e: `fagent.ai.proxyurl.v1` anahtarı yok ve sohbet sırasında page.on('request') ile src dışındaki hiçbir adrese istek gitmiyor. agent.ts saf kalır (§0.6). typecheck, build ve test:e2e yeşil olmalı. İş `wip/adim3-aiagent-incelenmedi` dalına kaydedilir; ürün dalına commit edilmez.

### Görev 2 — **Planlandı — `docs/adim3-ekip-plani.md`; koşu kredi nedeniyle durduruldu**

[fagent-uyum + fagent-tasarim] Plan adım 3, sıra 2 ve 3: ajan dilini 'deftere kayıt' diline çevir ve tavsiye reddini genişlet. (a) agent.ts:947 → '"THYAO'dan 500 TL sat" yazarsan defterine satış kaydı ekleyebilirim.' agent.ts:1129 → '… için ₺X tutarında satış kaydı ekleyeyim mi? (Yalnızca defterine yazılır.)' App.tsx:1939/1945 düğmeleri 'Deftere ekle' / 'Vazgeç'. App.tsx:1876 → 'Deftere kaydedildi — aracı kurumuna emir gönderilmedi.' App.tsx:1851 → 'Kayıt eklenmedi; defterin değişmedi.' App.tsx:1130 → 'Bugün defterine kayıt eklenmedi.' (b) CHAT_RULES tavsiye kalıbı (agent.ts:600-623) şu 9 cümleyi yakalamalı: 'hangisi daha iyi', 'şimdi girmeli miyim', 'kaç lot almalıyım', 'stop koymalı mıyım', 'altın alayım mı', 'hisse satayım mı', 'THYAO almalı mıyım', 'portföyümü dengele', 'bu hisse alınır mı'. Türkçe regex'te \b kullanılmaz. (c) agent.ts:141,156-157'deki değer yargıları sayı betimlemesine çevrilir (örn. 'Son 10 işlemin 7'si satış, 3'ü alış.'). e2e: 9 cümle için ret mesajı; ajan çıktılarında öneri/uygula/işlendi/emir/-malısın kelimeleri yok; agent-e2e ve action-e2e seçicileri güncellenir. Dal: `wip/adim3-dil-incelenmedi`.

### Görev 3

[fagent-veri-akisi + fagent-guvenlik] Zorunlu liste #40 (sıra 4): scripts/build.mjs'e derleme öncesi bir kapı ekle. Değer process.env'den (ya da Vite loadEnv ile) okunur; .env dosyası açılmaz. Kurallar: anahtar boşsa geç; sb_secret_ ile başlıyorsa çık(1); JWT ise payload role≠'anon' olduğunda çık(1); VITE_ adında SECRET, SERVICE_ROLE ya da PRIVATE geçen değişken varsa çık(1); VITE_SUPABASE_URL https değilse çık(1). Hata iletisi değeri yazdırmaz. cloud.ts:52-56'da http kabulü kaldırılır. guvenlik-tarama.mjs: GIZLI listesine sbp_, AIza, github_pat_, npm_, rk_live_ desenleri, adlar listesine SUPABASE_SECRET_KEY ve VERCEL_TOKEN eklenir; 63. satırda 2 MB üstü atlanan dosya için uyarı yazılır. Test: run-e2e.mjs ön adımında spawnSync ile sb_secret_x, service_role JWT ve http URL için çıkış kodu ≠0 ve çıktı dizini oluşmamış; geçerli sb_publishable_ ile çıkış 0. Dal: `wip/40-derleme-kapisi-incelenmedi`.

### Görev 4

[fagent-guvenlik + fagent-test] Zorunlu liste #43/16 (sıra 5), sıra 1 birleştikten sonra: repo köküne vercel.json ekle; `/(.*)` için Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co https://api.coingecko.com https://api.frankfurter.dev; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests. Ayrıca X-Content-Type-Options: nosniff, Referrer-Policy: no-referrer, Cross-Origin-Opener-Policy: same-origin ve kapalı bir Permissions-Policy. Rapor ucu EKLENMEZ. public/cors-test.html üretim paketinden çıkarılır. Test: tests/e2e/fagent-basliklar-e2e.mjs vercel.json'u okuyup başlıkları ve connect-src listesini doğrular; e2e-server.mjs aynı başlıklarla sunar ve her sekmede page.on('console') ile CSP ihlali 0 olmalı. Report-Only'den zorunlu kipe geçiş ve üretim deploy'u insan onayıyla. Dal: `wip/43-basliklar-incelenmedi`.

### Görev 5

[fagent-veri-akisi + fagent-guvenlik] Adım 5 hazırlığı (sıra 6 ve 10), YALNIZCA migration dosyası; üretime uygulanmaz. supabase/migrations'a yeni bir migration: (a) `grant select, insert, update, delete on table public.portfolios to authenticated;` (b) `version bigint not null default 0` ve before-update tetikleyicisi (NEW.version := OLD.version + 1) (c) 0029 uyarısının kabul gerekçesi yorumu. İstemci (cloud.ts:302-304): pull'da version 'fagent.cloud.ver.v1' anahtarına yazılır (BACKED_UP_KEYS dışı). save, .update({data}).eq('user_id',uid).eq('version',ver).select('version') kullanır; boş dizi dönerse status='cakisma' olur ve upsert yapılmaz. İlk kayıt insert ile; 23505 çakışma sayılır. Test: auth-e2e'de ortak sahte satırı paylaşan iki context; ikinci cihazın eski sürümle kaydı reddedilmeli ve çakışma kartı görünmeli. supabase/tests/portfolios_rls.test.sql (pgTAP, yaklaşık 14 kontrol) ve CI'da supabase/setup-cli işi eklenir. Dal: `wip/27-surum-incelenmedi`.

### Görev 6

[fagent-veri-akisi + fagent-tasarim + fagent-test] Zorunlu liste #35, #41 ve #34/33 (sıra 7-9). #35: cloud.ts:538-543 ve 570-574'te temizlikten önce hashSnapshot ile taban karşılaştırılır; fark varsa veri owner uid ile birlikte 'fagent.quarantine.v1' anahtarına kopyalanır. Aynı uid girişinde 'Kurtarılmamış yerel kopya: indir / sil' kartı gösterilir; farklı uid girişinde, SIFIRLA'da ve hesap silmede anahtar silinir. #41: girişte file.size > 2_000_000 ise ret; applyUserData önce yazar, hata olursa snapshot'tan geri yükler, silmeyi en sonda yapar. #34/33: window.confirm yerine role='alertdialog' modal (metinler sentezde). Girişliyken sıfırlamadan sonra syncReady=false; yeniden kurulumda bulut kaydı varsa çakışma kartı açılır ve onaysız upsert gitmez. Testler: iki sayfa ve tek context ile çıkışta yerel verinin karantinaya geçmesi; setItem'ı 2. çağrıda atacak şekilde taklit edince veri korunuyor; 5 MB dosya reddediliyor; SIFIRLA ve örnek portföyle yeniden kurulumdan sonra PATCH/upsert gitmiyor ve çakışma kartı görünüyor. sidebar-e2e:60-61 ile dialog dinleyen testler ortak yardımcıya taşınır. Dal: `wip/hesap-zorunlu-incelenmedi`.

### Görev 7

[fagent-tasarim + fagent-test] Plan adım 6 hızlı kazanımlar (sıra 13, 14, 26). (a) index.css:133-139'a .auth-links{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:14px}, .link-btn{min-height:24px} ve @media (pointer:coarse) için 44px eklenir; 'Hesapsız devam et' ayrı satıra alınır. (b) ≤860px'te üst çubukta marka, durum ve hesap; alt sabit çubukta Panel, Bugün, İşlemler, Ajan ve 'Daha fazla'. .side-link ve aria-label='Bölümler' 1440px'te korunur. (c) tests/e2e/fagent-mobil-e2e.mjs: 375x812 ve 1440x1000'de 9 sekmede yatay taşma yok; 375px'te main üst kenarı ≤%25 (şu an menü %43); etkileşimli öğeler ≥24x24; bağlantılar arası boşluk ≥8px. Yalnızca 'Karma örnek portföy' kullanılır. Dal: `wip/adim6-mobil-incelenmedi`.

### Görev 8

[fagent-tasarim + fagent-uyum] Zorunlu liste #47 (sıra 11), plan adım 7: src/legal.config.ts (unvan, MERSİS, adres, KEP, iletişim e-postası, metin sürümü, saklama bölgesi; alanlar boş kalırsa üretim derlemesi uyarı verir) ve bu yapılandırmadan üretilen Aydınlatma Metni sayfası ya da modal. Başlıklar: veri sorumlusu, işlenen veriler, amaç, hukuki sebep, aktarım (Supabase, bölge), toplama yöntemi, m.11 hakları, başvuru, saklama ve silme. Account.tsx:358-363 birleşik kutu kaldırılır; yerine görünür bağlantı ve 'Aydınlatma Metni'ni okudum ve anladım' kutusu gelir. Açık rıza kutusu EKLENMEZ, avukat görüşü beklenir. Metin taslaktır ve avukat onayı gerektiği belirtilir. Test: kutu işaretsizken 'Hesap oluştur' disabled ve Enter ile signUp isteği 0; bağlantı metni açıyor; auth-e2e:236 seçicisi güncellenir. Dal: `wip/47-kvkk-incelenmedi`.

## Reddedilen öneriler

Yönetmen tarafından gerekçesiyle reddedildi; yeniden önerilmeden önce gerekçe okunmalı.

- **Maketin onboarding metni ('vade hedef önerilerini belirler', 'ajan uyarı eşiklerini belirler') ve önceden seçili seçenekler** — §0.2: varsayılan hedef önerme ve kişiye özel yönlendirme.
- **Maketin örnek portföy verisi (THYAO, BIST 30 Fonu, tutarlar)** — §0.4: sahte veri.
- **Kazancı mor (accent-300) tonda göstermek** — Kazanç ile vurgu rengi ayırt edilemez hale gelir (tasarım gerekçesi).
- **Çakışmada 'Birleştir' seçeneği; CRDT, Replicache ya da ElectricSQL** — cloud.ts birleştirmeyi desteklemiyor; tek satır jsonb için aşırı (L). Sürüm sütunu aynı işi görüyor.
- **#27 için updated_at karşılaştırmasıyla koşullu güncelleme** — updated_at istemci saatiyle üretiliyor; saat ve hassasiyet riski var. Sunucu tetikleyicisiyle artan version seçildi.
- **SIFIRLA'da ikinci yıkıcı seçenek: 'Hesabımdaki veriyi de sil'** — Bunun için zaten 'Hesabımı sil' akışı var; aynı yıkıcı eylemi ikinci yerde sunmak hata riskini artırır.
- **Geçici onay metni: 'hesabındaki kopyanın üzerine yazılabilir'** — #34 aynı dalgada düzeltileceği için gereksiz; kullanıcıya bilinen bir hatayı anlatan metin yayımlanmamalı.
- **#35 için kod değişikliği yapmamak (güvenlik rolü)** — Bu görüş oturum belirtecinin localStorage'da tutulmasıyla ilgili; zorunlu listedeki veri kaybı sorununu çözmüyor. Karantina seçildi. Belirteç riski (orta) devir dokümanına kabul edilmiş risk olarak yazılır.
- **#35 için BroadcastChannel ve Web Locks** — storage olayı zaten tetikleniyor; ek karmaşıklık getirip fayda sağlamıyor (veri-akışı rolünün kendi değerlendirmesi).
- **Referrer-Policy: strict-origin-when-cross-origin** — Şifre sıfırlama bağlantısı ?code= taşıyor ve dış API'lerin referrer'a ihtiyacı yok. OWASP ölçütüne uyan no-referrer seçildi.
- **aiAgent'ı tutmak için connect-src'e 'https:' eklemek** — §0.5 ihlalini sürdürür ve CSP'yi anlamsızlaştırır; adım 3 katmanı çıkarıyor.
- **CSP raporlarını üçüncü taraf servise (report-uri vb.) göndermek** — §0.5: rapor sayfa adresi ve kullanım izi taşır. Report-Only kipi rapor ucu olmadan, konsoldan izlenir.
- **Supabase yönlendirme listesine genel '*.vercel.app/**' joker eklemek** — Herkes vercel.app altında yayın açabilir; Supabase üretimde tam adres öneriyor.
- **Supabase SSR/cookie tabanlı oturum** — Sunucusu olmayan Vite SPA'sına uymaz (Supabase Sessions belgesi).
- **SMS ile iki adımlı doğrulama** — Telefon numarası ek kişisel veri; veri en azaltma ilkesine ve §0.5'in ruhuna aykırı.
- **'Hedefine dönmek için X TL THYAO sat' hesaplayıcısı; gapTL'yi al/sat cümlesine dönüştürmek** — §0.2: araç, miktar ve yön içeren kişiye özel tavsiye.
- **Rakiplerdeki gibi sunucu tarafı AI portföy analizi (Finoloji, Horyzon)** — §0.5: portföy üçüncü tarafa gider.
- **Aracı kurum emir veya bakiye bağlantısı** — §0.3.
- **Tek sayılık portföy sağlık skoru** — karar-gunlugu §1.14; kaynaksız bileşik skor tavsiye algısı yaratır.
- **HHI eşiği için DOJ/FTC birleşme kılavuzunu kaynak göstermek** — Pazar payı yoğunlaşması için tasarlanmış; portföy bağlamına aktarmak yanıltıcı kaynak gösterimi olur (§0.4).
- **XIRR testlerinde kodun kendi ürettiği değerleri ya da hafızadan alınmış Excel tarihlerini kesin beklenti yapmak** — Döngüsel ya da kaynaksız. Beklenti NPV(r)≈0 ve elle hesaplanabilir vektörlerle yazılır; Excel örneği ancak birincil sayfayla teyit edilince eklenir.
- **Piksel ekran görüntüsü karşılaştırmasını şimdi kurmak** — Nocturne geçişinde (adım 6) sürekli kırılır; adım 6 bittikten sonra eklenecek.
- **require-trusted-types-for'u doğrudan zorunlu kipte açmak** — Tarayıcı ve recharts uyumu doğrulanmadı; yalnızca Report-Only ile denenecek.


## A1 — SaaS full paket araştırması (öncelik: en yüksek, cumartesi ilk iş)

Çalıştırma: `fagent-arastirma` iş akışı, `args.konu` = aşağıdaki metin. Kod değiştirmez.

> FAGENT'ı Acquire.com'da "full paket" SaaS olarak satmak için araştırma. Sorular:
> (1) Değerleme: Acquire.com/Flippa/Microns'ta gelirsiz ve düşük gelirli fintech/portföy takip uygulamalarının
> satış fiyatları ve çarpanları (gerçek ilan/rapor kaynaklı, tarihli). (2) Rakipler ve fiyatları: Türkiye
> (ör. portföy takip uygulamaları, aracı kurum uygulamaları) ve dünya (Sharesight, Kubera, Delta, Snowball,
> Getquin, Ghostfolio açık kaynak): hangi özellik ücretli, aylık fiyat. (3) Premium özellik seti ve TL fiyat
> önerisi (ücretsiz/Premium sınırı). (4) Ödeme: iyzico vs PayTR vs Paddle/Lemon Squeezy (Türkiye'den satıcı,
> yabancı alıcı devri, abonelik desteği, komisyon). (5) Yasal: SPK yatırım danışmanlığı sınırı, KVKK, mesafeli
> sözleşmeler yönetmeliği, e-fatura/şirket gereksinimi — satıcı şahıs mı şirket mi olmalı. (6) Devir paketi:
> alıcıların beklediği belgeler, hesap devri, due diligence kontrol listesi. (7) İlk 100 ücretli kullanıcı
> için düşük bütçeli kanal önerileri. Kural: al/sat önerisi ve işlem yürütme önerilmez; kaynaksız rakam yazılmaz,
> doğrulanamayan "ikincil" diye işaretlenir. Çıktı: önceliklendirilmiş öneri + 8/9/10. adımlar için hazır görevler.

Bütçe: mesaja "+800k" eklenmeli. Daha ucuz seçenek: yalnızca yönetmen + güvenlik/uyum rolleriyle (`args.roller`).


## A2 — Tasarım derin araştırması (öncelik: yüksek, Faz 2) — 1. TUR TAMAM: docs/arastirma/a2-tasarim-1-tur.md (T1–T8 iş listesi)
`fagent-arastirma`, `args.roller` = ["tasarim","uyum"] (+ yönetmen). Konu: `docs/fikir-defteri.md` → "Tasarım" bölümü. Çıktı: tasarım sistemi önerisi (jetonlar,
bileşen listesi), erişilebilirlik kontrol listesi, Türkçe sayı/yüzde biçim kuralı, görsel regresyon test planı, referans karşılaştırma tablosu (kaynaklı).

## A3 — Pazarlama, reklam ve reels araştırması (öncelik: orta, Faz 2)
Konu: `docs/fikir-defteri.md` → "Pazarlama". Sorular: Meta ve TikTok finansal ürün reklam politikaları ve Türkiye şartları; SPK ve Reklam Kurulu kuralları;
influencer ifşa; getiri vaadi yasakları; organik içerik formatları ve ilk 100 ücretli kullanıcı için kanal sırası; ölçüm (çerezsiz). Çıktı: yapılabilir/yapılamaz listesi + içerik fabrikası görev listesi.
