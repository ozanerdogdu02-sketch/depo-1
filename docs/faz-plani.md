# Faz planı (önem sırası)

Hedef: canlı, kayıt/giriş çalışan, abonelikli, çok kitleye ulaşabilen ve **tek pakette devredilebilen** SaaS.
Kural: her faz kapıdan geçer (typecheck, build, güvenlik taraması, e2e) ve commit öncesi kontrol edilir.
Fikirler ve yapılabilirlik: `docs/fikir-defteri.md`.

| Faz | Ne | Kim | Durum |
|---|---|---|---|
| 0 | Temel: tek ürün, hesap katmanı, ekip, güvenlik, panel, hafıza, Üst Kurul | biz | ✅ |
| 1 | **Güvenli çekirdek:** adım 3 (K2 "deftere kayıt" dili + 9 tavsiye kalıbı), G2 telefon menüsü, G3 yüzde biçimi, canlı öncesi liste (34+33, 35, 41, 27) | biz | 🔄 K1 bitti |
| 2 | **Araştırma turu** (3 paralel, "+800k" ile): A1 SaaS/değerleme/ödeme/yasal · A2 tasarım derin araştırma · A3 pazarlama, reklam politikaları, SPK | biz (ekip) | ⏳ onay bekliyor |
| 3 | **Tasarım** (adım 6): Nocturne sistemi, bileşenler, erişilebilirlik, mobil, görsel regresyon testi | biz | ⏳ |
| 4 | **Yayın hazırlığı:** adım 4 (Vercel, EVDS, CSP/güvenlik başlıkları), adım 7 (KVKK, koşullar, tavsiye değildir), adım 5 (gerçek Supabase — **sizin hesabınız**) | biz + siz | ⏳ |
| 5 | **Abonelik ve ödeme** (adım 8): sağlayıcı, veri modeli, sunucu tarafı kilit, webhook, e-posta, fatura | biz + siz (şirket/başvuru) | ⏳ |
| 6 | **Pazarlama sistemi:** tanıtım sayfası, ölçüm, içerik fabrikası (senaryo, demo ekran kaydı, görsel), reklam metinleri | biz + siz (hesap/video/reklam) | ⏳ |
| 7 | **İlk kullanıcılar** (adım 9): organik deneme, sonra ücretli reklam; 2–3 ay gelir verisi | siz (+ biz ölçüm) | ⏳ |
| 8 | **Devir paketi** (adım 10): kod, hesaplar, kurulum/devir dokümanı, gelir kanıtı | biz + siz | ⏳ |
| 9 | Ertelenenler ve yeni ürünler: ileri analiz teknikleri, ayrı ürün araştırması | gelirle | ⏸ |

## Paralel başlatılması gerekenler (kullanıcı tarafı, uzun sürebilir)
- Şirket/şahıs şirketi kararı ve ödeme sağlayıcı başvuru koşullarının öğrenilmesi (Faz 5'in gecikmesin diye Faz 2'de).
- Instagram/TikTok işletme hesapları (organik içerik Faz 6'dan önce ısınsın).
- Vercel/Supabase/alan adı hesaplarının sizin adınızda olması (devir için).
