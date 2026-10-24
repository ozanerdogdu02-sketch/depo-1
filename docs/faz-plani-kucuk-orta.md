# Küçük/orta işler: faz planı

Hazırlayan: yönetmen ajanı, 2026-10-24. Dal: `urun/birlesik`. Etiketler: ⚖️ = kullanıcıda (hukuk, dış hesap, görsel karar) · 🏛️ = Üst Kurul talebi gerekir (yeni bağımlılık/araç).

**Plan dışı:** görsel kararlar ve insan incelemesi (T2, G2/T3, Nocturne/T4/#25, #13, #14, #20, #29); ertelenen veri akışı maddeleri (34+33, 35, 41, 27, #12).
**Kuyrukta "Bekliyor" görünüp kapanmış işler (güncellenecek):** #4 (#40), #5'in başlık kısmı, #15 (EVDS fonksiyonu Vercel'de çalışıyor).

## Fazlar
| Faz | # | İş (kuyruk no) | Sahip | Kabul ölçütü | Efor | Bağımlılık |
|---|---|---|---|---|---|---|
| **1** | 1.1 | Yedek enflasyon %32 → %30 (#16) | veri-akisi + test | `VARSAYILAN_ENFLASYON_PCT = 30`, kaynak yorumu ("TÜİK Eylül 2026 yıllık TÜFE %29,73, haber kaynaklı, doğrulanmalı"); agent.ts metni ve `fagent-insight-e2e.mjs:58`, `fagent-evds-e2e.mjs:25` güncel; kontrol sayısı azalmaz | küçük | yok |
| 1 | 1.2 | `public/cors-test.html` üretimden çıkar (#5 kalanı) | guvenlik | `dist/cors-test.html` yok; csp-e2e'ye +1 kontrol | küçük | yok |
| 1 | 1.3 | Kullanıcıya görünen "demo" dilini temizle (#24 metin kısmı) | uyum | kullanıcı metninde "demo" 0; `App.tsx:~1853`, `agent.ts:~153,~1061`; e2e seçicileri güncel | küçük | yok |
| 1 | 1.4 | HHI etiketlerini betimleyici yap (#22) | uyum + veri-akisi | `agent.ts:~345-349` "sayılır/gerekir" yok; eşikler "FAGENT'ın gösterim aralığı, resmî standart değil"; analytics-e2e'ye yasak kelime kontrolü | küçük | 1.3 sonrası |
| 1 | 1.5 | Belgelerdeki eski iddiaları düzelt (#23) | uyum | README ve `docs/entegrasyonlar.md` EVDS için `api/evds.mjs` (Vercel); Netlify alternatif; her iddia `dosya:satır` ile eşli | küçük | 1.2 sonrası |
| **2** | 2.1 | Fisher, XIRR, HHI birim testi (#21) | test | ≥12 kontrol, beklenen değerler elle hesaplı; bağımlılık yok | orta | Faz 1 yeşil |
| 2 | 2.2 | Migration'a `grant ... to authenticated` + Splinter 0029 notu (#6, #30) | guvenlik | yeni migration dosyası, üretime UYGULANMAZ (adım 5 ⚖️) | küçük | yok |
| 2 | 2.3 | Tedarik zinciri (#27): `uses:` SHA sabitleme, dependabot, SECURITY.md | guvenlik | `ci.yml` her `uses:` 40 karakter SHA; CodeQL ⚖️ | orta | yok |
| 2 | 2.4 | e2e koşucusunda kararsız test raporu (#31) | test | düşen dosya bir kez yeniden koşulur; "kararsız: X" ayrı satır; ilk hata gizlenmez | küçük | yok |
| 2 | 2.5 | İlan taslağında iddia ↔ kod eşleme (#28) | uyum | her özellik iddiası `dosya:satır`/test adıyla eşli; kanıtsız olan silinir/“planlanan” | küçük | 1.5 |
| **3** | 3.1 | "Tavsiye değildir" metni tek kaynak (#24 kalanı) | uyum | tek sabit, 4 yerden bağlı; altbilgi yerleşimi ⚖️ | küçük | 1.3 |
| 3 | 3.2 | Klavye/ekran okuyucu envanteri (T6) | test | 9 sekmede Tab sırası ve adsız etkileşimli öğe sayısı ölçülür; eksikler listelenir; görsel düzeltme ⚖️ | orta | yok |
| 3 | 3.3 | Boş/yükleniyor/hata durumları envanteri (T7) | test + tasarım | ekran başına tablo; kod değişmez | küçük | yok |
| 3 | 3.4 | İnsan incelemesi için ekran görüntüsü betiği (T5-a) | test | `scripts/ekran-goruntusu.mjs` 6 ekran × 1440/375 PNG (karşılaştırıcısız) | orta | yok |
| **4** | 4.1 | `src/legal.config.ts` + boş alan uyarısı (#47 altyapısı) | uyum + guvenlik | alanlar boşken üretim derlemesi uyarır; değer girişi ⚖️ | küçük | 3.1 |
| 4 | 4.2 | Supabase ayarları kontrol listesi (#19) | guvenlik | devir belgesinde ayar başına satır; uygulama ⚖️ | küçük | yok |
| 4 | 4.3 | RLS pgTAP test taslağı (#18) | test + guvenlik | `supabase/tests/*.sql`; CLI/CI 🏛️; "doğrulanamadı" etiketli | orta | 2.2 |
| 4 | 4.4 | Devir belgesinde ortam değişkeni/hesap tablosu | veri-akisi | `docs/devir/kurulum-ve-devir.md` tüm `VITE_*` ve `EVDS_API_KEY`; `grep import.meta.env\|process.env` ile eşli | küçük | 1.5 |

## Büyük kod (en sona)
| İş | Neden sonra |
|---|---|
| Veri akışı/bulut senkron (34+33, 35, 41, 27, #12) | Kullanıcı kararıyla ertelendi; önce çakışma çözümü araştırması |
| Abonelik/ödeme (adım 8): sunucu tarafı kilit (RLS), webhook, e-posta | Sağlayıcı ve şirket kararı ⚖️; gerçek Supabase gerekir |
| Mobil gezinme G2/T3, Nocturne T4/#25, kazanç/kayıp T2, Kurulum/Hedefler #29 | Görsel karar kullanıcıda; çok dosyaya yayılır |
| KVKK kayıt akışı #47 | Avukat onaylı metin ve veri sorumlusu bilgisi ⚖️ |
| Tanıtım sayfası (adım 9) | Yasal metin ve ölçüm hazır olmadan değeri düşük |
| fast-check #32, Stryker #34, axe #26, görsel karşılaştırıcı T5-b | Yeni bağımlılık 🏛️ |
| TOTP #33, performans bölme T8 | Plan dışı / ertelendi |

## Yaratıcı fikirler (öneri; kullanıcı onaylamadan işe dönüşmez)
| # | Fikir | Gerekçe | Efor | §0 uyumu | Faz |
|---|---|---|---|---|---|
| F1 | Bayat fiyat hatırlatıcısı (Bugün: "3 fonun fiyatı 7+ gündür güncellenmedi") | Elle girilen fiyat gerçek gibi görünmesin; güven | küçük | yön belirtmez, tarihi betimler | 2–3 |
| F2 | Fiyat kaynağı + tazelik etiketi ("CoinGecko · 3 dk önce" / "elle · 12 gün önce") | "Sahte veri yok" ilkesini görünür kılar | küçük | yerleşim ⚖️ | 3 |
| F3 | "Bu oturumda nereye istek gitti" şeffaflık paneli | "Portföyün tarayıcıda kalır" iddiasını kanıtlar; satış metni | küçük–orta | yalnız alan adı, tutar değil | 3 |
| F4 | Yıl sonu stopaj/gerçekleşen kâr özeti (CSV/yazdır) | Türk yatırımcıya özgü; Premium adayı | orta | "beyanname değildir" etiketi; oran kaynağı doğrulanmalı | 4/adım 8 |
| F5 | Tutarı gizli "reel getiri kartı" PNG (cihazda canvas) | Organik edinim | orta | getiri vaadi okunmamalı; filigran; uyum incelemesi ⚖️ | 6 |
| F6 | Gizlilik dostu sayaç (günlük sayfa görüntüleme, IP/çerez yok) | Devir için kullanım kanıtı | orta | KVKK ⚖️ | 4/adım 9 |
| F7 | Ücretsiz/Premium sınır taslağı (yalnız belge) | Adım 8 buna bağlı | küçük | Premium'da da tavsiye/işlem yok | 2 |
| F8 | Örnek veri etiketli 30 sn demo videosu (Playwright ekran kaydı) | İlan ve organik içerik | küçük–orta | ekranda "örnek veri" | 3/6 |

Not: `tests/e2e/fagent-cryptodemo-e2e.mjs:1` yorumunda "BtcTurk sunumu" ifadesi var (adım 1 kişisel iz temizliğinden kalmış olabilir) — kullanıcı kararı bekliyor.

## Skill / kural önerileri (ekip özerk yazabilir; `docs/ekip-kararlari.md`'ye kaydeder)
1. Skill `uyum-dili`: yasak kelime/kalıp listesi (öneri, -malısın, uygula, emir, işlendi, demo, sayılır/gerekir) + betimleyici cümle şablonları.
2. Skill `kaynak-atfi`: sabit/metindeki rakam nasıl kaynaklanır (birincil/haber/çıkarım, tarih, "doğrulanmalı"); kodda yaşayan varsayımlar (enflasyon, stopaj `App.tsx:~290`, EVDS seri kodu).
3. Skill `belge-kod-tutarliligi`: kod hakkında iddia taşıyan belgeler (README, entegrasyonlar, yasal, devir, ilan) + kod değişince çalışacak `grep` listesi.
4. EKİP HAFIZASI: "`public/` altındaki her dosya üretim paketine girer; test/hata ayıklama sayfası konmaz (`cors-test.html` böyle sızdı)."
5. EKİP HAFIZASI: "Varsayılan sabit (enflasyon, stopaj, eşik) değişince eski değeri `grep -rn` ile `src` ve `tests/e2e`'de ara; testlerde aynı sayı sabit olarak tekrar eder."
