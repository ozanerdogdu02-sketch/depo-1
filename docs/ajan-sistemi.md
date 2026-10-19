# FAGENT Geliştirme Ekibi — Çok Ajanlı Sistem

FAGENT'ı geliştiren altı rollü bir ajan ekibi. Roller birbirinin işine kısıt koyar,
teslim alır, inceler ve düzeltme ister. Son karar her zaman insanındır.

> Bu ekip **geliştirme** içindir (kodu yazan/denetleyen ajanlar). Uygulamanın içindeki
> "Ajan" sekmesi ayrı bir şeydir: kural tabanlıdır, LLM çağırmaz, API anahtarı istemez.

## Roller

| Rol | Dosya | Ne yapar | Kod yazar mı |
|---|---|---|---|
| Ürün lideri | `.claude/agents/fagent-urun-lideri.md` | Görevi kalemlere böler, kabul ölçütü koyar, itirazları birleştirir, son kararı yazar | Hayır |
| Tasarım | `.claude/agents/fagent-tasarim.md` | Arayüz, Nocturne görsel dili, erişilebilirlik, mobil, Türkçe metin | Evet |
| Veri akışı | `.claude/agents/fagent-veri-akisi.md` | Veri modeli, yerel katmanlar, yedek, bulut senkronu, fiyat/enflasyon kaynakları, finansal matematik | Evet |
| Güvenlik | `.claude/agents/fagent-guvenlik.md` | İki mercek (erişim/veri, istemci/tedarik zinciri): gizli anahtar, RLS, XSS, içe aktarma, sunucu fonksiyonu, bağımlılık, KVKK | Hayır |
| Uyum | `.claude/agents/fagent-uyum.md` | Tavsiye yok, işlem yürütme yok, sahte veri yok, varsayım etiketi denetimi | Hayır |
| Test | `.claude/agents/fagent-test.md` | E2e kontrolü yazar, typecheck + build + e2e kapısını çalıştırır | Evet (yalnız test) |
| Yönetmen | `.claude/agents/fagent-yonetmen.md` | Üst rol: ekip için araştırma ve görev istemleri yazar, rollerin düzenini sağlar, sonuçları birleştirip kurala aykırıyı eler | Hayır |

## Nasıl konuşurlar — pano protokolü

Ajanlar birbirine doğrudan değil, iş akışının tuttuğu ortak bir **pano** üzerinden yazar.
Her ajanın istemi panonun son mesajlarını taşır; her ajanın çıktısı panoya yeni mesaj ekler.

| Mesaj türü | Kimden → kime | Örnek |
|---|---|---|
| `plan` / `plan-v2` | lider → ekip | "K1 (veri-akisi): hesap katmanını taşı" |
| `kisit` | güvenlik/uyum → kalem | "[yuksek] Supabase anahtarı yalnız publishable olabilir" |
| `itiraz` | güvenlik/uyum → lider | "K3: metin emir kipinde → betimleyici yaz" |
| `teslim` | uygulayıcı → ekip | "K1 [tamam] cloud.ts eklendi — inceleyene not: …" |
| `devir` | uygulayıcı → başka rol | "fagent-test: çıkışta yerel verinin silindiğini test et" |
| `test` | test → ekip | "YEŞİL — e2e 507✓/0✗" |
| `bulgu` | inceleyen → sahip | "[kritik] src/cloud.ts:80 — …" |
| `duzeltme` | sahip → ekip | "tur 1: RLS kontrolü eklendi" |
| `karar` | lider → insan | "BİRLEŞTİRİLEBİLİR — …" |

## Akış (`.claude/workflows/fagent-ekip.js`)

```
Plan ─▶ Danışma ─▶ Uygulama ─▶ Test ─▶ İnceleme ─▶ Düzeltme (≤2 tur) ─▶ Karar
lider   güvenlik    sahipler    test    güvenlik     sahipler + test      lider
        uyum        (sıralı)            uyum         + yeniden inceleme
        lider rev.                      alan sahipleri
```

- **Danışma uygulamadan önce gelir:** güvenlik ve uyum, kod yazılmadan önce plana kısıt koyar.
  Bu, sonradan "geri al" maliyetini düşürür.
- **Uygulama sıralıdır:** uygulayıcılar aynı çalışma ağacını düzenler; paralel düzenleme çakışırdı.
- **Çapraz inceleme:** güvenlik ve uyum her zaman inceler; tasarım dosyalarına başka bir rol
  dokunduysa tasarım, veri dosyalarına başka bir rol dokunduysa veri akışı da inceler.
- **Engelleyici:** `kritik` ve `yuksek` bulgular ile kırmızı test kapısı düzeltme turunu tetikler.
  İki turdan sonra hâlâ açıksa lider "birleştirilemez" der ve insana bırakır.
- Ajanlar **commit atmaz, push etmez, dal değiştirmez.** Değişiklikler çalışma ağacında kalır.

## Çalıştırma

Claude Code'da (repo kökünde):

```
fagent-ekip workflow'unu şu görevle çalıştır: "<görev>"
```

ya da parametreyle: `args: { gorev: "…", maksKalem: 4, maksDuzeltmeTuru: 2 }`.

Önce çalışma ağacını temiz bırak (commit et): inceleyenler değişiklikleri `git diff` ile görür,
önceden kalan değişiklikler ekibin işiyle karışır.

