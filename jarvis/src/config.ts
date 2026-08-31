// Tüm ayarlar tek yerden okunur ve AÇILIŞTA doğrulanır. Eksik/hatalı bir ayar varsa
// Jarvis yarım yamalak çalışmaya başlamak yerine anlaşılır bir Türkçe hatayla durur —
// "neden brifing gelmedi" diye saatlerce log okumaktan iyidir.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Node 22'nin yerleşik .env okuyucusu — dotenv bağımlılığına gerek yok.
// Docker'da ayarlar ortam değişkeni olarak gelir, .env dosyası olmayabilir; o yüzden sessizce geç.
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Bozuk .env dosyası — aşağıdaki doğrulama zaten eksik alanları yakalayacak.
  }
}

export interface JarvisConfig {
  telegramToken: string;
  ownerChatIds: number[];
  timezone: string;
  dbPath: string;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaMode: 'auto' | 'off';
  voiceEnabled: boolean;
  voiceUrl: string;
  cron: { morning: string; close: string; alerts: string };
  inflationPct: number;
  httpTimeoutMs: number;
  cacheTtlSec: number;
}

function str(key: string, fallback?: string): string {
  const raw = process.env[key]?.trim();
  if (raw) return raw;
  if (fallback !== undefined) return fallback;
  return '';
}

function num(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'evet' || raw === 'yes';
}

/** "123,456" ya da "123 456" gibi girişleri de kabul eder. */
function parseChatIds(raw: string): number[] {
  return raw
    .split(/[,\s;]+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => Number.isInteger(n) && n !== 0);
}

// 5 alanlı standart cron ifadesi mi? (node-cron 6 alanı da kabul eder ama biz 5'te kalıyoruz.)
function looksLikeCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

export interface ConfigResult {
  config: JarvisConfig;
  /** Jarvis'in çalışmasını ENGELLEYEN sorunlar. */
  errors: string[];
  /** Çalışmayı engellemeyen ama bir özelliği kapatan sorunlar. */
  warnings: string[];
}

/**
 * Ayarları okur ve doğrular. Hata fırlatmaz — `errors`/`warnings` döner ki hem `index.ts`
 * (durup hatayı basar) hem `doctor.ts` (hepsini rapor eder) aynı mantığı kullanabilsin.
 */
export function loadConfig(): ConfigResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const telegramToken = str('TELEGRAM_BOT_TOKEN');
  if (!telegramToken) {
    errors.push('TELEGRAM_BOT_TOKEN boş. Telegram\'da @BotFather\'a /newbot yazıp aldığın token\'ı .env dosyasına koy.');
  } else if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(telegramToken)) {
    warnings.push('TELEGRAM_BOT_TOKEN beklenen biçimde görünmüyor (rakamlar:harfler). Yanlış kopyalanmış olabilir.');
  }

  const ownerChatIds = parseChatIds(str('OWNER_CHAT_ID'));
  if (ownerChatIds.length === 0) {
    errors.push(
      'OWNER_CHAT_ID boş. Bu GÜVENLİK ayarı: boşken bot herkese cevap verirdi, o yüzden açılmıyor. ' +
      'Botuna /start yaz, sonra `npm run doctor` çalıştır — sana chat id\'ni söyleyecek.',
    );
  }

  const cron = {
    morning: str('BRIEFING_MORNING_CRON', '0 9 * * 1-5'),
    close: str('BRIEFING_CLOSE_CRON', '30 18 * * 1-5'),
    alerts: str('ALERT_POLL_CRON', '*/15 * * * *'),
  };
  for (const [name, expr] of Object.entries(cron)) {
    if (!looksLikeCron(expr)) {
      errors.push(`Cron ifadesi geçersiz (${name}): "${expr}" — 5 alan olmalı, ör. "0 9 * * 1-5".`);
    }
  }

  const timezone = str('TZ', 'Europe/Istanbul');
  try {
    new Intl.DateTimeFormat('tr-TR', { timeZone: timezone });
  } catch {
    errors.push(`TZ tanınmıyor: "${timezone}". Örnek: Europe/Istanbul`);
  }

  const inflationPct = num('INFLATION_PCT', 40);
  if (inflationPct < 0 || inflationPct > 500) {
    warnings.push(`INFLATION_PCT beklenmedik bir değer (${inflationPct}). Reel getiri uyarıları anlamsız çıkabilir.`);
  }

  const ollamaModeRaw = str('OLLAMA_MODE', 'auto').toLowerCase();
  const ollamaMode: 'auto' | 'off' = ollamaModeRaw === 'off' || ollamaModeRaw === 'false' ? 'off' : 'auto';

  const config: JarvisConfig = {
    telegramToken,
    ownerChatIds,
    timezone,
    dbPath: str('DB_PATH', './data/jarvis.db'),
    ollamaUrl: str('OLLAMA_URL', 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    ollamaModel: str('OLLAMA_MODEL', 'qwen2.5:7b-instruct'),
    ollamaMode,
    voiceEnabled: bool('VOICE_ENABLED', false),
    voiceUrl: str('VOICE_URL', 'http://voice:5002').replace(/\/+$/, ''),
    cron,
    inflationPct,
    httpTimeoutMs: num('HTTP_TIMEOUT_MS', 12000),
    cacheTtlSec: num('CACHE_TTL_SEC', 300),
  };

  return { config, errors, warnings };
}
