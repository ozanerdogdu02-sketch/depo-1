# Bölüm A sonu kod denetimi — 2026-11-02

Denetçi: fagent-guvenlik (yöntem: `.claude/skills/bolum-denetimi/SKILL.md`). Rapor dosyasını lider kaydetti (denetçinin yazma yetkisi yok).
Kapsam: `veri-yolculugu.json` A1–A17 sahneleri, HEAD `38b13cb` (temiz `git archive` kopyası). Çalışma ağacındaki incelenmemiş B11/B12 değişiklikleri kapsam DIŞI.

## Kapı (temiz HEAD kopyasında)

| Komut | Sonuç |
|---|---|
| `npm run typecheck` | çıkış 0 |
| `npm run build` | çıkış 0 |
| `npm run guvenlik -- --dist` | 0 kritik, 0 uyarı; npm audit üretim: 0/0/0/0 |
| `npm run denetim` (build sonrası) | 0 HATA, 0 UYARI, 0 BILGI |
| `npm run test:unit` | 371/371 (o kopyada) |
| e2e | test ajanında (son koşu 885/885, sahte Supabase ile) |

`dist/` içinde `sb_secret_`/`supabase.co` yalnız supabase-js kütüphane metninde; gömülü gizli değer yok.

## D1 Veri dışarı çıkışı

| Yer | Hedef | Ne gider | Tetik |
|---|---|---|---|
| `src/market.ts:39` | api.frankfurter.dev | döviz kodu | kullanıcı düğmesi |
| `src/market.ts:55` | api.coingecko.com | coinId (miktar gitmez) | kullanıcı düğmesi |
| `src/priceHistory.ts:58,94` | coingecko / frankfurter | coinId / kod, 90 gün | Risk "Hesapla" |
| `src/cryptoMarketData.ts:120` | coingecko markets | portföyden bağımsız | sekme |
| `src/kaynaklar/tcmb.ts:179,198` | `/api/evds` | yalnız seri/tablo adı | açılış |
| `src/cloud.ts:377-392` | Supabase (env boşken kapalı) | yalnız 5 `BACKED_UP_KEYS` | oturum |
| `netlify/functions/evds.mjs:130` | evds2.tcmb.gov.tr | seri + sunucu tarihi; anahtar başlıkta | sunucu |

sendBeacon/postMessage/BroadcastChannel/cookie/telemetri yok. Depolama: 5 yedekli, 16 açıklanmış yedeksiz, 0 açıklanmamış anahtar. Yedek ve bulut gövdesi aynı `snapshotUserData` işlevinden, yalnız `BACKED_UP_KEYS`.

## D2 Sıkışma/taşma — bulgu yok

Yedek 10 MB sınırı (`App.tsx:457`, `backup.ts:255`); bulut `MAX_SYNC_CHARS` 1,5 M (`cloud.ts:83,263`); karantina en çok 2 kopya, süresi dolan açılışta temizlenir; kurtarma kovası başına 3 kayıt; sunucu gövde sınırı 512 KB, hız sınırı tablosu en çok 1000. Paket: JS 1.035.281 B (sınır 1.250.000), en büyük parça 576.789 B (sınır 700.000), CSS 11.240 B (sınır 14.000).

## D3 Güncel ve doğru veri

Yalnız `durum==='guncel'` değer hesaba girer (`evds.ts:122`); varsayımlar "doğrulanmadı" etiketli. Bulgular aşağıda.

## D4 Yanlış kodlanmış yollar

`/api/evds` iki platformda da karşılıklı; CSP ile istemci hedefleri tutarlı. Bulgular aşağıda.

## D5 Sunucu fonksiyonları — KIRMIZI/YEŞİL

Gerçek undici fetch, yerel sahte EVDS sunucusu: ok 200 (gizli alan süzüldü); redirect → 502; >512 KB → 502; chunked akış sınırda kesildi; yavaş gövde 4 sn'de kesildi; 500/401 → sabit mesaj, anahtar sızmadı; geçersiz parametre → 400; anahtarsız → 503 `anahtar_yok`. Workers-best-practices maddeleri (zaman aşımı, gövde sınırı, redirect, anahtar yalnız ortamda, Math.random/log yok) geçti.

## Bulgular

