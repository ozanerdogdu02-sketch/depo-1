// Enflasyon varsayımı — TEK DOĞRULUK KAYNAĞI.
//
// Önceden aynı sayı DÖRT yerde ayrı ayrı duruyordu: ProactiveInsightsCard, AfterTaxCard ve
// Projeksiyon'un kendi `useState`'leri, artı `agent.ts`'teki `VARSAYILAN_ENFLASYON` sabiti.
// Üç kart da "Enflasyon varsayımın (%)" etiketli bir kutu gösteriyordu ama biri değiştirilince
// diğerleri eski değeri kullanmaya devam ediyordu — aynı ekranda iki farklı reel getiri.
// Burası o dört yeri birleştirir.
//
// Değerin kaynağı üç durumdan biri olabilir ve arayüz bunu AÇIKÇA yazar:
//   'varsayim'  — elle güncellenen sabit (TÜİK son açıklanan yıllık TÜFE)
//   'evds'      — TCMB'den (EVDS üzerinden) canlı çekildi
//   'kullanici' — kullanıcı kendi oranını girdi (senaryo denemesi)
import { useSyncExternalStore } from 'react';
import { fetchInflationPct } from './evds';

// Varsayılan değer, kaynağı ve doğrulama durumu: src/config/varsayilanlar.ts. Canlı veri (EVDS) gelemezse bu kullanılır.
import { VARSAYILAN_ENFLASYON_PCT, varsayilanEnflasyonPct } from './config/varsayilanlar.ts';
export { VARSAYILAN_ENFLASYON_PCT };

export type InflationSource = 'varsayim' | 'evds' | 'kullanici';

export interface InflationState {
  pct: number;
  source: InflationSource;
  periodLabel?: string; // yalnızca 'evds' için: verinin ait olduğu dönem (ör. "07-2026")
}

let state: InflationState = { pct: varsayilanEnflasyonPct(), source: 'varsayim' };
const listeners = new Set<() => void>();

function emit(): void { listeners.forEach(fn => fn()); }

export function getInflation(): InflationState { return state; }

// Kullanıcının elle girdiği oran. Canlı veriyi de ezer — senaryo denemesi yapmak
// ("%55 olsaydı ne olurdu") meşru bir kullanım ve kullanıcının girdisi her zaman kazanır.
export function setUserInflation(pct: number): void {
  const safe = Math.min(200, Math.max(0, Number.isFinite(pct) ? pct : varsayilanEnflasyonPct()));
  state = { pct: safe, source: 'kullanici' };
  emit();
}

let started = false;

// Canlı oranı bir kez dener. Hata FIRLATMAZ — başarısızlıkta varsayım olduğu gibi kalır ve
// kullanıcıya hiçbir hata gösterilmez; canlı veri bir bonustur, ürünün şartı değildir.
export async function loadLiveInflation(): Promise<void> {
  if (started) return;
  started = true;
  const reading = await fetchInflationPct();
  if (!reading) return;
  // Kullanıcı bu arada kendi oranını girdiyse üzerine yazma.
  if (state.source === 'kullanici') return;
  state = { pct: reading.annualPct, source: 'evds', periodLabel: reading.periodLabel };
  emit();
}

export function useInflation(): InflationState {
  return useSyncExternalStore(
    fn => { listeners.add(fn); return () => listeners.delete(fn); },
    () => state,
  );
}

// Arayüzde sayının nereden geldiğini yazmak için. Kullanıcı bir oranın resmî mi yoksa
// varsayım mı olduğunu bilmeden ona güvenmemeli.
export function inflationSourceLabel(s: InflationState): string {
  if (s.source === 'evds') return `TCMB (EVDS üzerinden)${s.periodLabel ? ` · ${s.periodLabel}` : ''}`;
  if (s.source === 'kullanici') return 'senin girdiğin oran';
  return 'varsayım (TÜİK Eylül 2026 yıllık TÜFE ≈ %29,73, haber kaynaklı, doğrulanmadı; elle güncellenir)';
}

// SIFIRLA ile birlikte çağrılır. Kullanıcının girdiği oran da kullanıcı verisidir — tam
// sıfırlamadan sonra ayakta kalmamalı.
//
// Bu, kartlar kendi `useState`'lerini tutarken KENDİLİĞİNDEN oluyordu (SIFIRLA onboarding'e
// döndürüyor, kartlar unmount olup varsayılanla yeniden mount oluyordu). Paylaşılan modül
// durumuna geçince o örtük davranış kayboldu ve açıkça geri konması gerekti — e2e testi yakaladı.
//
// Canlı okuma yeniden denenir: önbellekte (fagent.kaynak.tcmb.tufe.v1; eski fagent.evds.v1 göç eder) duruyorsa anında geri gelir.
// TCMB'nin resmî oranı "kullanıcı verisi" değildir, silinmesi için bir sebep yok.
export function resetInflation(): void {
  state = { pct: varsayilanEnflasyonPct(), source: 'varsayim' };
  started = false;
  emit();
  void loadLiveInflation();
}
