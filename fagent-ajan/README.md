# FAGENT · Ajan Laboratuvarı

FAGENT'ın yapay zeka ajanının **bağımsız geliştirme ortamı**. Ana uygulamayı (`fagent/`)
bozma riski olmadan ajan üzerinde çalışmak için ayrıldı.

## Neden ayrı bir uygulama?

Ana Fagent'ta ajan, sekizinci sekmedir — üzerinde çalışmak için her seferinde tüm uygulamayı
açman, portföy kurman, sekmeye gitmen gerekir. Burada ajan **ana konudur**: sohbet solda,
onu besleyen ve denetleyen her şey sağda.

- **Ana uygulamadan tamamen ayrık veri.** localStorage anahtarları `fagent.lab.*` öneklidir
  (`fagent.lab.portfolio.v1`, `fagent.lab.agent.memory.v1`, `fagent.lab.agent.training.v1`).
  Burada ne yaparsan yap **gerçek Fagent portföyün etkilenmez**.
- Çekirdek ajan dosyaları (`agent.ts`, `agentMemory.ts`, `agentTraining.ts`, `store.ts`)
  ana uygulamadan **kopyalanmıştır**. Burada denemeni yapıp beğendiğini `fagent/src/`'ye taşırsın.

## Çalıştırma

```bash
cd fagent-ajan
npm install
npm run dev          # http://localhost:5175  (ana Fagent 5173'te — çakışmaz)
npm run typecheck    # doğrulama 1
npm run build        # doğrulama 2
```

## Ekrandaki paneller

| Panel | Ne işe yarar |
| --- | --- |
| **Ajan Sohbeti** | Tam ajan: analiz, grafik çizme, 👍/👎 geri bildirim, komutla işlem (Onayla/Vazgeç). Altta **hızlı test** düğmeleri — sık kullanılan soruları tek tıkla gönderir. |
| **Karar Denetleyici** | Laboratuvara özel. Her yanıtın **hangi katmandan** geldiğini, niyet etiketini (`intentId`), grafik türünü ve süreyi gösterir. Üstte "anlaşılan %" ve fallback sayacı. |
| **Portföy Bağlamı** | Ajanın gördüğü veri. Karma/kripto örnek yükle, varlık ekle/sil — ajanın cevabı senaryoya göre nasıl değişiyor gör. |
| **Ajan Ne Biliyor?** | Uzun süreli bellek: risk seviyesi, ajan modu, vade, ilgi alanları (düzenlenebilir) + son sorular/öneriler. |
| **Ajanı Eğit** | Soru-cevap öğret. Öğretilenler built-in kuralların **önüne** geçer. |

## Karar Denetleyici — katmanlar

`chatReply`'nin öncelik sırası (agent.ts):

```
öğretilmiş bilgi → işlem komutu → bellek sorgusu → takip cümlesi
→ grafik → kıyaslama → genel kurallar → varlık arama → fallback
```

Denetleyici bu katmanı `AgentReply`'nin alanlarından **türetir** — `agent.ts`'e hiç dokunmaz,
böylece ajan modülü saf (I/O'suz, test edilebilir) kalır.

| Renk | Katman | Nereden anlaşılır |
| --- | --- | --- |
| 🔵 mavi | Öğretilmiş bilgi | `trainedFactId` dolu |
| 🟡 sarı | İşlem komutu | `pendingAction` dolu |
| 🔴 kırmızı | Fallback | `isFallback` true |
| 🟣 mor | Grafik üretimi | `chart` dolu |
| 🟢 yeşil | Analiz / kural | `intentId` dolu |

**Fallback oranı ajan geliştirmenin ana metriğidir:** düşürmek için ya yeni bir kural yaz
(`agent.ts` → `CHAT_RULES`) ya da o soruyu ajana öğret.

## Değişiklikleri ana uygulamaya taşıma

Laboratuvarda `agent.ts` (ya da `agentMemory.ts` / `agentTraining.ts`) üzerinde bir iyileştirme
yaptıysan:

1. `fagent-ajan/src/agent.ts` → `fagent/src/agent.ts` kopyala.
2. `agentMemory.ts` / `agentTraining.ts` / `store.ts` taşıyorsan **localStorage anahtarındaki
   `.lab.` ekini geri al** (`fagent.lab.agent.memory.v1` → `fagent.agent.memory.v1`).
3. Ana uygulamada doğrula:
   ```bash
   cd fagent && npm run typecheck && npm run build
   export CHROMIUM_PATH=/opt/pw-browsers/chromium
   npm run test:e2e
   ```

## Kurallar (ana projeyle aynı)

- **API anahtarı yok.** Ajan yerel kurallarla çalışır (regex + kelime benzerliği) — LLM değil.
- **Sahte veri yok.**
- **Veri tarayıcıda kalır** — sunucu, hesap, telemetri yok.
- **`agent.ts` saf kalır** — I/O yok, veri parametreyle geçer. Gerçek LLM'e geçişi mümkün kılan şey budur.
- Yanıtlar **yatırım tavsiyesi değildir.**
