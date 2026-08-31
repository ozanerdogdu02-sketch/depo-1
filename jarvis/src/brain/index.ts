// Beyin hattı: metin → niyet → deterministik yürütme → (opsiyonel) doğal dille yeniden yazım.
//
// AKIŞ:
//   1. Kural tabanlı ayrıştırıcı (rules.ts) niyeti anlamaya çalışır.
//   2. Anlayamazsa VE dil katmanı açıksa, model niyeti çıkarmaya çalışır (nlu.ts).
//   3. Niyet ne olursa olsun işi DETERMİNİSTİK yürütücü yapar (intents.ts) —
//      bütün rakamlar oradan gelir.
//   4. Yanıt "yeniden yazılabilir" işaretliyse dil katmanı tonu doğallaştırır (nlg.ts),
//      ama rakam içeren listelere DOKUNMAZ.
//
// Model her adımda düşebilir; her düşüşte akış kural tabanlı yola geri düşer ve
// Jarvis çalışmaya devam eder.
import type { Db } from '../db.ts';
import type { JarvisConfig } from '../config.ts';
import { listHoldings } from '../core/portfolio.ts';
import { executeIntent, type ExecuteContext, type Intent, type PendingAction } from './intents.ts';
import { parseIntent } from './rules.ts';

export interface BrainDeps {
  db: Db;
  config: JarvisConfig;
  /** Dil katmanı açıksa doldurulur (Aşama 3). Kapalıysa undefined — akış kurallara düşer. */
  nlu?: ((text: string, holdingNames: string[]) => Promise<Intent | undefined>) | undefined;
  nlg?: ((draft: string, userText: string) => Promise<string | undefined>) | undefined;
}

export interface BrainResult {
  text: string;
  pending?: PendingAction | undefined;
  intentId: string;
  /** Niyeti kim çözdü — doctor/log için faydalı. */
  source: 'kural' | 'model';
}

/** Kısa süreli sohbet kaydı. Sonsuz büyümesin diye budanır. */
export function recordTurn(db: Db, role: 'user' | 'jarvis', text: string, intent?: string): void {
  db.prepare('INSERT INTO chat_log (role, text, intent, created_at) VALUES (?, ?, ?, ?)')
    .run(role, text.slice(0, 2000), intent ?? null, new Date().toISOString());
  // Son 200 turdan eskisini at.
  db.prepare('DELETE FROM chat_log WHERE id NOT IN (SELECT id FROM chat_log ORDER BY id DESC LIMIT 200)').run();
}

export async function respond(userText: string, deps: BrainDeps): Promise<BrainResult> {
  const { db, config } = deps;
  const holdings = listHoldings(db);

  let intent = parseIntent(userText, holdings);
  let source: 'kural' | 'model' = 'kural';

  // Kurallar anlamadıysa modele bir şans ver.
  if (intent.id === 'bilinmiyor' && deps.nlu) {
    try {
      const guessed = await deps.nlu(userText, holdings.map(h => h.name));
      if (guessed && guessed.id !== 'bilinmiyor') {
        intent = guessed;
        source = 'model';
      }
    } catch (err) {
      console.warn('[beyin] dil katmanı niyeti çözemedi, kurallara düşülüyor:', (err as Error).message);
    }
  }

  const ctx: ExecuteContext = {
    db,
    timezone: config.timezone,
    inflationPct: config.inflationPct,
    timeoutMs: config.httpTimeoutMs,
  };

  const result = await executeIntent(intent, ctx);
  let text = result.text;

  // Doğallaştırma YALNIZCA rakam listesi olmayan kısa yanıtlarda. Bir tablonun ya da
  // portföy dökümünün modele yeniden yazdırılması, rakamların bozulması riskini taşır.
  if (result.allowRewrite && deps.nlg) {
    try {
      const rewritten = await deps.nlg(text, userText);
      if (rewritten) text = rewritten;
    } catch {
      // Sessizce özgün metinle devam et.
    }
  }

  recordTurn(db, 'user', userText, intent.id);
  recordTurn(db, 'jarvis', text, intent.id);

  return { text, pending: result.pending, intentId: intent.id, source };
}
