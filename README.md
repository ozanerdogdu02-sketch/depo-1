# FAGENT — Anahtarsız Yatırımcı Paneli

Kişisel portföy takip uygulaması — dokuz sekme: Panel, Bugün, Hisseler, Fonlar, Kripto Varlıklar,
**Kripto Piyasa**, İşlemler, Projeksiyon ve bir **kural tabanlı Ajan** (yerel, anahtarsız; sohbet + grafik çizme + hafıza +
eğitilebilir bilgi tabanı + proaktif içgörüler).

Portföy takibinin ötesinde **gerçek finansal matematik** yapar: reel getiri (Fisher), XIRR,
**vergi sonrası net reel getiri**, Herfindahl yoğunlaşma, volatilite, maksimum düşüş, Sharpe oranı,
korelasyon ve çeşitlendirme faydası — hepsi gerçek tarihsel fiyat serisinden, anahtarsız kaynaklarla.

Ayrıştığı nokta getiri zincirinin **tamamını** kurması:

```
BRÜT kazanç → (stopaj) → NET kazanç → (enflasyon) → REEL net getiri
```

Yaygın uygulamalar brütte durur; bir kısmı reeli hesaplar. Vergi halkasını katan neredeyse yok —
çünkü mevduat toplayan bir kurum kendi stopajını görünür kılmak istemez. Bağımsız bir ürün yapabilir.

> FAGENT'ın BtcTurk'ün yapay zekâ asistanı **Bloki**'den nerede ayrıştığı ve neden onun
> tamamlayıcısı olduğu: [`docs/bloki-vs-fagent.md`](docs/bloki-vs-fagent.md)

**Temel ilke: API anahtarı gerektirmez.** Hiçbir özellik, istemci tarafında bir Anthropic/OpenAI
anahtarı olmadan çalışmayı bırakmaz. Portföy verisi **varsayılan olarak** yalnızca tarayıcıda
(`localStorage`; aynı tarayıcıdaki IndexedDB'de doğrulanmış bir ayna kopyasıyla) tutulur — veri toplama yok. Kullanıcı isterse opsiyonel bir **Fagent hesabı** açabilir;
o zaman verisi yalnızca kendi hesabına bağlı, RLS korumalı tek bir kayda eşitlenir (bkz.
"Hesap ve bulut senkronu (opsiyonel)"). Hesap kurulumda kapalıdır ve açılmadıkça hiçbir ağ isteği atılmaz.

**Tek istisna — TCMB EVDS (opsiyonel):** enflasyon oranını resmî kaynaktan çekmek için bir sunucu
proxy'si var: Vercel Function `api/evds.mjs` (mantık tek kaynakta, `netlify/functions/evds.mjs`;
Netlify alternatif olarak kalır). Anahtar sunucu ortam değişkeninde durur,
istemciye HİÇ inmez ve **portföy verisi bu isteğe dahil edilmez** — sunucudan geçen tek şey TCMB'nin
kamuya açık serisidir. Anahtar tanımsızsa ya da fonksiyon yoksa uygulama elle girilen varsayımla
tam çalışmaya devam eder; canlı veri bir bonustur, şart değildir.

## Kurulum ve Geliştirme

```bash
npm install
npm run dev         # http://localhost:5173
npm run typecheck   # tsc --noEmit
npm run build        # dist/ üretir (Vercel/Netlify: build=npm run build, çıktı=dist)
```

## Hesap ve bulut senkronu (opsiyonel)

Kurulumda **kapalıdır**. `VITE_SUPABASE_URL` ve `VITE_SUPABASE_PUBLISHABLE_KEY` tanımsızken:
Supabase kütüphanesi yüklenmez, istemci oluşturulmaz, hiçbir ağ isteği atılmaz; kenar çubuğunda hesap
düğmesi görünmez ve uygulama yalnızca tarayıcıda çalışır.

