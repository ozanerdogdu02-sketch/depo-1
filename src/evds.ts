// TCMB (EVDS üzerinden) istemcisi — yıllık TÜFE enflasyonunu resmî kaynaktan çeker.
//
// Asıl iş artık src/kaynaklar/tcmb.ts bağdaştırıcısındadır (KaynakSonucu, önbellek, zaman aşımı, yeniden
// deneme, devre kesici). Bu dosya MEVCUT İMZAYI korur: `fetchInflationPct` ve `InflationReading` aynı kalır,
// böylece inflation.ts ve e2e akışı değişmez.
//
// Anahtar burada YOK: istek `/api/evds` sunucu ucuna gider (api/evds.mjs -> netlify/functions/evds.mjs).
//
// FAIL-SAFE: bu modül HİÇBİR KOŞULDA hata fırlatmaz ve asla tahmin edilmiş sayı döndürmez. Taze (guncel)
// değer yoksa `undefined` döner, çağıran elle girilen varsayıma düşer. Önbellekteki ESKİ değerin ekranda
// "son bilinen değer" olarak gösterilmesi görünür davranışı değiştireceği için bu sürümde BAĞLANMADI:
// `fetchInflationSonucu` tam sonucu verir, ekrana bağlama tasarım oturumunu bekliyor.
import { tufeOku, TUFE_SERIES } from './kaynaklar/tcmb.ts';
import type { KaynakSonucu } from './kaynaklar/tip.ts';
import type { TufeVeri } from './kaynaklar/tcmb.ts';

export { TUFE_SERIES };

export interface InflationReading {
  annualPct: number;    // yıllık % değişim
  periodLabel: string;  // ör. "07-2026" — hangi aya ait olduğu
  fetchedAt: string;
}

// Tam sonuç (durum, dönem, alındı, hata). Hata FIRLATMAZ.
// TODO(hukuk): TCMB EVDS verisinin yeniden yayınlanması ve API anahtarı kullanım şartları doğrulanmadı.
// TODO(muhasebe): TÜFE seri kodu TP.FG.J0 gerçek veriyle doğrulanmadı.
export function fetchInflationSonucu(signal?: AbortSignal): Promise<KaynakSonucu<TufeVeri>> {
  return tufeOku({ signal }).catch((): KaynakSonucu<TufeVeri> => ({ kaynak: 'tcmb', durum: 'ulasilamadi', hata: 'ulasilamadi' }));
}

// Yıllık enflasyonu döner. Başarısızlıkta `undefined` — throw ETMEZ.
export async function fetchInflationPct(signal?: AbortSignal): Promise<InflationReading | undefined> {
  const s = await fetchInflationSonucu(signal);
  if (s.durum !== 'guncel' || !s.veri) return undefined;
  return { annualPct: s.veri.annualPct, periodLabel: s.donem ?? '', fetchedAt: s.alindi ?? new Date().toISOString() };
}
