# FAGENT · Portföy Ajanı — canlı site yedeği

`https://fagent.vercel.app` adresinde yayında olan sürümün yedeği (alınma tarihi 2026-10-18).

- Kaynak: Claude Design'da yapılmış "gorgeous-malabi" maketi. Önce Netlify'de yayınlandı
  (8 Eylül 2026, deploy 6aa05b6b016a89c9f103588d), 9 Eylül 2026'da tek dosya olarak Vercel'e elle yüklendi.
- Ayrı bir kod reposu yoktu; uygulama tek dosyalık paketin içine gömülü.

## Dosyalar

| Dosya | Ne |
|---|---|
| `paket/index.html` | Canlı sitenin birebir kopyası (Vercel'e yüklenen dosya). Doğrudan yayınlanabilir. |
| `kaynak/sablon.html` | Paketten çıkarılan uygulama: ekranlar, stiller, hesaplama kodu. **Asıl kaynak bu.** |
| `kaynak/calisma-kodu.js` | Claude Design çalıştırma kodu (şablonu tarayıcıda çalıştırır). |
| `kaynak/ds-paketi.js` | "Nocturne" tasarım sistemi paketi (boş bileşen listesi). |
| `paket/paket-icerigi.json` | Paketteki tüm gömülü dosyaların listesi (React, yazı tipleri, görsel). |

## Tekrar yayınlama

`paket/` klasörünü Vercel'e yükle (Framework: Other, build yok, çıktı klasörü `paket`).