Açmak için `.env.example`'ı `.env.local` olarak kopyalayıp Supabase projesinin URL'sini ve
**publishable (anon)** anahtarını yaz. Gizli/servis (`service_role`) anahtarı hiçbir `VITE_`
değişkenine konmaz. Tablo, RLS politikaları ve hesap silme fonksiyonu:
`supabase/migrations/20261018000000_portfolios_and_account_deletion.sql`; sürüm sütunu (iki cihazda çakışma
koruması): `supabase/migrations/20261031000000_portfolios_version.sql`. İkisi de yalnızca dosyadır, hiçbir
projeye uygulanmadı (plan adım 5). Sürüm migration'ı uygulanmadan da uygulama çalışır: istemci sütun yoksa
düz upsert'e düşer (iki cihazda son yazan kazanır).

```bash
cp .env.example .env.local   # iki değişkeni doldur
npm run dev
```

Tanımlıyken kenar çubuğunda **GİRİŞ / KAYIT** düğmesi çıkar: e-postayla kayıt (açıklama + onay kutusu),
giriş, şifre sıfırlama, çıkış ve onaylı hesap silme. Bulut yalnızca kullanıcı açıkça giriş yaptıktan
sonra devreye girer; anonim oturum yok.

**Hesaba eşitlenen katmanlar** (`backup.ts` → `BACKED_UP_KEYS`, yedek dosyasıyla aynı beyaz liste):

- portföy ve işlem geçmişi (`fagent.portfolio.v1`)
- ajan kullanım belleği — hangi konularla ilgilendiğin, tercihler, son sorular (`fagent.agent.memory.v1`)
- öğretilen soru-cevaplar (`fagent.agent.training.v1`)
- stopaj oranları (`fagent.tax.v1`)
- hedef dağılım (`fagent.target.v1`)

**Eşitlenmeyenler:** fiyat önbellekleri (kripto piyasa, fiyat geçmişi), yedek meta verisi, Supabase oturum bilgisi (`sb-*-auth-token`) ve
senkronun kendi işaretleri. Enflasyon tercihi tarayıcıda da kalıcı tutulmadığı için eşitlenmez.

Davranış:

- Kayıt yalnızca kullanıcının kendi satırıdır; RLS diğer kullanıcıların okumasını/yazmasını engeller.
  Satır, hizmeti işleten taraf ve altyapı sağlayıcısı (Supabase) tarafından teknik olarak saklanır;
  saklama bölgesi gerçek proje kurulurken (plan adım 5) belirlenecek.
- Girişte hesapta kayıt varsa ve bu tarayıcıda farklı veri varsa hiçbir şey otomatik uygulanmaz:
  Hesap ekranı yedek indirme, "Hesabımdaki veriyi yükle" ve "Çıkış yap" seçeneklerini sunar.
  "Bu tarayıcıdaki veri" yalnızca onboarding yapılmış portföy değil, öğretilen bilgi, vergi oranı,
  hedef dağılım ve ajan belleğini de kapsar (portföysüz olsalar bile sessizce silinmez).
- Hesapta kayıt **yoksa** ve bu tarayıcıda hesapla eşitlenmemiş veri varsa (girişten önce hesapsız
  kullanılmış; ortak cihazda başkasının verisi olabilir) veri **otomatik yüklenmez**: Hesap ekranı
  "Bu tarayıcıdaki veri hesabına yüklensin mi?" diye sorar (yedek indir / yükle / bu tarayıcıdaki veriyi
  sil / çıkış). Onay verilene kadar buluta hiçbir şey gönderilmez. Sahiplik işareti zaten bu hesabı
  gösteriyorsa (veri daha önce bu hesapla eşitlenmişse) soru sorulmaz.
- Oturum **PKCE** akışıyla açılır (`flowType: 'pkce'`). Doğrulama ve şifre sıfırlama bağlantıları `?code=`
  taşır ve yalnızca bağlantıyı **isteyen tarayıcıda** oturuma çevrilir; bu yüzden bağlantı başka
  tarayıcıda açılırsa oturum açılmaz (yeniden istenir ya da şifreyle girilir). URL'deki `#access_token=…`
  oturum olarak **kabul edilmez** ve adres çubuğundan silinir (hazırlanmış bağlantıyla başkasının hesabına
  sokulma — login CSRF — engeli). Gerçek Supabase'de e-posta akışı henüz doğrulanmadı (plan adım 5).
