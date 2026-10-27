/* Varsayılan oran, enflasyon, stopaj ve eşik sabitleri: TEK YAPILANDIRMA YERİ (P0 kural 6).
   Bu dosya saftır: I/O, React, window yok; yalnızca `import type` kullanır ki `node --test`
   doğrudan koşabilsin. Değerler taşınmadan önceki kodla BİREBİR aynıdır.

   Her sabitin yanında kaynak, tarih ve doğrulama durumu yazılır. "doğrulanmadı" etiketi taşıyan
   değer, kaynağı birincil belgeyle kontrol edilene kadar varsayımdır; gerçekmiş gibi gösterilmez. */
import type { AssetType } from '../store.ts';

/* ───────────── Stopaj oranları (%) ─────────────
   Kaynak: 27.03.2026 tarihli 11107 sayılı Cumhurbaşkanı Kararı (Resmî Gazete); yatırım fonu
   katılma payı kazançlarında stopaj %15 → %17,5 (01.05.2026'dan itibaren elde edilen kazançlar).
   TL mevduatta 6 aya kadar vade %17,5; 1 yıla kadar vade %15. Hisse senedi yoğun fonlarda %0
   istisnası sürüyor (TEFAS'ta işlem görmeyen serbest hisse yoğun fonlar hariç).
   Tarih: 2026-08-01 itibarıyla doğrulandı (ikincil okuma). Geçerlilik tarih aralığı yapısı yok (P6).
   DOĞRULANAMAYANLAR 0 BIRAKILDI, UYDURULMADI: sıfır "vergi yok" iddiası değil, "bu ürün oran
   varsaymıyor, sen gir" demektir (bkz. UNVERIFIED_TAX). */
// TODO(muhasebe): fon %17,5 ve 11107 sayılı karar için kaynak ve geçerlilik tarihi muhasebeci doğrulaması gerekir.
// TODO(muhasebe): mevduat stopajı vade basamaklıdır (6 ay %17,5 / 1 yıl %15); Holding vade tutmaz, varsayım 6 ay.
// TODO(muhasebe): BIST pay senedi alım-satım kazancında stopaj 0 (GVK geç. 67) ve hisse yoğun fon istisnası doğrulanmadı.
// TODO(muhasebe): kripto, altın, döviz, tahvil, BES, gayrimenkul oranları doğrulanamadı (0 + etiket).
// TODO(muhasebe): komisyon/masraf vergisel işlenişi (maliyete eklenir mi, BSMV/KDV) ve kur farkı kazancı ele alınmadı.
export const DEFAULT_TAX_RATES: Record<AssetType, number> = {
  fon: 17.5,
  mevduat: 17.5, // 6 aya kadar vade varsayıldı: store vade bilgisi tutmuyor, kullanıcı düzeltebilir
  hisse: 0,      // GVK geç. 67 kapsamında BIST pay senedi alım-satım kazancında stopaj uygulanmıyor
  kripto: 0,     // doğrulanamadı
  altin: 0,      // doğrulanamadı
  doviz: 0,      // doğrulanamadı (kur farkı)
  // 2026-09-04 eklendi: üçü de basit "kazanç üzerinden stopaj" modeline UYMAZ (tahvil/Eurobond
  // vade+araca göre değişir; BES'in kendi rejimi var; gayrimenkulde 5 yıl elde tutma istisnası var).
  tahvil: 0,       // doğrulanamadı
  bes: 0,          // doğrulanamadı; stopaj modeli BES'in gerçek rejimini temsil etmiyor
  gayrimenkul: 0,  // doğrulanamadı
};

// Oranı "0 çünkü öyle" ile "0 çünkü doğrulayamadık" ayrımı: arayüz bunu farklı anlatır.
export const UNVERIFIED_TAX: AssetType[] = ['kripto', 'altin', 'doviz', 'tahvil', 'bes', 'gayrimenkul'];

/* ───────────── Enflasyon varsayımı (yıllık, %) ─────────────
   Kaynak: TÜİK Eylül 2026 yıllık TÜFE %29,73 (5 Ekim 2026), haber kaynaklı; tam sayıya yuvarlandı.
   Durum: birincil kaynakla DOĞRULANMADI. Canlı veri (TCMB EVDS, seri TP.FG.J0) gelemezse geri düşme
   değeri budur; EVDS seri kodu da gerçek veriyle doğrulanmadı. Dönemsel olarak elle güncellenir.
   inflation.ts ve agent.ts bu tek değeri kullanır. */
// TODO(muhasebe): TÜFE değeri ve TP.FG.J0 seri kodu birincil kaynakla doğrulanmadı.
export const VARSAYILAN_ENFLASYON_PCT = 30;

/* ───────────── Faiz varsayımları (yıllık, %) ─────────────
   Türkiye için anahtarsız/resmî bir kaynak yok; kullanıcı kendi oranını girebilir.
   Kaynak: yok (elle varsayım). Tarih: doğrulanmadı. */
// TODO(muhasebe): her iki faiz varsayımı da kaynaksızdır; "senin varsayımın" etiketiyle gösterilir.
export const DEFAULT_DEPOSIT_RATE_PCT = 45; // ajan: "mevduatta tutsaydım" karşı-olgusalı
export const DEFAULT_RISK_FREE_PCT = 45;    // RiskPanel: risksiz faiz varsayımı

/* ───────────── Projeksiyon senaryo getirileri (yıllık, %) ─────────────
   Kaynak: yok; kullanıcı arayüzde değiştirebilir. Tahmin değil, örnek aralıktır.
   Tarih: doğrulanmadı. */
// TODO(muhasebe): senaryo getirileri kaynaksız varsayımdır; belgelenmeli.
export const SCENARIO_DEFAULT_RATES_PCT = { dusuk: 20, orta: 35, yuksek: 50 } as const;

/* ───────────── Sıra riski sapması (yüzde puan) ─────────────
   "Kötü yıllar başta" senaryosunda yıllık getiri ortalama ∓ bu değerdir (src/projection.ts siraRiski).
   Kaynak: yok; örnek amaçlı kaynaksız varsayım, tahmin değil. Tarih: doğrulanmadı. */
// ÜRÜN VARSAYIMI: kaynaksızdır, ama vergi/mevzuat iddiası taşımaz; hukuk/muhasebe doğrulaması gerekmez (TODO(muhasebe) değil).
// Arayüzde gösterilirse 'varsayım' etiketiyle gösterilir.
export const SIRA_RISKI_SAPMA_PP = 15;

/* ───────────── Hedef sapma eşikleri ─────────────
   bant = min(DRIFT_ABSOLUTE_BAND_PP, hedef × DRIFT_RELATIVE_BAND) puan (gerekçe: analytics.ts driftBandOf).
   Kaynak: ürün tasarım kararı (bir hukuki/vergisel kaynak yok). */
export const DRIFT_ABSOLUTE_BAND_PP = 5;
export const DRIFT_RELATIVE_BAND = 0.25;
