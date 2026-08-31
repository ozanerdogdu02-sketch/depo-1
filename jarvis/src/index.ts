// Finansal Jarvis — giriş noktası.
// Ayarları doğrular, veritabanını açar, botu ve zamanlayıcıyı başlatır.
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { respond } from './brain/index.ts';
import { applyPendingAction, type ExecuteContext } from './brain/intents.ts';
import { createBot } from './telegram/bot.ts';
import { startScheduler } from './scheduler.ts';
import { fmtDateTime } from './core/format.ts';

async function main(): Promise<void> {
  const { config, errors, warnings } = loadConfig();

  // Eksik ayarla yarım çalışmaya başlamak, "neden brifing gelmiyor" diye saatlerce
  // log okumaktan çok daha kötü. Kritik eksik varsa hemen ve anlaşılır biçimde dur.
  if (errors.length > 0) {
    console.error('\n❌ Jarvis açılamıyor:\n');
    for (const e of errors) console.error(`   • ${e}`);
    console.error('\n   Ayrıntılı teşhis için:  npm run doctor\n');
    process.exit(1);
  }
  for (const w of warnings) console.warn(`⚠️  ${w}`);

  const db = openDb(config.dbPath);

  const ctx: ExecuteContext = {
    db,
    timezone: config.timezone,
    inflationPct: config.inflationPct,
    timeoutMs: config.httpTimeoutMs,
  };

  const bot = createBot({
    db,
    config,
    handleText: async text => {
      const result = await respond(text, { db, config });
      return { text: result.text, pending: result.pending };
    },
    applyAction: action => applyPendingAction(action, ctx),
  });

  const tasks = startScheduler({ db, config, bot });

  // ── Düzgün kapanış ────────────────────────────────────────────────────────
  // SQLite WAL modunda; temiz kapanmazsak son yazımlar diskle senkronize olmayabilir.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[jarvis] ${signal} alındı, kapanıyor...`);
    for (const task of tasks) task.stop();
    await bot.stop().catch(() => {});
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  console.log(`[jarvis] başlatılıyor · ${fmtDateTime(new Date(), config.timezone)} (${config.timezone})`);
  console.log(`[jarvis] yetkili sohbet: ${config.ownerChatIds.join(', ')}`);
  console.log(`[jarvis] veritabanı: ${config.dbPath}`);

  // bot.start() uzun yoklamayı başlatır ve süreç boyunca döner.
  await bot.start({
    onStart: info => console.log(`[jarvis] @${info.username} hazır. Telegram'dan yazabilirsin.`),
  });
}

main().catch(err => {
  console.error('[jarvis] açılışta beklenmedik hata:', err);
  process.exit(1);
});
