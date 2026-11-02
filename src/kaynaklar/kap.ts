// KAP bildirim META bağdaştırıcısı (şirket kodu, unvan, başlık, tarih, tür, bildirim no). Hata FIRLATMAZ.
// İstek PARAMETRESİZ ve gövdesizdir: GET /api/kap. Portföy, sembol listesi ya da başka kullanıcı verisi sunucuya
// GİTMEZ; sunucu sabit "son 2 gün bildirimleri" listesini döner, portföye göre süzme TARAYICIDA yapılır (kapSuz).
// Sunucu: api/kap.mjs -> netlify/functions/kap.mjs; varsayılan KAPALI (FAGENT_KAZIMA=on yoksa 503 kapali -> durum 'kapali').
// Bildirim metni/özeti çekilmez; kullanıcı bağlantıdan KAP'ta okur. Ekran metni betimleyicidir (yorum/yön yok).
//
// DOĞRULANMADI: gerçek KAP yanıtıyla denenmedi (bu ortamdan erişim yok).
// TODO(hukuk): KAP kullanım koşulları / otomatik okuma izni / kaynak gösterme biçimi birincil metinle doğrulanmadı.
import { createLocalStore } from '../storage/local.ts';
import { KAP_TTL_MS } from '../config/varsayilanlar.ts';
import { createCalistirici } from './kayit.ts';
import type { Calistirici, GetirSonucu, KaynakTanimi } from './kayit.ts';
import { ONBELLEK_ANAHTARLARI } from './onbellek.ts';
import type { KaynakHata, KaynakSonucu } from './tip.ts';

const FN_URL = '/api/kap'; // Vercel: api/kap.mjs; Netlify: netlify.toml yönlendirmesi

export interface KapBildirim {
  no: number;          // bildirim numarası
  zaman: string;       // ISO, +03:00 ("YYYY-AA-GGTSS:DD:ss+03:00")
  kodlar: string[];    // hisse kodları (boş olabilir)
  unvan: string;
  baslik: string;
  sinif?: string;      // ODA / FR / DG vb.
  gec?: true;
  duzeltme?: true;
}
export interface KapVeri { bildirimler: KapBildirim[]; kesildi?: true }

// Bağlantı İSTEMCİDE kurulur; sunucu dış adres üretmez.
export const kapBaglanti = (no: number): string => `https://www.kap.org.tr/tr/Bildirim/${no}`;

const KOD_RE = /^[A-Z0-9]{3,6}$/;
const SINIF_RE = /^[A-Z]{1,6}$/;
const ZAMAN_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+03:00$/;

export const kapBildirimMi = (v: unknown): v is KapBildirim => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const b = v as Record<string, unknown>;
  return typeof b.no === 'number' && Number.isSafeInteger(b.no) && b.no > 0
    && typeof b.zaman === 'string' && ZAMAN_RE.test(b.zaman) && Number.isFinite(Date.parse(b.zaman))
    && Array.isArray(b.kodlar) && b.kodlar.every(k => typeof k === 'string' && KOD_RE.test(k))
    && b.kodlar.length <= 20
    && typeof b.unvan === 'string' && b.unvan.length <= 200
    && typeof b.baslik === 'string' && b.baslik !== '' && b.baslik.length <= 300
    && (b.sinif === undefined || (typeof b.sinif === 'string' && SINIF_RE.test(b.sinif)))
    && (b.gec === undefined || b.gec === true) && (b.duzeltme === undefined || b.duzeltme === true);
};

export const kapVeriMi = (v: unknown): v is KapVeri => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const k = v as KapVeri;
  return Array.isArray(k.bildirimler) && k.bildirimler.every(kapBildirimMi) && (k.kesildi === undefined || k.kesildi === true);
};

