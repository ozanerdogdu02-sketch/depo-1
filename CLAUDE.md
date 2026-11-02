# FAGENT — Proje Hafızası (ürün dalı `urun/birlesik`)

FAGENT, Türk bireysel yatırımcı için API anahtarı gerektirmeyen portföy takip ve analiz
panelidir. Bu dal, üç ayrı sürümü Acquire.com'da satılabilir tek bir ürüne birleştirir.
Kurallar: `AGENTS.md` (önce onu oku). Karar geçmişi: `docs/karar-gunlugu.md`.

## Kaynak dallar (korunur, değiştirilmez)

| Dal | Ne | Bu dala ne alındı |
|---|---|---|
| `yedek/fagent-ana` | En kapsamlı kod — bu dalın temeli | Tamamı (kod köke taşındı) |
| `fagent-standalone` | Ana sürümün eski kopyası + Supabase kayıt/giriş | `src/cloud.ts`, `src/Account.tsx`, migration, auth testi (2. adım) |
| `yedek/canli-site` | fagent.vercel.app'teki Claude Design maketi, örnek veriyle | Yalnızca görsel dil (6. adım) |

## Yapı

- Uygulama repo kökünde: `src/`, `tests/e2e/`, `scripts/`, `public/`, `netlify/functions/`.
- Sekmeler: Panel, Bugün, Hisseler, Fonlar, Kripto, Kripto Piyasası, İşlemler, Projeksiyon, Ajan.
- Ajan sekmesi kural tabanlıdır (`src/agent.ts`), LLM çağırmaz.
- Canlı fiyat yalnızca döviz (Frankfurter) ve kripto (CoinGecko); hisse/fon elle girilir.
- Kalıcı katmanlar `src/backup.ts` → `BACKED_UP_KEYS`.

## Geliştirme planı (onaylandı)

1. ✅ Repoyu satışa uygun hale getir — kök dizine taşıma, kişisel dosya/iz temizliği.
2. ✅ Hesap katmanı — standalone'dan Supabase kayıt/giriş + senkronu tüm katmanları kapsayacak şekilde (kod tamam; canlıya açılması aşağıdaki listeye bağlı).
3. ✅ Kural uyumu — işlem komutu "deftere kayıt" dili, `aiAgent` katmanını çıkar, gizlilik metnini güncelle.
4. Vercel'e taşı (güvenlik başlıkları ✅ önizlemede doğrulandı; `api/evds.mjs` Vercel'de çalışıyor ✅ — anahtarsız 503 `anahtar_yok` döndürüyor; KALDI: kullanıcı Vercel'e `EVDS_API_KEY` eklemeli, sonra seri kodu `TP.FG.J0` gerçek veriyle doğrulanacak) — EVDS fonksiyonunu Vercel'e uyarla, seri kodunu doğrula, yedek enflasyon değerini güncelle.
5. Gerçek Supabase projesi — migration, Site URL, özel SMTP, canlıda uçtan uca deneme.
6. Canlı sitenin görünümü — Nocturne görsel dili; Kurulum ve Hedefler ekranları.
7. Yasal metinler — KVKK aydınlatma, kullanım koşulları, tavsiye değildir.
8. **(yeni, 2026-10-19 onaylandı)** Abonelik ve ödeme — ücretsiz + Premium katman, iyzico/PayTR (kart verisi bize gelmez), özellik kilidi, mesafeli satış sözleşmesi. Premium'da da al/sat önerisi ve işlem yürütme yok.
9. **(yeni)** İlk kullanıcılar — tanıtım sayfası, 2–3 ay gerçek gelir (satış fiyatını belirleyen adım).
10. Devir paketi (full paket) — kod, alan adı, Supabase/Vercel/ödeme hesaplarının devri, kurulum/devir dokümanı, gelir kanıtı, gizlilik dostu metrik.

**Araştırma:** A1 1. tur yapıldı (`docs/arastirma/a1-saas-1-tur.md`, hepsi ikincil kaynaklı, doğrulanmalı); A2 tasarım 1. tur yapıldı; A3 pazarlama 1. tur yapıldı (`docs/arastirma/a3-pazarlama-1-tur.md`; öneri: önce organik içerik, ücretli reklam ertelenir). Yasal taslaklar: `docs/yasal/` (avukat onayı şart). Devir kılavuzu: `docs/devir/kurulum-ve-devir.md`.
Tahmini bugünkü değer (gelirsiz, doğrulanmamış): ~1–5 bin $; hedef: ücretli kullanıcıyla 10–50 bin $+.

