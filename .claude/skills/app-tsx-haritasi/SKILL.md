---
name: app-tsx-haritasi
description: src/App.tsx (~2200 satır) ve src/agent.ts (~1200 satır) için bölüm haritası. Bu dosyalarda bir şey değiştirmeden önce kullan; dosyayı baştan okumak yerine doğru satır aralığını bulmak için.
---

# App.tsx / agent.ts haritası

Satır numaraları yaklaşıktır (2026-10-24). **Düzenlemeden önce `grep -n` ile doğrula**, sonra yalnızca o aralığı oku.
Dosyayı baştan sona okuma; kendi düzenlemenden sonra yeniden okuma.

## src/App.tsx
| Bileşen / bölüm | Yaklaşık satır |
|---|---|
| Grafik sabitleri (PIE_*, CHART_*) | 39–58 |
| `useCloudSynced` | 71 |
| `Onboarding` (ilk kurulum) | 96 |
| `ProactiveInsightsCard`, `AfterTaxCard` | 158, 213 |
| `TargetAllocationCard` (hedef dağılım) | 312 |
| `BackupCard` (CSV yedek/geri yükleme) | 428 |
| `OtoAktarimCard` | 528 |
| `Panel` (hisse/fon/kripto sekmeleri) | 624 |
| `Bugun` | 1075 |
| `Islemler` | 1145 |
| `Projeksiyon` (+ `projectFinalValue`, `SCENARIOS`) | 1284–1299 |
| `AgentChartView`, `TeachPanel`, `AgentMemoryCard` | 1414, 1470, 1574 |
| `Ajan` (sohbet; `send`, `resolveAction`, onay düğmeleri) | 1704 (send ≈1777, resolveAction ≈1843) |
| `SideLink`, ana `App`, `resetAll` | 2066, 2105 |

## src/agent.ts (saf: I/O yok)
Kurallı sohbet (`CHAT_RULES`, tavsiye reddi regex'i ≈600–623), analiz ve içgörü üreticileri, yedek/öğretme yanıtları,
işlem komutu ayrıştırma (≈947, ≈1129), fallback metni (≈1194). Hesap/bulut/dosya erişimi buraya GİRMEZ.

## Hızlı arama
`grep -n "function Ajan\|function resolveAction\|CHAT_RULES\|fallback" src/App.tsx src/agent.ts`
Kullanıcıya görünen metni değiştirirsen `grep -rn "<eski metin>" tests/e2e` ile seçicileri de güncelle.
