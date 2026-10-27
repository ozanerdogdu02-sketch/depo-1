# Fikir defteri

Kullanıcının söylediği her fikir buraya yazılır ve sınıflandırılır. Yeni fikir gelince **önce buraya satır eklenir**, sonra
(istenirse) ayrı bir ajan koşusuyla işlenir. Kural: kişiye özel al/sat önerisi ve gerçek işlem yürütme fikirleri
"❌ Yapılmaz"a gider. Plan: `docs/faz-plani.md`. Son güncelleme: 2026-10-24.

**Sınıflar:** ✅ Yapıldı/yapılabilir (bu ortamda) · 🟡 Yapılabilir ama dışarıdan hesap/insan/onay gerekir · ⏸ Ertelendi · ❌ Yapılmaz/yapılamaz

## Fikirler

| # | Fikir (kullanıcı) | Tarih | Sınıf | Yapılabilirlik ve gerekli altyapı | Faz |
|---|---|---|---|---|---|
| 1 | Fagent'ı Acquire.com'da satılabilir tek ürün yap; pasif gelir | 18.10 | 🟡 | Kod tarafı bizde. Satış fiyatını **ücretli kullanıcı** belirler; gelir/satış garantisi verilemez | 1–7 |
| 2 | Çok ajanlı, kendi aralarında konuşan geliştirme ekibi | 18.10 | ✅ | Kuruldu (pano, 7 rol + Üst Kurul) | 0 |
| 3 | Model iş bölümü, düşük token | 18.10 | ✅ | Kuruldu (Opus güvenlik, Sonnet kod, Haiku tekrar test) | 0 |
| 4 | Güvenlik maksimum | 18.10 | ✅ | Sürekli: iki mercekli Opus/max inceleme, deterministik tarama, kod kilidi | 0→ |
| 5 | Limit dolunca güvenli durma | 18.10 | ✅ | Yalnızca mesajda "+800k" gibi hedef varsa çalışır | 0 |
| 6 | İzleme paneli: iskelet, hedef yüzdesi, günlük, sözlük | 18–23.10 | ✅ | Kuruldu; yol haritası bölümü 10 adıma güncellenecek | 0 |
| 7 | Açık kaynak araç/skill kullan (güvenli ve gerekli olanlar) | 18.10 | 🟡 | Üst Kurul onayıyla; Jev reddedildi (kapalı, ücretli, veri dışarı) | → |
| 8 | Üst ajan: en iyi örneklerle karşılaştırma | 18.10 | ✅ | Yönetmen + araştırma iş akışı | 0 |
| 9 | Her işlemi ve düzeltmeyi klasöre aktar, masaüstüne koy | 18.10 | 🟡 | Klasör + zip hazır. Doğrudan Windows masaüstüne yazamam (bulutta çalışıyorum); zip'i indirirsiniz | 0 |
| 10 | AI bağlantısını çıkar | 19.10 | ✅ | Yapıldı ve commit edildi (24.10) | 1 |
| 11 | Sürekli yeni iş/hedef kuyruğu; 800k limiti | 19.10 | ✅ | `docs/is-kuyrugu.md` + bu defter | 0 |
| 12 | Tasarım kodlarını yan panelde göster | 19.10 | ✅ | `docs/tasarim/` ve rapor klasörü | 0 |
| 13 | Başka ürünler çıkarmak (araştırma, ayrı sohbet) | 19.10 | 🟡 | Araştırma kartı hazır; başlatmak kullanıcıda | 8+ |
| 14 | SaaS full paket + güncel fiyat tahmini | 19.10 | 🟡 | Tahmin (gelirsiz) ~1–5 bin $; A1 araştırması gerçek verilerle netleştirir | 2 |
| 15 | Zaman serisi (lag), rassal yürüyüş, transfer öğrenme, Fourier | 23.10 | ⏸ | Çok maliyetli; gelirle yeniden bak. Anahtarsız/kural tabanlı yapıyı bozar | 9+ |
| 16 | Ekip hafızası: hatalar CLAUDE.md'de, ajanlar okusun | 23.10 | ✅ | Yapıldı; etkisi ölçülmedi | 0 |
| 17 | Üst kurul (teknoloji onayı) + skill ekosistemi + ortak istem iskeleti | 23.10 | ✅ | Kuruldu; kurul kapısı henüz zorunlu aşama değil (istem kuralı) | 0→2 |
| 18 | Commit öncesi sistem kontrolü | 24.10 | ✅ | Kapı: typecheck, build, tarama, e2e. K1 bu kapıdan geçti (587/587) | her faz |
| 19 | Tasarıma fazla önem; detaylar dahil geniş araştırma | 24.10 | ✅ | 1. tur yapıldı (`docs/arastirma/a2-tasarim-1-tur.md`; 6 bulgu, T1–T8 işleri); rakip ekran incelemesi 2. tur. Araştırma A2 (aşağıda) + tasarım fazı; görsel kontrol 1440/375px, görsel regresyon testi | 2–3 |
| 20 | Çok kitleye ulaşınca abonelik ve tüm altyapı önem sırasında | 24.10 | 🟡 | Kod bizde; **şirket/ödeme sağlayıcı başvurusu kullanıcıda** (uzun sürebilir) | 5 |
| 21 | Instagram/TikTok reklam + reels sistemi | 24.10 | 🟡 | Parçalı: içerik fabrikası yapılır, hesap/reklam/video çekimi dışarıda (aşağıda) | 6 |
| 22 | Bu defter: tüm fikirler sınıflandırılsın, başka ajan sistemiyle çözülsün | 24.10 | ✅ | Bu dosya; her yeni fikir buraya eklenir | → |
| 23 | Veri akışı/bulut senkron işleri (SIFIRLA onayı, çok sekme çıkış, kısmi geri yükleme, iki cihaz çakışması) önce araştırılsın, sonra eklensin | 24.10 | ⏸ | Çok zaman alır; hesap özelliği bu yüzden canlıda kapalı kalır. Araştırma konusu: Notion/Figma/Linear çakışma çözümü, CRDT/koşullu güncelleme, atomik geri yükleme | 4–5 |
| 24 | Projeksiyon daha gelişmiş/"eğitilmiş" bir modele taşınsın (tasarımda yalnız projeksiyon ele alınsın) | 27.10 | 🟡 | ML modeli ⏸ (ertelenen liste: zaman serisi, transfer öğrenme; veri lisansı yok). Uygun yol: A) stopaj+reel+hedef+duyarlılık (rastgelesiz) şimdi; B) tohumlu Monte Carlo "senaryo dağılımı" %10/50/90 — rassal yürüyüş yasağı nedeniyle kullanıcı kararı. Plan: `docs/projeksiyon/gelismis-model-plani.md` | → |
| 25 | Verileri KAP ve Merkez Bankası'ndan çıkar; çok kaynak, sorun olan kaynak yalnız kendini etkilesin (EVDS+TCMB birleşik, KAP, BİST) | 27.10 | 🟡 | TCMB/EVDS birleşik bağdaştırıcı + kaynak başına önbellek/hata izolasyonu yapılabilir (anahtar Vercel'de gerekli). KAP: resmî API yok, hukuk onayı şart. BİST fiyatı: lisans gerekir, elle/CSV kalır. Plan: `docs/veri-akisi/cok-kaynakli-veri-plani.md` | P5 → |

