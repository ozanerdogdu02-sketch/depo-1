#!/usr/bin/env node
// `npm run demo` — Jarvis'i Telegram KURMADAN dene.
//
// Bellek içi bir veritabanı ve örnek bir portföyle çalışır: gerçek verine dokunmaz,
// ağa çıkmaz, Telegram/Ollama gerektirmez. Amaç, kurulumla uğraşmadan önce
// "bu şey ne yapıyor" sorusunu 10 saniyede cevaplamak.
//
// Kendi cümleni denemek için:  npm run demo -- "kriptoyu %25'e düşür"
import { openMemoryDb } from './db.ts';
import { addHolding } from './core/portfolio.ts';
import { respond } from './brain/index.ts';
import { applyPendingAction, type ExecuteContext } from './brain/intents.ts';
import type { JarvisConfig } from './config.ts';

const config = {
  telegramToken: 'demo', ownerChatIds: [0], timezone: 'Europe/Istanbul',
  dbPath: ':memory:', ollamaUrl: '', ollamaModel: '', ollamaMode: 'off',
  voiceEnabled: false, voiceUrl: '',
  cron: { morning: '0 9 * * 1-5', close: '30 18 * * 1-5', alerts: '*/15 * * * *' },
  inflationPct: 40, httpTimeoutMs: 3000, cacheTtlSec: 300,
} satisfies JarvisConfig;

const VARSAYILAN_SENARYO = [
  'merhaba',
  'portföyüm',
  'analiz et',
  'en çok kazandıran ne',
  "Bitcoin'den 20000 TL sattım",
  "kriptoyu %30'a düşür",
  'BTC 4 milyon üstüne çıkarsa haber ver',
  'alarmlarım',
  'bugün hava nasıl olacak',
];

/** Telegram HTML'ini terminalde okunur hale getirir. */
function terminale(text: string): string {
  return text
    .replace(/<b>(.*?)<\/b>/gs, '\x1b[1m$1\x1b[0m')
    .replace(/<i>(.*?)<\/i>/gs, '\x1b[2m$1\x1b[0m')
    .replace(/<code>(.*?)<\/code>/gs, '\x1b[36m$1\x1b[0m')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function main(): Promise<void> {
  const db = openMemoryDb();
  // Örnek portföy — canlı fiyata bağlı DEĞİL, böylece demo ağa hiç çıkmaz.
  addHolding(db, { name: 'Bitcoin', kind: 'kripto', amount: 120_000 }, config.timezone);
  addHolding(db, { name: 'THYAO', kind: 'hisse', amount: 60_000 }, config.timezone);
  addHolding(db, { name: 'Mevduat', kind: 'mevduat', amount: 40_000 }, config.timezone);

  const ctx: ExecuteContext = { db, timezone: config.timezone, inflationPct: config.inflationPct };
  const args = process.argv.slice(2).filter(Boolean);
  const senaryo = args.length > 0 ? args : VARSAYILAN_SENARYO;

  console.log('\n\x1b[1m\x1b[36m  FİNANSAL JARVİS — demo\x1b[0m');
  console.log('  \x1b[2mÖrnek portföy · bellek içi veritabanı · ağ yok · Telegram yok\x1b[0m');
  console.log('  \x1b[2mKendi cümleni dene:  npm run demo -- "portföyüm"\x1b[0m');

  for (const metin of senaryo) {
    const result = await respond(metin, { db, config });
    console.log(`\n\x1b[1m\x1b[32m▶ sen:\x1b[0m ${metin}`);
    console.log(terminale(result.text).split('\n').map(l => `  ${l}`).join('\n'));

    if (result.pending) {
      console.log('\x1b[33m  [Onayla] [Vazgeç]  ← burada henüz HİÇBİR veri değişmedi\x1b[0m');
      console.log('\x1b[2m  (demo otomatik onaylıyor)\x1b[0m');
      console.log(terminale(applyPendingAction(result.pending, ctx)).split('\n').map(l => `  ${l}`).join('\n'));
    }
  }

  console.log('\n\x1b[2m  Gerçek kurulum için: README.md · Sağlık kontrolü için: npm run doctor\x1b[0m\n');
  db.close();
}

main().catch(err => {
  console.error('[demo] hata:', err);
  process.exit(1);
});
