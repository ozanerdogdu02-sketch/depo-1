---
name: veri-akisi-haritasi
description: FAGENT'ta hangi veri hangi localStorage anahtarında, hangi dosya yazıyor ve hangi dış ağ çağrısı var. Veri katmanı, yedek, bulut, fiyat hattı işine başlamadan önce grep yerine bunu kullan.
---

# Veri akışı haritası (2026-10-25; satırlar kayar, grep ile doğrula)

Plan: `docs/veri-akisi/mevcut-durum-ve-plan.md`. Spec: `docs/veri-akisi/spec.md`.

| Anahtar | Dosya | Yedek+bulut |
|---|---|---|
| fagent.portfolio.v1 | src/store.ts (KEY :56, load :125, commit :155; ErrorBoundary okur) | evet |
| fagent.agent.memory.v1 | src/agentMemory.ts | evet |
| fagent.agent.training.v1 | src/agentTraining.ts | evet |
| fagent.tax.v1 | src/taxRates.ts | evet |
| fagent.target.v1 | src/targetAllocation.ts | evet |
| fagent.backup.v1, cloud.owner/base.v1 | src/backup.ts, src/localData.ts | hayir |
| kaynak.tcmb.tufe.v1, kaynak.tcmb.kur.v1 (eski evds.v1 göç eder), cryptomarket.cache.v2, pricehistory.v1.* | src/kaynaklar/ (tcmb.ts, onbellek.ts), cryptoMarketData.ts, priceHistory.ts (önbellek) | hayir |

- Liste: `BACKED_UP_KEYS` src/backup.ts:26 (aynı liste bulut beyaz listesi). Yeni katman: yedek + SIFIRLA (localData.ts) + cloud.
- Tek yazma noktası: store.ts `actions.*`. Diğer katmanlar `notifyUserDataChanged()` çağırır.
- Dış ağ (src): Frankfurter market.ts:38, priceHistory.ts:92; CoinGecko market.ts:53, priceHistory.ts:57, cryptoMarketData.ts:119; /api/evds src/kaynaklar/tcmb.ts (evds.ts ince sarmalayıcı; api/evds.mjs -> netlify/functions/evds.mjs); Supabase cloud.ts (düz metin upsert :303).
- Gömülü sabitler (P0 kural 6 ihlali): analytics.ts:507 DEFAULT_TAX_RATES, inflation.ts:20, agent.ts:318, App.tsx:142,290.
- e2e: localStorage'a dokunan 11 dosya (yedek, auth, hedef, ... ); route taklidi: cryptodemo, cryptomarket, live, risk.
- Node 22.22: `node --test x.test.ts` çalışır, ama içe aktarma `.ts` uzantılı olmalı (uzantısız ERR_MODULE_NOT_FOUND). indexedDB yok, crypto.subtle var.
- IndexedDB aynası (P3 bağlama, 2026-10-27): localStorage ESAS, IndexedDB ayna. Kod: src/mirror.ts (tarayıcı), src/storage/mirror.ts (saf kurallar), src/recovery.ts (bozuk kayıt kopyası). main.tsx açılışta `bootStorage()` bekler, App/store DİNAMİK içe aktarılır (store.ts yüklenirken load() koşar). SIFIRLA/çıkış: localData.ts → clearMirrorForReset + clearRecoveryKeys. Ek anahtarlar: `fagent.mirror.cleared.v1` (silme işareti), `fagent.recovery.corrupt.*` (bozuk kayıt kopyası, 256 KB üstü yalnız not), IndexedDB `fagent.recovery.idb.*` (anahtar başına en çok 3) — hiçbiri BACKED_UP_KEYS değil, SIFIRLA/çıkış siler. Silme işareti varken açılış ASLA geri yüklemez. Yeni katman eklersen BACKED_UP_KEYS yeterli (ayna o listeyi izler). Birim testte store.ts içe aktarımları `.ts` uzantılı olmalı (recovery.ts böyle).
