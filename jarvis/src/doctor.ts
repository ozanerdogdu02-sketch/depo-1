#!/usr/bin/env node
// `npm run doctor` — Jarvis'in sağlık kontrolü.
//
// Bu komut projenin GERÇEK doğrulama adımı. Veri kaynaklarının (Yahoo, TEFAS, TCMB,
// CoinGecko) hiçbiri geliştirme ortamından test edilemedi — ağ politikası engelliyordu.
// Bu yüzden "çalışıyor mu?" sorusunun cevabı burada, senin makinende veriliyor.
//
// Hiçbir şeyi DEĞİŞTİRMEZ: sadece okur, dener ve rapor eder.
import os from 'node:os';
import { loadConfig } from './config.ts';
import { openDb } from './db.ts';
import { probeAll } from './data/index.ts';
import { probeOllama } from './brain/ollama.ts';
import { fmtDateTime } from './core/format.ts';

const OK = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';
const INFO = 'ℹ️ ';

function heading(text: string): void {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
  console.log('─'.repeat(Math.min(72, text.length + 30)));
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Model etiketinden kabaca gereken RAM'i tahmin eder (q4 nicemleme varsayımıyla). */
function estimateModelRamGb(model: string): number | undefined {
  const m = model.match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (!m?.[1]) return undefined;
  const params = Number(m[1]);
  if (!Number.isFinite(params)) return undefined;
  // q4 ≈ 0,6 GB / milyar parametre + ~1 GB bağlam/çalışma payı
  return params * 0.6 + 1;
}

async function telegramCall(token: string, method: string, timeoutMs = 10_000): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { signal: controller.signal });
    return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  } catch (err) {
    return { ok: false, description: (err as Error).name === 'AbortError' ? 'zaman aşımı' : (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  console.log('\n\x1b[1m\x1b[36m  FİNANSAL JARVİS — sağlık kontrolü\x1b[0m');

  const { config, errors, warnings } = loadConfig();
  let hardFailures = 0;
  let softFailures = 0;

  // ── 1. Sistem ──────────────────────────────────────────────────────────────
  heading('1. Sistem');
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 22) {
    console.log(`${OK} Node.js ${process.versions.node}`);
  } else {
    console.log(`${FAIL} Node.js ${process.versions.node} — en az 22 gerekli.`);
    hardFailures++;
  }
  const totalRam = os.totalmem();
  console.log(`${INFO} Bellek: ${gb(totalRam)} toplam, ${gb(os.freemem())} boş · ${os.cpus().length} çekirdek`);
  console.log(`${INFO} Saat dilimi "${config.timezone}" → şu an ${fmtDateTime(new Date(), config.timezone)}`);
  console.log(`   (Yukarıdaki saat SENİN saatinle uyuşmuyorsa brifingler yanlış saatte gelir — .env'deki TZ'yi düzelt.)`);

  // ── 2. Ayarlar ─────────────────────────────────────────────────────────────
  heading('2. Ayarlar (.env)');
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`${OK} Tüm zorunlu ayarlar dolu.`);
  }
  for (const e of errors) {
    console.log(`${FAIL} ${e}`);
    hardFailures++;
  }
  for (const w of warnings) {
    console.log(`${WARN}${w}`);
    softFailures++;
  }
  console.log(`${INFO} Brifing saatleri — sabah "${config.cron.morning}" · kapanış "${config.cron.close}" · alarm "${config.cron.alerts}"`);
  console.log(`${INFO} Enflasyon varsayımı: %${config.inflationPct} (reel getiri uyarılarında kullanılır)`);

  // ── 3. Veritabanı ──────────────────────────────────────────────────────────
  heading('3. Veritabanı');
  let db;
  try {
    db = openDb(config.dbPath);
    const holdings = db.prepare('SELECT COUNT(*) AS n FROM holdings').get() as { n: number };
    const txns = db.prepare('SELECT COUNT(*) AS n FROM txns').get() as { n: number };
    const alerts = db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE active = 1').get() as { n: number };
    console.log(`${OK} ${config.dbPath} açıldı ve şema güncel.`);
    console.log(`${INFO} ${holdings.n} varlık · ${txns.n} işlem · ${alerts.n} aktif alarm`);
  } catch (err) {
    console.log(`${FAIL} Veritabanı açılamadı: ${(err as Error).message}`);
    hardFailures++;
  }

  // ── 4. Veri kaynakları ─────────────────────────────────────────────────────
  heading('4. Piyasa verisi kaynakları');
  if (!db) {
    console.log(`${WARN}Veritabanı açılamadığı için kaynaklar sınanamadı.`);
  } else {
    const results = await probeAll(db, config.httpTimeoutMs);
    for (const r of results) {
      if (r.ok) {
        console.log(`${OK} ${r.label.padEnd(38)} ${String(r.ms).padStart(5)} ms  →  ${r.sample}`);
      } else {
        console.log(`${FAIL} ${r.label.padEnd(38)} ${String(r.ms).padStart(5)} ms`);
        console.log(`   ${r.detail}`);
        softFailures++;
      }
    }
    const down = results.filter(r => !r.ok);
    if (down.length === results.length) {
      console.log(`\n${WARN}Kaynakların HİÇBİRİ çalışmadı. Bu genelde sunucunun internete çıkamaması demek`);
      console.log('   (güvenlik duvarı / proxy). Tek tek hepsinin aynı anda bozulması beklenmez.');
    } else if (down.length > 0) {
      console.log(`\n${INFO} Çalışmayan kaynaklar için Jarvis "veri yok" der — tahmini fiyat ÜRETMEZ.`);
      console.log('   Diğer varlıkların takibi normal sürer.');
    }
  }

  // ── 5. Beyin (Ollama) ──────────────────────────────────────────────────────
  heading('5. Beyin (Ollama)');
  if (config.ollamaMode === 'off') {
    console.log(`${INFO} OLLAMA_MODE=off — dil katmanı kapalı. Jarvis kural tabanlı yanıt verir (tamamen çalışır).`);
  } else {
    const needed = estimateModelRamGb(config.ollamaModel);
    if (needed !== undefined) {
      const totalGb = totalRam / 1024 ** 3;
      if (totalGb < needed) {
        console.log(`${WARN}"${config.ollamaModel}" için ~${needed.toFixed(1)} GB RAM gerekir, sunucuda ${gb(totalRam)} var.`);
        console.log('   Daha küçük bir model dene:  OLLAMA_MODEL=qwen2.5:3b-instruct');
        softFailures++;
      }
    }
    console.log(`${INFO} ${config.ollamaUrl} · model "${config.ollamaModel}" sınanıyor (ilk yükleme uzun sürebilir)...`);
    const probe = await probeOllama(config.ollamaUrl, config.ollamaModel);
    if (probe.ok) {
      console.log(`${OK} Model yanıt verdi (${(probe.ms / 1000).toFixed(1)} sn).`);
      console.log(`   Türkçe örnek yanıt: "${probe.reply}"`);
      console.log(`   ${INFO}Yanıt bozuk Türkçeyse daha büyük bir model kullan — ama RAKAMLAR her zaman koddan gelir,`);
      console.log('   modelin Türkçesi kötü olsa bile Jarvis yanlış tutar söylemez.');
    } else {
      console.log(`${FAIL} ${probe.detail}`);
      console.log(`   ${INFO}Jarvis yine de çalışır: dil katmanı düşünce kural tabanlı yedeğe geçer.`);
      softFailures++;
    }
  }

  // ── 6. Telegram ────────────────────────────────────────────────────────────
  heading('6. Telegram');
  if (!config.telegramToken) {
    console.log(`${FAIL} TELEGRAM_BOT_TOKEN yok — bot açılamaz.`);
  } else {
    const me = await telegramCall(config.telegramToken, 'getMe');
    if (me.ok) {
      const bot = me.result as { username?: string; first_name?: string };
      console.log(`${OK} Bot bağlandı: @${bot.username ?? '?'} (${bot.first_name ?? ''})`);
    } else {
      console.log(`${FAIL} Bot'a bağlanılamadı: ${me.description ?? 'bilinmeyen hata'}`);
      hardFailures++;
    }

    // Chat id yardımı: kullanıcı botuna /start yazdıysa id'sini burada gösteriyoruz.
    const updates = await telegramCall(config.telegramToken, 'getUpdates?limit=20');
    if (updates.ok && Array.isArray(updates.result)) {
      const seen = new Map<number, string>();
      for (const u of updates.result as Array<{ message?: { chat?: { id?: number; first_name?: string; username?: string } } }>) {
        const chat = u.message?.chat;
        if (chat?.id) seen.set(chat.id, chat.username ? `@${chat.username}` : (chat.first_name ?? ''));
      }
      if (config.ownerChatIds.length === 0) {
        if (seen.size === 0) {
          console.log(`${WARN}OWNER_CHAT_ID boş ve bota henüz kimse yazmamış.`);
          console.log('   Telegram\'dan botuna /start yaz, sonra bu komutu TEKRAR çalıştır — id\'ni burada göstereceğim.');
        } else {
          console.log(`\n${INFO} Bota yazan hesaplar (birini .env'deki OWNER_CHAT_ID'ye koy):`);
          for (const [id, who] of seen) console.log(`     OWNER_CHAT_ID=${id}    ${who}`);
        }
      } else {
        console.log(`${OK} Yetkili chat id: ${config.ownerChatIds.join(', ')} — başka herkes yok sayılacak.`);
        const strangers = [...seen.keys()].filter(id => !config.ownerChatIds.includes(id));
        if (strangers.length) {
          console.log(`${INFO} Bota yazan ama yetkisiz olan ${strangers.length} hesap var — doğru davranış, cevap verilmiyor.`);
        }
      }
    } else if (updates.description?.includes('409')) {
      console.log(`${INFO} Bot şu anda çalışıyor (getUpdates çakıştı) — bu iyiye işaret.`);
    }
  }

  // ── 7. Ses ─────────────────────────────────────────────────────────────────
  heading('7. Ses servisi');
  if (!config.voiceEnabled) {
    console.log(`${INFO} VOICE_ENABLED=false — kapalı. Metin akışı bundan etkilenmez.`);
    console.log('   Açmak için:  docker compose --profile voice up -d  ve .env\'de VOICE_ENABLED=true');
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${config.voiceUrl}/health`, { signal: controller.signal });
      const json = (await res.json()) as { stt?: boolean; tts?: boolean };
      if (res.ok && json.stt && json.tts) {
        console.log(`${OK} Ses servisi hazır (konuşma→metin ve metin→konuşma çalışıyor).`);
      } else {
        console.log(`${WARN}Ses servisi cevap verdi ama hazır değil: STT=${json.stt} TTS=${json.tts}`);
        console.log('   Modeller hâlâ iniyor olabilir; birkaç dakika sonra tekrar dene.');
        softFailures++;
      }
    } catch (err) {
      console.log(`${FAIL} Ses servisine ulaşılamadı (${config.voiceUrl}): ${(err as Error).message}`);
      softFailures++;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Özet ───────────────────────────────────────────────────────────────────
  heading('Özet');
  if (hardFailures === 0 && softFailures === 0) {
    console.log(`${OK} Her şey yolunda. \`npm start\` ile Jarvis'i başlatabilirsin.\n`);
  } else if (hardFailures === 0) {
    console.log(`${WARN}${softFailures} uyarı var ama Jarvis ÇALIŞIR — eksik özellikler devre dışı kalır.`);
    console.log('   Yukarıdaki her uyarının altında ne yapılacağı yazıyor.\n');
  } else {
    console.log(`${FAIL} ${hardFailures} kritik sorun var — bunlar çözülmeden Jarvis açılmaz.`);
    if (softFailures) console.log(`${WARN}Ayrıca ${softFailures} uyarı.`);
    console.log('');
  }

  db?.close();
  process.exit(hardFailures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${FAIL} Sağlık kontrolü beklenmedik şekilde çöktü:`, err);
  process.exit(1);
});
