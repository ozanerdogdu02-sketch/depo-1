# KAP ve BİST: teknik erişim yolları (araştırma)

Yazan: yönetmen, 2026-10-31. Durum: **ARAŞTIRMA — kod yok.** Bağlı adımlar: `docs/yol-haritasi-birlesik.md` YH-4 (KAP),
YH-5 (BİST), YH-6 (paylaşılan önbellek). Hukuk/lisans konuları kullanıcı kararıyla **en sona** bırakıldı; burada yalnız
**teknik risk** olarak işaretlenir (`TODO(hukuk)`).

## 0. Sonuç önce (sade dille)

1. **KAP için kullanılabilir bir yol var.** KAP sitesinin kendi sayfalarının kullandığı iç JSON uçları üç ayrı açık kaynak
   kütüphanede aynı adresle geçiyor: `POST https://www.kap.org.tr/tr/api/disclosure/members/byCriteria`. Gövdeye tarih
   aralığı yazılır, yanıt bildirim listesidir (şirket kodu, başlık, tarih, tür, bildirim numarası). Bildirimin bağlantısı
   numaradan kurulur: `https://www.kap.org.tr/tr/Bildirim/{numara}`. **Resmî, belgelenmiş bir API değildir**; değişebilir.
2. **KAP'tan yalnız meta veri** (şirket, başlık, tarih, tür, bağlantı) çekilmesini öneriyoruz. Bildirim metni, özeti ve ekleri
   çekilmez; kullanıcı bağlantıya tıklayıp KAP'ta okur.
3. **Bir uyarı:** kütüphanelerden biri "KAP'ın güvenlik duvarı tarayıcı gibi görünen başlık istiyor" diyor ve tarayıcı
   taklidi yapıyor. Biz **taklit yapmamayı** öneriyoruz (kendimizi dürüstçe tanıtırız). Duvar bizi reddederse KAP bölümü
   "ulaşılamadı" der; bu bir karar konusudur (K1).
4. **BİST gün sonu fiyatı için en kararlı aday, Borsa İstanbul'un kendi "Günlük Bülten" sayfasıdır** (2011'den beri
   yayınlanıyor). Dosya biçimi (PDF mi, zip/CSV mi) ve adı **doğrulanamadı**; bu ortamdan siteye erişim yok. Aracı kurum ve
   grafik sitelerinin iç uçları (İş Yatırım, TradingView vb.) teknik olarak çalışıyor ama **önerilmiyor** (üçüncü tarafın
   ürününü kazımak; o yolları kullanan kütüphane bile "ticari kullanım için Borsa İstanbul lisansı gerekir" diyor).
5. **Mimari:** EVDS'te kurduğumuz desenin aynısı. Sunucu, kullanıcıdan **hiç girdi almadan** sabit bir tablo çeker
   ("bugünün tüm bildirimleri", "bugünün tüm kapanışları"); portföydeki hisselere göre süzme tarayıcıda yapılır.
   Portföy sunucuya gitmez.
6. **Satış kararına uyum:** kazıma kodu yazılır ama canlıda **varsayılan kapalı** durur (sunucu ayarı). Yalnız Vercel
   önizlemede açılır ve orada doğrulanır.
7. **Ayrı veri deposu (YH-6) şimdilik gerekmez.** Vercel'in CDN önbelleği "bugünün listesi" için yeterli. Depo yalnız
   geçmiş fiyat serisi gerekince ya da kaynak bizi IP'den engellerse açılır.

## 1. Erişim denemesi (bu ortam)

| Adres | Sonuç (2026-10-31) |
|---|---|
| `https://www.kap.org.tr/...` (curl, 4 adres) | Proxy `CONNECT 403`: erişim yok |
| `https://www.borsaistanbul.com/...` (curl + WebFetch) | Proxy 403 / alan adı izinli değil |
| `pypi.org` | Erişildi: KAP topluluk kütüphanelerinin kaynak kodu indirilip **okundu** (çalıştırılmadı) |