- **SIFIRLA** yalnızca bu tarayıcıdaki veriyi siler; hesaptaki kopya kalır. Girişliyken SIFIRLA'dan sonra
  yeniden kurulum hesaptaki kaydı sormadan ezmez: ilk kayıt denemesinde bulutla karşılaştırılır, farklıysa
  çakışma kartı çıkar ("Hesabımdaki veriyi yükle" birincil; "bu tarayıcıdaki veriyi hesabıma yükle" ayrı ve
  onaylı). Hesaptaki veriyi silmenin yolu Hesabım → **Hesabımı sil**'dir.
- **Çıkışta** bu tarayıcıdaki kullanıcı katmanları, fiyat önbellekleri ve oturum bilgisi temizlenir.
  Hesaba henüz gitmemiş değişiklik varsa: kullanıcının kendi Çıkış'ında çıkıştan önce sorulur ("7 gün bu cihazda sakla
  ve çık" / "İndir" / "Sil ve çık"); oturum kendiliğinden düşerse (başka sekmeden çıkış, süre dolması) sormadan
  saklanmaya çalışılır. Saklanan **karantina** kopyası bu cihazda ayrı bir anahtardadır (`fagent.quarantine.v1`,
  `src/karantina.ts`): hesap kimliğinin özetiyle etiketli, kayıt başına en çok 7 gün, en çok 2 kayıt. Cihazda yer yoksa
  kullanıcının Çıkış'ı yapılmaz ve bildirilir (oturum kendiliğinden düşmüşse veri yine silinir). Aynı hesapla girişte
  "indir / hesaba yükle / sil" sorulur; başka hesapla girişte, SIFIRLA'da, hesap silmede ve süre dolunca silinir.
  Karantina buluta, yedek dosyasına ve IndexedDB aynasına girmez (yalnızca "indir" ile ayrı bir dosya olarak çıkar).
  Kopya cihazda düz metin kalır (ortak cihaz riski).
- **İki cihaz:** sürüm sütunu varsa kayıt "yalnız sürüm eşleşirse" yazılır. Başka cihaz hesabı değiştirmişse bu
  cihazın değişikliği hesaba yazılmaz, karantinaya alınır ve çakışma kartı çıkar. Gerçek projede doğrulanmadı.
- Arayüzdeki gizlilik metinleri iki durumlu: hesapsız/girişsiz kullanımda "yalnızca tarayıcında",
  girişliyken "hesabına eşitlenir" der.

> **Doğrulama durumu:** auth ve senkron yalnızca `page.route()` ile taklit edilen (sahte) bir
> Supabase'e karşı denendi. Gerçek bir Supabase projesine karşı — RLS politikaları,
> `delete_my_account`, e-posta doğrulama/sıfırlama yönlendirmeleri — **doğrulanmadı** (plan adım 5).
> Kayıt ekranındaki açıklama KVKK aydınlatma metni değildir; aydınlatma metni plan adım 7'ye kaldı.

## Dosya Yapısı

