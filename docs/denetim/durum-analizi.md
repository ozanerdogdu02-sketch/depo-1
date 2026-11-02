# FAGENT — Durum analizi (2026-11-02)

> Yazan: yönetmen. Kod değişikliği yok, commit yok. Dayanak: `docs/veri-akisi/veri-yolculugu.json`
> (çalışma ağacı sürümü), `git log` (son 40 commit), commit mesajları, `.claude/agents/*.md`,
> `.claude/workflows/fagent-ekip.js`, `tests/`. İnceleme turu sayıları liderin kaydından alındı;
> git'te her iş tek commit olduğu için **tur sayıları git'ten doğrulanamaz**, yalnız iş sırası ve
> test sayıları commit mesajlarıyla çapraz kontrol edildi.

## Sonuç önce

- 54 sahneden **29 yeşil, 14 sarı, 11 mor**. Bu hafta **5 sahne yeşile döndü** (A6, A7, A8, A10, A14),
  2 sahne morda sarıya geçti (A17, B11).
- Sarı/morların çoğu **kod eksiği değil, dış bekleme**: EVDS anahtarı (kullanıcı), gerçek Supabase
  (adım 5), tasarım ekranı (kullanıcı), hukuk (en sona). **Kodla şimdi kapatılabilecekler:** B12 BİST
  (çalışma ağacında yarım, commit'siz), B13 paylaşılan önbellek, CoinGecko/Frankfurter'ı ortak
  çalıştırıcıya alma + CSP daraltma, CI eksikleri (C3).
- Motorların hepsi **taklitle yeşil**; hiçbiri gerçek ağda/gerçek Supabase'de doğrulanmadı.
- İnceleme deseni net: **veri kaybı ve eşzamanlılık** işleri 3–4 güvenlik turu istiyor; **kalıbı
  önceden oturmuş sunucu bağdaştırıcısı** (KAP) ilk turda geçti.
- Zero trust kodda kilitli (lider "olur" dese de açık bulgu/kırmızı test birleştirmeyi durdurur);
  zayıf nokta: aynı model ailesi yazıp inceliyor ve gerçek ortam testi yok.
- **Dikkat:** yeni kurala göre `docs/denetim/bolum-A-denetim.md` gerekiyor ve **henüz yok**
  (`docs/denetim/` boş). B12'nin commit'inden önce bu açılmalı (bkz. §5).

---

## 1) Sarı ve mor sahneler

Neden türleri: **KOD** = ekip yazabilir · **ANAHTAR** = EVDS_API_KEY · **SUPA** = gerçek Supabase
(adım 5) · **TASARIM** = ekran kullanıcıda · **HUKUK** = en sona · **KARAR** = kullanıcı onayı.
Büyüklük: K (≤1 gün ajan işi), O (1 koşu), B (birden çok koşu).

### 1a. Kod ve veri alımı/kullanımı (öncelikli)

| Sahne | Durum | Neden bitmedi | Sonraki somut adım | Sahip | Büy. |
|---|---|---|---|---|---|
| **B12** BİST gün sonu fiyatı | MOR (json) | KOD. Çalışma ağacında `api/bist.mjs`, `netlify/functions/bist.mjs` (251 satır), `src/kaynaklar/bist.ts` (173 satır) **izlenmeyen, incelenmemiş** dosyalar olarak duruyor; json hâlâ "henüz yok" diyor | A denetimi → ekip kapısı + güvenlik + uyum → json'u KISMEN yap. Kapanış dosya adı bulunamadı (`kap-bist-erisim.md:124`), gerçek yanıtla doğrulanamaz | ekip | O |
| **B11** KAP bildirimleri | SARI | Kod var (sunucu + istemci, varsayılan kapalı), **ekrana bağlı değil**, gerçek KAP yanıtıyla doğrulanmadı (U4). Çalışma ağacında ortak modüle ek değişiklik var (commit'siz) | Çalışma ağacı farkını B12 ile aynı kapıdan geçir; ekran bağlaması tasarım sonrası | ekip / TASARIM | K |
| **B8** Kur | SARI | ANAHTAR + KOD. Kur bugün Frankfurter'dan; TCMB yolu hazır ama seri kodu doğrulanmadığı için tablo bilerek boş | Kullanıcı anahtarı ekler → seri kodları gerçek yanıtla doğrulanır → Frankfurter bağlantısı kaldırılır (karar: otomatik yedek yok) | kullanıcı → ekip | O |
| **B7** EVDS anahtarı yönetimi | MOR | ANAHTAR. Vercel `fagent` projesinde değişken yok (27.10 kontrolü) | Kullanıcı `EVDS_API_KEY` ekler; `TP.FG.J0` gerçek veriyle doğrulanır | kullanıcı | K |
| **B6** Durum metinleri, "eski veri hesapta kullanılmaz" | SARI | TASARIM. Kural kodda ve testli; metin ekranda yok. Ayrıca CoinGecko/Frankfurter ortak çalıştırıcıya taşınmadı, CSP `connect-src` daraltılmadı | **Şimdi yapılabilir:** CoinGecko'yu ortak çalıştırıcıya al + CSP daraltma (kod). Ekran bağlaması tasarımdan sonra | ekip / TASARIM | O |
| **B13** Paylaşılan herkese açık veri önbelleği | MOR | KOD + SUPA. Depo yok; bugün yalnız CDN `s-maxage` | Önce tasarım notu (hangi tablo, yalnız herkese açık veri, yazma yetkisi yalnız sunucu); yeni depo/servis gerekiyorsa Üst Kurul talebi | ekip / Üst Kurul | B |
| **A9** Projeksiyon motoru | SARI | TASARIM + KARAR. Motor saf ve testli (29 birim), yeni fonksiyonların çoğu ekranda değil; Monte Carlo ayrı onay bekliyor | PDF ekranına bağlama (YH-7 yeniden tanımı); Monte Carlo için kullanıcı kararı | TASARIM / kullanıcı | O |
| **A16** Hesap ve bulut | SARI | SUPA + HUKUK. Kod hazır, canlıda bilerek kapalı; gerçek RLS/hesap silme/e-posta denenmedi; KVKK metni (47) en sonda | Adım 5: gerçek proje, migration, iki kullanıcıyla deneme | kullanıcı + ekip | B |
| **A17** Bulut canlı-öncesi maddeler | SARI | SUPA. 34+33, 35, 41 kapandı; **27**'nin migration'ı hiçbir veritabanına uygulanmadı | Adım 5'te açık onayla uygula, iki istemciyle doğrula | kullanıcı + ekip | O |

### 1b. Süreç, yayın, hukuk, satış

| Sahne | Durum | Neden | Sonraki adım | Sahip | Büy. |
|---|---|---|---|---|---|
| C3 Kapı komutları | SARI | KOD. CI Node 20 kuruyor (`engines >=22.18`), CI'da `test:unit` yok, aksiyonlar SHA ile sabit değil | `ci.yml` düzeltmesi (küçük ekip işi) | ekip | K |
| C7 Üst Kurul | SARI | Süreç bir koşuda ölçülmedi | Bir sonraki yeni bağımlılıkta kayıtla dene | yönetmen | K |
| C8 Kullanım sınırı | SARI | 4 kez yarıda kesilme (aşağıda) | İş kalemlerini küçült; her kalem sonunda yama yedeği | lider | K |
| D1 Vercel önizleme/üretim | SARI | KARAR. Önizleme başlıkları 24.10'da elle görüldü; üretim hâlâ eski maket | Üretime geçiş en sonda (alan adından sonra) | kullanıcı | K |
| D2 Alan adı | MOR | KARAR | Bitiş sırasına göre test sonrası | kullanıcı | K |
| D3 MVP kapısı | MOR | KARAR. `docs/mvp-tanimi.md` yok | Taslak yaz, PDF ekranlarından hangisi ilk sürümde açık kullanıcıya sor | yönetmen → kullanıcı | K |
| D4 CHANGELOG | MOR | KOD (belge) | `CHANGELOG.md` başlat (commit'lerden) | ekip | K |
| D5 Kullanıcının altyapı testi | MOR | Kullanıcı işi | Elle deneme listesi hazırla | yönetmen → kullanıcı | K |
| D6 Bağımlılık güncelleme | SARI | Yazılı kural yok, Dependabot yok | Kural belgesi (Üst Kurul'a Dependabot talebi) | ekip | K |
| E2 KVKK/SPK/ETBİS devri | SARI | HUKUK (en sona) | — | kullanıcı | — |
| E4 Cihazda YZ yorumu | MOR | KARAR ("başla" onayı yok) | Onay gelirse uygulanabilirlik denemesi | kullanıcı | B |
| E5 Uyumluluk açık maddeler sayfası | MOR | HUKUK ama yazımı KOD-dışı belge | Listeyi `TODO(hukuk)` işaretlerinden derle (hukuk yorumu yok, yalnız envanter) | ekip | K |
| F1 Devir belgeleri | SARI | Sürekli eskiyor | Her bölüm sonunda tutarlılık grep'i | ekip | K |
| F2 Acquire ilanı + gelir | MOR | Gelir yok | Adım 9'dan sonra | kullanıcı | — |
| F3 Devir paketi klasörü | MOR | KOD. `scripts/paket-olustur.sh` yok | Dışlama listesi testli betik (özel prompt dizini ve `.env*` asla girmez) | ekip | O |
| F4 Hesap devri listesi | SARI | Hesaplar henüz yok | Adım 10 | kullanıcı | K |

---

## 2) "Model" performansı

### 2a. Veri ve hesap motorları

Birim test sayısı: `grep -c 'test('` (çalışma ağacı; toplam **323**, son doğrulanmış koşu commit
`e4f8865`'te **314**; fark çalışma ağacındaki commit'siz KAP testleri + grep'in yorum satırlarını da
sayması). e2e sayısı: dosyadaki yazılı `check(` çağrısı; döngüler nedeniyle çalışma anındaki sayı daha
yüksek (son koşu **884/884**, sahte Supabase ile yeşil).

| Motor | Kod | Birim | e2e (`check(`) | Gerçek ortamda | Bilinen açık |
|---|---|---|---|---|---|
| Yerel depo + IndexedDB ayna (YH-1, A7, A14) | var | depolama 87 | depolama 38, yazma 31, yedek 32 | **hayır** — kota `setItem` hatası taklit edildi | Dolu depoda bekleyen değer yalnız bellekte (yenilenirse kaybolur, uyarı var); okuma hâlâ localStorage'dan; IndexedDB kotası gerçek cihazda denenmedi; aynı milisaniyede iki kayıt aynı kimliği alabilir |
| Kurtarma (A6) | var, ekranı yok | sekme-kurtarma 41 (A8 ile ortak) | — | hayır | Kullanıcıya görünür bildirim yok |
| Sekme eşitleme (A8, #35a) | var | sekme-kurtarma 41 | sekme 35 | hayır (tek tarayıcı, Playwright) | Silme işareti ömrü 30 sn — yavaş sekmede sınır durumu |
| Karantina + bulut (A16/A17) | var, canlıda kapalı | karantina 26 | auth 178 | **taklit Supabase** | Migration 27 uygulanmadı (son yazan kazanır); oturum kendiliğinden düşerken yer yoksa veri silinir |
| Projeksiyon (YH-2) | var, kısmen ekranda | projeksiyon 29, hesap 9 | projection 12, hedef 41 | yerel hesap; gerçek dış girdi yok | Yeni fonksiyonlar ekranda değil; Monte Carlo onay bekliyor |
| Vergi/varsayım kuralları (A10) | var | vergi-kuralları 11, varsayımlar 9, kullanıcı oranı 5 | vergi 35 | — | Hiçbir oran muhasebeciden geçmedi (`dogrulandi:false`); %17,5 ve %30 birincil kaynaksız |
| TCMB/EVDS bağdaştırıcısı (YH-3) | var, anahtarsız 503 | kaynaklar 41, evds-sunucu 24 | evds 26, live 16 | **hayır** (anahtar yok); Vercel'de anahtarsız 503 görüldü | Seri kodları doğrulanmadı, kur tablosu boş; hız sınırı/devre kesici örnek başına bellekte (en iyi çaba) |
| KAP bağdaştırıcısı (B11) | var, varsayılan kapalı | kap-sunucu 29, kap-istemci 12 | — | **hayır**; fikstürler kütüphane kodundan türetildi | Ekranda yok; gerçek yanıt (U4) bekliyor |
| Ortak sunucu modülü (`netlify/ortak/sunucu-ortak.mjs`) | var (EVDS'ten taşındı) | EVDS + KAP sunucu testleri üzerinden | — | hayır | Çalışma ağacında +53 satır commit'siz değişiklik (B12 için) |
| BİST (B12) | **yarım, izlenmeyen** | yok | yok | hayır | İncelenmedi; yama yedeğine ya da kapıya alınmalı |

Test büyümesi (commit mesajlarından): birim 117 → 181 → 194 → 234 → 257 → 281 → 314; e2e 735 → 736 →
767 → 804 → 804 → 883 → 884. Kontrol sayısı hiç azalmadı.

### 2b. Ajan ekibi ve yapay zekâ modelleri

Rol → model (ön bilgi `model:` + iş akışı `VARSAYILAN_MODELLER`):

| Rol / adım | Model / çaba | Yetki |
|---|---|---|
| Ürün lideri (plan, karar) | Opus / orta | Read, Grep, Glob, Bash — dosya yazamaz |
| Güvenlik (danışma, erişim ve istemci incelemesi) | **Opus / max** | yazamaz |
| Uyum (danışma, inceleme) | Sonnet / düşük | yazamaz |
| Veri akışı (uygulama) | Sonnet / yüksek | yazar |
| Veri akışı (inceleme) | Sonnet / orta | — |
| Tasarım | Sonnet | yazar |
| Test (yaz-koş / yeniden koş) | Sonnet düşük / **Haiku** düşük | yazar |
| Üst Kurul, Yönetmen | Opus | yazamaz; web araştırır |

İnceleme turları (liderin kaydı) ve git karşılığı:

| İş | Commit | Güvenlik turu | Uyum turu | Bulgu niteliği |
|---|---|---|---|---|
| YH-1 P3 bağlama | `d13471f` | **4** | 2 | Her turda gerçek veri kaybı yolu |
| A7 + A14 | `0293fca` | 3 | 1 | Kota/geri yükleme (veri kaybı) |
| A8 + A6 | `8da5bfa` | 3 | 1 | Eşzamanlılık (iki sekme) |
| YH-3 EVDS | `0a8a9bb` | 3 | 2 | Sahtelenebilir IP, devre kesici, girdi sınırları (O1/O2 + D1–D6) |
| A10 | `a247359` | 1 (onay + O1) | 1 | Kural dosyası; tek orta bulgu |
| A16 / A17 | `4cc64e5` | 1 (koşullu, O1–O3) | 1 | Karantina/sürüm |
| B11 KAP | `e4f8865` | 1 (onay) | 1 (onay) | Temiz |

Diğer olaylar: kullanım sınırına **4 kez** takılma (ajanlar yarıda kesildi; C8 sarı bu yüzden);
**1** `pkill` ihlali (EKİP HAFIZASI'na 2026-10-31 satırı olarak yazıldı); **1** rapor sayısı hatası
(ajan 167 dedi, gerçek 281 — `4cc64e5` mesajı 281 diyor).

**Çıkarım**
- **Çok tur isteyenler:** durum tutan, iki yazarın aynı veriye dokunduğu işler (yerel depo + ayna,
  kota, sekmeler arası, geri yükleme). Sonnet'in yazdığı kodda Opus/max güvenlik her turda yeni bir
  kaybolma yolu buldu; yani ilk sürümde sınır durumları (yarım yazma, sıra, çift sekme) eksik kalıyor.
- **İlk turda geçenler:** saf veri/kural (A10) ve **önceden oturmuş kalıbı yeniden kullanan** iş (KAP,
  EVDS'in 3 turda sertleşen ortak sunucu modülünü kullandı). Öğrenilen ders koda (ortak modül) ve skill'e
  taşınınca tur sayısı düşüyor.
- **Uyum turu az ve hep 1–2:** uyum Sonnet/düşük çabada; az bulgu iyi kod demek olabilir, düşük çaba da
  olabilir — ayırt edecek veri yok.
- **Haiku/Sonnet test adımı sayı yanlış raporladı** (167/281): sayı iddiaları lider tarafından yeniden
  koşulmadan kabul edilmemeli (bkz. §4).

---

## 3) Yeşile dönenler ve sürekli güncellenen akışlar

Bu hafta (commit `5c5b7d0` → `HEAD`) yeşile dönen sahneler:

| Sahne | Commit | Ne kapandı |
|---|---|---|
| A7 Depolama dolu uyarısı | `0293fca` | Yazma hatası yakalanır, değer bekletilir, uyarı + `beforeunload` |
| A14 Atomik geri yükleme (#41) | `0293fca` | ~10 MB sınırı, anlık görüntü, iki turlu geri alma |
| A6 Kurtarma işlevleri | `8da5bfa` | Listele/oku/dışa aktar/geri yükle |
| A8 Sekme eşitleme (#35a) | `8da5bfa` | Başka sekmede SIFIRLA'da silme kazanır |
| A10 Vergi/varsayım kuralları | `a247359` | Tarih aralıklı JSON, çakışma/boşluk doğrulayıcı |

Morda sarıya: A17 (`4cc64e5`, 34+33/35b/35c kapandı, 27 yalnız istemci), B11 (`e4f8865`).

Her adımda güncellenen dosyalar ve nedeni:

| Dosya | Neden her adımda |
|---|---|
| `docs/veri-akisi/veri-yolculugu.json` | Sahne durumu, kod/test bağları ve "açık" listesi tek kaynak; simülasyon sayfası buradan üretiliyor |
| `CLAUDE.md` canlı-öncesi liste | Supabase'in canlıda açılma koşulu; kapanan madde üstü çizilir |
| `docs/yol-haritasi-birlesik.md` | YH adımının "Yapıldı" ve kapı sonucu |
| `docs/devir/kurulum-ve-devir.md` | Yeni ortam değişkeni/bayrak (ör. `FAGENT_KAZIMA`) alıcıya yazılmalı |
| README / `entegrasyonlar.md` | Kaynak davranışı değişince eski cümleler yanlış olur (YH-3'te 3 eskimiş satır bulundu) |
| `.claude/skills/veri-akisi-haritasi/SKILL.md` | Ajanların dar okuma yapması için harita |
| `netlify/ortak/sunucu-ortak.mjs` | Her yeni kaynak (EVDS → KAP → BİST) aynı korumaları buradan alır |

**Eskimiş hafıza (kullanıcı onayıyla düzeltilmeli):** `CLAUDE.md` "DURUM VE SIRADAKİ İŞLER
(2026-10-30)" YH-3'ü "yarım" diyor, oysa `0a8a9bb` ile commit'li; aynı bölüm `veri-yolculugu.md`'yi
"henüz yazılmadı" diyor, dosya `docs/veri-akisi/` altında var. Ajanlar bu bölümü okursa yanlış
başlar.

---

## 4) Ajanlara zero trust

**Nasıl uygulanıyor (kanıtla)**

| İlke | Kanıt |
|---|---|
| Uygulayan ≠ doğrulayan | Veri akışı ajanı yazar; güvenlik, uyum, test ayrı ajanlar; güvenlik/uyum/lider/kurul ön bilgisinde **Edit/Write yok** (`.claude/agents/*.md`) |
| Karar kodla kilitli | `fagent-ekip.js` ~561: açık engelleyici bulgu, eksik zorunlu inceleme ya da kırmızı test varsa lider "birleştirilebilir" dese bile sonuç **birleştirilemez** |
| Bağımsız kapı | typecheck, build, tarama, birim, e2e test ajanında; e2e iki koşuda aynı sonuç istendi (`8da5bfa`, `4cc64e5`: "iki koşuda aynı") |
| Kırmızı/yeşil kanıt | `0293fca`: ayna korumasında "kırmızı/yeşil e2e kanıtı" — koruma kaldırılınca test düşüyor, eklenince geçiyor |
| Liderin yeniden doğrulaması | Kapı ajanı 804 dedi, lider komutla yeniden koştu; ajanın "167" sayısı lider koşusunda 281 çıktı ve commit'e doğru sayı yazıldı |
| Yetki sınırı | Ajan commit/push yapmaz, dal değiştirmez, `.env*` okumaz, süreç yalnız PID ile durdurulur; ihlal (pkill) ekip hafızasına girdi |
| Dürüst dil | "çalışıyor" değil "sahte Supabase ile yeşil"; dış kaynaklar "doğrulanamadı" |
| İncelenmemiş iş dala girmez | Yarım iş yama yedeğine (`/home/user/FAGENT-Raporlar/02-degisiklikler/`) |

**Zayıf noktalar**
1. **Aynı model ailesi** yazıyor ve inceliyor (Sonnet yazar, Opus inceler). Kör noktalar ortak olabilir.
2. **Gerçek ortam yok:** EVDS, KAP, BİST, Supabase, kota, IndexedDB — hepsi taklit. Taklidi ajan yazdığı
   için "sahte sunucu da yanlış olabilir" riski var (KAP fikstürleri kütüphane kodundan türetildi).
3. **Kırmızı kanıt her işte yok:** yalnız bazı korumalarda belgelenmiş; sistemli değil.
4. **Uyum düşük çabada**; az bulgunun nedeni bilinmiyor.
5. **Şu an çalışma ağacında incelenmemiş kod var** (B12 + KAP/ortak modül farkı, 14 değişik + 3 yeni
   dosya). Kurala göre yarım kalırsa yama yedeğine alınmalı.
6. Bölüm A denetim raporu yazılmadı (kural 2026-11-02).

**Önerilen iyileştirmeler** (fikir-defteri biçimi; kabul kullanıcıda)

| Öneri | Gerekçe | Efor | Kural uyumu | Plan adımı |
|---|---|---|---|---|
| Teslim notunda zorunlu "kırmızı kanıt" alanı: korumayı geri al → hangi test düştü (çıktı satırıyla) | 3. zayıflık | K | uyumlu | C2 / her YH |
| Lider her teslimde sayıları kendisi koşar, ajan sayısı yalnız karşılaştırma için | 167/281 olayı | K | uyumlu | C3 |
| Veri kaybı/eşzamanlılık işlerinde güvenliği **iki farklı merceğe** böl (zaten erişim/istemci var) + uyumu bu işlerde orta çabaya çıkar | YH-1'de 4 tur | K (ayar) | uyumlu | C1 |
| Fikstürleri gerçek yanıttan üretme kuralı: anahtar/erişim gelince ilk iş gerçek yanıtı kaydet, taklidi onunla değiştir | 2. zayıflık | O | uyumlu (yalnız herkese açık veri) | YH-3/4/5 |
| Kullanıcının elle deneme listesi (D5) | Gerçek ortam doğrulaması insan gözüyle | K | uyumlu | D5 |
| Farklı aileden ikinci görüş (başka sağlayıcı modeli) | 1. zayıflık | ? | **yeni teknoloji → Üst Kurul**; kod/portföy verisi üçüncü tarafa gider mi incelenmeli | — |

---

## 5) Sonraki 5 adım (B bölümünden devam)

1. **Bölüm A kod denetimi** → `docs/denetim/bolum-A-denetim.md` (veri dışarı çıkışı, kota/taşma,
   eski veri kullanımı, yanlış yollar). Kural gereği B'nin sonraki commit'inden önce. Sahip: ekip
   (güvenlik + veri akışı). Büyüklük: O.
2. **B12 BİST + çalışma ağacındaki KAP/ortak modül farkı:** kapı (typecheck, build, tarama, birim, e2e
   iki koşu) + güvenlik + uyum; json'da B12 → KISMEN. Bitmezse yama yedeğine. Sahip: ekip. O.
3. **B6 kod kısmı:** CoinGecko'yu ortak çalıştırıcıya taşı, CSP `connect-src`'i daralt (Frankfurter
   TCMB gelince kalkacağı için ona dokunma). Sahip: ekip. O.
4. **B13 paylaşılan önbellek tasarım notu** (yalnız herkese açık piyasa verisi; depo seçimi Üst Kurul'a)
   + **C3 CI düzeltmesi** (Node 22, `test:unit` adımı). Sahip: ekip / Üst Kurul. K+K.
5. **Bölüm B sonu denetimi** → `docs/denetim/bolum-B-denetim.md`; paralelde kullanıcıdan
   `EVDS_API_KEY` (B7/B8 açılır). Sahip: ekip / kullanıcı. O.

Kullanıcıdan beklenenler (değişmedi): EVDS anahtarı, Monte Carlo kararı, YZ denemesi "başla", MVP
kapsamı, `CLAUDE.md` eski bölümlerinin temizliğine onay.
