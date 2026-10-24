---
name: hareket-kurallari
description: Arayüze hareket (animasyon/geçiş) eklerken uyulacak kısıtlar ve hazır desenler. CSS yazmadan önce kullan.
---

# Hareket kuralları (docs/tasarim/ana-ekran-konsepti.md §3)

## Kısıtlar
- Yalnız CSS (`transition`, `@keyframes`, View Transitions) ve mevcut kütüphaneler (Recharts). Yeni bağımlılık yok (gerekirse `docs/teknoloji-talepleri.md`).
- Süre jetonları: `--t-fast: 140ms`, `--t-med: 220ms`, `--t-slow: 300ms`. 300 ms üstü yok.
- Sürekli dönen, yanıp sönen, sonsuz döngülü hareket yok (yükleniyor simgesi hariç, o da reduced-motion'da durur).
- Yalnızca `opacity`, `transform`, `stroke-dash*` canlandır; `width/height/top/left` canlandırma (yeniden düzen yükü).
- Hareket bilgi taşımaz: aynı bilgi hareket olmadan da okunur (sayı, ▲/▼, etiket).

## Zorunlu: azaltılmış hareket
```css
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```
JS ile başlayan hareket (sayı sayma, `startViewTransition`) önce `matchMedia('(prefers-reduced-motion: reduce)')` denetler.

## Desenler
- Çizgi çizme: `<path pathLength="1">` + `stroke-dasharray:1; stroke-dashoffset:1` -> `0`.
- Halka: `circle pathLength="100"` + `stroke-dasharray: len calc(100 - len)`.
- Paylaşılan öğe: `view-transition-name` yalnız geçiş sırasında tek öğede; destek yoksa `@keyframes` ile belirme.
- Kademe: `transition-delay: calc(var(--i) * 40ms)`.
Örnek: `docs/tasarim/ana-ekran-prototip.html`.