Bu yüzden aşağıdaki uç adresleri ve alan adları **kaynak koddan** çıkarıldı; gerçek yanıtla **doğrulanmadı**.
`borsaistanbul.com`, `kap.org.tr` oturumun ağ ayarlarında izinli değil; asıl doğrulama yalnız Vercel önizlemede yapılabilir.

## 2. KAP

### 2.1 Bulunan uçlar (kaynak koddan)

| Uç | Yöntem | Ne verir | Kanıt |
|---|---|---|---|
| `/tr/api/disclosure/members/byCriteria` | POST, JSON gövde | Tarih aralığındaki şirket bildirimleri | `kap-client` 1.2.0 `_endpoints.py:22` (`MEMBER_DISCLOSURE_QUERY_URL`); `kap-mcp` 0.1.0 `server.py:473`; `pykap` 0.2.0 `BISTCompany.py:99` |
| `/tr/api/disclosure/list/light` | GET | Tüm şirketlerden son ~10 bildirim | `kap-mcp` `server.py:497` ("latest ~10 disclosures") |
| `/tr/api/company/items/{memberType}/A` | GET | Şirket listesi (kod, unvan, KAP kimliği `memberOid`) | `kap-client` `_endpoints.py:28` |
| `/tr/api/company/generic/excel/IGS/A` | GET | Şirket listesi (Excel) | `borsapy` 0.11.0 `_providers/kap.py:28` |
| `/tr/api/notification/attachment-detail/{no}` | GET | Bildirimin içeriği ve ekleri | `kap-client` `_endpoints.py:29` — **kullanılmaz** (içerik) |
| `/tr/Bildirim/{no}` | Sayfa | Kullanıcının tıklayacağı bağlantı | `kap-client` `_endpoints.py:24`; arama sonuçlarında örnek: `kap.org.tr/tr/Bildirim/1297207` |
| RSS/Atom akışı | — | **Bulunamadı** (web aramasında resmî akış yok) | — |

**byCriteria gövdesi** (kap-client `MemberDisclosureQueryBody`, kap-mcp ile aynı alanlar):
`fromDate`, `toDate` ("YYYY-AA-GG"), `memberType`, `mkkMemberOidList` (şirket kimlikleri), `subjectList`,
`disclosureClass`, ve boş bırakılan ~15 alan (`sector`, `index`, `year`, `fromSrc: false` …).
Bilinen kısıt: başlangıç ve bitiş **aynı takvim yılında** olmalı, aksi hâlde 500 döner (kap-client README §"same
calendar year"). **Doğrulanamadı:** `mkkMemberOidList` boş gönderilince tüm şirketlerin bildirimleri gelir mi? (KAP ana
sayfası "o günün son 50 bildirimini" listeliyor ve sorgu ekranı şirketsiz tarih aramasına izin veriyor — web arama özeti;
uç bu davranışı destekliyorsa sunucu tek istekle günün tüm bildirimlerini alır.)

**Yanıt alanları** (kap-client `DisclosureRow`; `extra: allow` — fazladan alan gelebilir):

| Alan | Anlam | Biz kullanır mıyız |
|---|---|---|
| `disclosureIndex` | Bildirim numarası (tam sayı) | Evet → bağlantı |
| `publishDate` | Yayın zamanı. **İki biçim görülmüş:** "GG.AA.YYYY SS:DD:ss" (kod yorumu) ve "YYYY-AA-GG SS:DD:ss" (kütüphanenin örnek dosyası) | Evet; ayrıştırıcı ikisini de kabul etmeli |
| `stockCodes` | Hisse kodları, **virgülle ayrılmış** ("THYAO" ya da birden çok) | Evet → süzme |
| `memberTitle` / `kapTitle` | Şirket unvanı. **İki kütüphane farklı ad kullanıyor** (kap-client `memberTitle`, kap-mcp `kapTitle`) | Evet; ikisine de bak |
| `subject` | Bildirim konusu/başlığı ("Özel Durum Açıklaması" vb.) | Evet |
| `disclosureClass` | Sınıf: `ODA` (özel durum), `FR` (finansal rapor), `DG` (diğer) | Evet (tür etiketi) |
| `disclosureType`, `disclosureCategory` | Ek tür kodları | Hayır (gerek yok) |
| `isLate`, `isCorrective` | Geç / düzeltme bildirimi | İsteğe bağlı (betimleyici etiket) |
| `summary` | Şirketin yazdığı özet metni | **Hayır** (içerik sayılır; yeniden yayın riski) |
| `hasAttachment`, `attachmentCount` | Ek var mı | Hayır |

