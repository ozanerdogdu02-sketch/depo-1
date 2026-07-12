// Ajanın "eğitilebilir" bilgi tabanı — kullanıcının doğrudan öğrettiği soru-cevap
// çiftlerini tutar. Bu bir LLM eğitimi DEĞİLDİR (ağırlık güncellemesi yok); klasik bir
// "uzman sistem" / örnek-tabanlı öğrenme yaklaşımıdır: kullanıcı bir soru-cevap öğretir,
// bu kalıcı olarak (localStorage) saklanır, gelecekte benzer bir soru geldiğinde eşleşme
// skoruna göre bulunup built-in kurallardan ÖNCE kullanılır. Böylece ajanın davranışı
// gerçekten kullanıcı tarafından şekillendirilebilir — agentMemory.ts'teki (yalnızca
// kullanım istatistiği tutan, davranışı değiştirmeyen) katmandan farklıdır.
const KEY = 'fagent.agent.training.v1';

export interface TrainedFact {
  id: string;
  question: string;
  answer: string;
  createdAt: string; // ISO
  timesUsed: number;
}

function load(): TrainedFact[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(facts: TrainedFact[]): void {
  localStorage.setItem(KEY, JSON.stringify(facts));
}

export function getTrainedFacts(): TrainedFact[] {
  return load();
}

// Aynı soruyu (normalize edilmiş) tekrar öğretmek, eskisinin üzerine yazar — "düzeltme" akışı.
function normalize(text: string): string {
  return text.trim().toLocaleLowerCase('tr-TR').replace(/[?!.,;:]/g, '').replace(/\s+/g, ' ');
}

export function teach(question: string, answer: string): TrainedFact[] {
  const q = question.trim();
  const a = answer.trim();
  if (!q || !a) return load();
  const facts = load();
  const key = normalize(q);
  const existingIdx = facts.findIndex(f => normalize(f.question) === key);
  if (existingIdx >= 0) {
    facts[existingIdx] = { ...facts[existingIdx], question: q, answer: a };
  } else {
    facts.unshift({ id: `f${Date.now()}`, question: q, answer: a, createdAt: new Date().toISOString(), timesUsed: 0 });
  }
  save(facts);
  return facts;
}

export function deleteFact(id: string): TrainedFact[] {
  const facts = load().filter(f => f.id !== id);
  save(facts);
  return facts;
}

export function recordFactUse(id: string): void {
  const facts = load();
  const idx = facts.findIndex(f => f.id === id);
  if (idx < 0) return;
  facts[idx] = { ...facts[idx], timesUsed: facts[idx].timesUsed + 1 };
  save(facts);
}

export function resetTraining(): void {
  localStorage.removeItem(KEY);
}

// Basit kelime-örtüşmesi (Jaccard benzerliği) tabanlı eşleştirme — anlamsal değil,
// gerçek bir NLP modeli değil; yalnızca tam eşleşmeyi değil, ufak varyasyonları
// ("THYAO nasıl?" vs "THYAO nasıl gidiyor?") da yakalamak için. Saf fonksiyon —
// localStorage'a dokunmaz, agent.ts'in chatReply'si tarafından çağrılır.
const MATCH_THRESHOLD = 0.5;

function wordsOf(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter(w => w.length > 0));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findBestMatch(facts: TrainedFact[], userText: string): TrainedFact | undefined {
  const text = userText.trim();
  if (!text || facts.length === 0) return undefined;
  const normKey = normalize(text);
  const exact = facts.find(f => normalize(f.question) === normKey);
  if (exact) return exact;

  const qWords = wordsOf(text);
  let best: TrainedFact | undefined;
  let bestScore = 0;
  for (const f of facts) {
    const score = jaccard(qWords, wordsOf(f.question));
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore >= MATCH_THRESHOLD ? best : undefined;
}