Tek bir rolü tek başına da çağırabilirsin (ör. "fagent-guvenlik ajanıyla son commit'i incele").

## Güvenlik — en üst seviye (kullanıcı kararı)

- **Model:** güvenlik danışması Opus/yüksek, güvenlik incelemesi Opus/**max**. Tasarruf güvenlikten
  değil, mekanik adımlardan yapılır.
- **İki mercek:** `guvenlik-erisim` (oturum, RLS, senkron, hesap silme — saldırgan kullanıcı gözüyle)
  ve `guvenlik-istemci` (önce `npm run build && npm run guvenlik -- --dist`, sonra gizli anahtar,
  XSS, içe aktarma, dış istek, bağımlılık). İkisi de her koşuda ve **her düzeltme turundan sonra** çalışır.
- **Kapı kapalı kalır:** güvenlik danışması iki denemede sonuç vermezse uygulama başlamaz; güvenlik
  incelemesi iki denemede sonuç vermezse iş birleştirilemez; test ajanı sonuç vermezse kapı kırmızıdır.
- **Karar kodla kilitli:** açık `kritik`/`yuksek` bulgu, eksik güvenlik incelemesi ya da kırmızı test
  varsa liderin kararı ne olursa olsun sonuç `birlestirilebilir: false` (`karar.kilitler` nedenini yazar).
- **Deterministik tarama:** `npm run guvenlik` — model görüşüne bağlı değildir, CI'da da çalışır.

## Model iş bölümü

| Adım | Model / çaba |
|---|---|
| Lider: plan, karar | Opus / orta |
| Lider: plan revizyonu | Sonnet / düşük |
| Güvenlik: danışma | Opus / yüksek |
| Güvenlik: iki mercekli inceleme | Opus / max |
| Veri akışı: uygulama | Sonnet / yüksek |
| Tasarım: uygulama | Sonnet / orta |
| Uyum: danışma ve inceleme | Sonnet / düşük |
| Test: yaz ve koş | Sonnet / düşük |
| Test: yalnızca yeniden koş | Haiku / düşük |

Adım adım ezmek için: `args.modeller = { 'veri-akisi:uygulama': { model: 'opus', effort: 'high' } }`.
Token tasarrufu: her ajan panonun yalnızca kendisine/ekibine/kalemine yazılanını görür; uyum
incelemesi kullanıcıya görünen metin değişmediyse atlanır; dosya değişmeyen düzeltme turunda test
ve güvenlik yeniden koşmaz (yalnızca tamamlanamamış inceleme yeniden denenir).

## Bütçe koruması — güvenli durdurma

Mesaja bir token hedefi yazarak başlat (ör. "+800k"). Kalan bütçe `butceEsigi` (varsayılan 150k)
altına düşünce akış **bir ajanı yarıda kesmez**; bir sonraki aşama sınırında durur, yeni iş başlatmaz,
panoyu ve nerede kaldığını döndürür ve kararı `birlestirilebilir: false` olarak kilitler. Durdurulan
koşunun çalışma ağacı incelenmemiş sayılır: `wip/<konu>-incelenmedi` dalına kaydet, ürün dalına
commit etme. Hedef verilmezse akış limiti bilemez ve bu koruma devreye girmez.

## Maliyet

Tipik bir koşu 12–20 ajan çağrısıdır (1 plan + 2 danışma + 1 revizyon + ≤4 uygulama +
1 test + 3–5 inceleme + düzeltme turları + 1 karar). En pahalı adımlar Opus/max güvenlik
incelemeleridir ve bilinçli olarak kısılmaz. Küçük işler için tek bir rolü çağırmak
daha ucuzdur; ekibi riskli ya da çok alanlı işlere sakla (kimlik doğrulama, veri senkronu,
ödeme/abonelik, yeni veri kaynağı, büyük arayüz değişikliği).

## Araştırma aşaması (`.claude/workflows/fagent-arastirma.js`)

Bir ekip koşusu bittikten sonra, yapılan iş dünyadaki en iyi örneklerle karşılaştırılır.
Kod değiştirmez.

```
Brifing ─▶ Araştırma (paralel) ─▶ Sentez
yönetmen    tasarım, veri akışı,     yönetmen
(istem      güvenlik, uyum, test
 yazar)     (web + kod okuma)
```

- **Yönetmen** önce ekibin gerçekte ne yaptığını okur, sonra her rol için adlandırılmış
  referanslarla (ürünler, açık kaynak projeler, standartlar) o işe özel bir istem yazar ve
  tüm rollerin uyacağı düzen kurallarını koyar.
- **Roller** kendi alanlarında referansları derinlemesine inceler; her karşılaştırma kaynak,
  bizdeki durum, öneri, öncelik ve efor içerir. Kimse dosya değiştirmez.
- **Sentez:** yönetmen tekrarları birleştirir, çelişkileri çözer, kurala aykırı ya da kaynaksız
  önerileri gerekçesiyle reddeder, kalanları 8 adımlık plana bağlayıp önceliklendirir ve ekibe
  verilecek hazır görev metinlerini yazar.
- Modeller: yönetmen Opus, güvenlik araştırması Opus/yüksek, diğer roller Sonnet. Bütçe koruması
  ekip iş akışıyla aynı.

Çalıştırma: `fagent-arastirma workflow'unu şu konuyla çalıştır: "<yapılan iş>"`.