**Hız sınırı bulgusu:** KAP 429 döndürüyor; örnek gövde `{"message": "Too Many Requests", "retryAfter": 60}`
(kap-client `tests/fixtures/rate_limit.json`; kütüphanenin kendi örnek dosyası, gerçek yanıt olduğu doğrulanmadı).
Sayısal sınır bilinmiyor. kap-client her istekten önce 0,3–0,8 sn rastgele bekliyor, 3 deneme, üstel bekleme
(`_client.py:25-28`).

**Güvenlik duvarı bulgusu:** kap-client başlık yorumu: "Browser-like headers required by the KAP WAF" (`_client.py:4`) ve
Chrome kimliğiyle `Origin`/`Referer` gönderiyor. kap-mcp yalnız `User-Agent: Mozilla/5.0` gönderiyor, pykap hiç başlık
göndermiyor. Yani duvarın ne istediği kütüphaneler arasında bile tutarsız; **doğrulanamadı**.

### 2.2 Değişme riski: YÜKSEK
- Belgelenmemiş iç uç; KAP sitesi en az bir kez yenilendi (haber başlığı: "KAP'ın internet sitesi yenilendi", ekonomist.com.tr;
  tarih okunamadı). Alan adlarındaki tutarsızlık (`memberTitle`/`kapTitle`, iki tarih biçimi) sürümler arası değişimin işareti.
