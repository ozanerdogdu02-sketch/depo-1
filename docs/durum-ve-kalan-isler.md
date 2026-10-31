# Durum ve kalan işler (kontrol listesi)

> **Güncelleme (28.10):** YH-2 (projeksiyon motoru, Aşama A) bitti ve doğrulandı: e2e 735/735, birim 117/117 (sahte Supabase ile yeşil). Puan: 13,5 / 39 ≈ %35. Dosya adı `src/projection.ts`. Ekrana bağlanmayan yeni fonksiyonlar tasarım oturumunu bekliyor.

> **Güncelleme (YH-3 bitti, EVDS anahtarı bekliyor):** kapı yeşil (e2e 736/736 sahte Supabase ile, birim 181/181). Puan 13,5 → 16 / 39 ≈ %41 (YH-3'ün yarım 0,5 puanı tam 3 oldu: 10 + 3 + 3 = 16; 16/39 = %41,0). Anahtar ve kur seri kodları doğrulanana kadar canlı enflasyon/kur kapalı kalır.

> **Güncelleme (28.10, YH-3 anahtarsız bölüm):** `src/kaynaklar/` çatısı, TCMB bağdaştırıcısı ve `api/evds.mjs` genişletmesi yazıldı; birim 179/179 (güvenlik/uyum düzeltme turu dâhil). Kur kodları ve kullanıcı anahtarı bekleniyor, CoinGecko/Frankfurter yeniden bağlama ve CSP daraltma YAPILMADI (ayrıntı: yol haritası YH-3 "Yapıldı"). YH-3 puanı kapıdan (e2e dâhil) geçmeden değişmez.

Yazan: yönetmen, 2026-10-27. Durum: **BELGE. Kod yok, commit yok.** Siz satır satır kontrol edin; yanlış gördüğünüz satırın yanına not düşün.
Dayanak: `docs/yol-haritasi-birlesik.md` (kısaca "yol haritası"), `CLAUDE.md`, `git log` (son commit `455804e`), çalışma ağacı (`git status`).

## 1. Özet

- **Bugün: ~%27 bitti** (39 puanın 10,5'i). **YH-2 (projeksiyon motoru) bitince: ~%35** (39'un 13,5'i = %34,6).
- Biten: YH-1 (yerel veri katmanı, commit `d13471f`). Yapılıyor: YH-2 (başka ajanda; bitmiş sayılmadı). Yarım: YH-3 (yalnız enflasyon ucu var, anahtar yok).
- Kalan 25,5 puanın 10'u (yaklaşık %40'ı) KAP ve BİST kazımasında; bu ikisi hem hukuken hem teknik olarak en belirsiz iş.
- En riskli 3 şey:
  1. **KAP/BİST kazıması (YH-4, YH-5):** hukuki durum belirsiz; BİST için kaynak sayfa bile seçilmedi; bu ortamdan siteler erişilemiyor.
  2. **Gerçek ağda hiçbir dış kaynak doğrulanmadı:** EVDS anahtarı Vercel'de yok; tüm testler taklit (sahte) yanıtla yeşil.
  3. **YH-8 (eski sekmeleri kaldırma):** e2e testleri bugünkü menüye sıkı bağlı (`side-link` 22 dosyada) ve sizin tasarımınıza bağlı.

## 2. Yüzde hesabı (yöntem açık)

**Puanlama:** küçük = 1, orta = 3, büyük = 5 (büyüklükler yol haritası §0 tablosundan).
**Bitti sayma kuralı:** commit'lenmiş ve kapıdan geçmiş iş tam puan alır; yapılmakta olan iş 0 alır; yarım iş elle verilmiş kısmi puan alır.

| Adım | İş (sade) | Büyüklük | Puan | Durum (27.10) | Sayılan |
|---|---|---|---|---|---|
| YH-1 | Yerel veri katmanı (Y1–Y5 küçük ×5 + bağlama büyük) | 5×1 + 5 | 10 | ✅ Bitti (`d13471f`; 88 birim test, e2e 735/735 sahte Supabase ile yeşil) | 10 |
| YH-2 | Projeksiyon hesap motoru | orta | 3 | 🔧 Yapılıyor (çalışma ağacında `src/projection.ts` + `App.tsx` farkı; incelenmedi) | 0 |
| YH-3 | TCMB/EVDS + kur bağdaştırıcısı | orta | 3 | ◐ Yarım: enflasyon ucu (`api/evds.mjs`) var, anahtar yok, kur/çatı yok | 0,5 |
| YH-4 | KAP bildirimleri (kazıma) | büyük | 5 | Başlamadı | 0 |
| YH-5 | BİST gün sonu fiyatı (kazıma) | büyük | 5 | Başlamadı; kaynak sayfa seçilmedi | 0 |
| YH-6 | Paylaşılan piyasa verisi önbelleği | orta | 3 | Başlamadı; Üst Kurul talebi gerekir | 0 |
| YH-7 | Eski panellerin ekransız motora dönüşmesi (9 alt bölüm) | toplam büyük | 5 | Başlamadı | 0 |
| YH-8 | Menüyü ve eski sekmeleri kaldırma | büyük | 5 | Başlamadı | 0 |
| **Toplam** | | | **39** | | **10,5 → %26,9** |

YH-2 bitince: 13,5 / 39 = **%34,6**. Sonrasında her adımın katkısı: YH-3 +%6,4 (kalan 2,5 puan) · YH-4 +%12,8 · YH-5 +%12,8 · YH-6 +%7,7 · YH-7 +%12,8 · YH-8 +%12,8.

**Yöntemin zayıf yanları (dürüst not):**
- Puanlar emek ölçüsü değil, kaba tahmindir. "Büyük = 5" bir işin gerçekte 3 ya da 10 kat süreceğini göstermez.
- YH-3'e verilen 0,5 puan elle verilmiş bir yargıdır; ölçülmedi.
- YH-1 tam sayıldı, ama plandan farklı bir biçimde bitti: **localStorage hâlâ asıl kaynak, IndexedDB "doğrulanmış ayna"** (`docs/veri-akisi/mevcut-durum-ve-plan.md` → "P3 bağlama — yapılan"). Asıl okumanın IndexedDB'ye geçmesi ayrı iş olarak kaldı (aşağıdaki "yol haritası dışı" tablosunda).
- KAP ve BİST'in büyüklüğü belirsiz: kaynak adresleri, biçimleri ve hukuki durum bilinmiyor. Hukuk "olmaz" derse bu iki adım ya düşer ya küçülür; yüzde o zaman yeniden hesaplanır.
- Yüzde **yalnız yol haritasını** ölçer. "Yayına hazır" ya da "satışa hazır" demek değildir; aşağıdaki tablodaki işler ve sizin işleriniz (§4) yüzdeye girmez.
- Son e2e sayısı iki kayıtta farklı: commit mesajı 735, plan belgesi 732 (699 + 33). Fark doğrulanmadı; bir sonraki kapı koşusu kesin sayıyı verir.

### Yol haritası DIŞI işler (yüzdeye KATILMAZ)

| İş | Durum | Kim | Not |
|---|---|---|---|
| Yapay zekâ yorumu denemesi (cihazda açık kaynak model) | Üst Kurul koşullu onay; sizin "başla" onayınızı bekliyor | ekip (veri-akışı, güvenlik, uyum, test) | `docs/teknoloji-talepleri.md` 2026-10-27 satırı; yalnız deneme, ürüne girmez |
| Uyumluluk açıklama sayfası (`docs/devir/`) | Karar verildi, sayfa yok (`docs/devir/` altında 3 dosya var, bu yok) | ekip (uyum) | `CLAUDE.md` → "HUKUK/UYUM YÜKÜ ALICIYA DEVİR" madde 2 |
| Devir paketi güncellemesi | `docs/devir/kurulum-ve-devir.md` TASLAK; IndexedDB, YH-3…6 sunucu uçları, yeni env'ler yazılmadı | ekip (veri-akışı + uyum) | Her YH adımında belge-kod tutarlılığı ile birlikte |
| Birim test kapsamı (`src/analytics.ts`) | 27 dışa aktarılan fonksiyon (grep), 4'ünün birim testi var (`tests/unit/hesap.test.ts`) | ekip (test) | Faz planı 2.1 (#21: Fisher/XIRR/HHI) bunun alt kümesi; birleştirilir |
| Asıl okumanın IndexedDB'ye geçmesi (P3 sonrası) | Açık; plan belgesindeki "Kalan işler" listesi | ekip (veri-akışı) | Sizin onayınızla ayrı adım |
| `AGENTS.md` §0.4 güncellemesi | Bekliyor; ajanlar değiştirmez | siz | YH-5'in ön koşulu; öneri metni yol haritası §13 |
| `CLAUDE.md` eski satırlarının temizliği | Açık | siz onaylar, yönetmen taslak verir | Örnek: "NEREDEN DEVAM EDİLİR (2026-10-19)", "Doğrulama durumu (2026-10-18) 582/582", "KAPSAM KARARI 2026-10-25"nin tasarım cümlesi (tek ekran kararıyla çelişiyor), 10 adımlı eski plan ile YH-1…8'in ilişkisi |
| EVDS anahtarı | Vercel `fagent` projesinde YOK | siz | YH-3'ün son doğrulaması |
| Gerçek Supabase projesi (hesap) | Yok; canlı öncesi zorunlu liste (34+33, 35, 41, 27) açık | siz + ekip | Satıştan önce canlıda hesap KAPALI kalır (hukuk/uyum kararı) |
| Hukuk görüşü (avukat) | Alınmadı | siz | Alıcıya devredilen açık madde olarak yazılabilir |
| Sizin altyapı testiniz | Yol haritası bitince | siz | `CLAUDE.md` → HEDEF: bitiş sırası |
| Alan adı | Alınmadı | siz | Altyapı testinden sonra |
| Yayın (fagent.vercel.app üretime geçiş) | fagent.vercel.app hâlâ eski maket | siz onaylar | En son |

## 3. Hazır istemler

**Nasıl kullanılır:** Her istem `fagent-ekip` iş akışına (küçük koşu, `maksKalem` 3–4) `gorev` olarak verilir. Gönderilecek metin = **§3.0 ORTAK blok + ilgili istem**. İstemler yol haritasındaki bölüme atıf yapar, metni kopyalamaz; ekip o bölümü okur.

### 3.0 ORTAK blok (her istemin başına eklenir)

```
ORTAK KISITLAR (her rol):
- AGENTS.md §0 aynen geçerli: istemcide anahtar yok; kişiye özel al/sat önerisi yok; gerçek işlem yürütme yok; sahte veri yok; portföy verisi üçüncü tarafa/sunucuya gitmez.
- Ajanlar commit atmaz, push etmez, dal değiştirmez. İncelenmemiş iş /home/user/FAGENT-Raporlar/02-degisiklikler/ altına yama dosyası olur.
- npm install yok (npm ci). .env* okunmaz. playwright install yok. pkill -f yok.
- e2e'yi YALNIZ test rolü koşar: CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e. Rapor dili "sahte Supabase ile yeşil"; dış kaynaklar için "gerçek ağda doğrulanmadı".
- KAPI (adım sonunda, hepsi yeşil olmadan teslim yok): npm run typecheck · npm run build · npm run guvenlik -- --dist (0 kritik) · npm run test:unit · e2e (kontrol sayısı azalmaz; son kayıt 735).
- İnceleme: güvenlik rolü + uyum rolü teslimi git diff ile inceler; kritik/yüksek bulgu kapanmadan teslim yok.
- Yeni paket/servis/araç = Üst Kurul talebi (docs/ust-kurul.md "Talep biçimi"); kendiliğinden eklenmez.
- Kaynak gösterilmeyen iddia bulgu sayılmaz (kanıt: komut çıktısı, dosya:satır, bağlantı). Lisanslı kod/görsel kopyalanmaz.
- Kullanıcıya görünen metinde emir kipi, "öneri/tavsiye", "tahmin/beklenen getiri" yok (uyum-dili skill'i). Görünen her sayının yanında kaynak + tarih.
- Ekran görünümü değişmez (tasarım kullanıcıda), istem aksini söylemedikçe.
ORTAK OKU (önce): CLAUDE.md → "EKİP HAFIZASI" (satır 95-128) · .claude/skills/e2e-kosu/SKILL.md 6-23 · .claude/skills/uyum-dili/SKILL.md 10-26 · AGENTS.md §0 (satır 6-24) · docs/yol-haritasi-birlesik.md §1 (satır 33-42). Satır numaraları kayar: grep -n ile doğrula, dosyayı baştan okuma.
ORTAK ÇIKTI: yapılan kalemler; değişen dosyalar (git diff --stat); kapı komutlarının çıktı özeti; güvenlik ve uyum bulguları (ciddiyetiyle); yol haritasındaki "Elle denetim" maddelerinin her biri için kanıt ya da "doğrulanamadı"; yeni TODO(hukuk)/TODO(muhasebe) satırları.
```

### 3.1 YH-3 · TCMB/EVDS + kur bağdaştırıcısı

```
BAĞLAM: FAGENT, Türk bireysel yatırımcı için anahtarsız, yerelde çalışan portföy paneli. Yol haritası adımı YH-3 (docs/yol-haritasi-birlesik.md "## YH-3").
GÖREV: YH-3 "Yapılacaklar" 2-8'i uygula (madde 1 kullanıcıda: EVDS anahtarı). Anahtar yoksa çatı + kur bağdaştırıcısı taklit yanıtla kurulur, kur seri kodları IZINLI_SERILER'e EKLENMEZ (gerçek yanıt yok).
OKU: ORTAK OKU + .claude/skills/veri-akisi-haritasi/SKILL.md 6-26 · .claude/skills/belge-kod-tutarliligi/SKILL.md 8-22 · docs/veri-akisi/cok-kaynakli-veri-plani.md §2 (satır 44-104) · src/evds.ts, api/evds.mjs, netlify/functions/evds.mjs (grep -n IZINLI_SERILER) · vercel.json connect-src satırı · YH-2'nin projeksiyon girdi sözleşmesi (src/projection.ts ya da projeksiyon.ts; grep ile bul).
KISITLAR: ORTAK + Frankfurter otomatik yedek OLMAZ (kullanıcı kararı). Sunucu ucu keyfi URL/sembol almaz; istemci sembol listesi göndermez. Anahtar yalnız sunucuda. InflationState "kullanici" önceliği ve vergi oranları değişmez. Netlify aynası silinmez (ayrı karar). TCMB kuru ECB'den farklı çıkar: eski sabit sayıları grep -rn ile src ve tests/e2e'de ara.
ÇIKTI: ORTAK ÇIKTI + YH-3 "Kabul ölçütü" 1-5'in her biri için kanıt (5. madde anahtar yoksa "doğrulanamadı: anahtar yok"). Değişen e2e taklitleri listesi (cryptodemo, cryptomarket, live, risk). TODO(hukuk) EVDS ticari gösterim satırı.
DURMA ŞARTI: Kur için EVDS seri kodu gerçek yanıtla doğrulanamıyorsa kodu uydurma, dur ve "kullanıcı anahtarı bekleniyor" yaz. CSP değişikliği csp-e2e'yi kırıyor ve çözüm başka başlığı gevşetmeyi gerektiriyorsa dur. Kapı 2 düzeltme turunda yeşile dönmezse dur.
```

### 3.2 YH-4 · KAP bağdaştırıcısı (kazıma)

```
BAĞLAM: FAGENT. Yol haritası adımı YH-4 (docs/yol-haritasi-birlesik.md "## YH-4"). Kullanıcı KAP verisinin kazınmasını açıkça istedi (CLAUDE.md → KARARLAR 2026-10-27/28); hukuki risk TODO(hukuk) olarak işaretlenir, satışta alıcıya açıklanır.
GÖREV: YH-4 "Yapılacaklar" 1-5: ortak sunucu kazıma çatısı (api/_kazima.mjs), api/kap.mjs (girdisiz, genel tablo), src/kaynaklar/kap.ts (tarayıcıda süzme), ayrıştırıcı testleri, yorumsuz metin şablonu.
OKU: ORTAK OKU + .claude/skills/veri-akisi-haritasi/SKILL.md 6-26 · docs/veri-akisi/cok-kaynakli-veri-plani.md §2 ve §4 (satır 44-145) · YH-3'te kurulan src/kaynaklar/tip.ts ve kayit.ts.
KISITLAR: ORTAK + Hedef adres listesi sabit, kullanıcı girdisi yok (SSRF). robots.txt kontrolü, kimliği belli User-Agent, istekler arası bekleme, zaman aşımı, en çok 2 yeniden deneme, devre kesici, yanıt boyutu üst sınırı. Fixture uydurulmaz: gerçek yanıt yoksa "örnek" etiketli ve testte bunu belirten ad. Liste metninde yorum/özet/yön yok. HTML ayrıştırma kütüphanesi gerekirse Üst Kurul talebi. api/kap.mjs içinde en az bir TODO(hukuk).
ÇIKTI: ORTAK ÇIKTI + YH-4 "Kabul ölçütü" 1-4 kanıtı. KAP iç uçlarının hangi kaynağa dayanarak seçildiği (bağlantı). Önizlemede yapılacak gerçek deneme için kullanıcıya adım adım kontrol listesi.
DURMA ŞARTI: YH-3 çatısı yoksa başlama. Kullanıcının hukuk okuması (docs/karar-gunlugu.md'de kayıt) yoksa uygulamaya geçmeden kullanıcıya sor. İç uç adresi bir kaynakla gösterilemiyorsa dur. KAP robots.txt ilgili yolu yasaklıyorsa dur ve raporla.
```

### 3.3 YH-5 · BİST bağdaştırıcısı (gün sonu)

```
BAĞLAM: FAGENT. Yol haritası adımı YH-5 (docs/yol-haritasi-birlesik.md "## YH-5"). En yüksek hukuki risk.
GÖREV: YH-5 "Yapılacaklar" 2-5: api/bist.mjs (YH-4 çatısıyla, günde bir, girdisiz), src/kaynaklar/bist.ts (süzme), fiyat önceliği (kullanıcı girişi → BİST; elle değer onaysız ezilmez), mantık kontrolü (günlük ±%20 eşiği src/config/varsayilanlar.ts'e).
OKU: ORTAK OKU + .claude/skills/app-tsx-haritasi/SKILL.md 11-35 (Panel, updateHoldingValue) · docs/veri-akisi/cok-kaynakli-veri-plani.md §4 · AGENTS.md §0.4 (GÜNCEL hâli) · docs/karar-gunlugu.md'deki BİST kaynak sayfası kararı.
KISITLAR: ORTAK + Yalnız gün sonu kapanış; gün içi/gerçek zamanlı yok. TEFAS fon fiyatı kapsam dışı (elle kalır). Elle/CSV giriş her zaman yedek yol. Her değerin yanında kaynak adı + kapanış tarihi. Sembol listesi sunucuya gitmez.
ÇIKTI: ORTAK ÇIKTI + YH-5 "Kabul ölçütü" 1-4 kanıtı. Seçilen kaynak sayfanın kullanım koşulu bağlantısı ve TODO(hukuk) satırları.
DURMA ŞARTI: AGENTS.md §0.4 kullanıcı tarafından güncellenmediyse BAŞLAMA. Kaynak sayfa kararı karar günlüğünde yoksa BAŞLAMA. Kaynak sayfa kazımayı kullanım koşuluyla açıkça yasaklıyorsa dur ve kullanıcıya bildir.
```

### 3.4 YH-6 · Paylaşılan herkese açık veri önbelleği

```
BAĞLAM: FAGENT. Yol haritası adımı YH-6 (docs/yol-haritasi-birlesik.md "## YH-6"; karar K3: önce CDN, geçmiş gerekince ayrı Supabase projesi).
GÖREV: (1) Üst Kurul talebini aç: yol haritası YH-6 sonundaki "Üst Kurul talep taslağı" docs/ust-kurul.md "Talep biçimi"ne göre doldurulur, eksik alanlar (sürüm, ücretsiz katman sınırı kanıtı, log saklama ayarı) araştırılıp bağlantıyla eklenir. (2) Kurul onayı ve kullanıcının ayrı Supabase projesi varsa YH-6 "Yapılacaklar (b)" 2-4 uygulanır; yoksa yalnız (a) CDN önbelleği belgelenir.
OKU: ORTAK OKU + docs/ust-kurul.md (tamamı kısa) · docs/teknoloji-talepleri.md · supabase/migrations/ (yalnız dosya adları; hesap migration'ına dokunulmaz) · scripts/build.mjs (grep -n sb_secret_).
KISITLAR: ORTAK + Tabloda kullanıcı kimliği, IP, portföy alanı yok. Servis anahtarı yalnız Vercel ortam değişkeninde; tarayıcı yalnız /api/* okur, VITE_SUPABASE_* gerekmez. Hesap katmanı (cloud.ts, Account.tsx, mevcut migration) ve canlı öncesi zorunlu liste (34+33, 35, 41, 27) değişmez. Kurul kararı olmadan bağımlılık/servis eklenmez.
ÇIKTI: Doldurulmuş talep metni (TALEP / NE İÇİN / NEDEN / ALTERNATİF / VERİ AKIŞI / MALİYET-LİSANS, her iddia bağlantılı). Uygulandıysa ORTAK ÇIKTI + YH-6 "Kabul ölçütü" 1-4 kanıtı.
DURMA ŞARTI: Talep açıldıktan sonra kurul kararı gelene kadar kod yazma. Kullanıcı ayrı proje açmadıysa (b)'yi uygulama. Vercel Cron/Supabase kotası kanıtlanamıyorsa "doğrulanamadı" yaz, uydurma.
```

### 3.5 YH-7 · Eski panellerin motora dönüşmesi (panel panel)

Tek istem şablonu; `<ALT>` yerine aşağıdaki tablodaki satır konur. Önerilen gruplama (koşu başına 3–4 kalem): **Koşu A** (yalnız YH-2'ye bağlı): 7.1, 7.4, 7.7, 7.8 · **Koşu B** (YH-3 sonrası): 7.2, 7.3, 7.9 · **Koşu C** (YH-4 sonrası): 7.5, 7.6.

```
BAĞLAM: FAGENT. Yol haritası adımı YH-7 (docs/yol-haritasi-birlesik.md "## YH-7" genel kural + "YH-7 ortak alanlar" + ilgili alt bölüm <ALT>).
GÖREV: <ALT> alt bölümündeki motoru src/motor/<ad>.ts olarak saf modül yaz; mevcut fonksiyonları TAŞIMA, yeniden dışa aktar; ekran değişmez.
OKU: ORTAK OKU + .claude/skills/app-tsx-haritasi/SKILL.md 11-35 · .claude/skills/veri-akisi-haritasi/SKILL.md 6-26 · alt bölümde adı geçen dosya:satır'lar (grep ile doğrula) · YH-2 projeksiyon girdi sözleşmesi.
KISITLAR: ORTAK + Motor saf: React, window, ağ yok (AGENTS.md §0.6). analytics.ts ve agent.ts aynı adlarla kalır; store.ts API'si, bileşenler ve e2e seçicileri değişmez. Ekrandaki hiçbir sayı değişmez.
ÇIKTI: ORTAK ÇIKTI + motorun girdi/çıktı tipi; her dışa aktarılan fonksiyon için birim test adı; "ekranda sayı değişmedi" kanıtı (ilgili e2e kontrolleri yeşil).
DURMA ŞARTI: Alt bölüm çıktısı YH-2 sözleşmesiyle uyuşmuyorsa sözleşmeyi değiştirme, dur ve raporla. Bir e2e seçicisini değiştirmek gerekiyorsa dur (bu adımda ekran değişmez).
```

| Alt | Motor | Ön koşul | Özel kabul |
|---|---|---|---|
| 7.1 | `motor/degerleme` | YH-2 | Panel toplam/maliyet/K/Z aynı |
| 7.2 | `motor/fiyat` | YH-3 (BİST kısmı YH-5) | Kripto "fiyatı yenile" eskisi gibi; yanında kaynak/tarih |
| 7.3 | `kaynaklar/coingecko` (yalnız önbellek) | YH-3 | Portföyde kripto yokken coin tablosu isteği yok (YH-8 sonrası ölçülür) |
| 7.4 | `motor/defter` | YH-2 | Gerçekleşen K/Z eskisiyle aynı; "deftere kayıt" dili korunur |
| 7.5 | `motor/olaylar` | YH-4 (KAP kısmı) | Bugün eklenen alış olaylar listesinde |
| 7.6 | `motor/icgoru` | YH-3 | 9 tavsiye kalıbı taraması dokunulmaz; enflasyon cümlesinde kaynak + tarih |
| 7.7 | `motor/vergi` | YH-2 | Vergi kartı değeri aynı; `dogrulanmadi` işareti geçer |
| 7.8 | `motor/enflasyon` | YH-3 tip sözleşmesi | Elle enflasyon "senin girdin" etiketi; kalıcılık kararı açık (değiştirme) |
| 7.9 | `motor/risk` | YH-3 | Risk kartı sayıları aynı; Aşama B girdisi YALNIZ onay sonrası |

### 3.6 YH-8 · Menüyü ve eski sekmeleri kaldırma (EN SON)

```
BAĞLAM: FAGENT. Yol haritası adımı YH-8 (docs/yol-haritasi-birlesik.md "## YH-8" ve "## 11. Tasarım oturumuna devir notu"). Tek ekran: Projeksiyon + giriş çekmecesi. Görünüm kullanıcının tasarımından gelir.
GÖREV: YH-8 "Yapılacaklar" 1-2: kullanıcının tasarımını BAYRAK ARKASINDA ekle (bayrak kapalıyken eski arayüz birebir); eski her e2e kontrolü için eşleme tablosu (hangi kontrol nereye taşınıyor). Madde 3 (bayrağı varsayılan açmak) ve eski sekme kaldırma AYRI onayla yapılır.
OKU: ORTAK OKU + .claude/skills/app-tsx-haritasi/SKILL.md 11-35 · .claude/skills/hareket-kurallari/SKILL.md 8-26 · kullanıcının tasarım dosyaları (docs/tasarim/ altında kullanıcının belirttiği dosya) · grep -rln side-link tests/e2e.
KISITLAR: ORTAK + Bu istem görünümü DEĞİŞTİRİR ama yalnız kullanıcının tasarımıyla; ajan kendi görsel kararını eklemez. Hesap ekranı ve fagent-auth-e2e beyaz liste kontrolleri dokunulmaz. "Yatırım tavsiyesi değildir" uyarısı ekranda. Kontrol sayısı ≥ önceki; eşleme tablosunda boş satır yok. K1/K4 kararları dışına çıkılmaz.
ÇIKTI: ORTAK ÇIKTI + eşleme tablosu (eski kontrol → yeni yer) + eski/yeni kontrol sayısı + 375px ve 1440px ekran görüntüleri (insan incelemesi kullanıcıda).
DURMA ŞARTI: YH-7 bitmediyse, tasarım dosyası yoksa ya da K1/K4 kararı verilmediyse BAŞLAMA. Bir eski kontrolün karşılığı bulunamıyorsa silme, dur ve raporla.
```

### 3.7 Yapay zekâ yorumu — uygulanabilirlik denemesi (yol haritası dışı)

```
BAĞLAM: FAGENT. Üst Kurul KOŞULLU ONAY: yalnız cihazda çalışan açık kaynak küçük dil modeliyle uygulanabilirlik denemesi; ürüne girmez (docs/teknoloji-talepleri.md 2026-10-27 satırı; CLAUDE.md → "YAPAY ZEKÂ YORUMU").
GÖREV: Talepteki deneme ölçütlerini (bellek ≤2 GB, 40 sentetik senaryo, sayı doğrulaması ≥%95, yasak kalıp %0, Türkçe okur puanı ≥4) ölçen ayrı bir deneme düzeneği kur ve sonucu raporla. Ölçütlerden biri tutmazsa sonuç RED.
OKU: ORTAK OKU + docs/teknoloji-talepleri.md (tek satır, koşulların tamamı) · docs/ust-kurul.md · src/agent.ts tavsiye kalıbı taraması ve foldTr (grep -n foldTr) · .claude/skills/turkce-regex/SKILL.md 6-13.
KISITLAR: ORTAK + Deneme dosyaları üretim paketine GİRMEZ (public/ ve src/ dışında; dist taramasıyla kanıtla). Yalnız talepte adı geçen kütüphane/model, sürüm sabit + SHA-256 (ağırlıklar dâhil); raw.githubusercontent/main yasak; yalnız Apache/MIT model. Senaryolar sentetik ve "sentetik" etiketli; gerçek portföy kullanılmaz. Çıktıdaki her sayı girdide olmalı, ihlalde çıktı atılır. Ajan sekmesi kural tabanlı kalır. Ürün CSP'si bu denemede değişmez.
ÇIKTI: Ölçüt başına sayı + kanıt (komut çıktısı); tavsiye filtresinin yakaladığı örnekler; sabitlenen sürümler ve SHA-256 listesi; KABUL/RED önerisi. "Okur puanı" insan değerlendirmesi gerektirir: kullanıcı için puanlama formu hazırla, puanı uydurma.
DURMA ŞARTI: Kullanıcının açık "başla" onayı CLAUDE.md ya da karar günlüğünde yoksa BAŞLAMA. Model dosyası bu ortamdan indirilemiyorsa ya da tarayıcıda WebGPU/WASM yoksa dur ve "doğrulanamadı" yaz (bu ortamın ağ erişimi kısıtlı). Talepte olmayan bir paket gerekirse yeni talep aç, ekleme.
```

### 3.8 Uyumluluk açıklama sayfası (devir; yol haritası dışı)

```
BAĞLAM: FAGENT. Karar: hukuk/uyum yükü alıcıya devredilir; "yükümlülükler sağlandı" beyan edilmez; devir paketine "Uyumluluk durumu ve açık maddeler" sayfası eklenir (CLAUDE.md → "HUKUK/UYUM YÜKÜ ALICIYA DEVİR").
GÖREV: docs/devir/uyumluluk-durumu.md yaz: her açık madde için (konu, nerede: dosya:satır, bugünkü durum, canlıda açık mı kapalı mı, kim karar verir, kaynak). Ayrıca docs/devir/kurulum-ve-devir.md ve ilan-taslagi.md'den bu sayfaya bağlantı.
OKU: ORTAK OKU + .claude/skills/belge-kod-tutarliligi/SKILL.md 8-22 · grep -rn "TODO(hukuk)\|TODO(muhasebe)" src api netlify scripts (27.10'da src altında 11 dosyada işaret vardı) · docs/yasal/* (README, aydinlatma-kvkk, kullanim-kosullari, yatirim-tavsiyesi-degildir) · docs/teknoloji-talepleri.md · docs/veri-akisi/mevcut-durum-ve-plan.md §5 "TODO(hukuk) adayları".
KISITLAR: ORTAK + Hukuki hüküm verilmez ("uygundur/uygun değildir" yazılmaz); her madde "açık" ya da "kapalı (kanıt)" olur. Kapalı/kapalı tutulan özellikler açıkça yazılır: canlıda hesap, ödeme, kazıma, yapay zekâ yorumu KAPALI. Kod değişmez.
ÇIKTI: Sayfa + her TODO işaretinin sayfada karşılığı olduğunu gösteren grep eşlemesi (işaret sayısı = sayfadaki satır sayısı ya da fark gerekçeli).
DURMA ŞARTI: Bir maddenin canlıda açık mı kapalı mı olduğu kodda kanıtlanamıyorsa "doğrulanamadı" yaz; tahmin etme.
```

### 3.9 Birim test kapsamı: `src/analytics.ts` (yol haritası dışı)

```
BAĞLAM: FAGENT. src/analytics.ts saf hesap modülü (AGENTS.md §0.6); 27 dışa aktarılan fonksiyon, yalnız 4'ünün birim testi var (tests/unit/hesap.test.ts: realReturnPct, xirr, afterTaxOf, driftBandOf). Faz planı 2.1 (#21 Fisher/XIRR/HHI) bu işin içinde kapanır.
GÖREV: Testi olmayan 23 fonksiyonun her biri için en az bir birim testi + sınır durumu (boş portföy, sıfır maliyet, tek değer, negatif değer) ekle. Beklenen değerler elle hesaplanır ve test içinde nasıl hesaplandığı tek satır yorumla yazılır.
OKU: ORTAK OKU + grep -n "^export function" src/analytics.ts · tests/unit/hesap.test.ts (düzen örneği) · .claude/skills/veri-akisi-haritasi/SKILL.md (Node .ts test notu).
KISITLAR: ORTAK + src/analytics.ts DEĞİŞMEZ (yalnız test). Test bir hata gösterirse kodu düzeltme; bulgu olarak raporla. Formül iddiaları (Sharpe, Sortino, HHI, maks. düşüş) kaynakla (ders kitabı/standart bağlantısı). Yeni test paketi yok (node:test).
ÇIKTI: Fonksiyon → test adı tablosu (27 satır, boş satır yok); npm run test:unit çıktısı; bulunan hata adayları (dosya:satır).
DURMA ŞARTI: Bir fonksiyonun beklenen davranışı koddan ve belgeden çıkarılamıyorsa testi yazma, soru olarak listele.
```

## 4. Sizin yapacaklarınız

| # | İş | Neden gerekli | Neyi bloklar |
|---|---|---|---|
| 1 | **EVDS anahtarı** Vercel `fagent` projesine `EVDS_API_KEY` olarak eklensin (27.10 kontrolünde projede hiç ortam değişkeni yoktu; eski Netlify/başka projede olabilir) | Enflasyon ve kurun resmî kaynaktan gelmesi; seri kodlarının gerçek yanıtla doğrulanması | YH-3'ün bitmesi (çatı anahtarsız başlayabilir); YH-7.6/7.8'in "resmî" etiketi |
| 2 | **`AGENTS.md` §0.4 onayı** (öneri metin: yol haritası §13) | Bugünkü kural "BİST fiyatı elle girilir" diyor; ajanlar bu kuralı değiştiremez | YH-5'in tamamı |
| 3 | **Yapay zekâ denemesi için "başla"** | Kapsam kararı denemeyi kapsamıyor; Üst Kurul onayı koşullu | §3.7 denemesi (yol haritası dışı) |
| 4 | **Monte Carlo (Aşama B) kararı** (`docs/projeksiyon/gelismis-model-plani.md` (g) K1) | "Rassal yürüyüş" ertelemesiyle çelişebilir; sizin yorumunuz gerekir | Yol haritası dışı projeksiyon işleri (plan (f) 7–9); YH-7.9'un projeksiyona girdi vermesi |
| 5 | **BİST kaynak sayfası kararı** (uyum rolüyle birlikte) | Hangi sayfadan çekileceği belirlenmedi; koşulları okunmadan kazıma yapılmaz | YH-5 |
| 6 | **Tasarım oturumu** (yol haritası §11 veri yuvalarıyla) + K1 (çekmece/ajan sohbeti) ve K4 (eski sekmeler) kararları | Görünüm sizde; ajanlar görsel karar vermez | YH-8 |
| 7 | **Avukat** (EVDS şartları, KAP yasal metni, Borsa İstanbul veri yayını, SPK açısından yorum/listeleme, KVKK) | Kazıma ve yapay zekâ yorumunun hukuki durumu bilinmiyor; isterseniz alıcıya devredilen açık madde olarak kalır | Canlıda kazıma/YZ açılması; YH-4/5'te hızlı ilerleme (karar sizin) |
| 8 | **İki adımlı doğrulama (2FA)**: GitHub, Vercel, Supabase (ve alan adı kayıt) hesaplarında | Hesap ele geçirilirse kod/yayın/veri riski; devirde alıcı güvenli hesap bekler | Yayın ve devir (yol haritası adımını bloklamaz) |
| 9 | **Alan adı** | Yayın ve devir paketi için | Yayın (altyapı testinizden sonra) |
| 10 | Ayrı Supabase projesi (yalnız piyasa verisi; K3 kabul edilirse) | Paylaşılan önbellek hesap projesinden ayrı olmalı | YH-6 (b) seçeneği |
| 11 | Her adımın "Elle denetim" listesini işaretlemek | İşaretlenmemiş adım bir sonrakine geçmez (yol haritası §13) | Her adım |
| 12 | `CLAUDE.md` eski satırlarının temizliği için onay | Eski satırlar ajanları yanlış yönlendirebilir (ör. 2026-10-18 doğrulama sayısı, 10-25 kapsam cümlesi) | Doğrudan bloklamaz; hata riskini azaltır |

## 5. Açık riskler ve doğrulanamayanlar

**Gerçek ağda doğrulanmayanlar (hepsi taklit yanıtla sınandı):**
- EVDS: anahtar yok; `TP.FG.J0` seri kodu, kur seri kodları, istek kotası, evds2 → evds3 geçişi doğrulanmadı.
- CoinGecko ve Frankfurter: bu ortamdan gerçek yanıt alınmadı.
- KAP iç uçları ve BİST kaynak sayfası: adres, biçim, kararlılık bilinmiyor; 27.10'da `kap.org.tr`, `borsaistanbul.com`, `tcmb.gov.tr` erişimi vekil sunucuca reddedildi. Vercel IP'lerinin engellenip engellenmeyeceği bilinmiyor.
- Supabase: RLS, `delete_my_account`, e-posta yönlendirmeleri gerçek projede sınanmadı ("sahte Supabase ile yeşil").
- Vercel Cron sıklığı, Supabase ücretsiz katman kotası, maliyet.
- Yapay zekâ modeli: Hugging Face model kartları bu ortamdan doğrulanamadı; tarayıcıda WebGPU desteği ölçülmedi.

**Hukuki:**
- KAP ve BİST kazıması: kullanım koşullarına uygunluk, lisans/izin gereği, yeniden yayın ve ücretli üründe gösterim belirsiz (`TODO(hukuk)`). BİST verisi lisanslı dağıtıcılar üzerinden yayılıyor; lisanssız gösterim en yüksek risk.
- Portföye göre bildirim/yorum listelemenin SPK açısından danışmanlık sayılıp sayılmadığı belirsiz. "Yorum bizi sorumlu tutmaz" varsayımı doğrulanmadı.
- Vergi/stopaj oranları ve senaryo getirileri doğrulanmadı (`TODO(muhasebe)`, kaynaksız varsayım).
- Yasal metinler (`docs/yasal/`) taslak; avukat onayı yok.

**Tarayıcı ve veri:**
- IndexedDB kota ve tahliye davranışı gerçek cihazlarda sınanmadı; Safari ve Firefox denenmedi (ortamda yalnız Chromium).
- IndexedDB silme mantıksaldır; fiziksel silme tarayıcıya bağlı (gizlilik notu taslakta).
- Çok sekmeli yarış: bir sekmede SIFIRLA yapılırken diğer sekme aynayı yeniden doldurabilir; canlı eşitleme yok.
- Asıl okuma hâlâ localStorage'da; IndexedDB'ye geçiş yapılmadı.
- Hesap katmanı canlı öncesi zorunlu liste (34+33, 35, 41, 27, 47) açık; bu yüzden canlıda hesap kapalı kalmalı.

**Süreç:**
- YH-2 çalışma ağacında incelenmemiş durumda; dosya adı `src/projection.ts`, yol haritası `src/projeksiyon.ts` diyor (inceleme sırasında netleşmeli).
- Son e2e sayısı iki kayıtta farklı (735 / 732); bir sonraki kapı koşusu doğrulayacak.
- Üst Kurul kapısı henüz bir koşuda zorunlu aşama olarak denenmedi (istem kuralı olarak duruyor).
