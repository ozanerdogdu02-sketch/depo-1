# Tasarım işi — yeni oturum devir notu (24 Ekim 2026)

Bu not, tasarım işini ayrı bir oturumda sürdürmek için yazıldı. Önce bunu, sonra `AGENTS.md` (kurallar) ve `CLAUDE.md` (proje hafızası) oku.

## Amaç ve kullanıcının istekleri (kullanıcının sözleriyle)
- "Göz yoran kısımlar var; backend'de çalışabilecek kısımları arkaya al."
- "Motion olarak kullanabileceğimiz bir grafik, bir başka geçiş — onları tek ekranda kullanabiliriz, bulalım. Tek bir ekranda bu tüm işler birleşsin; orada kullanıcı isterse oraya bassın, oraya geçiş sağlasın. **Tek bir ana ekran** istiyorum."
- Daha önce: tasarıma gereğinden fazla önem verilsin; detaylar dahil her şey iyi çalışsın; Nocturne (mor tonlu) görsel dil hedef. Kullanıcı tasarım ve insan incelemesini kendisi yürütüyor.
- Büyük kod en sona; önce küçük/orta, az kodlu işler.

## Şu an ne var
- **Prototip (tıklanabilir, örnek veri):** `ana-ekran-prototip.html` · web: https://claude.ai/artifact/R6zNd6JaZtCmVM93PM8m7m
- **Konsept belgesi:** `ana-ekran-konsepti.md` — 40 öğelik envanter (A ana ekran 9 · B arka plana 7 · C detay katmanı 15 · D araçlar çekmecesi 9), hareket kataloğu, 4 fazlı uygulama planı, 7 açık karar.
- **Araştırma:** `a2-tasarim-1-tur.md` (6 ölçülmüş bulgu, T1–T8): kazanç/kayıp renk körlüğü (yeşil/kırmızı parlaklık oranı 1,16:1), kayıp rengi koyu yüzeyde 3,89:1, telefonda 9 maddelik menü ilk ekranı kaplıyor, görsel test yok.
- **Yapıldı:** T1 yüzde yazımı (`%17,5`, `+%17,5`, `-%22,7`); G1 hesap ekranı bağlantı boşluğu.
- **Hedef görsel dil:** `hedef-tasarim-canli-site.html`; mevcut ekran görüntüleri: `ekran-mevcut/`; prototip görüntüleri: `ekran-prototip/`.
- **Mevcut CSS jetonları:** `src/index.css` (`:root` 12 değişken, koyu lacivert + teal).
- Canlı önizleme (Vercel girişi gerekir): https://fagent-git-urun-birlesik-myself-40f7.vercel.app · GitHub: ozanerdogdu02-sketch/depo-1, dal `urun/birlesik`.

## Kullanıcı kararı bekleyenler (varsayılanlar prototipte seçili; ayrıntı konsept belgesinde)
Açılışta Ana ekran mı eski Panel mi · arama kutusunun yeri · Kripto Piyasası'nın Kripto altına alınması · fiyat tazelemenin sunucuya taşınması · ilk açılışta dış servislere bağlanıldığını söyleyen satır · **kazanç/kayıp renkleri: mavi `#3fa9f5` / turuncu `#ffb07c`** (en tartışmalı) · (kalan madde için belgeye bak).

## Değişmez kurallar (AGENTS.md §0 özeti)
İstemci koduna API anahtarı girmez · kişiye özel al/sat önerisi yok, işlem yürütme yok ("Deftere ekle" yalnızca defter kaydı) · sahte veri yok (örnek veri her yerde etiketli) · portföy verisi üçüncü tarafa gitmez · dil betimleyici: "öneri, uygula, işlendi, -malısın" yok (`.claude/skills/uyum-dili`). Hareket: yalnızca CSS, yeni bağımlılık yok, ≤300 ms, `prefers-reduced-motion` altında kapanır (`.claude/skills/hareket-kurallari`). Kazanç/kayıp renge ek ▲/▼ ve işaretle gösterilir. Türkçe sayı biçimi (`₺140.000`).

## Uygulamaya geçirirken (test etkisi — önemli)
- E2E testleri DOM seçicilerine bağlı: `side-link` 22 dosyada 72 yerde, `SIFIRLA` 11 dosyada 29, `.card-title` 9 dosyada 17. **Kenar çubuğunu kaldırmak en son faz**; önce yeni ana görünüm bayrak arkasında eklenir, mevcut testler değişmez.
- Kapı (her değişiklikten sonra): `npm run typecheck`, `npm run build`, `npm run guvenlik -- --dist`, `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e` (şu an 699/699, sahte Supabase ile yeşil). `npm install` yok (`npm ci`). `.env*` okunmaz. CSP `vercel.json` içinde (`script-src 'self'`): satır içi script eklenmez.
- Aşamalı plan (konsept belgesi): Faz 1 CSS/hareket jetonları + ▲/▼ + durum şeridi + seyrek kartları katlama (küçük) → Faz 2 yeni Ana görünüm bayrak arkasında → Faz 3 detay katmanı + Araçlar çekmecesi → Faz 4 kenar çubuğunu kaldır (büyük, en sonda).

## Bu işin dışında kalanlar
Veri akışı/bulut senkron maddeleri (SIFIRLA onayı, çok sekme çıkış, kısmi geri yükleme, çakışma) kullanıcı kararıyla ertelendi; `src/cloud.ts`'e dokunma. Opus güvenlik incelemesi yapılmadı (insan incelemesi kullanıcıda).

## Geri teslim
Tasarım dosyalarını (HTML/CSS/görsel) ya da GitHub dalını kullanıcıya ver; entegrasyon, test seçicilerinin güncellenmesi ve güvenlik/uyum incelemesi ajan ekibiyle (`docs/ajan-sistemi.md`) ana oturumda yapılır.
