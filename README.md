# Aura Finance

Kişisel gelişim panosu: finansal eğitim takibi, spor rutini ve AI destekli BDT (bilişsel davranışçı terapi) duygu günlüğü.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-tfkxfnvn)

## Mimari

- **İstemci:** Vite + React + TypeScript (`src/`)
- **Sunucu:** Express (`server/`) — AI proxy, anonim JWT oturumları, rate limiting, analitik
- API anahtarı **yalnızca sunucuda** (`.env` → `ANTHROPIC_API_KEY`) tutulur; tarayıcıya asla gönderilmez.
- Anahtar tanımlı değilse uygulama **demo modunda** çalışır (şablon AI yanıtları) — "önce dene" deneyimi.

## Kurulum

```bash
npm install
cp .env.example .env   # değerleri doldur (anahtar yoksa demo modu)
npm run server         # API sunucusu → http://localhost:3001
npm run dev            # Vite → http://localhost:5173 (/api istekleri sunucuya proxy'lenir)
```

## API Uçları

| Uç | Koruma | Açıklama |
|---|---|---|
| `POST /api/auth/session` | rate limit | Anonim oturum (JWT) — kişisel veri istemez |
| `POST /api/ai/chat` | JWT + 10/dk | BDT yeniden çerçeveleme önerisi (Anthropic proxy) |
| `POST /api/events` | JWT + 60/dk | Beyaz listeli olay kaydı — serbest metin kabul edilmez |
| `GET /api/metrics/me` | JWT | Kullanıcının kendi "değer kanıtı" metrikleri |
| `GET /api/admin/metrics` | `x-admin-key` | Admin paneli metrikleri (`/admin` sayfası) |

## KVKK Notu

Analitik olayları yalnızca olay adı, zaman damgası, anonim kullanıcı kimliği (rastgele UUID) ve dar bir sayısal/enum özellik kümesi içerir. Günlük metinleri, durumlar ve düşünceler **hiçbir zaman** sunucuda loglanmaz; beyaz liste dışındaki alanlar sunucuda atılır.

## Test Listesi — Güvenlik (Prompt 1)

1. ✅ `ANTHROPIC_API_KEY` boşken `/api/ai/chat` demo yanıt döner (`demo: true`)
2. ✅ Jetonsuz `/api/ai/chat` isteği → 401
3. ✅ Boş/eksik gövde → 400 + alan bazlı Türkçe hata mesajları
4. ✅ Dakikada 10'dan fazla AI isteği → 429
5. ✅ Hata gövdelerinde anahtar/sağlayıcı detayı sızmaz (sadece genel mesaj)
6. ✅ İstemci kodunda ve tarayıcıda API anahtarı bulunmaz (`grep -r ANTHROPIC src/` boş)

## Test Listesi — Analitik (Prompt 2)

1. ✅ Bilinmeyen olay adı → 400 (`unknown_event`)
2. ✅ Beyaz liste dışı özellikler (ör. serbest metin) sunucuda atılır
3. ✅ `mood_entry_created` yalnızca skor/duygu sayısı/AI kullanımı gönderir, metin göndermez
4. ✅ Sayfa geçişleri `page_view` olayı üretir
5. ✅ Dashboard'daki "Değer Kanıtı" paneli `/api/metrics/me`'den beslenir; sunucu kapalıysa sessizce gizlenir
6. ✅ `/admin` sayfası doğru `ADMIN_KEY` ile metrikleri gösterir; yanlış anahtar → 401, anahtar tanımsız → 503
7. ✅ Analitik istekleri asla kullanıcı akışını bloklamaz (ateşle-unut, hatalar yutulur)
