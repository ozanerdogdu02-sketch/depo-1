// Zamanlayıcı — Jarvis'i "proaktif" yapan katman.
//
// SAAT DİLİMİ: node-cron'a timezone AÇIKÇA verilir. Konteyner UTC'de çalışır; bu seçenek
// olmasa "0 9 * * 1-5" ifadesi TSİ 12:00'de tetiklenirdi ve sabah brifingi öğle brifingi olurdu.
import cron, { type ScheduledTask } from 'node-cron';
import type { Bot } from 'grammy';
import type { Db } from './db.ts';
import type { JarvisConfig } from './config.ts';
import { composeBriefing } from './core/briefing.ts';
import { evaluateAlerts } from './core/alerts.ts';
import { pushHtml, prunePendingActions } from './telegram/bot.ts';
import { escapeHtml } from './core/format.ts';

export interface SchedulerDeps {
  db: Db;
  config: JarvisConfig;
  bot: Bot;
}

/** Bir işi tüm yetkili sohbetlere gönderir; biri patlarsa diğerleri etkilenmez. */
async function broadcast(deps: SchedulerDeps, text: string): Promise<void> {
  for (const chatId of deps.config.ownerChatIds) {
    try {
      await pushHtml(deps.bot, chatId, text);
    } catch (err) {
      console.error(`[zamanlayıcı] ${chatId} sohbetine gönderilemedi:`, (err as Error).message);
    }
  }
}

async function runBriefing(deps: SchedulerDeps, kind: 'sabah' | 'kapanis'): Promise<void> {
  try {
    const briefing = await composeBriefing(deps.db, {
      kind,
      timezone: deps.config.timezone,
      inflationPct: deps.config.inflationPct,
      timeoutMs: deps.config.httpTimeoutMs,
    });
    // Portföy boşken her sabah "portföyün boş" mesajı atmak sinir bozucu olurdu.
    if (briefing.empty) return;
    await broadcast(deps, briefing.text);
  } catch (err) {
    console.error(`[zamanlayıcı] ${kind} brifingi hazırlanamadı:`, (err as Error).message);
    // Sessiz kalmak yerine haber ver — kullanıcı brifingin neden gelmediğini bilmeli.
    await broadcast(
      deps,
      `⚠️ ${kind === 'sabah' ? 'Sabah' : 'Kapanış'} brifingini hazırlayamadım: ` +
      `${escapeHtml((err as Error).message)}\n<i>Portföy verin güvende — bu yalnızca bir raporlama hatası.</i>`,
    );
  }
}

async function runAlertPoll(deps: SchedulerDeps): Promise<void> {
  try {
    const result = await evaluateAlerts(deps.db, deps.config.httpTimeoutMs);
    for (const t of result.triggered) {
      await broadcast(deps, t.message);
    }
    // Atlanan alarmlar (fiyat alınamadı) her seferinde bildirilmez — spam olurdu.
    // Yalnızca loglanır; kullanıcı "alarmlarım" yazınca son değeri görebilir.
    if (result.skipped.length > 0) {
      console.warn(
        `[alarm] ${result.skipped.length} alarm fiyat alınamadığı için değerlendirilemedi:`,
        result.skipped.map(s => `${s.alert.target} (${s.reason})`).join(' · '),
      );
    }
  } catch (err) {
    console.error('[zamanlayıcı] alarm yoklaması başarısız:', (err as Error).message);
  }
}

export function startScheduler(deps: SchedulerDeps): ScheduledTask[] {
  const { config } = deps;
  const options = { timezone: config.timezone } as const;
  const tasks: ScheduledTask[] = [];

  tasks.push(cron.schedule(config.cron.morning, () => void runBriefing(deps, 'sabah'), options));
  tasks.push(cron.schedule(config.cron.close, () => void runBriefing(deps, 'kapanis'), options));
  tasks.push(cron.schedule(config.cron.alerts, () => void runAlertPoll(deps), options));

  // Günlük bakım: eskimiş onay kayıtlarını temizle.
  tasks.push(
    cron.schedule('17 3 * * *', () => {
      const removed = prunePendingActions(deps.db);
      if (removed > 0) console.log(`[bakım] ${removed} eski onay kaydı temizlendi.`);
    }, options),
  );

  console.log(
    `[zamanlayıcı] ${config.timezone} · sabah "${config.cron.morning}" · ` +
    `kapanış "${config.cron.close}" · alarm "${config.cron.alerts}"`,
  );
  return tasks;
}

/** Elle tetikleme — /brifing komutu ve testler için. */
export { runBriefing, runAlertPoll };