```
src/
  App.tsx           — tüm UI (sekmeler, formlar, grafikler, Ajan sohbet arayüzü)
  store.ts          — portföy veri modeli + actions (localStorage: fagent.portfolio.v1)
  mirror.ts         — IndexedDB aynası: açılış (bootStorage), write-through, SIFIRLA silmesi; localStorage esas
  recovery.ts       — bozuk kayıt ham değerinin kurtarma kopyası (fagent.recovery.corrupt.*)
  kurtarma.ts       — kurtarma rafını listeleme / geri yükleme / dışa aktarma (arka plan işlevi, ekranı yok)
  sekmeSenkron.ts   — başka sekmede yapılan değişikliği (storage olayı) bu sekmenin belleğine taşır; çakışmada kaydedilmemiş değeri korur
  storage/          — ince IndexedDB katmanı (idb, localStorage, yedekli depo, göç, ayna kuralları); bağımlılık yok
  market.ts         — döviz/kripto canlı fiyat (Frankfurter.dev, CoinGecko — anahtarsız)
  csv.ts            — varlık/işlem CSV dışa-içe aktarma
  agent.ts          — Ajan'ın YANIT MANTIĞI (saf fonksiyonlar, localStorage'a dokunmaz)
  agentMemory.ts    — Ajan'ın UZUN SÜRELİ belleği (kullanım istatistiği, localStorage)
  agentTraining.ts  — Ajan'ın EĞİTİLEBİLİR bilgi tabanı (öğretilen soru-cevaplar, localStorage)
  taxRates.ts       — kullanıcının düzenlediği stopaj oranları (localStorage)
  vergiKurallari.ts — tarih aralıklı vergi kuralı okuyucu/doğrulayıcı (SAF); veri: config/tax_rules.json
  varsayimlar.ts    — tarih aralıklı piyasa varsayımları (enflasyon, faiz, senaryo, sıra riski; SAF); veri: config/varsayimlar.json
  targetAllocation.ts — kullanıcının girdiği HEDEF dağılım (localStorage; varsayılanı YOK)
  backup.ts         — tam veri yedeği: beş katmanı tek JSON'da dışa/geri al (beyaz listeli);
                      bulut senkronu da aynı beyaz liste + doğrula-yaz çekirdeğini kullanır
  cloud.ts          — OPSİYONEL hesap + bulut senkronu (Supabase; env tanımsızken tamamen kapalı)
  Account.tsx       — Hesap ekranı: giriş/kayıt/şifre sıfırlama/çıkış/hesap silme/çakışma kararı/karantina kartı
  karantina.ts      — hesaba gitmemiş yerel kopyanın 7 günlük karantinası (SAF; depo parametre)
  surum.ts          — portfolios.version koşullu yazım sonucunun yorumu (SAF)
  localData.ts      — SIFIRLA ve çıkış temizliği (yerel kullanıcı katmanları)
  ErrorBoundary.tsx — render hatasında beyaz ekran yerine veri kurtarma ekranı
  inflation.ts      — enflasyon oranının TEK KAYNAĞI (varsayım / TCMB EVDS / kullanıcı)
  evds.ts           — TCMB EVDS istemcisi (ince sarmalayıcı); hata FIRLATMAZ, başarısızlıkta varsayıma düşülür
  kaynaklar/        — kaynak bağdaştırıcı çatısı: KaynakSonucu + durum metni (tip.ts), önbellek, çalıştırıcı
                      (zaman aşımı/yeniden deneme/devre kesici), TCMB TÜFE + kur (tcmb.ts)
api/
  evds.mjs          — Vercel Function: netlify/functions/evds.mjs mantığını Vercel'e bağlar
netlify/
  functions/evds.mjs — EVDS proxy'sinin TEK KAYNAĞI: API anahtarı YALNIZCA burada (sunucu ortam değişkeni)
  analytics.ts      — FİNANSAL MATEMATİK (saf): reel getiri, XIRR, HHI, volatilite,
                      maks. düşüş, Sharpe, korelasyon, kovaryansla çeşitlendirme faydası,
                      vergi sonrası net getiri (varsayilanVergiOranlari() — config/tax_rules.json — + afterTaxOf),
                      hedef dağılım sapması / %5-%25 bandı (driftOf)
  projection.ts     — PROJEKSİYON HESABI (saf): aylık bileşik büyüme, reel değer, stopaj sonrası,
                      hedefe ulaşma süresi, getiri×enflasyon tablosu, sıra riski; sayılar kaynak
                      etiketli (resmi / varsayim / kullanici). Ekrana yalnız ilk üçü bağlı
  priceHistory.ts   — tarihsel fiyat serisi (CoinGecko market_chart + Frankfurter/ECB)
                      + risk raporu; KAPSAM ORANINI (coveragePct) açıkça döner
  cryptoMarketData.ts — Kripto Piyasa sekmesinin veri katmanı (CoinGecko, önbellekli)
  RiskPanel.tsx     — risk metrikleri arayüzü (kapsam dışı varlıkları da listeler)
  CryptoMarket.tsx  — Kripto Piyasa sekmesi (canlı liste + 7 günlük mini grafikler)
```

`analytics.ts` ve `projection.ts` de `agent.ts` gibi **saftır** — I/O içermez, doğrudan test edilebilir.
`projection.ts` modül sayılarını etiketli döndürür (resmi/varsayim/kullanici); ekranda etiket gösterimi henüz yok (tasarım).
`priceHistory.ts` ağ erişimi içerir ve bu ayrımı bilinçli olarak tek başına taşır.

