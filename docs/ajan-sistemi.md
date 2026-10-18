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
| Güvenlik | `.claude/agents/fagent-guvenlik.md` | Gizli anahtar, RLS, XSS, içe aktarma, sunucu fonksiyonu, bağımlılık, KVKK denetimi | Hayır |
| Uyum | `.claude/agents/fagent-uyum.md` | Tavsiye yok, işlem yürütme yok, sahte veri yok, varsayım etiketi denetimi | Hayır |
| Test | `.claude/agents/fagent-test.md` | E2e kontrolü yazar, typecheck + build + e2e kapısını çalıştırır | Evet (yalnız test) |

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

## Maliyet

Tipik bir koşu 12–20 ajan çağrısıdır (1 plan + 2 danışma + 1 revizyon + ≤4 uygulama +
1 test + 2–4 inceleme + düzeltme turları + 1 karar). Küçük işler için tek bir rolü çağırmak
daha ucuzdur; ekibi riskli ya da çok alanlı işlere sakla (kimlik doğrulama, veri senkronu,
ödeme/abonelik, yeni veri kaynağı, büyük arayüz değişikliği).