## Pazarlama (reklam + reels) — ne yapılır, ne yapılamaz

**Yapabiliriz (bu ortamda):**
- İçerik fabrikası: reels/TikTok senaryosu, sahne sahne storyboard, altyazı, hashtag, içerik takvimi (haftalık plan), farklı kitleye göre (bireysel yatırımcı, "enflasyona karşı reel getiri", "portföyümü tek yerde görmek").
- Uygulama ekran kaydı: Playwright ile **örnek verili** demo videosu üretilebilir (ekranda "örnek veri" etiketiyle; uydurma getiri gösterilmez).
- Paylaşım görselleri (carousel/kapak) HTML'den PNG; reklam metin varyantları; tanıtım sayfası (Vercel); UTM'li bağlantılar; gizlilik dostu ölçüm.
- Reklam metni uyum denetimi: Uyum ajanı "kazanç vaadi / tavsiye görünümü" ifadelerini eler.

**Dışarıdan gerekir (sizde):** Instagram/TikTok işletme hesapları, reklam yöneticisi hesapları ve ödeme yöntemi; kamera/seslendirme/montaj (CapCut, Canva vb.); müzik/telif seçimi; yüz ve ses sahibi kişi.
**Yapılamaz/şimdilik yok:** Otomatik paylaşım (Meta ve TikTok API'leri uygulama onayı ister; ilk aşamada elle paylaşım). Hesap açma, reklam yayınlama, kullanıcı adına giriş yapma.
**Doğrulanması gerekenler (araştırma A3):** Meta/TikTok'un finansal ürün reklam politikaları ve Türkiye'de ön onay/yetki şartları, SPK'nın reklam/tanıtım kuralları, Reklam Kurulu kuralları, influencer ifşa zorunluluğu, getiri vaadi yasakları. (Şu an kesin bilgi değil; "doğrulanmalı".)
**Uyarı:** Reklama para harcamadan önce ürün canlı, yasal metinler hazır ve ödeme çalışır olmalı. Önce içerik ve organik deneme, sonra ücretli reklam.

## Abonelik ve çok kitle için gereken altyapı (öncelik sırasıyla)
1. **Yasal/şirket zemini (kullanıcı):** satıcının şahıs mı şirket mi olacağı, vergi/fatura (e-arşiv), mesafeli satış sözleşmesi, KVKK, iade/iptal politikası. *Sağlayıcı başvuruları için gerekebilir; doğrulanmalı (A1).*
2. **Ödeme sağlayıcı:** iyzico / PayTR (yerel) veya Paddle / Lemon Squeezy (satıcı-aracı). Kart verisi hiçbir zaman bize gelmez. Seçim A1 sonucuna göre.
3. **Abonelik veri modeli:** Supabase'de abonelik tablosu; **özellik kilidi sunucu tarafında** (RLS) — yalnız istemcide gizleme yetmez.
4. **Webhook fonksiyonu:** Vercel sunucusuz fonksiyon; imza doğrulama, tekrar işleme koruması, iptal/iade/başarısız ödeme durumları. Gizli anahtarlar yalnız sunucuda.
5. **E-posta:** özel SMTP (doğrulama, şifre sıfırlama, fatura bildirimi).
6. **Çok kitle için dayanıklılık:** performans (ana paket ~750 kB, bölme gerekir), erişilebilirlik, hata izleme (gizlilik dostu), yedek, hız sınırı/kötüye kullanım koruması, durum sayfası, destek kanalı.
7. **Ölçüm:** gizlilik dostu kullanım ve dönüşüm ölçümü (çerezsiz); KVKK ile uyumlu.
8. **Hesap/alan adı devri:** alan adı, Vercel, Supabase, ödeme hesabı devredilebilir kurulmalı (adım 10).

## Tasarım — neden ayrı faz ve araştırma
Tasarım satışta ilk izlenimi belirler. Araştırma A2 şunları kapsar: Nocturne tasarım sistemi (renk/tipografi/boşluk jetonları), mobil-önce (375px), erişilebilirlik (WCAG 2.2 AA, renk körlüğü, klavye), Türkçe tipografi ve sayı/yüzde biçimi (ör. "-%22,69"), finans grafik dili, boş/yükleniyor/hata durumları, onboarding, mikro-etkileşim, açık/koyu tema, performans, **görsel regresyon testi** (ekran görüntüsü karşılaştırma) ve referanslar (Revolut, Midas, Sharesight, Getquin, Monarch, Linear, Stripe paneli).
