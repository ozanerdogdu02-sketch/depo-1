// Kaynak bağdaştırıcılarının ortak sözleşmesi. SAF: I/O, React, window, ağ yok.
// Tasarım: docs/veri-akisi/cok-kaynakli-veri-plani.md §2. Bağdaştırıcı hata FIRLATMAZ; her şey KaynakSonucu döner.
// Sahte veri yok: `veri` yalnızca gerçekten okunmuş değerdir (ya da önbellekteki son okunmuş değer, durum 'eski').
import { KAYNAK_YENIDEN_DENEME_BEKLEME_MS } from '../config/varsayilanlar.ts';

export type KaynakAdi = 'tcmb' | 'coingecko' | 'frankfurter' | 'kap' | 'bist' | 'elle';

// guncel: taze veri (kaynaktan ya da süresi dolmamış önbellekten)
// eski: kaynağa ulaşılamıyor, önbellekte son bilinen değer var (etiketli anılır, hesaplarda kullanılmaz)
// ulasilamadi: ulaşılamadı ve önbellek yok
// kapali: yapılandırma yok (sunucu anahtarı ya da seri tanımı); arıza değil
// veri_yok: kaynak yanıt verdi ama değer okunamadı ya da akla yatkın değil
export type KaynakDurum = 'guncel' | 'eski' | 'ulasilamadi' | 'kapali' | 'veri_yok';

export type KaynakHata =
  | 'anahtar_yok'
  | 'seri_dogrulanmadi'
  | 'kapali'            // kazıma bayrağı sunucuda kapalı (FAGENT_KAZIMA); arıza değil
  | 'kaynak_reddetti'   // yukarı akış isteği kabul etmedi (4xx / güvenlik duvarı); yeniden denenmez
  | 'ulasilamadi'
  | 'kaynak_hatasi'
  | 'okunamadi'
  | 'zaman_asimi'
  | 'mantik_disi'
  | 'sinir_asildi';

export interface KaynakSonucu<T> {
  kaynak: KaynakAdi;
  durum: KaynakDurum;
  veri?: T;
  donem?: string;   // verinin ait olduğu dönem, kaynağın kendi etiketi (ör. "09-2026"; örnek biçim, gerçek veri değil)
  alindi?: string;  // tarayıcının en son başarıyla aldığı an (ISO)
  hata?: KaynakHata;
}

// Yapılandırma durumu: yeniden denenmez, devre kesiciyi açmaz.
export function yapilandirmaHatasi(hata: KaynakHata | undefined): boolean {
  return hata === 'anahtar_yok' || hata === 'seri_dogrulanmadi' || hata === 'kapali';
}

/* ───────────── TTL, geri çekilme, devre kesici (saf) ───────────── */

export function onbellekGecerli(alindiIso: string | undefined, simdiMs: number, ttlMs: number): boolean {
  if (!alindiIso) return false;
  const t = Date.parse(alindiIso);
  if (!Number.isFinite(t)) return false;
  const yas = simdiMs - t;
  return yas >= 0 && yas <= ttlMs; // gelecekteki damga (saat kayması) geçerli sayılmaz
}

// denemeNo 0 = ilk yeniden deneme. Sınır aşılınca undefined (denemeler tükendi).
export function yenidenDenemeBekleme(denemeNo: number): number | undefined {
  return KAYNAK_YENIDEN_DENEME_BEKLEME_MS[denemeNo];
}

// Devre kesici durumu yalnızca "açıldığı an"dır. Açık ve süre dolmadıysa kaynak denenmez.
export function devreAcikMi(acilisMs: number | undefined, simdiMs: number, sureMs: number): boolean {
  if (acilisMs === undefined) return false;
  const gecen = simdiMs - acilisMs;
  return gecen >= 0 && gecen < sureMs;
}

/* ───────────── Durum metni (betimleyici; emir/öneri/tahmin yok) ───────────── */