// Portföydeki sembollere göre süzme (TARAYICIDA). Sembol karşılaştırması büyük harfle; en yeni önce.
export function kapSuz(veri: KapVeri, semboller: readonly string[]): KapBildirim[] {
  const kume = new Set(semboller.map(s => s.trim().toUpperCase()).filter(Boolean));
  if (kume.size === 0) return [];
  return veri.bildirimler.filter(b => b.kodlar.some(k => kume.has(k)));
}

// Sunucu yanıt kodunu kaynak hatasına çevirir (saf). Yeniden deneme yalnız geçici arızalarda.
export function kapYanitHatasi(status: number, govde: unknown): { hata: KaynakHata; yenidenDene: boolean } {
  const kod = typeof (govde as { error?: unknown } | null)?.error === 'string' ? (govde as { error: string }).error : '';
  if (status === 503 && kod === 'kapali') return { hata: 'kapali', yenidenDene: false };
  if (status === 429) return { hata: 'sinir_asildi', yenidenDene: false };
  if (status >= 400 && status < 500) return { hata: 'kaynak_hatasi', yenidenDene: false };
  if (kod === 'okunamadi') return { hata: 'okunamadi', yenidenDene: false };
  if (kod === 'kaynak_reddetti') return { hata: 'kaynak_reddetti', yenidenDene: false }; // duvar/4xx: engel aşılmaz
  if (kod === 'zaman_asimi') return { hata: 'zaman_asimi', yenidenDene: true };
  return { hata: kod === 'kaynak_hatasi' ? 'kaynak_hatasi' : 'ulasilamadi', yenidenDene: true };
}

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface KapSecenek {
  calistirici?: Calistirici;
  fetchFn?: FetchLike;
  signal?: AbortSignal;
  zorla?: boolean;
}

let varsayilanCalistirici: Calistirici | undefined;
function paylasilanCalistirici(): Calistirici {
  if (!varsayilanCalistirici) {
    const ls = typeof localStorage === 'undefined' ? undefined : localStorage;
    varsayilanCalistirici = createCalistirici({ depo: createLocalStore(ls) });
  }
  return varsayilanCalistirici;
}

const varsayilanFetch: FetchLike = (url, init) => fetch(url, init);

// Tüm (süzülmemiş) liste döner; çağıran kapSuz ile portföye göre süzer. donem = sunucunun kurduğu tarih penceresi.
export async function kapOku(s: KapSecenek = {}): Promise<KaynakSonucu<KapVeri>> {
  const c = s.calistirici ?? paylasilanCalistirici();
  const fetchFn = s.fetchFn ?? varsayilanFetch;
  const tanim: KaynakTanimi<KapVeri> = {
    kaynak: 'kap', anahtar: ONBELLEK_ANAHTARLARI.kapBildirimler, ttlMs: KAP_TTL_MS, dogrula: kapVeriMi,
    async getir(signal): Promise<GetirSonucu<KapVeri>> {
      const res = await fetchFn(FN_URL, { signal }); // sorgu dizgisi yok, gövde yok
      if (!res.ok) {
        const govde = await res.json().catch(() => null);
        const { hata, yenidenDene } = kapYanitHatasi(res.status, govde);
        return { ok: false, hata, yenidenDene };
      }
      const data = await res.json().catch(() => null) as { items?: unknown; kesildi?: unknown; pencere?: unknown } | null;
      if (!data || !Array.isArray(data.items) || !data.items.every(kapBildirimMi)) return { ok: false, hata: 'okunamadi', yenidenDene: false };
      const veri: KapVeri = { bildirimler: data.items, ...(data.kesildi === true ? { kesildi: true as const } : {}) };
      const p = data.pencere;
      const donem = Array.isArray(p) && p.length === 2 && p.every(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))
        ? `${(p[0] as string).split('-').reverse().join('.')}–${(p[1] as string).split('-').reverse().join('.')}`
        : undefined;
      return { ok: true, veri, donem };
    },
  };
  return c.calistir(tanim, { signal: s.signal, zorla: s.zorla });
}
