// Dosya adı gibi "bugün" etiketleri için Europe/Istanbul takvim günü (cihaz saat diliminden bağımsız).
// toISOString().slice(0,10) UTC günüdür: Türkiye'de 00:00-03:00 arası bir önceki günü verirdi.
// Not: işlem/portföy tarihleri için todayLocalDate() (store.ts) kullanılır; bu yalnız dosya adı içindir.
const bicim = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });

export function istanbulTarihi(d: Date = new Date()): string {
  const p = Object.fromEntries(bicim.formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// CSV dışa aktarım dosya adı: fagent-<ad>-YYYY-AA-GG.csv (tarih Europe/Istanbul gününe göre).
export function csvDosyaAdi(ad: string, d: Date = new Date()): string {
  return `fagent-${ad}-${istanbulTarihi(d)}.csv`;
}
