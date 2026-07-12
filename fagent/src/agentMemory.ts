// Ajan'ın uzun süreli belleği — tamamen tarayıcıda (localStorage), anahtarsız, sunucusuz.
// İlham: Microsoft "AI Agents for Beginners" dersi 13 (Ajan Belleği) — kısa süreli bellek
// (App.tsx'teki messages/intentId zinciri) tek oturumla sınırlıyken, bu modül oturumlar
// arasında kalıcı olan "uzun süreli" ve "öğe (entity)" belleği uygular: hangi konular ne
// sıklıkla soruldu, hangi varlıklardan bahsedildi. Mem0/Cognee/Azure AI Search gibi
// dersteki araçlar API anahtarı ve sunucu gerektirdiğinden FAGENT'ın anahtarsız ilkesiyle
// çelişir; burada aynı KAVRAM (gözlemle → çıkar → kalıcı depola → gelecekte kullan)
// tamamen yerel/kuralsal biçimde uygulanır.
const KEY = 'fagent.agent.memory.v1';

export interface AgentMemoryProfile {
  topicCounts: Record<string, number>; // intentId -> kaç kez soruldu
  holdingMentions: Record<string, number>; // varlık adı -> sohbette kaç kez geçti
  totalTurns: number;
  firstSeenAt: string; // ISO
  lastSeenAt: string; // ISO
}

function empty(): AgentMemoryProfile {
  return { topicCounts: {}, holdingMentions: {}, totalTurns: 0, firstSeenAt: '', lastSeenAt: '' };
}

function load(): AgentMemoryProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<AgentMemoryProfile>;
    return {
      topicCounts: parsed.topicCounts && typeof parsed.topicCounts === 'object' ? parsed.topicCounts : {},
      holdingMentions: parsed.holdingMentions && typeof parsed.holdingMentions === 'object' ? parsed.holdingMentions : {},
      totalTurns: typeof parsed.totalTurns === 'number' ? parsed.totalTurns : 0,
      firstSeenAt: parsed.firstSeenAt ?? '',
      lastSeenAt: parsed.lastSeenAt ?? '',
    };
  } catch {
    return empty();
  }
}

function save(p: AgentMemoryProfile): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function getProfile(): AgentMemoryProfile {
  return load();
}

// Her sohbet turundan sonra çağrılır — "gözlemle → çıkar → kalıcı depola" adımı.
export function recordTurn(intentId: string | undefined, mentionedHoldingNames: string[]): AgentMemoryProfile {
  const p = load();
  const now = new Date().toISOString();
  p.totalTurns += 1;
  if (!p.firstSeenAt) p.firstSeenAt = now;
  p.lastSeenAt = now;
  if (intentId) p.topicCounts[intentId] = (p.topicCounts[intentId] ?? 0) + 1;
  for (const name of mentionedHoldingNames) p.holdingMentions[name] = (p.holdingMentions[name] ?? 0) + 1;
  save(p);
  return p;
}

export function mostAskedTopic(p: AgentMemoryProfile): string | undefined {
  const entries = Object.entries(p.topicCounts);
  if (!entries.length) return undefined;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export function mostMentionedHolding(p: AgentMemoryProfile): string | undefined {
  const entries = Object.entries(p.holdingMentions);
  if (!entries.length) return undefined;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

// Portföy "SIFIRLA" ile silindiğinde tutarlılık için bu da temizlenir — kalıntı davranış
// profili bırakmamak KVKK'ya bu repodaki genel yaklaşımla uyumludur (bkz. Aura Finance bölümü).
export function resetMemory(): void {
  localStorage.removeItem(KEY);
}