interface KaynakEtiketi { ad: string; yonelme: string; ayrilma: string }
const ETIKET: Record<KaynakAdi, KaynakEtiketi> = {
  tcmb: { ad: 'TCMB (EVDS üzerinden)', yonelme: "TCMB'ye (EVDS üzerinden)", ayrilma: "TCMB'den (EVDS üzerinden)" },
  coingecko: { ad: 'CoinGecko', yonelme: "CoinGecko'ya", ayrilma: "CoinGecko'dan" },
  frankfurter: { ad: 'Frankfurter', yonelme: "Frankfurter'a", ayrilma: "Frankfurter'dan" },
  kap: { ad: 'KAP', yonelme: "KAP'a", ayrilma: "KAP'tan" },
  bist: { ad: 'Borsa İstanbul', yonelme: "Borsa İstanbul'a", ayrilma: "Borsa İstanbul'dan" },
  elle: { ad: 'Elle girilen', yonelme: 'Elle girilen veriye', ayrilma: 'Elle girilen veriden' },
};

export function kaynakAdi(k: KaynakAdi): string { return ETIKET[k].ad; }

const p2 = (n: number) => String(n).padStart(2, '0');

// Yerel saat dilimiyle GG.AA.YYYY; çözülemezse boş.
export function formatTarih(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function formatTarihSaat(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${formatTarih(iso)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export interface DurumMetniSecenek {
  // Veri yokken kullanılan geri düşme değerinin cümlesi (çağıran yazar), ör.
  // "Enflasyon için varsayım kullanılıyor: %30 (kaynak: TÜİK Eylül 2026, doğrulanmadı)."
  varsayim?: string;
}

function ekle(metin: string, varsayim?: string): string {
  return varsayim ? `${metin} ${varsayim}` : metin;
}

// Tek yerden üretilir; e2e seçicileri ve arayüz bu metni kullanır. Her sayının yanında kaynak + dönem/tarih.
export function kaynakDurumMetni<T>(s: KaynakSonucu<T>, secenek: DurumMetniSecenek = {}): string {
  const e = ETIKET[s.kaynak];
  const veriVar = s.veri !== undefined;
  switch (s.durum) {
    case 'guncel': {
      if (!veriVar) return `${e.ayrilma} değer okunamadı; gösterilmiyor.`;
      const parcalar = [`Kaynak: ${e.ad}`];
      if (s.donem) parcalar.push(`dönem ${s.donem}`);
      const alindi = formatTarihSaat(s.alindi);
      if (alindi) parcalar.push(`alındı ${alindi}`);
      return parcalar.join(' · ');
    }
    case 'eski': {
      if (!veriVar) return ekle(`${e.yonelme} ulaşılamadı.`, secenek.varsayim);
      // Son bilinen değer yalnızca etiketli olarak anılır; hesaplarda KULLANILMAZ, hesaplar varsayımla yapılır.
      const donem = s.donem ? `dönem ${s.donem}` : 'dönem bilinmiyor';
      const alindi = formatTarih(s.alindi);
      return `${e.yonelme} şu an ulaşılamıyor. Son bilinen değer (${donem}${alindi ? `, alındı ${alindi}` : ''}) hesaplarda kullanılmıyor; hesaplar varsayımla yapılıyor (varsayım).`;
    }
    case 'kapali': {
      const neden = s.hata === 'seri_dogrulanmadi'
        ? 'sunucuda bu seri henüz tanımlı değil'
        : s.hata === 'kapali'
          ? 'bu kaynak sunucuda etkin değil'
          : 'sunucu anahtarı tanımlı değil';
      return ekle(`Veri kaynağı yapılandırılmamış (${e.ad}: ${neden}).`, secenek.varsayim);
    }
    case 'veri_yok':
      return ekle(`${e.ayrilma} gelen değer okunamadı; gösterilmiyor.`, secenek.varsayim);
    case 'ulasilamadi':
    default:
      return ekle(`${e.yonelme} ulaşılamadı.`, secenek.varsayim);
  }
}
