# Ortak istem iskeleti

Yönetmen ve ürün lideri, her rol için yazdıkları istemi **bu altı bölümle, bu adlarla ve bu sırayla** kurar.
Aynı kavram her rolde aynı adı taşır; roller arasında farklı terim kullanılmaz.

| # | Bölüm | İçerik | Not |
|---|---|---|---|
| 1 | **BAĞLAM** | Ürün bir cümle + işin hangi plan adımına ait olduğu | Uzun geçmiş yok; ayrıntı için dosya yolu ver |
| 2 | **GÖREV** | Tek, ölçülebilir iş | "Kalem" = plan parçası, "bulgu" = inceleme sonucu, "talep" = teknoloji isteği |
| 3 | **OKU** | Önce okunacaklar: `CLAUDE.md` → "EKİP HAFIZASI", ilgili `.claude/skills/*`, `AGENTS.md` §0, görevle ilgili dosya + satır aralığı | Dosyayı baştan okutma; skill haritasındaki aralığı ver |
| 4 | **KISITLAR** | Değişmez kurallar + role özel sınırlar | §0 kuralları her istemde aynen |
| 5 | **ÇIKTI** | Beklenen biçim (şema/başlıklar) ve kanıt şartı | Kanıt: komut çıktısı, `dosya:satır`, bağlantı |
| 6 | **DURMA ŞARTI** | Ne zaman durup insana/lidere bırakır | Bütçe, belirsizlik, kural çakışması |

## Terim sözlüğü (istemlerde sabit)
- **kalem**: planın bir parçası. **teslim**: uygulayıcının çıktısı. **bulgu**: inceleyenin tespiti (kritik/yüksek/orta/düşük).
- **talep**: yeni teknoloji/kütüphane/servis isteği → Üst Kurul'a gider (bkz. `docs/ust-kurul.md`).
- **kapı**: typecheck + build + güvenlik taraması + e2e. **kilit**: kodla zorlanan "birleştirilemez" şartları.
- **skill**: `.claude/skills/<ad>/SKILL.md` — tekrar okunan bilginin kısa, hazır özeti.

## Kurallar
- Bir bölüm başka bölümün işini yapmaz (kısıt GÖREV'e, görev KISITLAR'a karışmaz).
- İstem kısa kalır; tekrar eden uzun bilgi istem yerine skill'e yazılır.
- Rol dosyası (`.claude/agents/*.md`) rolün kalıcı kurallarıdır; istem yalnızca bu işi anlatır.
