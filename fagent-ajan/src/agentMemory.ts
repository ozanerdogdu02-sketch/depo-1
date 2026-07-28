// Ajan'ın uzun süreli belleği — tamamen tarayıcıda (localStorage), anahtarsız, sunucusuz.
// İlham: Microsoft "AI Agents for Beginners" dersi 13 (Ajan Belleği) — kısa süreli bellek
// (App.tsx'teki messages/intentId zinciri) tek oturumla sınırlıyken, bu modül oturumlar
// arasında kalıcı olan "uzun süreli" ve "öğe (entity)" belleği uygular: hangi konular ne
// sıklıkla soruldu, hangi varlıklardan bahsedildi. Mem0/Cognee/Azure AI Search gibi
// dersteki araçlar API anahtarı ve sunucu gerektirdiğinden FAGENT'ın anahtarsız ilkesiyle
// çelişir; burada aynı KAVRAM (gözlemle → çıkar → kalıcı depola → gelecekte kullan)
// tamamen yerel/kuralsal biçimde uygulanır.
import { AssetType } from './store';

const KEY = 'fagent.lab.agent.memory.v1';

// BLOK 1 — genişletilmiş ajan belleği. Kullanıcının kendi belirlediği tercihler (prefs) +
// ajanın gözlemlediği son sorular/öneriler. Portföy özeti, takip edilen varlıklar ve veri
// güncelliği bilinçli olarak BURADA saklanmaz — onlar store'dan (usePortfolio) türetilir,
// böylece bellek ile gerçek portföy arasında tutarsızlık/veri tekrarı olmaz.
export type RiskLevel = 'dusuk' | 'orta' | 'yuksek';
export type AgentMode = 'temkinli' | 'dengeli' | 'agresif';
export type VadeTercihi = 'kisa' | 'orta' | 'uzun';

export interface AgentPrefs {
  riskLevel: RiskLevel; // risk seviyesi
  agentMode: AgentMode; // ajan modu: temkinli / dengeli / agresif
  vade: VadeTercihi; // vade tercihi: kısa / orta / uzun
  interests: AssetType[]; // ilgi alanı: hisse, kripto, fon, döviz, altın, mevduat
}

const RECENT_CAP = 5; // son sorular / son öneriler için tutulacak azami sayı

export interface AgentMemoryProfile {
  topicCounts: Record<string, number>; // intentId -> kaç kez soruldu
  holdingMentions: Record<string, number>; // varlık adı -> sohbette kaç kez geçti
  totalTurns: number;
  firstSeenAt: string; // ISO
  lastSeenAt: string; // ISO
  prefs: AgentPrefs; // kullanıcı tercihleri (şeffaf + düzenlenebilir)
  recentQuestions: string[]; // kullanıcının sorduğu son önemli sorular (en yeni başta)
  recentAdvice: string[]; // ajanın verdiği son öneri/uyarılar (en yeni başta)
  lastAnalysisAt: string; // en son "Analiz Et" ne zaman çalıştı (ISO; '' = hiç)
}

export function defaultPrefs(): AgentPrefs {
  return { riskLevel: 'orta', agentMode: 'dengeli', vade: 'orta', interests: [] };
}

function empty(): AgentMemoryProfile {
  return {
    topicCounts: {}, holdingMentions: {}, totalTurns: 0, firstSeenAt: '', lastSeenAt: '',
    prefs: defaultPrefs(), recentQuestions: [], recentAdvice: [], lastAnalysisAt: '',
  };
}

function load(): AgentMemoryProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<AgentMemoryProfile>;
    const dp = defaultPrefs();
    const p = parsed.prefs && typeof parsed.prefs === 'object' ? parsed.prefs : {};
    return {
      topicCounts: parsed.topicCounts && typeof parsed.topicCounts === 'object' ? parsed.topicCounts : {},
      holdingMentions: parsed.holdingMentions && typeof parsed.holdingMentions === 'object' ? parsed.holdingMentions : {},
      totalTurns: typeof parsed.totalTurns === 'number' ? parsed.totalTurns : 0,
      firstSeenAt: parsed.firstSeenAt ?? '',
      lastSeenAt: parsed.lastSeenAt ?? '',
      // Eski (BLOK 1 öncesi) bellek verisinde bu alanlar yoktu → varsayılanlara göç eder.
      prefs: {
        riskLevel: (p as AgentPrefs).riskLevel ?? dp.riskLevel,
        agentMode: (p as AgentPrefs).agentMode ?? dp.agentMode,
        vade: (p as AgentPrefs).vade ?? dp.vade,
        interests: Array.isArray((p as AgentPrefs).interests) ? (p as AgentPrefs).interests : dp.interests,
      },
      recentQuestions: Array.isArray(parsed.recentQuestions) ? parsed.recentQuestions.slice(0, RECENT_CAP) : [],
      recentAdvice: Array.isArray(parsed.recentAdvice) ? parsed.recentAdvice.slice(0, RECENT_CAP) : [],
      lastAnalysisAt: parsed.lastAnalysisAt ?? '',
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

// Kullanıcının düzenlediği tercihleri günceller (risk, mod, vade, ilgi alanları).
export function updatePrefs(patch: Partial<AgentPrefs>): AgentMemoryProfile {
  const p = load();
  p.prefs = { ...p.prefs, ...patch };
  save(p);
  return p;
}

// Son N öğeyi (en yeni başta) tutan, ardışık tekrarı elenmiş liste.
function pushRecent(list: string[], item: string): string[] {
  const clean = item.trim();
  if (!clean) return list;
  if (list[0] === clean) return list; // aynı şeyi üst üste ekleme
  return [clean, ...list.filter(x => x !== clean)].slice(0, RECENT_CAP);
}

// Kullanıcının sorduğu son önemli soruyu belleğe düşer.
export function recordQuestion(text: string): AgentMemoryProfile {
  const p = load();
  p.recentQuestions = pushRecent(p.recentQuestions, text);
  save(p);
  return p;
}

// Ajanın verdiği son öneri/uyarıyı belleğe düşer (uzun metinler kısaltılır).
export function recordAdvice(text: string): AgentMemoryProfile {
  const p = load();
  const short = text.length > 160 ? text.slice(0, 157).trimEnd() + '…' : text;
  p.recentAdvice = pushRecent(p.recentAdvice, short);
  save(p);
  return p;
}

// "Analiz Et" çalıştığında son analiz zamanını günceller.
export function recordAnalysis(): AgentMemoryProfile {
  const p = load();
  p.lastAnalysisAt = new Date().toISOString();
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
