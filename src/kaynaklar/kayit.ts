// Kaynak çalıştırıcı + kayıt defteri. Bir kaynağın arızası YALNIZ kendi sonucunu etkiler.
// Akış: taze önbellek -> devre kesici -> istek (zaman aşımı, en çok 1 yeniden deneme) -> önbelleğe yaz.
// Hata FIRLATMAZ; her yol KaynakSonucu döner. Ortam (depo, saat, bekleme) parametreyle girer: window yok.
import type { KvStore } from '../storage/types.ts';
import { KAYNAK_DEVRE_KESICI_MS, KAYNAK_ZAMAN_ASIMI_MS } from '../config/varsayilanlar.ts';
import { onbellekOku, onbellekYaz } from './onbellek.ts';
import { devreAcikMi, onbellekGecerli, yapilandirmaHatasi, yenidenDenemeBekleme } from './tip.ts';
import type { KaynakAdi, KaynakHata, KaynakSonucu } from './tip.ts';

export type GetirSonucu<T> =
  | { ok: true; veri: T; donem?: string }
  | { ok: false; hata: KaynakHata; yenidenDene: boolean };

export interface KaynakTanimi<T> {
  kaynak: KaynakAdi;
  anahtar: string;                                  // önbellek anahtarı
  ttlMs: number;
  getir: (signal: AbortSignal) => Promise<GetirSonucu<T>>;
  dogrula: (v: unknown) => v is T;                  // önbellek biçim kontrolü
}

export interface CalistiriciOrtami {
  depo?: KvStore;
  simdi?: () => number;
  bekle?: (ms: number) => Promise<void>;
  zamanAsimiMs?: number;
  devreKesiciMs?: number;
}

export interface Calistirici {
  calistir<T>(tanim: KaynakTanimi<T>, secenek?: { signal?: AbortSignal; zorla?: boolean }): Promise<KaynakSonucu<T>>;
  devreSifirla(): void;
}

const varsayilanBekle = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function createCalistirici(ortam: CalistiriciOrtami = {}): Calistirici {
  const simdi = ortam.simdi ?? (() => Date.now());
  const bekle = ortam.bekle ?? varsayilanBekle;
  const zamanAsimiMs = ortam.zamanAsimiMs ?? KAYNAK_ZAMAN_ASIMI_MS;
  const devreMs = ortam.devreKesiciMs ?? KAYNAK_DEVRE_KESICI_MS;
  const devre = new Map<string, number>(); // anahtar -> açıldığı an

  async function tekDeneme<T>(tanim: KaynakTanimi<T>, dis?: AbortSignal): Promise<GetirSonucu<T>> {
    if (dis?.aborted) return { ok: false, hata: 'ulasilamadi', yenidenDene: false };
    const ac = new AbortController();
    let zamanAsti = false;
    const t = setTimeout(() => { zamanAsti = true; ac.abort(); }, zamanAsimiMs);
    const disDinle = () => ac.abort();
    dis?.addEventListener('abort', disDinle, { once: true });
    try {
      return await tanim.getir(ac.signal);
    } catch {
      if (zamanAsti) return { ok: false, hata: 'zaman_asimi', yenidenDene: true };
      if (dis?.aborted) return { ok: false, hata: 'ulasilamadi', yenidenDene: false };
      return { ok: false, hata: 'ulasilamadi', yenidenDene: true };
    } finally {
      clearTimeout(t);
      dis?.removeEventListener('abort', disDinle);
    }
  }

  return {
    devreSifirla() { devre.clear(); },
    async calistir<T>(tanim: KaynakTanimi<T>, secenek: { signal?: AbortSignal; zorla?: boolean } = {}): Promise<KaynakSonucu<T>> {
      const onb = await onbellekOku(ortam.depo, tanim.anahtar, tanim.kaynak, tanim.dogrula);
      if (!secenek.zorla && onb && onbellekGecerli(onb.alindi, simdi(), tanim.ttlMs)) {
        return { kaynak: tanim.kaynak, durum: 'guncel', veri: onb.veri, donem: onb.donem, alindi: onb.alindi };
      }

      // Başarısızlık sonucu: son bilinen değer varsa 'eski' (tarihiyle), yoksa duruma göre.
      const basarisiz = (hata: KaynakHata): KaynakSonucu<T> => {
        if (yapilandirmaHatasi(hata)) return { kaynak: tanim.kaynak, durum: 'kapali', hata };
        if (onb) return { kaynak: tanim.kaynak, durum: 'eski', veri: onb.veri, donem: onb.donem, alindi: onb.alindi, hata };
        const veriYok = hata === 'mantik_disi' || hata === 'okunamadi';
        return { kaynak: tanim.kaynak, durum: veriYok ? 'veri_yok' : 'ulasilamadi', hata };
      };

      if (devreAcikMi(devre.get(tanim.anahtar), simdi(), devreMs)) return basarisiz('ulasilamadi');

      let sonHata: KaynakHata = 'ulasilamadi';
      for (let deneme = 0; ; deneme++) {
        const r = await tekDeneme(tanim, secenek.signal);
        if (r.ok) {
          devre.delete(tanim.anahtar);
          const alindi = new Date(simdi()).toISOString();
          await onbellekYaz(ortam.depo, tanim.anahtar, { surum: 1, kaynak: tanim.kaynak, donem: r.donem, alindi, veri: r.veri });
          return { kaynak: tanim.kaynak, durum: 'guncel', veri: r.veri, donem: r.donem, alindi };
        }
        sonHata = r.hata;
        if (!r.yenidenDene) return basarisiz(r.hata); // yapılandırma/okuma/mantık hatası: yeniden deneme ve devre kesici yok
        const bekleme = yenidenDenemeBekleme(deneme);
        if (bekleme === undefined || secenek.signal?.aborted) break;
        await bekle(bekleme);
      }
      if (!secenek.signal?.aborted) devre.set(tanim.anahtar, simdi()); // denemeler tükendi: kaynak bir süre denenmez
      return basarisiz(sonHata);
    },
  };
}

/* ───────────── Kayıt defteri: kaynaklar bağımsız çağrılır ───────────── */

export interface KayitGorevi {
  kaynak: KaynakAdi;
  calistir: () => Promise<KaynakSonucu<unknown>>;
}

// Promise.allSettled mantığı: biri asılı kalsa ya da beklenmedik biçimde reddetse diğerleri sonuç verir.
export async function kaynaklariBagimsizCagir(gorevler: Record<string, KayitGorevi>): Promise<Record<string, KaynakSonucu<unknown>>> {
  const adlar = Object.keys(gorevler);
  const sonuclar = await Promise.allSettled(adlar.map(a => gorevler[a].calistir()));
  const cikis: Record<string, KaynakSonucu<unknown>> = {};
  adlar.forEach((a, i) => {
    const s = sonuclar[i];
    cikis[a] = s.status === 'fulfilled'
      ? s.value
      : { kaynak: gorevler[a].kaynak, durum: 'ulasilamadi', hata: 'ulasilamadi' };
  });
  return cikis;
}
