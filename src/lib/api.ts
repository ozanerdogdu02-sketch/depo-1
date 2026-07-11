const TOKEN_KEY = 'aura.session.token';

let sessionPromise: Promise<string> | null = null;
let backendDown = false; // Statik hosting'de gereksiz istek tekrarını önler.

async function createSession(): Promise<string> {
  const res = await fetch('/api/auth/session', { method: 'POST' });
  if (!res.ok) throw new Error('Oturum açılamadı.');
  const { token } = (await res.json()) as { token: string };
  if (typeof token !== 'string' || !token) throw new Error('Geçersiz oturum yanıtı.');
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

async function getToken(): Promise<string> {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) return stored;
  if (backendDown) throw new Error('Sunucu erişilebilir değil.');
  if (!sessionPromise) {
    sessionPromise = createSession()
      .catch(err => { backendDown = true; throw err; })
      .finally(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const doFetch = (t: string) =>
    fetch(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } });

  let res = await doFetch(token);
  if (res.status === 401) {
    // Jeton süresi dolmuş olabilir — yeni anonim oturum aç ve bir kez tekrar dene.
    localStorage.removeItem(TOKEN_KEY);
    res = await doFetch(await getToken());
  }
  return res;
}

export interface ReframeRequest {
  situation: string;
  automaticThought: string;
  emotions?: string[];
  score?: number;
}

export interface ReframeResponse {
  reframedThought: string;
  demo: boolean;
}

// Sunucu hiç yokken (statik hosting) kullanılan yerel şablon yanıt —
// site API anahtarı ve backend olmadan da uçtan uca çalışır.
function localReframe({ automaticThought }: ReframeRequest): ReframeResponse {
  return {
    reframedThought:
      `Bu düşüncenin ("${automaticThought.slice(0, 120)}") şu an sana ağır geldiğini görüyorum ve bu anlaşılır. ` +
      'Yine de bu, anın verdiği bir yorum; kanıtlara baktığında ilerlediğin ve iyi giden alanlar da var. ' +
      'Tek bir zor an, tüm gidişatı tanımlamaz — küçük adımlar saymaya devam ediyor.',
    demo: true,
  };
}

class RateLimitedError extends Error {}

export async function aiReframe(body: ReframeRequest): Promise<ReframeResponse> {
  try {
    const res = await authedFetch('/api/ai/chat', { method: 'POST', body: JSON.stringify(body) });
    if (res.status === 429) throw new RateLimitedError('Çok fazla istek gönderildi, lütfen biraz bekle.');
    if (!res.ok) throw new Error('AI servisine ulaşılamadı.');
    const data = (await res.json()) as ReframeResponse;
    if (typeof data?.reframedThought !== 'string') throw new Error('Geçersiz AI yanıtı.');
    return data;
  } catch (err) {
    // Gerçek rate limit mesajını kullanıcıya göster; diğer her durumda
    // (backend yok, ağ hatası, geçersiz yanıt) yerel demo yanıta düş.
    if (err instanceof RateLimitedError) throw err;
    return localReframe(body);
  }
}

export type EventName =
  | 'page_view'
  | 'mood_entry_created'
  | 'ai_reframe_used'
  | 'topic_toggled'
  | 'sport_toggled';

// Ateşle-unut: analitik hiçbir zaman kullanıcı akışını bloklamaz veya bozmaz.
export function track(name: EventName, props: Record<string, unknown> = {}): void {
  authedFetch('/api/events', { method: 'POST', body: JSON.stringify({ name, props }) }).catch(() => {});
}

export interface MyMetrics {
  totalEvents: number;
  activeDays: number;
  streak: number;
  moodEntries: number;
  aiAssists: number;
  avgMoodScore: number | null;
  moodTrendDelta: number | null;
}

export async function fetchMyMetrics(): Promise<MyMetrics> {
  const res = await authedFetch('/api/metrics/me');
  if (!res.ok) throw new Error('Metrikler alınamadı.');
  return (await res.json()) as MyMetrics;
}

export interface AdminMetrics {
  totalEvents: number;
  totalUsers: number;
  activeLast7: number;
  returningUsers: number;
  retentionRate: number | null;
  topFeature: string | null;
  featureUsage: { name: string; count: number }[];
  eventsPerDay: { day: string; count: number }[];
}

export async function fetchAdminMetrics(adminKey: string): Promise<AdminMetrics> {
  const res = await fetch('/api/admin/metrics', { headers: { 'x-admin-key': adminKey } });
  if (res.status === 401) throw new Error('Admin anahtarı geçersiz.');
  if (res.status === 503) throw new Error('Admin paneli sunucuda kapalı (ADMIN_KEY tanımlı değil).');
  if (!res.ok) throw new Error('Metrikler alınamadı.');
  return (await res.json()) as AdminMetrics;
}
