# A2 — Tasarım araştırması, 1. tur (24 Ekim 2026)

**Kapsam ve sınır:** Tek ajan, 6 hedefli web araması + uygulamanın kendi kodu ve renklerinin ölçümü (en ucuz yol).
Web kaynaklarının çoğu ikincil (blog, sözlük, üçüncü taraf sayfa); birincil olanlar işaretli. Rakip ürünlerin (Revolut, Midas,
Sharesight, Getquin…) ekranlarını **incelemedim** (görsel erişim yok) → 2. tur gerekir. Ölçümler bu kodun kendisinden, kanıtlı.

## Bulgular (uygulamanın kendisinden, ölçülmüş)
| # | Bulgu | Kanıt | Önem |
|---|---|---|---|
| F1 | **Kazanç (yeşil) ile kayıp (kırmızı) birbirinden yalnızca renk tonuyla ayrılıyor.** İkisinin parlaklık oranı 1,16:1 — renk körlüğünde (özellikle kırmızı-yeşil) aynı görünür. Metinde +/− işareti var (iyi), ama kartlarda/grafiklerde yalnız renge güvenilen yerler olabilir | `src/index.css` `--accent #26a69a`, `--red #ef5350`; hesap: 1,16:1 | Yüksek |
| F2 | **Kayıp rengi koyu yüzeyde AA'nın altında:** `#ef5350` / `--surface-2 #2a2e39` = 3,89:1 (normal metin için ≥4,5 gerekir). Kazanç/yüzey-2 = 4,52 (sınırda). Ana zeminde hepsi geçiyor (5,13 ve 5,97) | hesap | Orta |
| F3 | **Yüzde biçimi iki farklı yazımda:** panelde `fmtPct` → "+17,5%" (işaret **sonda**); ajan metinlerinde "%17" (işaret **önde**). Negatifte ajan "%-22,7" üretiyor | `src/store.ts:369`, `src/agent.ts:112,390,637` | Orta |
| F4 | **Yalnızca 3 ekran kuralı (1000/860/640 px)**; 9 sekmeli kenar çubuğu telefonda dikey liste olarak ilk ekranı kaplıyor (G2) | `src/index.css`, ekran görüntüsü | Yüksek |
| F5 | Renk jetonları tek katman (`:root` içinde 12 değişken). Yeni görsel dile (Nocturne) geçiş ve olası açık tema için **anlamsal katman** yok | `src/index.css:3-21` | Orta |
| F6 | Görsel kontrol yok: bugüne dek 1440/375px kontrolü elle bir kez yapıldı; testler metin/davranış denetliyor, görünüm değil | testler | Yüksek |

## Dış kaynaklardan alınanlar
- **WCAG 2.2 AA (birincil: W3C):** Hedef boyutu en az 24×24 CSS px (2.5.8); odaktaki öğe sabit başlık/afişle tamamen örtülmemeli (2.4.11);
  sürüklemeye tek işaretçili alternatif (2.5.7). Hedef dağılım kaydırıcıları ve sabit üst/alt çubuklar bu üçünü ilgilendirir.
  Odak görünümü (2.4.13) düzeyi kaynaklar arasında tutarsız → resmî W3C metninden doğrulanmalı. [W3C: What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- **Renk körlüğü (ikincil):** Okabe-Ito paleti; kazanç/kayıp için mavi `#0072B2` – turuncu-kırmızı `#D55E00` çifti hem ton hem parlaklıkta ayrışır. Asıl kural: **renge tek başına güvenme** — +/−, ▲/▼, doğrudan etiket ekle.
  (Kazanç/kayıp çifti önerisi kaynakta yok, kaynaktaki paletten çıkarımdır.)
- **Mobil gezinme (ikincil, NN/g birincil kaynağı doğrulanamadı):** Birincil gezinme için görünür alt çubuk, ikincil/seyrek öğeler için menü; 375 px'te alt çubuk 4–5 öğe taşır → 9 sekmeyi 4 ana + "Daha fazla"ya böl.
- **Jetonlar (ikincil):** Üç katman (ham → anlamsal → bileşen), kaynak biçim W3C DTCG JSON (`$type`/`$value`), tema yalnızca anlamsal katmanı değiştirir. Style Dictionary yaygın araç ama **yeni bağımlılık** → Üst Kurul; küçük bir kendi betiğimiz yeter.
- **Görsel regresyon (ikincil, resmî Playwright belgesi okunmadı):** Sabit viewport, dinamik içeriği maskele, eşik (`maxDiffPixelRatio`), tam sayfa yerine bölüm/ekran ölçeği, eski taban görüntüsünü bilinçli güncelle.
  **Kısıt:** Bizim testler `playwright-core` ile elle yazılmış; `toHaveScreenshot` `@playwright/test` ister. Seçenek: (a) `page.screenshot` + küçük karşılaştırıcı (PNG çözücü bağımlılığı → Üst Kurul), (b) yalnızca ekran görüntüsü üretip insanın bakması (bağımlılıksız, başlangıç için yeter).
- **Türkçe yüzde yazımı:** Kaynaklarda işaret sayıya bitişik ve **önde** ("%25"), ondalık virgül. Negatifte "-%22,7" yazımı kaynakla **doğrulanamadı**; çıkarım. Kesin kural için TDK yazım kılavuzu bakılmalı.

## Faz 3 için önerilen iş listesi (öncelik sırasıyla)
| # | İş | Efor | Not |
|---|---|---|---|
| T1 | Yüzde biçimini tek kurala bağla: önde `%`, işaret `-%22,7` / `+%17,5`; `fmtPct` + ajan metinleri + test | küçük | G3'ü kapatır; birçok test metni etkilenir |
| T2 | Kazanç/kayıp'a ikinci kodlama: ▲/▼ ya da +/− her yerde, grafiklerde doğrudan etiket; kayıp rengini yüzey-2 üzerinde ≥4,5'e çıkar | küçük–orta | Renk değişimi Nocturne ile birlikte karar verilir |
| T3 | Telefon gezinmesi: 4 ana + "Daha fazla" alt çubuğu; sabit çubuğun odağı örtmediğini doğrula (2.4.11); dokunma hedefi ≥24 px | orta | G2'yi kapatır |
| T4 | Jeton katmanı: ham → anlamsal CSS değişkenleri (bağımlılıksız); Nocturne değerleri anlamsal katmana girer | orta | 6. adımın temeli |
| T5 | Görsel kontrol: 6 ana ekran × 1440/375 px ekran görüntüsü üreten betik (+ isteğe bağlı karşılaştırıcı, Üst Kurul onayıyla) | orta | |
| T6 | Erişilebilirlik tarama: klavye ile tüm akış, odak halkası, kaydırıcılar için tuş alternatifi (2.5.7), `prefers-reduced-motion` (var), ekran okuyucu adları (`aria-label` 17 yerde var; eksikleri tara) | orta | |
| T7 | Boş / yükleniyor / hata durumları: ekran ekran envanter | orta | |
| T8 | Performans: ana paket ~750 kB; bölme (dinamik import) | orta | çok kitle için |

## 2. tur gerekirse (daha pahalı)
Rakip ekran incelemesi (görsel erişimli bir oturum veya sizin ekran görüntüleriniz), TDK yazım kılavuzu kontrolü, resmî Playwright belgesi, WCAG 2.4.13 düzeyi, finans grafik dili için birincil kaynaklar.
