// Adres yönetimi — KÜTÜPHANESİZ.
//
// Neden react-router-dom yok: ürünün "4 üretim bağımlılığı" iddiası hem sunumda hem
// docs/soru-cevap.md'de geçiyor; bir router paketi (ve alt bağımlılıkları) o iddiayı
// yanlış yapardı. Uygulamada 9 DÜZ rota var — parametre yok, iç içe rota yok, koruma
// (guard) yok. Bu kadarı için History API üzerine ince bir katman yeterli.
//
// Desen store.ts / inflation.ts ile aynı: modül düzeyinde durum + useSyncExternalStore.
import { useSyncExternalStore } from 'react';

export type Tab =
  | 'panel' | 'bugun' | 'hisseler' | 'fonlar' | 'kripto'
  | 'kriptopiyasa' | 'islemler' | 'projeksiyon' | 'ajan';

// TEK doğruluk kaynağı: yol, etiket ve rozet burada. Sidebar bu tablodan üretiliyor —
// önceden dokuz satır elle yazılmıştı ve yeni sekme eklerken üç ayrı yeri güncellemek
// gerekiyordu (tip, sidebar, render koşulu).
export interface RouteDef {
  tab: Tab;
  path: string;
  label: string;
  badge?: string;
}

export const ROUTES: RouteDef[] = [
  { tab: 'panel', path: '/panel', label: 'PANEL' },
  { tab: 'bugun', path: '/bugun', label: 'BUGÜN' },
  { tab: 'hisseler', path: '/hisseler', label: 'HİSSELER' },
  { tab: 'fonlar', path: '/fonlar', label: 'FONLAR' },
  { tab: 'kripto', path: '/kripto', label: 'KRİPTO VARLIKLAR' },
  { tab: 'kriptopiyasa', path: '/kripto-piyasa', label: 'KRİPTO PİYASASI' },
  { tab: 'islemler', path: '/islemler', label: 'İŞLEMLER' },
  { tab: 'projeksiyon', path: '/projeksiyon', label: 'PROJEKSİYON' },
  { tab: 'ajan', path: '/ajan', label: 'AJAN', badge: 'YENİ' },
];

export const LANDING_PATH = '/';
export const DEFAULT_APP_PATH = '/panel';

/** Yol → sekme. Tanınmayan yol `undefined` döner (çağıran karar verir). */
export function tabForPath(path: string): Tab | undefined {
  const clean = normalizePath(path);
  return ROUTES.find(r => r.path === clean)?.tab;
}

export function pathForTab(tab: Tab): string {
  return ROUTES.find(r => r.tab === tab)?.path ?? DEFAULT_APP_PATH;
}

// Sondaki eğik çizgi ve büyük harf farkı yüzünden rota kaçırılmasın: /Panel/ → /panel
function normalizePath(path: string): string {
  const p = path.toLowerCase().replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/* ── Durum ── */

let current = typeof window === 'undefined' ? LANDING_PATH : normalizePath(window.location.pathname);
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): string {
  return current;
}

if (typeof window !== 'undefined') {
  // Geri/ileri tuşu: adres zaten değişmiş oluyor, biz yalnızca okuyup yayınlıyoruz.
  window.addEventListener('popstate', () => {
    current = normalizePath(window.location.pathname);
    emit();
  });
}

/**
 * Adrese git. `replace` true ise geçmişe yeni kayıt EKLEMEZ — yönlendirmelerde
 * (ör. verisi olan ziyaretçiyi / → /panel taşırken) kullanılır, yoksa geri tuşu
 * kullanıcıyı yönlendirmenin başına geri atıp sonsuz döngü hissi verir.
 */
export function navigate(path: string, replace = false): void {
  const next = normalizePath(path);
  if (next === current) return;
  current = next;
  if (replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
  emit();
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
