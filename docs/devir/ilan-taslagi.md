# Acquire.com ilan taslağı — DOLDURULMADAN YAYINLANMAZ

**Kural:** İlana yalnızca **gerçek, kanıtlanabilir** rakamlar yazılır. Gelir, kullanıcı, büyüme veya retention uydurulmaz; veri yoksa "henüz gelir yok" yazılır. Alıcı due diligence'ta kanıt isteyecektir (ödeme sağlayıcı raporu, ölçüm ekran görüntüsü).

## Başlık
Türk bireysel yatırımcılar için hesap gerektirmeyen portföy takip ve enflasyona göre reel getiri paneli (SaaS'a hazır kod tabanı)

## Kısa özet (≈ 3 cümle)
FAGENT, bireysel yatırımcının hisse, fon, kripto, döviz ve mevduat varlıklarını tek ekranda izleyip enflasyon ve vergi sonrası gerçek getirisini hesaplayan Türkçe bir web uygulamasıdır. Yatırım tavsiyesi vermez ve işlem yürütmez (kural tabanlı, kayıt ve hesaplama aracı). [GELİR/KULLANICI DURUMU: gerçek rakam ya da "henüz gelir yok"]

## Ne satılıyor
Kod tabanı (React + TypeScript + Vite, Supabase hesap katmanı, Vercel yayını), alan adı [VARSA], tasarım dosyaları, 674+ otomatik ekran testi, güvenlik taraması, karar geçmişi ve devir kılavuzu (`docs/devir/kurulum-ve-devir.md`). [Premium abonelik/ödeme: yalnızca gerçekten kurulduysa yaz]

## Güçlü yanlar (kanıtlı olanlar)
- Test edilmiş: otomatik uçtan uca test paketi (sahte veritabanıyla yeşil; gerçek veritabanıyla doğrulama [YAPILDIYSA yaz]).
- Güvenlik: sunucuya hiç API anahtarı girmeyen mimari, CSP/güvenlik başlıkları, otomatik gizli anahtar taraması.
- Düşük işletme maliyeti: hesapsız çalışır; sunucu maliyeti neredeyse sıfır [Vercel/Supabase plan ücretleri].
- Net kural çerçevesi: kişiye özel tavsiye ve işlem yürütme yok (SPK sınırına dikkatli tasarım; hukuki doğrulama [YAPILDIYSA yaz]).

## Riskler ve açık işler (dürüst yaz)
- Gelir ve kullanıcı geçmişi [yok/kısa].
- Bulut senkronu için bilinen açık maddeler listesi (`CLAUDE.md`) kapatılmadan hesap özelliği canlıya alınmaz.
- Yasal metinler avukat onayına bağlıdır; ödeme sağlayıcı başvurusu [yapıldı/yapılmadı].
- Canlı hisse/fon fiyatı yok (BIST/TEFAS için resmî anahtarsız kaynak bulunamadı); kullanıcı elle girer.

## Teknik özet
React 18, TypeScript, Vite; Supabase (PKCE, RLS); Vercel; Recharts; Playwright testleri. Lisanslar: `docs/devir/ucuncu-taraf-lisanslar.md`.

## Devir sonrası destek
[Süre/biçim — örn. 30 gün e-posta desteği ve bir canlı devir görüşmesi]