| No | Şiddet | Yer | Açıklama ve düzeltme | Durum |
|---|---|---|---|---|
| A-D3-1 | ORTA | `src/kaynaklar/tcmb.ts:59-66` | Yıllık TÜFE "13 satır önce" ile hesaplanıyor; boş satır süzüldüğü için eksik ayda 14 ay önceye bölünüyor, resmî etiketle yanlış değer (KIRMIZI: 26,8 yerine 29,4, ikisi de `ok:true`). Düzeltme: tarih etiketiyle geçen yılın aynı ayı; yoksa `okunamadi`. | açık |
| A-D1-1 | ORTA | `vercel.json`, `netlify.toml:30` CSP | `connect-src` içinde `*.supabase.co`/`wss://*.supabase.co`; canlıda hesap kapalı, gereksiz dışarı çıkış kanalı. Düzeltme: env boşken üretim CSP'sinden çıkar; açılınca yalnız proje alt alanı. | açık |
| A-D3-2 | DÜŞÜK | `tcmb.ts:63-70` | TÜFE dönem tazeliği denetlenmiyor. Düzeltme: N aydan (ör. 3) eskiyse `veri_yok`. | açık |
| A-D3-3 | DÜŞÜK | `tcmb.ts:129`, `:218` | Önbellek/göç değerine mantık aralığı uygulanmıyor. Düzeltme: `dogrula` içinde aralık. | açık |
| A-D3-4 | DÜŞÜK | `src/backup.ts:283` | İçe aktarılan `createdAt` doğrulanmıyor (gelecek tarih hatırlatmayı susturur, "Invalid Date"). Düzeltme: geçerli ISO ve ≤ şimdi. | açık |
| A-D3-5 | DÜŞÜK | `src/store.ts:147-165` | Portföy iç şeması (sayı, ≥0) doğrulanmıyor; `"amount":"abc"` hesaba NaN olarak girer. Düzeltme: alan doğrulayıcı + `preserveCorruptRaw`. | açık |
| A-D3-6 | DÜŞÜK | `src/store.ts:91-133`, `App.tsx:106-111` | Örnek portföy kalıcı etiket taşımıyor; gerçek veri gibi hesaba girer. Düzeltme: `ornek:true` bayrağı + rozet (uyum ile). | açık |
| A-D1-2 | DÜŞÜK | `src/localData.ts:68-84` | SIFIRLA fiyat geçmişi önbelleğini silmiyor; anahtar adları tutulan varlıkları gösterir. Düzeltme: `clearPriceHistoryCache()`. | açık |
| A-D4-1 | DÜŞÜK | `market.ts`, `priceHistory.ts`, `cryptoMarketData.ts` | İstemci fetch'lerinde zaman aşımı yok. | ertelendi: CoinGecko ortak çalıştırıcı işinde |
| A-D4-2 | DÜŞÜK | `src/cloud.ts:66-70` | `validSupabaseUrl` `http:` kabul ediyor. Düzeltme: derlemede `https` zorunlu. | açık |
| A-D5-1 | DÜŞÜK | `netlify/functions/evds.mjs:149-157` | Gövde zaman aşımı `okunamadi` sayılıyor, devre kesiciye sayılmıyor. Düzeltme: `zaman_asimi` + `devre.hata()`. | açık |
| A-D1-3 | BİLGİ | `App.tsx:132-134` | Canlı fiyat isteği varlık kimliği + IP'yi sağlayıcıya iletir (miktar gitmez). Gizlilik metnine not (hukuk en sona). | bilgi |
| A-D4-3 | BİLGİ | `kayit.ts:2`, `tcmb.ts:3`, `App.tsx:139-146`, `inflation.ts:68` | Bayat yorumlar; etiket "TCMB (EVDS üzerinden)" olmalı. | açık |
| A-D4-4 | BİLGİ | `src/csv.ts:41,51` | CSV dosya adı UTC tarihi; TR 00–03 arası önceki gün. | açık |
| A-D5-2 | BİLGİ | `scripts/guvenlik-tarama.mjs:25` | Sembolik bağlı dizinde EISDIR ile çöküyor. Düzeltme: `isFile()` süzgeci. | açık |

Özet: 0 KRİTİK, 0 YÜKSEK, 2 ORTA, 8 DÜŞÜK, 5 BİLGİ.

## Doğrulanamayanlar

Gerçek EVDS (`TP.FG.J0`; TÜİK 2026 baz yılı değişikliği sonrası seri doğrulanmalı), Vercel `x-real-ip` ve CDN önbellek anahtarı, Vercel ortamında undici gövde iptali, gerçek Supabase (RLS, `delete_my_account`, version migration), CoinGecko/Frankfurter, Core Web Vitals.

## Ertelenenler

Hukuk ve KVKK (kullanıcı kararı: en sona); erişilebilirlik (arayüz değişince).

## Kapanış kaydı

(Düzeltme turu ve bağımsız doğrulama sonrası doldurulur.)
