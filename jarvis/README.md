# Finansal Jarvis

7/24 kendi sunucunda yaşayan, Telegram'dan konuştuğun kişisel finansal asistan.
Sabah brifingini sen sormadan gönderir, alarmlarını arka planda kollar, defterini tutar.

**Bu, `fagent/` projesinden tamamen bağımsızdır.** Ortak kod yoktur. FAGENT bir tarayıcı
uygulaması — sen sekmeyi açmazsan çalışmaz ve CORS yüzünden BIST/TEFAS verisine erişemez.
Jarvis sunucuda yaşadığı için ikisini de yapabiliyor: hem sen uyurken çalışıyor, hem
gerçek Türk piyasası verisine ulaşabiliyor.

---

## Ne yapar

| | |
|---|---|
| 🌅 **Proaktif brifing** | Hafta içi 09:00 ve 18:30'da özet: portföy değeri, dünden farkı, günün hareketleri, piyasa nabzı, dikkat çeken riskler |
| 🔔 **Alarm** | "BTC 4 milyon üstüne çıkarsa haber ver" — 15 dakikada bir kontrol, tetiklenince bildirim |
| 💬 **Türkçe sohbet** | "portföyüm ne durumda", "en çok kazandıran ne", "altına ne kadar yatırmıştım" |
| 📒 **Defter** | Alım/satım kaydı, ağırlıklı ortalama maliyet, gerçek kâr/zarar |
| ⚖️ **Dengeleme planı** | "kriptoyu %30'a düşür" → adım adım plan → onayınla uygulanır |
| 🎙 **Sesli konuşma** | Sesli mesaj gönder, sesli cevap al (opsiyonel) |
| 📈 **Canlı fiyat** | BIST hisseleri, TEFAS fonları, TCMB döviz kurları, gram altın, kripto |

**Ne YAPMAZ:** hiçbir borsaya/aracı kuruma emir göndermez, yatırım tavsiyesi vermez,
verini hiçbir yere yollamaz.

---

## Önce dene (30 saniye, kurulum yok)

Telegram/Docker/Ollama kurmadan Jarvis'in ne yaptığını gör:

```bash
cd jarvis && npm install
npm run demo
npm run demo -- "kriptoyu %25'e düşür"   # kendi cümleni dene
```
Örnek portföyle, bellek içi veritabanında çalışır — gerçek verine dokunmaz, ağa çıkmaz.

---

## Kurulum

### Yol 1 — Docker (önerilen)

**1. Telegram botunu oluştur.** Telegram'da [@BotFather](https://t.me/BotFather)'a `/newbot`
yaz, bir isim ver, sana bir token verecek.

**2. Ayar dosyasını hazırla:**
```bash
cd jarvis
cp .env.example .env
nano .env          # TELEGRAM_BOT_TOKEN satırını doldur
```

**3. Başlat:**
```bash
docker compose up -d
docker compose logs -f jarvis
```
Ollama modeli ilk açılışta iner (birkaç GB, sabır). Jarvis bu sırada zaten çalışıyor —
model gelene kadar kural tabanlı cevap verir.

**4. Kendi chat id'ni öğren.** Telegram'dan botuna `/start` yaz, sonra:
```bash
docker compose exec jarvis npx tsx src/doctor.ts
```
Çıktıda `OWNER_CHAT_ID=123456789` satırını göreceksin. Bunu `.env`'e yaz ve yeniden başlat:
```bash
docker compose restart jarvis
```

**5. Sesli konuşma istersen** (opsiyonel):
```bash
# .env içinde: VOICE_ENABLED=true
docker compose --profile voice up -d
```

### Yol 2 — Docker olmadan (kendi bilgisayarında)

