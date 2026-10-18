# FAGENT — Proje Hafızası (ürün dalı `urun/birlesik`)

FAGENT, Türk bireysel yatırımcı için API anahtarı gerektirmeyen portföy takip ve analiz
panelidir. Bu dal, üç ayrı sürümü Acquire.com'da satılabilir tek bir ürüne birleştirir.
Kurallar: `AGENTS.md` (önce onu oku). Karar geçmişi: `docs/karar-gunlugu.md`.

## Kaynak dallar (korunur, değiştirilmez)

| Dal | Ne | Bu dala ne alındı |
|---|---|---|
| `yedek/fagent-ana` | En kapsamlı kod — bu dalın temeli | Tamamı (kod köke taşındı) |
| `fagent-standalone` | Ana sürümün eski kopyası + Supabase kayıt/giriş | `src/cloud.ts`, `src/Account.tsx`, migration, auth testi (2. adım) |
| `yedek/canli-site` | fagent.vercel.app'teki Claude Design maketi, örnek veriyle | Yalnızca görsel dil (6. adım) |

## Yapı

- Uygulama repo kökünde: `src/`, `tests/e2e/`, `scripts/`, `public/`, `netlify/functions/`.
- Sekmeler: Panel, Bugün, Hisseler, Fonlar, Kripto, Kripto Piyasası, İşlemler, Projeksiyon, Ajan.
- Ajan sekmesi kural tabanlıdır (`src/agent.ts`), LLM çağırmaz.
- Canlı fiyat yalnızca döviz (Frankfurter) ve kripto (CoinGecko); hisse/fon elle girilir.
- Kalıcı katmanlar `src/backup.ts` → `BACKED_UP_KEYS`.

## Geliştirme planı (onaylandı)

1. ✅ Repoyu satışa uygun hale getir — kök dizine taşıma, kişisel dosya/iz temizliği.
2. Hesap katmanı — standalone'dan Supabase kayıt/giriş + senkronu tüm katmanları kapsayacak şekilde.
3. Kural uyumu — işlem komutu "deftere kayıt" dili, `aiAgent` katmanını çıkar, gizlilik metnini güncelle.
4. Vercel'e taşı — EVDS fonksiyonunu Vercel'e uyarla, seri kodunu doğrula, yedek enflasyon değerini güncelle.
5. Gerçek Supabase projesi — migration, Site URL, özel SMTP, canlıda uçtan uca deneme.
6. Canlı sitenin görünümü — Nocturne görsel dili; Kurulum ve Hedefler ekranları.
7. Yasal metinler — KVKK aydınlatma, kullanım koşulları, tavsiye değildir.
8. Devir paketi — kurulum/devir dokümanı, ortam değişkenleri, gizlilik dostu metrik.

## Geliştirme ekibi

Altı rollü çok ajanlı ekip `.claude/agents/` altında, iş akışı `.claude/workflows/fagent-ekip.js`.
Kullanım ve pano protokolü: `docs/ajan-sistemi.md`.

## Doğrulama durumu (2026-10-18)

- typecheck ✓, build ✓, e2e 486/486 ✓ (kök dizine taşımadan sonra yeniden koşuldu).
- Doğrulanamayanlar: gerçek ağdaki dış API'ler, EVDS fonksiyonu (gerçek deploy gerekir).