`agent.ts` bilinçli olarak **saf** tutuldu: hiçbir I/O (localStorage, ağ) içermez, tüm veri
(portföy, geçmiş, hafıza, öğretilmiş bilgiler) parametre olarak geçirilir. Bu hem test etmeyi
kolaylaştırır. Ürün dışı: dış AI/LLM bağlantısı yoktur (bkz. "Dış AI bağlantısı yok").

---

## Ajan — Nasıl Çalışıyor

Ajanın davranışı üç ayrı katmandan oluşuyor. Her biri farklı bir soruya cevap veriyor:

| Katman | Dosya | Soru | Kalıcı mı? |
|---|---|---|---|
| **Kısa süreli bağlam** | `App.tsx` (messages state) + `agent.ts` (intentId) | "Az önce ne konuştuk?" | Hayır — sekme/sayfa kapanınca sıfırlanır |
| **Uzun süreli bellek** | `agentMemory.ts` | "Bu kullanıcı genelde neyle ilgileniyor?" | Evet — `localStorage` (+ IndexedDB aynası), davranışı değiştirmez, yalnızca kişiselleştirir |
| **Eğitilebilir bilgi** | `agentTraining.ts` | "Kullanıcı bana ne öğretti?" | Evet — `localStorage` (+ IndexedDB aynası), davranışı DOĞRUDAN değiştirir |

### 1. `chatReply()` — Yanıt Önceliği (agent.ts)

Bir kullanıcı mesajı geldiğinde sırasıyla kontrol edilir (ilk eşleşen kazanır):

```
1. Öğretilmiş bilgi (agentTraining.findBestMatch)   ← kullanıcının öğrettiği her şey en yüksek öncelikte
2. Bellek sorgusu ("beni ne hatırlıyorsun")
3. Takip cümlesi ("devam et", "biraz daha anlat")   ← son konuşulan konuyu (intentId ile) genişletir
4. Grafik isteği (detectChartRequest)               ← "dağılımımı çiz", "yatırım grafiğim" vb.
5. En iyi/en kötü performans kıyaslaması
6. Genel niyet kuralları (CHAT_RULES — analiz, dağılım, risk, enflasyon, küçük sohbet…)
7. Varlık adıyla serbest arama (holdingLookupReply) ← "THYAO nasıl gidiyor"
8. Fallback — "anlayamadım" + öneriler
```