```bash
cd jarvis
npm install
cp .env.example .env      # token + chat id doldur
npm run doctor            # her şeyi sınar
npm start
```
Dil katmanı için [Ollama](https://ollama.com) kurulu olmalı ve model çekilmiş olmalı:
```bash
ollama pull qwen2.5:7b-instruct
```
Ollama yoksa sorun değil — Jarvis kural tabanlı modda tam çalışır.

> ⚠️ Bilgisayarın kapalıyken Jarvis de kapalıdır: sabah brifingi gelmez.
> Gerçek 7/24 için bir VPS'e kur.

---

## `npm run doctor` — ilk çalıştıracağın komut

Bu, projenin en önemli aracı. Sistem, ayarlar, veritabanı, **beş veri kaynağı**, Ollama,
Telegram ve ses servisini tek tek dener; hangisinin çalışıp çalışmadığını ve her sorun
için ne yapman gerektiğini yazar. Hiçbir şeyi değiştirmez.

Bir şey ters gittiğinde ilk buraya bak.

---

## Konuşma örnekleri

```
portföyüm                          → özet
brifing                            → tam rapor (fiyatları tazeler)
analiz et                          → risk ve reel getiri yorumu
dolar kaç                          → güncel TCMB kuru
BTC ne durumda                     → güncel fiyat

ekle Gram Altın altin 25000        → elle değerli varlık
ekle Bitcoin kripto BTC 0.05       → canlı fiyata bağlı (0,05 BTC)
ekle THYAO hisse THYAO 200         → 200 adet THYAO

Bitcoin 5000 TL aldım              → onay ister, sonra deftere yazar
THYAO'dan 2000 TL sattım           → onay ister
guncelle Mevduat 45000             → elle değer güncelleme

BTC 4 milyon üstüne çıkarsa haber ver
dolar 45 altına düşerse haber ver
alarmlarım

kriptoyu %30'a düşür               → dengeleme planı + onay
```

`yardım` yaz, hepsini listeler.

---

## Mimari — neden böyle kuruldu

Beyin olarak **yerel bir Ollama modeli** kullanılıyor (API anahtarı yok, veri dışarı
çıkmıyor). Ama küçük yerel modellerin bilinen bir huyu var: **sayı uydururlar.**
"Portföyün 2.410.000 TL" cümlesindeki tek bir yanlış hane Jarvis'i işe yaramaz yapar.

Bu yüzden sorumluluk keskin biçimde ayrıldı:

```
Kullanıcı metni
      ↓
  [ kural tabanlı ayrıştırıcı ]   ← anlarsa burada biter
      ↓ (anlamazsa)
  [ model: niyet çıkarma ]        ← sadece "ne demek istedi"
      ↓
  [ DETERMİNİSTİK YÜRÜTÜCÜ ]      ← TÜM rakamlar burada hesaplanır
      ↓
  [ model: doğallaştırma ]        ← opsiyonel, rakama dokunamaz
      ↓
   Telegram
```

Modelin uydurmasına karşı üç somut kilit var:

1. **Varlık adı doğrulaması** — model portföyde olmayan bir varlık adı üretirse niyet düşürülür.
2. **Tutar temellendirmesi** — işlem/alarm tutarı kullanıcının kendi cümlesinde geçmiyorsa
   niyet düşürülür. "5000 TL sattım" cümlesinden 50.000 üreten bir model defteri bozamaz.
3. **Rakam koruması** — doğallaştırılmış metin, taslakta olmayan bir sayı içeriyorsa
   reddedilir ve özgün metin gönderilir.

Sonuç: dil katmanı en kötü ihtimalle **işe yaramaz** olur — asla **yanlış** olmaz.
Ollama tamamen kapalıyken bile brifing, alarm, defter ve dengeleme eksiksiz çalışır.

---

## Veri kaynakları

| Varlık | Kaynak | Not |
|---|---|---|
| Döviz | TCMB günlük bülten (resmî XML) | En sağlam kaynak. `Unit` alanına dikkat: JPY 100 birimlik. |
| BIST hisse | Yahoo Finance | Resmî API değil, sitenin kendi ucu — değişebilir |
| TEFAS fon | tefas.gov.tr arka ucu | Resmî API değil |
| Kripto | CoinGecko genel uç | Anahtarsız, hız sınırlı → önbellekli |
| Altın | ons × USD/TRY ile **türetilmiş** | Spot fiyat; kuyumcu işçiliği/marjı hariç |

**Dürüstlük kuralı:** bir kaynak düşerse Jarvis "veri alamıyorum" der. Tahmini fiyat
**üretmez**. Önbellekten dönen değer her zaman "eski veri" diye işaretlenir.

> Bu uçların hiçbiri geliştirme ortamından doğrulanamadı (ağ politikası engelliyordu).
> `npm run doctor` tam olarak bunun için var — gerçek doğrulama senin makinende oluyor.
> Bir kaynağın şeması değişmişse düzeltme tek dosyayla sınırlı (`src/data/<kaynak>.ts`).

---

## Model seçimi

| Model | RAM | Not |
|---|---|---|
| `qwen2.5:7b-instruct` | ~6 GB | Varsayılan, iyi Türkçe |
| `qwen2.5:3b-instruct` | ~3 GB | Küçük VPS için |
| `gemma2:9b` | ~7 GB | Alternatif |

`.env` içindeki `OLLAMA_MODEL` ile değiştir. `npm run doctor` sunucunun RAM'i yetmiyorsa
uyarır ve Türkçe kalitesini örnek bir soruyla ölçer.

Model istemiyorsan `OLLAMA_MODE=off` — Jarvis tamamen çalışmaya devam eder.

---

## Güvenlik ve gizlilik

- **`OWNER_CHAT_ID` allowlist**: bot yalnızca senin chat id'ne cevap verir. Botun adını
  bulan biri `/portfoy` yazsa bile hiçbir şey göremez; istek handler'lara hiç ulaşmaz.
- **Veri sende kalır**: SQLite dosyası kendi sunucunda. Hesap yok, telemetri yok.
- **Model yerel**: sohbetlerin hiçbir yere gönderilmez.
- **Açık port yok**: Telegram uzun yoklama (long polling) kullanılıyor — sunucunun dışarıya
  bir port, alan adı ya da TLS sertifikası sunması gerekmiyor.
- **`.env` git'e girmez.**

---

## Sorun giderme

| Belirti | Bak |
|---|---|
| Bot cevap vermiyor | `OWNER_CHAT_ID` doğru mu? `npm run doctor` chat id'ni söyler |
| Brifing yanlış saatte | `TZ` ayarı. `doctor` çıktısındaki saat seninkiyle uyuşmalı |
| "model not found" | `docker compose logs ollama-init` — model inmiş mi? |
| Fiyatlar gelmiyor | `npm run doctor` → 4. bölüm hangi kaynağın düştüğünü söyler |
| Ollama çok yavaş | Model RAM'e sığmıyor olabilir; `qwen2.5:3b-instruct` dene |
| Sesli mesaj çalışmıyor | `VOICE_ENABLED=true` + `--profile voice` ile başlattın mı? |

Veriyi yedeklemek için:
```bash
docker compose cp jarvis:/app/data/jarvis.db ./jarvis-yedek.db
```

---

## Geliştirme

```bash
npm run typecheck    # tsc --noEmit
npm test             # 146 test, tamamen çevrimdışı (fixture'lara karşı)
npm run demo         # Telegram olmadan hattı uçtan uca çalıştır
npm run dev          # tsx watch
npm run doctor       # canlı sağlık kontrolü
```

Kod haritası:

| Dizin | Sorumluluk |
|---|---|
| `src/core/` | Finans matematiği — saf, LLM'e bağlı değil, tüm rakamlar burada |
| `src/data/` | Veri kaynağı adaptörleri (her biri: saf ayrıştırıcı + ağ sarmalayıcı) |
| `src/brain/` | Niyet çözümleme (kural + model), deterministik yürütücü |
| `src/telegram/` | Bot, allowlist, onay akışı, ses istemcisi |
| `voice/` | Ayrı konteyner: Whisper (STT) + Piper (TTS) |

> **Türkçe regex uyarısı:** JavaScript'in `\b` sınırı ASCII'dir ve `ç ğ ı ö ş ü`
> harflerini kelime karakteri saymaz — `/\bçıkarsa\b/` Türkçe metinde **eşleşmez**,
> üstelik hata da vermez. Yeni kalıp yazarken `src/brain/parse.ts` içindeki
> `stemRe()` / `wordRe()` yardımcılarını kullan.

---

*Yatırım tavsiyesi değildir. Jarvis senin defterini tutar ve rakamları hesaplar; kararlar senindir.*