## KARAR (kullanıcı, 2026-10-27): SUPABASE KODU AÇIK KALIR

Kullanıcı: "Supabase açık olmalı, kod yapılarını görmem için; başlangıç bir veritabanı sistemi, orayı açık bırakmak gerekiyor."
Sonuç: `cloud.ts`, `Account.tsx`, migration ve auth testi repoda KALIR; silinmez, sert kilitle devre dışı bırakılmaz
(plan belgesindeki B "sert kilit" önerisi reddedildi). Env boşken bulut kodu zaten çalışmaz; bu varsayılan kalır.
Canlıda `VITE_SUPABASE_*` tanımlama kararı ayrıdır: canlı-öncesi zorunlu liste (34+33, 35, 41, 27) kapanana kadar tanımlanmaz.
Local-first ilkesiyle uzlaşma: Supabase isteğe bağlı katman olarak durur, varsayılan akış yerel veridir.

## KARARLAR (kullanıcı, 2026-10-27/28): VERİ KAYNAKLARI + TEK EKRAN PROJEKSİYON

- Öneriler kabul: TCMB ve EVDS tek kaynak ("TCMB (EVDS üzerinden)"); kur TCMB'den, Frankfurter otomatik yedek OLMAZ; projeksiyon Aşama A önce (Monte Carlo/Aşama B için ayrı onay, rassal yürüyüş ertelemesiyle çelişki notu planda).
- Kullanıcı KAP ve BİST verisini kazıyarak (scraping) çekmeyi açıkça istedi; "kullanacağımız verilerin hepsini sormadan çekebilmelisin". Uygulama: her kaynak ayrı bağdaştırıcı (`docs/veri-akisi/cok-kaynakli-veri-plani.md`), sunucu tarafı geçiş fonksiyonu, kibar hız sınırı + önbellek, kaynak/tarih etiketi, `TODO(hukuk)` işareti. Kullanıcı verisi bu yollardan GİTMEZ. Kazıma hukuki riski ürün satışında alıcıya açıklanır.
- Büyük veri grupları ayrı veri depolarında tutulabilir (yalnızca herkese açık piyasa verisi, kullanıcı verisi değil; ör. Supabase'de paylaşılan önbellek tablosu). Kullanıcı portföy verisi yerel kalır.
- TASARIM: ekranda yalnızca PROJEKSİYON paneli kalır; diğer panellerin (Panel, Bugün, Hisseler, Fonlar, Kripto, Kripto Piyasası, İşlemler, Ajan) görevleri arka planda motor olarak çalışır ve projeksiyonu besler. Kapsam: altyapı + veri akışı + projeksiyon ekranı.
- EVDS anahtarı: Vercel `fagent` projesinde ortam değişkeni YOK (27.10 kontrol, hiç değişken yok). Kullanıcı eski sürümde kullandığını söyledi; eski Netlify/başka projede olabilir. Kullanıcı eklemeli.

## HEDEF (kullanıcı onayı, 2026-10-28): YOL HARİTASI = ANA HEDEF

`docs/yol-haritasi-birlesik.md` (YH-1…YH-8) projenin güncel hedefidir; çalışma bu sırayla yürür. Tasarım kullanıcıdadır (ayrı oturum).
Bitiş sırası: uygulama son aşamaya gelir → kullanıcı altyapıyı kendisi test eder → alan adı alınır → yayına geçilir (fagent.vercel.app üretime geçişi ve `VITE_SUPABASE_*` kararı da o zaman ele alınır).
Her adım sonunda kapı (typecheck, build, güvenlik taraması, birim, e2e) + güvenlik + uyum incelemesi; yeşil olmadan commit yok.

## YAPAY ZEKÂ YORUMU (2026-10-28): ÜST KURUL KOŞULLU ONAY, DENEME BEKLİYOR

Kullanıcı portföy + piyasa verisi üzerinden LLM yorumu ve açık kaynak model istedi. Üst Kurul (`docs/teknoloji-talepleri.md`): yalnızca CİHAZDA çalışan açık kaynak model (A) koşullu onay, uygulanabilirlik denemesi olarak; sunucuda model (B) ve ticari API (C) RED (portföy verisi sunucuya gidemez). Ajan sekmesi kural tabanlı kalır. "Yorum bizi sorumlu tutmaz" varsayımı DOĞRULANMADI: SPK açısından avukat görüşü canlı öncesi zorunlu. Deneme başlamadan önce kullanıcının açık "başla" onayı beklenir (kapsam kararının deneme için kaldırılması).

## KARAR (kullanıcı, 2026-10-28): HUKUK/UYUM YÜKÜ ALICIYA DEVİR + AÇIKLAMA

Odak: sistemi ve işleyişi kurmak; KVKK/SPK/ETBİS vb. yükümlülükler satış sonrası alıcıda. Çerçeve: (1) satıştan önce canlıda hesap, ödeme, kazıma ve yapay zekâ yorumu KAPALI kalır (kullanıcı verisi toplayan özellik açılırsa veri sorumlusu satıcı olur); (2) "yükümlülükler sağlandı" diye beyan edilmez, devir paketine "Uyumluluk durumu ve açık maddeler" sayfası eklenir (`docs/devir/`; kaynaklar: `TODO(hukuk)/TODO(muhasebe)` işaretleri, `docs/yasal/*`, `docs/teknoloji-talepleri.md`); (3) avukat görüşü alıcıya devredilen açık madde olarak yazılır, istenirse satıştan önce alınır.

## KARAR (kullanıcı, 2026-10-31): ÜRÜN TASARIMI = PDF; MOTORLAR ARKADA

`docs/tasarim/FAGENT_web_sitesi.pdf` Fagent'ın NORMAL ürün tasarımıdır (brüt→net→reel, sekmeli paneller Panel/Grafik/Hisseler/Fonlar/Kripto/Projeksiyon, abonelik planları, SSS, gizlilik kartları). Fagent içinde çalışan veriler ve kontroller bu tasarımın ARKASINDA (backend/motor) çalışır. Bu, 2026-10-27/28'deki "ekranda yalnızca Projeksiyon kalsın" kararının YERİNİ ALIR; YH-7 (paneller motora) "motorlar PDF ekranlarını besler" olarak, YH-8 (kenar çubuğunu kaldırma) PDF tasarımına göre yeniden tanımlanacak. Görsel tasarım kullanıcıda. "Oyun simülasyonu" ayrı bir açıklama sayfasıdır (arka plandaki tüm veri/kontrol ve operasyonel süreçleri bölüm/sahne olarak anlatır; kaynak `docs/veri-akisi/veri-yolculugu.json`), ürün tasarımıyla ilgisi yoktur.

## KARAR (kullanıcı, 2026-10-31): BULUT SENKRONU ÖNERİLERİ KABUL; ŞİMDİ YALNIZ VERİ VE KOD

`docs/veri-akisi/bulut-senkron-arastirma.md` önerileri kabul: önce Seçenek 2a (istemci kodu; 34+33, 35b, 35c), sonra 2b (sürüm sütunu; 27) — 2b'nin migration'ı yalnız DOSYA olarak hazırlanır, gerçek veritabanına adım 5'te açık onayla uygulanır. Çıkışta hesaba gitmemiş veri en çok 7 gün bu cihazda karantinada bekler; aynı hesapla girişte "indir / hesaba yükle / sil" sorulur; başka hesapla girişte, SIFIRLA'da ve hesap silmede silinir. KVKK (47) ve tüm hukuk/muhasebe konuları EN SONA bırakıldı (kullanıcı: "hukuki ve muhasebeci kısmını en son konuşuruz"). Simülasyon bölümleri sırayla: A bitince kullanıcıya A'nın kısa özeti yazılır, sonra B.

## KURAL (kullanıcı, 2026-11-02): BÖLÜM SONU KOD DENETİMİ + AJANLARA ZERO TRUST

- Simülasyonun her bölümü (A, B, C…) bittiğinde bölüm sonu KOD DENETİMİ yapılır: veri dışarı çıkıyor mu (her ağ çağrısı, her depolama anahtarı, yedek/bulut gövdesi), veri sıkışması/taşması (kota, boyut sınırları, önbellek), güncel ve doğru veri kullanımı (kaynak/tarih etiketi, eski veri hesapta kullanılmaz, uydurma yok), yanlış kodlanmış yollar. Denetim raporu `docs/denetim/bolum-<X>-denetim.md`; bulgular kapanmadan sonraki bölümün commit'i atılmaz.
- AJANLARA ZERO TRUST: hiçbir ajan çıktısı kendi beyanıyla kabul edilmez. Uygulayıcı ajan ≠ doğrulayan ajan; kapı (typecheck, build, tarama, birim, e2e) bağımsız test ajanında; güvenlik + uyum ayrı ajanlarda; her koruma için KIRMIZI/YEŞİL kanıt; lider (ben) kritik iddiaları komutla yeniden doğrular; ajanlar commit/push yapamaz, `.env` okuyamaz, yalnız PID ile süreç durdurur.
- Cloudflare eklentisi (kullanıcı "Cloudflare audit" dedi) bu oturumda YÜKLÜ DEĞİL; yüklenirse denetimde kullanılır. Yüklenmezse aynı denetim fagent-guvenlik ile yapılır.

## DURUM VE SIRADAKİ İŞLER (2026-10-30, kullanım sınırı nedeniyle durduruldu)

Commit'li: YH-1 (P3 bağlama), YH-2 (projeksiyon motoru). Tasarım: kullanıcının "mevcut tasarım" PDF'i `docs/tasarim/FAGENT_web_sitesi.pdf` (sekmeli paneller + 3 abonelik planı; tek-ekran-Projeksiyon kararı ve "abonelik yapılmaz" kapsamıyla ÇELİŞKİ var → `docs/mvp-tanimi.md` yazılacak, kullanıcıya sorulacak).
YARIM (commit'lenmedi, yama yedeği `/home/user/FAGENT-Raporlar/02-degisiklikler/yh3-*`): YH-3 TCMB/EVDS bağdaştırıcısı (src/kaynaklar/*, api/evds.mjs, netlify/functions/evds.mjs). Kapı (e2e) YARIM kaldı; güvenlik KOŞULLU ONAY, uyum KOŞULLU ONAY. Yapılacak tek düzeltme turu:
- Güvenlik O1: hız sınırı istemci kimliği sahtelenebilir (X-Forwarded-For) → Netlify `x-nf-client-connection-ip`, Vercel `x-real-ip`/`x-vercel-forwarded-for`; tablo dolunca `clear()` yerine en eskiyi at; tarih aralığını sunucuda sabitle (istemci yalnız series/tablo göndersin). O2: devre kesici yalnız ağ hatası/zaman aşımı/5xx saysın, yukarı akış 4xx sayılmasın, gelecek tarih reddedilsin. Düşük: D1 `redirect:'error'`, D2 gövde sınırını okumadan önce uygula, D3 yanıtı `{items}` ile süz, D4 `kurVeriMi` alt alan kontrolü, D5 hata yanıtından `status` alanını kaldır, D6 e2e beyaz listeye yeni `fagent.kaynak.tcmb.*` anahtarlarını EKLE (gevşetme yok) ve `src/inflation.ts:80` yorumunu güncelle.
- Uyum: `eski` durum metni "hesaplarda kullanılmıyor, varsayım kullanılıyor (varsayım)" demeli; hız sınırı IP'si için aydınlatma/devir notu (tek cümle, avukat teyidi); EVDS çökünce 35 sn'ye varan yeniden deneme gecikmesi için e2e sonucuna bak (kısalt ya da YH-3 notuna yaz); eskiyen belge cümleleri (entegrasyonlar.md:54,62,170; README.md:299-304).
Sonra: kapı (typecheck, build, guvenlik, test:unit 167, e2e 735 iki koşu) → commit.
HENÜZ YAZILMADI (ajan yarıda kesildi): `docs/veri-akisi/veri-yolculugu.md` (14 sahne, oyun simülasyonu anlatımı → sonra etkileşimli Artifact), `docs/mvp-tanimi.md` (MVP tanımı, PDF çelişkileri, sürekli güncelleme düzeni), `scripts/paket-olustur.sh` + `/home/user/FAGENT-Paket/` klasörü (kaynak kod, tasarım, belgeler, raporlar, ekip hafızası; `kullanici-prompt-dizini-TAM-OZEL.md` ASLA girmez; .env* girmez) + zip.
Bekleyen kullanıcı işleri: EVDS_API_KEY (Vercel `fagent` projesinde YOK), tasarım metrikleri kaynağı (tasarım sohbeti okunamadı: repoya `TASARIM-METRIKLERI.md` olarak yazılsın ya da dosya yüklensin), yapay zekâ denemesi "başla" onayı, Monte Carlo kararı, AGENTS.md §0.4 onayı.

## KAPSAM KARARI (kullanıcı, 2026-10-25): YALNIZCA ALTYAPI VE VERİ AKIŞI

Kullanıcı "prompt dizini"ni verdi ve "altyapı ve veri akışı sistemini kuralım; bunun dışında herhangi bir şey yapmayacağız" dedi. Spesifikasyon: `docs/veri-akisi/spec.md`
(P0 kurallar, P3 yerel veri katmanı, P4 CSV, P5 fiyat/kur hattı, P6 hesap motoru, P8 şifreli ekip senkronu). **Ana karar: kullanıcı verisi sunucuda tutulmaz (local-first);
sunucu en çok şifreli blob görür.** Bu karar mevcut Supabase portföy senkronuyla (hesap katmanı: `cloud.ts`, `Account.tsx`, migration) ÇELİŞİR; ne yapılacağı plan belgesinde
(`docs/veri-akisi/mevcut-durum-ve-plan.md`) seçenek olarak sunulur, kullanıcı onaylamadan silinmez. Tasarım, abonelik, yasal metin, pazarlama bu kapsamda YAPILMAZ.
İşler ajan ekibiyle yapılır; P8 seçeneği kullanıcı onayı bekler (spec'te yazılı).

## NEREDEN DEVAM EDİLİR (2026-10-19 son durum)

- Ürün dalı `urun/birlesik` temiz ve yeşil (adım 1–2 tamam). Yarım kod yok.
- **Adım 3 (kural uyumu) TAMAM 2026-10-24: K1 (AI çıkarıldı), K2 (deftere kayıt dili, 9 tavsiye kalıbı, değer yargıları betimleyici), K3 (uyum e2e). typecheck/build ✓, tarama 0 kritik, e2e 674/674 (sahte Supabase). Eksik: Opus/max güvenlik incelemesi yapılmadı (insan incelemesi kullanıcıda). Sıradaki (veri akışı maddeleri ertelendi): A1 araştırması, yasal metin taslakları, devir paketi belgeleri.** Ekip planı hazır ve güvenlik/uyum danışmasından geçti: `docs/adim3-ekip-plani.md`
  (K1 aiAgent'ı çıkar → K2 "deftere kayıt" dili + 9 tavsiye kalıbı → K3 testler). Koşu kredi bittiği için K1'in
  başında durduruldu; kalemleri sırayla uygula, sonra kapıyı koş.
- Sonraki işler: `docs/is-kuyrugu.md` (34 iş + G1–G3 görsel).
- Tasarım araştırması 1. tur: `docs/arastirma/a2-tasarim-1-tur.md` (kazanç/kayıp renk körlüğü, telefon menüsü vb. → T1–T8). T1 yapıldı 24.10: yüzde tek kural `%17,5` / `+%17,5` / `-%22,7` (`fmtPct`, `fmtPctPlain` in store.ts; "%-" üretilmez). Sıradaki: T2 (kazanç/kayıp ikinci işaret).
- **Küçük/orta iş fazları: `docs/faz-plani-kucuk-orta.md` (yönetmen planı; Faz 1 → ekip koşusu, sonra Faz 2–4). Büyük kod en sona.**
- Fikirler ve yapılabilirlik: `docs/fikir-defteri.md` (yeni fikir önce buraya satır olarak eklenir). Faz sırası: `docs/faz-plani.md`.
- **Çalışma biçimi: işler AJAN EKİBİYLE yapılır (bkz. EKİP HAFIZASI → Süreç → HATA).**
- Vercel: `fagent` projesi (takım MYSELF) Vite/`dist` olarak ayarlandı ve yalnızca `urun/birlesik` dalını derler;
  GitHub'a bağlı; her push önizlemeyi günceller: https://fagent-git-urun-birlesik-myself-40f7.vercel.app
  (Vercel girişi gerekir). fagent.vercel.app hâlâ eski maket; üretime geçiş kullanıcı onayıyla, 4. adımdan sonra.
- Tasarım dosyaları: `docs/tasarim/`.
- İzleme paneli: https://claude.ai/artifact/Re4RorKLeMADNWMqGDhFu3 — "Olay günlüğü" ve "Bilmen gerekenler" (sözlük) bölümleri var.
  Her önemli adımdan sonra günlüğe satır ekle; raporda yeni teknik terim geçtiyse sözlüğe ekle (kullanıcı teknik değil).

## EKİP HAFIZASI — bilinen hatalar (her ajan işe başlamadan okur)

Aynı hatayı tekrar yapma. Yeni bir hata bulunursa buraya tek satır eklenir (tarih + ne + doğrusu).

**Okuma düzeni**
- Her ajan taze başlar, önceki ajanın okuduğunu bilmez. Son koşuda `App.tsx` 14, `agent.ts` 10 kez baştan okundu.
  Doğrusu: önce `grep -n` ile yeri bul, sonra yalnızca o satır aralığını oku (`App.tsx` ~2100 satır). Kendi düzenlemenden sonra dosyayı yeniden okuma.
- Plan/pano mesajındaki satır numaraları kayar. Düzenlemeden önce kodda yeniden doğrula.

**Komutlar**
- `npm install` çalıştırma (`package-lock.json` değişir ve dal kirlenir). `npm ci` kullan; lock değiştiyse `git checkout -- package-lock.json`.
- e2e: `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e`. `playwright install` çalıştırma.
- `pkill -f` ile genel desen kullanma (kendi kabuğunu öldürür). Süreci PID ile durdur.
- Workflow çıktısı sarmalayıcı JSON'dur; asıl sonuç `.result` altındadır.

**Test ve doğrulama**
- Kullanıcıya görünen metni değiştirirsen, aynı kalemde o metni arayan tüm e2e seçicilerini güncelle (`grep -rn` tests/e2e). Kontrol sayısı azalmaz.
- `tests/e2e/fagent-auth-e2e.mjs` içindeki beyaz liste kontrolleri (satır ~200, 276-278, 359-368) silinmez, gevşetilmez.
- Supabase testlerde taklittir. Rapor dili: "sahte Supabase ile yeşil", asla "çalışıyor". Dış API'ler (Frankfurter, CoinGecko, EVDS) bu ortamda doğrulanamaz; "doğrulanamadı" yaz.
- Türkçe regex: `\b` kullanma. Girdiyi `foldTr()` (agent.ts: tr-küçük harf + ı→i ş→s ğ→g ü→u ö→o ç→c) ile sadeleştir, kalıbı ASCII yaz; yalnız `toLocaleLowerCase('tr-TR')` yetmez (ASCII "IYI"→"ıyı"). İ/I/ı/i varyantlarını test et. Kalıplar sınırlı olsun (ReDoS).

- 2026-10-24: Dosya silen değişiklikte `git ls-files --cached` silinmiş dosyayı da verir; tarama betikleri `existsSync` ile süzmeli (tarama bu yüzden çöktü, düzeltildi).
- 2026-10-24: Var olan e2e dosyasına blok eklerken `grep -n "const <ad>"` ile değişken adı çakışmasını ve bloğun zaten ekli olup olmadığını kontrol et (tekrar eklenen blok test dosyasını çökertti).
- 2026-10-24: `public/` altındaki her dosya üretim paketine girer; test/hata ayıklama sayfası konmaz (cors-test.html böyle sızdı).
- 2026-10-24: Varsayılan sabit (enflasyon, stopaj, eşik) değişince eski değeri `grep -rn` ile src ve tests/e2e'de ara; testlerde aynı sayı sabit olarak tekrar eder.

- 2026-10-31: Bir ajan test koşusunu `pkill` ile kesti (kural ihlali) ve `npx` altındaki `vite preview`/`http.server` alt süreçleri port tutarak kaldı. Doğrusu: süreci yalnız PID ile durdur; `npx` ile açılan sunucunun ALT sürecini de `ps`/`lsof -i :4200,4201` ile bulup PID ile kapat; koşu sonunda portların boş olduğunu doğrula. `ss` bu ortamda yok, `lsof` kullan.

**Süreç**
- **HATA (2026-10-24, kullanıcı düzeltti): işleri ekipsiz, tek başıma yapma.** Kullanıcı geliştirme işlerinin **ajan ekibiyle** (`fagent-ekip` iş akışı; araştırma için `fagent-arastirma`) yürütülmesini ister. "En ucuz yol" ifadesini "ekibi atla" diye yorumladım ve bir gün boyu çoğu işi kendim yaptım; bu kullanıcının söylediğinin dışına çıkmaktır. Kural: kod/test/belge geliştirme işi → önce ekip akışı; ekipsiz çalışma ancak kullanıcı AÇIKÇA "ekipsiz/kendin yap" derse. Kredi tasarrufu gerekçesi benim kararım değildir: ucuzluk istenirse ekibin KÜÇÜK bir koşusu (`maksKalem` düşük, roller kısıtlı) önerilir/yapılır, ekip tamamen atlanmaz. Kullanıcı kendi adıma karar vermemi istemiyor; soru sormaya da gerek yok: varsayılan = ekip.
- Kullanıcı bir komutu yarıda keserse (tool reddi) nedenini soru olarak anla, aynı komutu tekrar deneme; önce durumu sade dille açıkla.
- Ajanlar commit atmaz, push etmez, dal değiştirmez. Çalışma ağacı temiz başlar (inceleyenler `git diff` ile görür).
- İncelenmemiş/yarım iş git dalına konmaz; yama dosyası olarak `/home/user/FAGENT-Raporlar/02-degisiklikler/` altına yedeklenir (kullanıcı kararı).
- Hiçbir `.env*` dosyası okunmaz. Gizli anahtar istemciye girmez; `VITE_*` içinde yalnızca publishable/anon anahtar olur.
- Bütçe koruması yalnızca kullanıcı mesajında "+800k" gibi token hedefi varsa çalışır; yoksa limit bilinmez, işi küçük parçalara böl.
- Kullanıcı kuralları: kişiye özel al/sat önerisi yok, gerçek işlem yürütme yok, sahte veri yok. Tavsiye dili ("almalısın", "öneri") ajan çıktısında yasak.

## ERTELENEN TEKNOLOJİLER (kullanıcı kararı, 2026-10-23)

Şimdilik KULLANILMAZ (çok maliyetli, büyük mühendislik): zaman serisi analizi (gecikmeli değişkenler / lag),
rassal yürüyüş (random walk) kuramı, transfer öğrenme, Fourier dönüşümü. Unutulmasın; ürün satıldıktan sonra
ya da gelirle birlikte yeniden değerlendirilir. Bugünkü ajan ve projeksiyon yapısı kural tabanlı ve anahtarsız kalır.

## EKİP EKOSİSTEMİ — KURULDU (2026-10-24, kullanıcı "tamam başla" dedi)

Üst Kurul (`docs/ust-kurul.md`, `.claude/agents/fagent-ust-kurul.md`, kayıt: `docs/teknoloji-talepleri.md`), ortak istem iskeleti
(`docs/istem-iskeleti.md`) ve skill'ler (`.claude/skills/`: app-tsx-haritasi, e2e-kosu, turkce-regex) var. Ajan istemlerine
(`fagent-ekip.js` ORTAK) "önce EKİP HAFIZASI + skill, sonra dar okuma, yeni teknoloji = talep" kuralı eklendi.
Sınırlar: kurul kapısı zorunlu iş akışı aşaması DEĞİL (istem kuralı); henüz bir koşuda denenmedi, etkisi ölçülmedi.
Yeni tekrar eden bilgi → yeni skill; yeni hata → EKİP HAFIZASI'na satır.

## Geliştirme ekibi

Altı rollü çok ajanlı ekip `.claude/agents/` altında, iş akışı `.claude/workflows/fagent-ekip.js`.
Kullanım ve pano protokolü: `docs/ajan-sistemi.md`.

## Doğrulama durumu (2026-10-18)

- typecheck ✓, build ✓, e2e **486 + 96 auth = 582/582 sahte Supabase ile yeşil**.
- Koşucu (`tests/run-e2e.mjs`) iki derleme yapar: `dist/` (Supabase env'leri açıkça boş; 486 kontrol, port 4200) ve
  `dist-e2e-cloud/` (sahte `https://sahte.supabase.co`; yalnızca `fagent-auth-e2e.mjs`, port 4201). `.env.local`
  tanımlıyken de aynı sonuç alındı; `dist/` içinde sahte değer yok (koşucu doğrular).
- Supabase `page.route()` ile TAKLİT edilir. Gerçek projeye karşı doğrulanmayanlar: RLS, `delete_my_account`,
  e-posta yönlendirmeleri, `PASSWORD_RECOVERY`; migration'ın SQL ile iki kullanıcıyla sınanması adım 5'e kalır.
  "Çalışıyor" değil, "sahte Supabase ile yeşil".
- Doğrulanamayanlar: gerçek ağdaki dış API'ler, EVDS fonksiyonu (gerçek deploy gerekir), 1440/375px görsel kontrol.

## Hesap katmanı — CANLI ÖNCESİ ZORUNLU LİSTE (2026-10-19, ekip kararı)

**KULLANICI KARARI (2026-10-24): aşağıdaki veri akışı/bulut senkron maddeleri (34+33, 35, 41, 27) şimdilik YAPILMAZ. Çok zaman alır; önce dikkatli araştırılıp (çakışma çözümü, çoklu cihaz, kısmi geri yükleme örnekleri) sonra uygulamaya eklenecek. Bu liste açıkken `VITE_SUPABASE_*` canlıda tanımlanmaz, hesap özelliği kapalı kalır. Şimdi diğer işler yapılır.**

Bu liste kapanmadan **üretim ortamında `VITE_SUPABASE_*` tanımlanmaz** (5. adımın giriş koşulu).
Env boşken bulut kodu hiç çalışmaz; hesapsız ürün bu maddelerden etkilenmez.

| # | Dosya | Sorun | Sahip |
|---|---|---|---|
| ~~34 + 33~~ | `src/cloud.ts`, `src/App.tsx` | ✅ Kapandı (31.10, A16): girişliyken SIFIRLA sonrası yeniden kurulum (iki sekmede de) bulutu ezmez, çakışma kartı çıkar; onay metni dürüst; auth e2e q6/q6b/q9 (sahte Supabase ile yeşil) | — |
| ~~35a~~ | `src/sekmeSenkron.ts`, `src/store.ts` | ✅ Kapandı (31.10, A8): başka sekmede çıkış/SIFIRLA sonrası bu sekme belleğinden diski yeniden doldurmaz (silme kazanır, işaret ömrü 30 sn, yazıcı durur); `fagent-sekme-e2e.mjs` | — |
| ~~35b/35c~~ | `src/cloud.ts`, `src/karantina.ts` | ✅ Kapandı (31.10, A16): hesaba gitmemiş veri karantinada en çok 7 gün (en çok 2 kopya), kendi Çıkış'ında sorulur, yer yoksa çıkış durur; sahibi belirsiz veri karantinaya girmez; q1–q5, q10–q12 (sahte Supabase ile yeşil). Açık risk: oturum kendiliğinden düşerken cihazda yer yoksa veri silinir | — |
| ~~41~~ | `src/backup.ts` | ✅ Kapandı (31.10, A14): anlık görüntü + iki turlu rollback, geri alınamayan değer bekletilir ve ayna korunur, ~10 MB sınırı; `fagent-yazma-e2e.mjs`, `depolama.test.ts` | — |
| 27 | `src/cloud.ts`, `src/surum.ts` | KISMEN (31.10, A17): istemci koşullu yazım + çakışma kopyası hazır (q7/q7b/q8/q13, sahte Supabase ile yeşil); `supabase/migrations/20261031000000_portfolios_version.sql` HİÇBİR projeye uygulanmadı — adım 5'te açık onayla uygulanıp iki istemciyle doğrulanacak | veri-akışı |
| ~~40~~ | `scripts/build.mjs` | ✅ Kapandı: derleme `sb_secret_`/service_role içeren VITE_* değerinde durur | — |
| ~~43/16~~ | `vercel.json`, `netlify.toml` | ✅ Kapandı (24.10): CSP, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy; `fagent-csp-e2e.mjs` korur. Vercel önizlemede başlıklar DOĞRULANDI (24.10, yanıt başlıklarında görüldü) | — |
| 47 | `src/Account.tsx` | KVKK aydınlatma metni olmadan kayıt açılabiliyor (adım 7) | tasarım |
| ~~42/39~~ | `scripts/guvenlik-tarama.mjs` | ✅ Kapandı: tarama artık izlenmeyen yeni dosyaları da tarıyor | — |

Kısa vadeli (orta/düşük) bulguların tam listesi ve ekip koşusunun kaydı: geliştirme raporları klasörü
(`01-ekip-kosulari/2026-10-19-kosu-2-hesap-katmani.md`).