Yeni bir konu/kural eklemek için `agent.ts`'teki `CHAT_RULES` dizisine yeni bir `{ test: RegExp,
reply: (s) => string }` girişi eklemek yeterli. `id` alanı verirsen (`'analiz'`, `'dagilim'` gibi)
bu konu "takip cümlesi" ve "bellek" sistemleriyle de bağlantılı hale gelir.

### 2. Grafik Çizme

`agent.ts` üç grafik türü üretebilir (`ChartSpec` — `{ kind, title, data, dataKey, nameKey }`):

- `allocationChart` — pasta, sınıf dağılımı
- `investmentHistoryChart` — alan, net yatırım geçmişi (`store.investmentHistoryOf()` ile Panel'deki
  grafikle aynı veri kaynağını paylaşır)
- `pnlBarChart` — çubuk, varlık bazlı kâr/zarar

`App.tsx`'teki `AgentChartView` bunu sohbet balonu içinde Recharts ile render eder. Yeni bir grafik
türü eklemek için: (1) agent.ts'te veriyi üreten bir fonksiyon yaz, (2) `ChartSpec.kind`'a yeni bir
değer ekle, (3) `AgentChartView`'da o `kind` için bir render bloğu ekle.

**Türkçe dilbilgisi tuzağı:** "grafik" kelimesi iyelik ekiyle "grafiğimi" olur (ünsüz yumuşaması,
k→ğ). `detectChartRequest`'teki regex bu yüzden tam `grafik` yerine `graf` köküyle eşleşiyor. Yeni
Türkçe anahtar kelime eklerken bu tarz çekim farklarını unutma.

### 3. Uzun Süreli Bellek (`agentMemory.ts`)

Her sohbet turundan sonra `recordTurn(intentId, mentionedHoldingNames)` çağrılır ve şunları sayar:

- `topicCounts` — hangi `intentId` kaç kez tetiklendi
- `holdingMentions` — hangi varlık adı sohbette kaç kez geçti

Bu veri **yalnızca** karşılama mesajını kişiselleştirmek (`buildGreeting`) ve şeffaflık sorgusuna
("beni ne hatırlıyorsun") cevap vermek için kullanılır — ajanın asıl yanıt mantığını etkilemez.

### 4. Eğitilebilir Bilgi Tabanı (`agentTraining.ts`)

Kullanıcı Ajan sekmesindeki **"Ajanı Eğit"** panelinden bir soru + cevap girip öğretebilir.
Bu, `TrainedFact { id, question, answer, createdAt, timesUsed }` olarak saklanır ve `chatReply`'de
en yüksek öncelikle kontrol edilir (bkz. yukarıdaki tablo).

Eşleştirme `findBestMatch()` ile yapılır: önce tam metin eşleşmesi (normalize edilmiş), yoksa
kelime kümesi örtüşmesi (Jaccard benzerliği, eşik `0.5`). Bu **gerçek bir NLP/embedding modeli
değildir** — basit ama etkili bir kelime-örtüşmesi sezgiseli. Aynı soru tekrar öğretilirse eskisinin
üzerine yazılır (düzeltme akışı).

**Önemli — bu bir LLM eğitimi değildir.** Ortada güncellenen bir sinir ağı/model yok; kullanıcı
doğrudan sabit cevaplar ekliyor. Bu, klasik "uzman sistem" / örnek-tabanlı akıl yürütme desenidir.
UI'da ve "yardım" metninde bu açıkça belirtiliyor — yanlış beklenti yaratmamak önemli.

### 5. Geri Bildirim Döngüsü — 👍/👎

Her ratable ajan mesajının altında 👍/👎 butonları var (karşılama mesajı hariç):

- **👍** — eğer yanıt zaten öğretilmiş bir bilgiden geldiyse hiçbir şey yapmaz. Built-in bir kuraldan
  geldiyse, o soru-cevabı olduğu gibi öğretilmiş bilgiye **otomatik terfi ettirir** — bir sonraki aynı
  soru artık `findBestMatch` üzerinden (daha hızlı/kesin) gelir.
- **👎** — kaynağı ne olursa olsun (built-in kural ya da fallback), "Ajanı Eğit" panelini otomatik açar
  ve **Soru** alanını kullanıcının az önce sorduğu metinle önceden doldurur (`findPrecedingUserText`).
  Kullanıcı doğru cevabı yazıp öğretir — negatif geri bildirim doğrudan düzeltme akışına bağlanmış olur.
- Her mesaj yalnızca bir kez oylanabilir.

Bu, "beğenilen ad-hoc cevapları veri setine ekleyip modeli eğitmek" fikrinin anahtarsız/gerçekçi
karşılığıdır — **model eğitimi değil**, `agentTraining.ts`'e satır ekleme. Gerçek bir öğrenme
algoritması (RLHF, fine-tuning) burada yok; bu konudaki dürüstlük ilkesi diğer katmanlarla aynı.

### 6. Aksiyon Alma — Onayla/Vazgeç

Ajan artık salt bilgi vermekle kalmıyor, sohbette verilen bir komutu gerçekten uygulayabiliyor:
"THYAO'dan 500 TL sat" gibi bir mesaj yazarsan, ajan `detectTradeCommand()` ile bunu ayrıştırır ve
"Onaylıyor musun?" diye sorar. **Onayla**'ya basmadan hiçbir gerçek veri değişmez — `agent.ts` bu
akışta da saf kalır, `actions.addTxn` yalnızca `App.tsx`'teki `resolveAction()` içinde, onay sonrası
çağrılır. Tespit bilinçli olarak sıkı: tutar + tek anlamlı fiil (al/sat) + tam olarak bir varlıkla
eşleşme şart; biri eksikse normal soru-cevap akışına düşülür (yanlış negatif, verinin yanlışlıkla
değişmesinden çok daha güvenli). Onaylansa bile bakiye aşımı gibi durumlar İşlemler sekmesindekiyle
aynı kurala göre reddedilir.

---

## Dış AI bağlantısı yok

Ajan tamamen kural tabanlı ve anahtarsızdır; portföy verisi hiçbir yapay zekâ servisine gönderilmez.
Eskiden Ajan sekmesinde opsiyonel bir "AI bağlantısı" kartı vardı; gizlilik ve düzenleme gerekçesiyle
(portföy özetini dışarı gönderiyordu, kişiye özel yorum riski) kaldırıldı. Eski sürümden kalmış bağlantı
adresi, uygulama ilk açıldığında tarayıcıdan silinir. Anlaşılamayan sorulara ajan sabit bir
"Bunu yanıtlayamam; şunları sorabilirsin…" cevabı verir.

---

## Veri Modeli Özeti

- `fagent.portfolio.v1` — `Holding[]` + `Txn[]` (bkz. `store.ts`)
- `fagent.agent.memory.v1` — kullanım istatistiği (bkz. `agentMemory.ts`)
- `fagent.agent.training.v1` — öğretilmiş soru-cevaplar (bkz. `agentTraining.ts`)

Sidebar'daki **SIFIRLA** üçünü de temizler.

## Bilinçli Sınırlar

- **Hisse/fon canlı fiyatı yok:** BIST/TEFAS için resmi/ücretsiz/anahtarsız bir kaynak yok
  (araştırıldı) — bu ikisi manuel-girişli kalıyor, sahte fiyat gösterilmiyor.
- **Altın canlı fiyatı yok:** Adayları (gold-api.com vb.) JSON şeması doğrulanamadığı için eklenmedi.
- Döviz/kripto canlı fiyatı Frankfurter.dev + CoinGecko ile çalışır (anahtarsız, CORS-açık).
- **Risk metrikleri portföyün tamamını kapsamaz:** tarihsel seri yalnızca canlı fiyata bağlı
  kripto/döviz için çekilebiliyor. Bu gizlenmez — risk raporu portföyün yüzde kaçını kapsadığını
  (`coveragePct`) ve kapsam dışı her varlığın nedenini arayüzde açıkça yazar.
- **Enflasyon oranının tek kaynağı `inflation.ts`'tir.** Üç durumdan biri olabilir ve arayüz
  hangisi olduğunu AÇIKÇA yazar: `varsayim` (elle güncellenen sabit, TÜİK son yıllık TÜFE),
  `evds` (TCMB EVDS'den canlı), `kullanici` (senaryo denemesi için elle girilen). Kullanıcının
  girdiği oran canlı veriyi de ezer; SIFIRLA bu geçersiz kılmayı temizler.
  Daha önce aynı sayı DÖRT yerde ayrı ayrı duruyordu (iki kart + projeksiyon + `agent.ts` sabiti)
  ve biri değiştirilince diğerleri eski değeri kullanmaya devam ediyordu — birleştirildi.
- **EVDS şu an KAPALI — `EVDS_API_KEY` tanımlı değil.** Vercel önizlemede (24.10.2026) anahtar
  tanımsızken 503 `anahtar_yok` gözlendi; gerçek EVDS verisiyle doğrulanmadı (EVDS_API_KEY tanımlanınca ve
  seri kodu doğrulanınca açılır). Anahtar yokken uygulama elle girilen varsayıma düşer. Yani ürün bugün
  enflasyonu canlı ÇEKMİYOR, varsayım modunda çalışıyor. Anahtar tanımlanınca canlı enflasyon açılır;
  açılması için tek gereken Vercel ortam değişkenine anahtarı eklemek. Sunum/doküman dilinde bu ayrımı koru:
  "hazır ve açılmayı bekliyor" doğru, "canlı çekiyoruz" yanlış.
- **EVDS seri kodu (`src/kaynaklar/tcmb.ts` → `TUFE_SERIES`; `evds.ts` yeniden dışa aktarır) HENÜZ DOĞRULANMADI.** Yanlışsa yanıt okunamaz ya da akla yatkınlık kontrolünde reddedilir,
  istemci `undefined` döner ve varsayıma düşülür — ekranda yanlış bir sayı ÇIKMAZ.
  Yıllık değişim endeksin kendisinden hesaplandığı için serinin baz yılı sonucu etkilemez.
- **Netlify Function gerçek deploy dışında koşturulamadı** (ne netlify-cli var ne dış ağ erişimi).
  Vercel durumu: önizlemede yalnızca anahtarsız 503 `anahtar_yok` yanıtı ve güvenlik başlıkları gözlendi (24.10.2026);
  gerçek EVDS verisi doğrulanmadı.
  İstemci tarafı `page.route()` taklidiyle, sunucu fonksiyonu ve bağdaştırıcı sahte `fetch` ile yazılmış birim testlerle sınandı
  (yeşil); gerçek EVDS yanıtıyla doğrulanmadı — fonksiyonun kendisi yalnızca canlı deploy'da ve anahtarla
  doğrulanabilir, "test edildi" DEĞİLDİR.
- **Stopaj oranları da elle güncellenen varsayımdır** (`src/config/tax_rules.json`, tarih aralıklı; `DEFAULT_TAX_RATES` bugünün tarihindeki kuraldan türetilir; hiçbir kural muhasebeciyle doğrulanmadı).
  Kaynak: 27.03.2026 tarihli 11107 sayılı Cumhurbaşkanı Kararı — fon ve 6 aya kadar vadeli TL
  mevduat %17,5; BIST pay senedi alım-satımında stopaj yok. **Kripto/altın/döviz için doğrulanmış
  bir rejim bulunamadığından %0 bırakıldı** — bu "vergi yok" iddiası değil, "oran uydurmuyoruz"
  demektir ve ajan bunu açıkça söyler (`UNVERIFIED_TAX`). Vade, fon türü ve istisnalar sonucu
  değiştirir; hesap bir tahmindir, beyanname değildir.
- **Ondalık ayraç Türkçe (virgül):** kullanıcıya görünen her ondalık `store.ts` → `fmtDec()`
  üzerinden geçmeli. `toFixed()` her zaman NOKTA üretir ve tutarlar (`₺140.000`) zaten Türkçe
  biçimde olduğu için aynı cümlede "%17.5" ile "₺140.000" tutarsız görünüyordu. **İstisna:**
  `csv.ts` — CSV alan ayracı zaten virgül, ondalığı da virgül yapmak dosyayı bozar, orada
  `toFixed()` kalır.
- **Ajan mesajları düz metindir** — `App.tsx` `{m.text}` olarak basar, markdown ayrıştırmaz.
  Yanıt metinlerinde `**kalın**` kullanma; kullanıcıya yıldız olarak görünür.
- **Hedef dağılım ÖNERİLMEZ, yalnızca ölçülür** (`targetAllocation.ts` → varsayılanı yoktur,
  boş başlar). "Şu dağılımı hedefle" demek yatırım tavsiyesidir; SPK'ya göre genel yatırım
  tavsiyesi yalnızca aracı kurum/banka/portföy yönetim şirketlerince verilebilir. Ürünün
  yaptığı, kullanıcının KENDİ koyduğu hedeften sapmayı hesaplamaktır — bu aritmetiktir.
  Yeni içgörü/analiz metni yazarken fiil kipini betimleyici tut ("aran şu kadar açılmış",
  "şunu yap" değil).

## Test Kapsamı

Playwright e2e testleri artık **repo içinde**: `tests/e2e/` — 23 dosya, **415 kontrol**.

```bash
npm run test:e2e     # Vite dev sunucusunu başlatır, tüm takımları sırayla çalıştırır
```

Kapsam: sidebar/nav, kâr-zarar muhasebesi, canlı fiyat bağlama, CSV içe/dışa aktarma, validasyon
kuralları (ad çakışması, bakiye aşımı), ajan sohbet/grafik, uzun süreli bellek, eğitilebilir bilgi
tabanı, geri bildirim döngüsü (👍/👎), aksiyon alma (Onayla/Vazgeç), proaktif içgörüler, finansal
analitik (reel getiri/XIRR/HHI), **vergi sonrası net getiri**, risk metrikleri, Kripto Piyasa
sekmesi, projeksiyon.

**Yeni davranış eklerken ilgili takıma kontrol ekle.** Commit öncesi üç doğrulama da geçmeli:
`npm run typecheck` · `npm run build` · `npm run test:e2e`.

Detaylar için repo kökündeki `CLAUDE.md`'ye bakabilirsin (proje hafızası, her oturumda güncellenir).