- Kırılınca ne olur: ayrıştırıcı şemayı tutturamaz → sunucu `okunamadi` → istemci `veri_yok` ("KAP'tan gelen değer
  okunamadı; gösterilmiyor."). Uydurma satır gösterilmez. Diğer kaynaklar etkilenmez.

### 2.3 Öneri: yalnız meta + bağlantı
- Sunucu yanıtı **yalnız** şu alanları taşır: `{ no, zaman, kodlar[], unvan, baslik, sinif, gec?, duzeltme? }`; bağlantı
  istemcide `https://www.kap.org.tr/tr/Bildirim/{no}` olarak kurulur (sunucu dış adres üretmez).
- Ekran metni (YH-4 madde 5): "ŞİRKET · tarih · başlık · KAP bağlantısı". Yorum, özet, yön yok (`uyum-dili` skill).
- Neden: (1) içerik/ek çekmek istek sayısını ve yeniden yayın riskini katlar; (2) özet metin şirketin yazısıdır, ekranda
  "bizim yorumumuz" gibi algılanabilir; (3) meta için tek istek yeter.

### 2.4 Kibar hız sınırı ve önbellek (öneri)

| Katman | Değer | Gerekçe |
|---|---|---|
| Sunucu → KAP | Örnek başına aynı anda en çok **1** istek (süren istek paylaşılır); iki istek arası en az **60 sn** | Kaba yük yok |
| CDN (`s-maxage`) | Seans saatlerinde (hafta içi 09:00–19:00 TSİ) **900 sn**, dışında **3600 sn**; `stale-while-revalidate=300` | Bölge başına saatte ≈4 istek; gece neredeyse hiç |
| İstemci önbelleği | `fagent.kaynak.kap.v1`, TTL **15 dk**; süresi geçen silinmez (`eski`) | YH-3 deseni |
| 429 | `retryAfter`/`Retry-After`'a uyulur, devre o süre kadar açılır; sunucu yeniden denemez | KAP'ın açık isteği |
| Devre kesici | Ağ hatası / zaman aşımı / 5xx / 429 → 3 ardışıkta **15 dk** kapalı; 4xx (429 hariç) sayılmaz | YH-3 O2 kuralı |
| Zaman aşımı | Sunucu 4 sn, istemci 5 sn | YH-3 ile aynı |
| Gövde sınırı | **2 MB** (okumadan önce), en çok **500** satır | Gün içi bildirim sayısı doğrulanamadı; sınır kesilirse yanıt `kesildi: true` taşır |
| Kimlik | `User-Agent: FAGENT/1.0 (+iletişim adresi)`; tarayıcı taklidi yok; `redirect: 'error'` | K1 |
| Pencere | Sunucu kurar: dün + bugün (yıl başında yalnız bugün; aynı-yıl kısıtı) | İstemci tarih göndermez |

`robots.txt` okunamadı (erişim yok); sunucu ucu önizlemede ilk açılışta `robots.txt`'i okuyup `/tr/api/` yasaksa
`kapali` dönmeli (öneri; YH-4 madde 1'de zaten var).

## 3. BİST gün sonu kapanış

### 3.1 Seçenekler

| # | Kaynak | Ne | Kararlılık | Teknik risk | Öneri |
|---|---|---|---|---|---|
| A | **Borsa İstanbul Günlük Bülten** (`borsaistanbul.com/veriler/gunluk-bulten`) | Resmî gün sonu bülteni; 22.08.2011 ve sonrası sayfada, eskisi arşivde | **En yüksek** (resmî, 15 yıldır yayında) | Dosya biçimi/adı doğrulanamadı. PDF ise ayrıştırıcı kütüphane gerekir (Üst Kurul); zip/CSV ise zip açıcı gerekir (Node'da yerleşik `zlib` var, zip kabı için küçük okuyucu ya da kütüphane — Üst Kurul) | **Birincil aday** |
| B | Borsa İstanbul "Pay Piyasası Verileri / Bülten Verileri" sayfaları (`/veriler/pay-piyasasi-verileri`, `sayfa/2714`, `sayfa/2784` "Data/File Paths") | Bülten verileri, güncellenme periyotları, dosya yolları | Yüksek | Biçim belgesi 2017/2019 tarihli (ör. `toppiy.zip → toppiy.csv`, noktalı virgül ayraçlı CSV); kapanış dosyasının adı **bulunamadı** | A ile birlikte incelenir |
| C | `borsaistanbul.com/datum/hisse_endeks_ds.csv` | Endeks bileşenleri (sembol listesi) — fiyat yok | Yüksek | — | **Sembol beyaz listesi** için aday (borsapy `bist_index.py:12`) |
| D | `datastore.borsaistanbul.com` | Tarihsel veri satış platformu | Yüksek | Ücretli/lisanslı; kazıma değil satın alma | Gelir sonrası (adım 9) |
| E | Aracı kurum / grafik sitesi iç uçları (İş Yatırım `_Layouts/15/IsYatirim.Website/Common`, TradingView `wss://data.tradingview.com`) | Gecikmeli/anlık fiyat | Düşük (iç uç, oturum/çerez, sık değişir) | Üçüncü tarafın ürünü; borsapy README: "ticari kullanım için Borsa İstanbul'dan lisans" | **Reddedildi** |
| F | Kullanıcının CSV'si / elle giriş (bugünkü P4) | — | — | — | Her zaman yedek yol |

### 3.2 Zamanlama
- Sürekli işlem 10:00–18:00, ardından kapanış seansı (ikincil kaynak: Milliyet Uzmanpara; resmî seans çizelgesi okunamadı).
- Öneri: sunucu bülteni **hafta içi 19:30 TSİ'den sonra** arar; bulduğu bültenin **kendi tarihini** `donem` olarak taşır.
  O günün bülteni yoksa (tatil, gecikme) bir önceki iş gününün bülteni `guncel` sayılmaz, `eski` olarak etiketlenir.
- CDN: bülten bulunduysa `s-maxage` = ertesi iş günü 19:30'a kadar (en çok 24 saat); bulunamadıysa 900 sn.
- Tatil/yarım gün takvimi: **doğrulanamadı**; kod takvim tutmaz, bültenin tarihine güvenir.

### 3.3 Mantık kontrolü
- Önceki kapanışa göre ±%20 dışı → `mantik_disi`, gösterilmez (YH-5 madde 5). Not: bölünme/bedelsiz günlerinde gerçek fiyat
  bu eşiği aşabilir; o gün değer gösterilmez ve elle değer geçerli kalır (sahte değer üretmekten iyidir).
- Sembol biçimi: `^[A-Z0-9]{3,6}$` (C listesiyle de kesişim alınabilir). Biçim dışı satır atılır.

### 3.4 Lisans (teknik risk olarak; hukuk en sona)
- `TODO(hukuk)`: BİST verisi lisanslı dağıtıcılar üzerinden yayılıyor (`cok-kaynakli-veri-plani.md` §4). Bültenin üçüncü taraf
  uygulamada gösterimi, ücretli üründe gösterim, alıcıya açıklama. Teknik etkisi: lisans gerekirse kaynak tek satırla
  kayıt defterinden çıkar, elle giriş kalır (YH-5 geri alma).

## 4. Mimari (YH-3 desenine uygun)

```
Tarayıcı                         Sunucu (Vercel; Netlify aynası)          Dış kaynak
src/kaynaklar/kap.ts  ──GET /api/kap (parametresiz)──▶ api/kap.mjs ─▶ netlify/functions/kap.mjs ──POST sabit gövde──▶ KAP
src/kaynaklar/bist.ts ──GET /api/bist (parametresiz)─▶ api/bist.mjs ─▶ netlify/functions/bist.mjs ──GET sabit adres──▶ Borsa İstanbul
   │ süzme (portföy kodları) burada; portföy hiçbir isteğe girmez
   └ önbellek: fagent.kaynak.kap.v1 / fagent.kaynak.bist.v1 (KvStore; BACKED_UP_KEYS'e girmez)
```

| Parça | Ne | YH-3'te karşılığı |
|---|---|---|
| `netlify/functions/_ortak/` (öneri) | `istemciKimligi`, `sinirliOku`, `json`, devre kesici, hız sınırı tablosu EVDS'ten **taşınır** (davranış değişmez) | `netlify/functions/evds.mjs:76-139` |
| `netlify/functions/kap.mjs` | `createKapHandler({fetchFn, env, simdi, platform})`; sabit hedef; yalnız GET kabul, **her** sorgu parametresi 400 | `createEvdsHandler` |
| `api/kap.mjs`, `api/bist.mjs` | Yalnız bağlama (`platform: 'vercel'`) | `api/evds.mjs` |
| Kazıma bayrağı | Sunucu env `FAGENT_KAZIMA=acik` yoksa 503 `kapali` (`anahtar_yok` gibi; yeniden denenmez) | `anahtar_yok` |
| `src/kaynaklar/kap.ts`, `bist.ts` | `KaynakSonucu` döner, hata fırlatmaz; ortak çalıştırıcı + önbellek | `tcmb.ts` |
| `tip.ts` | `KaynakAdi`'ye `'bist'`, `ETIKET`'e "Borsa İstanbul"; `KaynakHata`'ya `'kaynak_reddetti'` (sunucuda var, tipte yok) | — |
| e2e beyaz liste | `fagent.kaynak.kap.v1`, `fagent.kaynak.bist.v1` **eklenir** (gevşetme yok) | YH-3 D6 |
| CSP | Değişmez (tarayıcı yalnız kendi `/api/*` adresine gider) | — |

Doğrulanmalı: Netlify `functions/` altındaki alt klasörü fonksiyon saymıyor mu; Vercel `api/` altında `_` ile başlayan
dosyayı fonksiyon saymıyor mu. İkisi de belgeden teyit edilmeden ortak dosya `api/` köküne konmaz.

**Güvenlik:** hedef adres kodda sabit (SSRF yok); istemciden gövde/parametre kabul edilmez; yukarı akışın ham hata gövdesi
ve durum kodu istemciye aktarılmaz; yanıt şemaya süzülür (yalnız §2.3 alanları); IP yalnız 1 dk bellekte (YH-3 notu,
`TODO(hukuk)`).

**Durumlar:** ağ/zaman aşımı/5xx → `ulasilamadi` (önbellek varsa `eski`); şema tutmadı ya da güvenlik duvarı HTML'i döndü →
`veri_yok`; bayrak kapalı → `kapali`; 429 → `ulasilamadi` + `retry-after`. Metinler mevcut `kaynakDurumMetni`'nden.

**Test stratejisi:**
1. Birim (`node --test`): ayrıştırıcı — iki tarih biçimi, `memberTitle`/`kapTitle`, virgüllü kodlar, eksik alan, fazla alan,
   dizi olmayan gövde, HTML gövde, 500+ satır; sunucu — sahte fetch ile 429/5xx/4xx/zaman aşımı/yönlendirme/büyük gövde,
   bayrak kapalı, parametreli istek 400, istemci kimliği sahteleme.
2. Fikstür: önce **kendi yazdığımız** "örnek — doğrulanmadı" dosyası (`tests/fixtures/kap-ornek.json`), alanlar §2.1
   tablosundan türetilir; kütüphanelerin örnek dosyaları **kopyalanmaz** (kap-client'inki zaten sentetik: no 1234567).
   Önizlemede gerçek yanıt alınınca yalnız meta alanlarla `kap-gercek-AAAAGG.json` eklenir, örnek dosya silinmez.
3. e2e (`page.route`): `/api/kap` 502 → yalnız KAP bölümü "KAP'a ulaşılamadı."; ağ günlüğünde `/api/kap` ve `/api/bist`
   istekleri **sorgu dizgisiz ve gövdesiz**; kripto/TCMB çalışmaya devam eder.
4. Gerçek doğrulama yalnız Vercel önizlemede, bayrak açıkken, elle (YH-4/YH-5 elle denetim listeleri).

## 5. AGENTS.md §0.4 için önerilen metin (kullanıcı onayı; ajan değiştirmez)

Bugün: "Sahte veri yok. Doğrulanmamış fiyat/oran gerçekmiş gibi gösterilmez. BIST hisse ve TEFAS fon fiyatı için anahtarsız
resmî kaynak yok; bunlar elle girilir. Varsayımlar (enflasyon, vergi oranı) kaynağıyla etiketlenir."

Öneri:
> 4. **Sahte veri yok.** Doğrulanmamış fiyat/oran gerçekmiş gibi gösterilmez. Kullanıcı kararıyla (2026-10-27) BIST hisse
> **gün sonu kapanışı** ve KAP bildirim **meta verisi** (şirket, başlık, tarih, tür, bağlantı) herkese açık kaynaklardan
> **sunucu tarafında** okunabilir (kazıma): istek kullanıcı verisi taşımaz, her değer kaynak ve tarihle etiketlenir, kaynak
> yoksa ya da okunamazsa değer gösterilmez. Gün içi/anlık fiyat çekilmez. Kullanıcının elle girdiği fiyat onaysız ezilmez;
> elle/CSV giriş her zaman geçerlidir. Kazıma canlıda varsayılan **kapalıdır** (sunucu ayarı). TEFAS fon fiyatı elle girilir.
> Kullanım koşulu ve lisans riski `TODO(hukuk)` olarak kayıtlıdır ve satışta alıcıya açıklanır. Varsayımlar (enflasyon, vergi
> oranı) kaynağıyla etiketlenir.

Fark (§13 önerisine göre): KAP eklendi; "kullanım koşulu incelenmiş" şartı hukuk en sona bırakıldığı için kaldırıldı ve yerine
"canlıda varsayılan kapalı" kondu; "gün içi yok" ve "elle değer ezilmez" açıkça yazıldı.

## 6. B13 / YH-6: CDN yeter mi?

Vercel belgesine göre işlev yanıtları `s-maxage` ile **bölge başına** önbelleğe alınır, az istenen kayıt bölgeden düşebilir
(süre "en iyi çaba"), `stale-if-error` **desteklenmez**. Sonuç:

| İhtiyaç | CDN yeter mi | Not |
|---|---|---|
| KAP: bugünün bildirim listesi | **Evet** | Bölge başına saatte ≈4 istek |
| BİST: bugünün kapanış tablosu | **Evet** | Günde bölge başına ≈1 istek |
| Kaynak çökünce son bilinen değer | CDN **hayır** (`stale-if-error` yok) → **istemci önbelleği** karşılar (`eski`) | YH-3'te zaten var |
| Geçmiş kapanış serisi (PDF "Grafik", projeksiyon girdisi) | **Hayır** | Birikim gerekir → YH-6 |
| Kaynak IP'den engellerse / 429 sıklaşırsa | **Hayır** | Tek zamanlanmış çekiş (Cron) + depo daha kibar |

**Öneri:** YH-4/YH-5 yalnız CDN + istemci önbelleğiyle yapılır. YH-6 (ayrı Supabase projesi + Vercel Cron, Üst Kurul talebi
`yol-haritasi-birlesik.md` YH-6'da hazır) yalnız şu üç tetikleyiciden biri olunca açılır: (1) geçmiş seri ekrana gerekir,
(2) önizlemede 429/engel gözlenir, (3) bölge sayısı yüzünden kaynağa giden istek ölçülerek kabul edilemez bulunur.

## 7. Uygulama sırası ve kabul ölçütleri

| # | İş | Kabul ölçütü | Plan | Efor |
|---|---|---|---|---|
| U1 | Ortak sunucu parçalarını EVDS'ten taşı (davranış aynı) | `evds-sunucu.test.ts` değişmeden yeşil; e2e sayısı azalmaz | YH-4 m.1 | Küçük |
| U2 | Kazıma bayrağı + `tip.ts` ekleri + önbellek anahtarları + e2e beyaz liste ekleri | Bayraksız `/api/kap` → 503 `kapali`, istemci "yapılandırılmamış" metni; beyaz liste yalnız genişledi | YH-4 | Küçük |
| U3 | KAP sunucu ucu + ayrıştırıcı (örnek fikstür) + `kap.ts` + süzme | §4 test listesi 1–3 yeşil; `grep -n "TODO(hukuk)" netlify/functions/kap.mjs` ≥1; ağ günlüğünde parametre yok | YH-4 m.2–4 | Orta |
| U4 | Önizlemede gerçek KAP denemesi (bayrak yalnız Preview ortamında) | Vercel log: 200 ve şema tuttu, ya da duvar reddi kaydedildi (K1'e göre karar); gerçek meta fikstür eklendi | YH-4 elle denetim | Küçük (kullanıcı Vercel'de env ekler) |
| U5 | BİST bülten keşfi: önizlemede tek seferlik, sabit adres, yalnız `content-type` + ilk baytlar log'a | Biçim (PDF/zip/CSV) ve dosya adı yazıya geçti; ayrıştırıcı gerekiyorsa Üst Kurul talebi açıldı | YH-5 m.1 | Küçük |
| U6 | BİST sunucu ucu + `bist.ts` + fiyat öncelik kuralı (elle > BİST) | YH-5 kabul ölçütleri 1–4; ±%20 birim testi | YH-5 m.2–5 | Büyük |
| U7 | Ekrana bağlama (Hisseler) | Tasarım oturumu kararı | YH-7/YH-8 | Tasarıma bağlı |
| U8 | YH-6 | Yalnız §6 tetikleyicisi olursa | YH-6 | Orta |

Önceki plan uyumu: `cok-kaynakli-veri-plani.md` S8/K3 ("KAP hukuk onayı beklesin") ve K4 ("BİST elle kalsın") **2026-10-27
kullanıcı kazıma kararıyla aşıldı**; bu belge onların yerine teknik yolu verir. Hukuk okuması (S0) kod sırasının önünde değil,
satış öncesi açık madde olarak kalır. 10 adımlık geliştirme planında karşılığı yok; yol haritası YH-4/YH-5'e bağlıdır.

## 8. Kullanıcıdan kararlar (en fazla 3)

| # | Karar | Öneri |
|---|---|---|
| K1 | KAP'a dürüst kimlikle mi gidilsin? (tarayıcı taklidi yok; güvenlik duvarı reddederse KAP kapalı kalır) | **Evet, dürüst kimlik.** Taklit, kazımayı "engel aşma"ya çevirir; satışta alıcıya açıklaması da zorlaşır |
| K2 | BİST kaynağı: Borsa İstanbul Günlük Bülten (resmî) mi, aracı kurum/grafik sitesi iç uçları mı? | **Günlük Bülten.** Biçim PDF/zip çıkarsa ayrıştırıcı için Üst Kurul talebi açılır; aracı kurum yolları reddedilir |
| K3 | AGENTS.md §0.4'ün §5'teki yeni metni onaylansın mı? (kazıma canlıda varsayılan kapalı) | **Evet.** BİST işi (U6) bu onay olmadan başlamaz; KAP (U1–U4) §0.4'ü fiyat açısından etkilemez ama aynı metne bağlanır |

## Kaynaklar

- kap-client 1.2.0 (MIT; kaynak kod okundu): https://pypi.org/project/kap-client/ , https://github.com/semudu/kap-client
  — `src/kap_client/_endpoints.py:19-34, 98-125, 153-180`; `_client.py:4, 25-42`; README "same calendar year" notu;
  `tests/fixtures/company_disclosures.json`, `rate_limit.json` (sentetik örnek).
- kap-mcp 0.1.0 (MIT; kaynak kod okundu): https://pypi.org/project/kap-mcp/ — `server.py:28-29, 449-500`.
- pykap 0.2.0 (kaynak kod okundu): https://pypi.org/project/pykap/ — `pykap/bist/BISTCompany.py:48, 99, 225`.
- borsapy 0.11.0 (Apache-2.0; README kişisel kullanım/ticari lisans uyarısı; kaynak kod okundu): https://pypi.org/project/borsapy/
  — `_providers/kap.py:28-31`, `_providers/isyatirim.py:24`, `_providers/tradingview.py:101`, `_providers/bist_index.py:12`.
- Borsa İstanbul (bu ortamdan açılamadı; web arama özetleri): Günlük Bülten https://borsaistanbul.com/veriler/gunluk-bulten ;
  arşiv https://borsaistanbul.com/veriler/gunluk-bulten/gunluk-bulten-arsiv ; pay piyasası verileri
  https://borsaistanbul.com/veriler/pay-piyasasi-verileri ; Bulletin Data https://borsaistanbul.com/sayfa/2714 ;
  Data/File Paths https://borsaistanbul.com/sayfa/2784 ; veri formatları (2017)
  https://www.borsaistanbul.com/files/borsa-istanbul-equity-data-and-index-data-reporting-and-acceptance-formats.pdf ;
  dosya paylaşım kılavuzu (2019) https://www.borsaistanbul.com/files/file-sharing-guidelines1AB68DFE8245.pdf ;
  veri yayın ürünleri https://borsaistanbul.com/veriler/veri-yayini/veri-yayin-urunleri .
- Seans saatleri (ikincil): https://uzmanpara.milliyet.com.tr/uzmanpara/galeri/borsa-saat-kacta-aciliyor-borsa-istanbul-acilis-saati-nedir-borsa-acilis-kapanis-saatleri-2026-7558914
- KAP site yenilenmesi (başlık; içerik açılamadı): https://www.ekonomist.com.tr/borsa/kap-in-internet-sitesi-yenilendi-58588
- Vercel CDN önbelleği: https://vercel.com/docs/cdn-cache , https://vercel.com/docs/edge-network/caching
