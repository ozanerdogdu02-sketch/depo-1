// SENTETİK FİKSTÜR — GERÇEK BORSA İSTANBUL BÜLTENİ DEĞİLDİR; bülten biçimi DOĞRULANMADI.
// Aşağıdaki "SENTETIK" metin biçimi ve ayrıştırıcı yalnızca sunucu hattını (bayrak, sınırlar, doğrulama, önbellek) sınamak için
// UYDURULDU; gerçek bülten bu biçimde olmak zorunda değildir. Semboller uydurmadır (ORNKA vb.), fiyatlar anlamsızdır.
export const sentetikMetin = (tarih = '2026-10-29', satirlar: Array<[string, string]> = [['ORNKA', '12,50'], ['ORNKB', '100,00'], ['ORNKC', '7,25']]) =>
  `#SENTETIK;${tarih}\n` + satirlar.map(([k, f]) => `${k};${f}`).join('\n') + '\n';

export const sentetikAyristirici = {
  ad: 'sentetik',
  taniyabilir: (m: string) => m.startsWith('#SENTETIK;'),
  ayristir: (m: string) => {
    const [bas, ...govde] = m.trim().split('\n');
    return {
      tarih: bas.split(';')[1],
      satirlar: govde.map(l => { const [kod, f] = l.split(';'); return { kod, kapanis: Number(f.replace(',', '.')) }; }),
    };
  },
};
