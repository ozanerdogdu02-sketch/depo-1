// Telegram botu — grammy, long polling.
//
// Long polling seçildi (webhook değil): sunucunun dışarı açık bir portu, alan adı ya da
// TLS sertifikası GEREKMEZ. Böylece aynı kod hem VPS'te hem kullanıcının dizüstünde,
// hiçbir ağ ayarı yapılmadan çalışır.
//
// GÜVENLİK: OWNER_CHAT_ID allowlist'i EN DIŞTAKİ ara katmandır. Botun kullanıcı adını
// bulan biri /portfoy yazarsa hiçbir şey göremez — istek handler'lara hiç ulaşmaz.
import { randomUUID } from 'node:crypto';
import { Bot, InlineKeyboard, type Context } from 'grammy';
import type { Db } from '../db.ts';
import type { JarvisConfig } from '../config.ts';
import type { PendingAction } from '../brain/intents.ts';

/** Telegram tek mesajda en fazla 4096 karakter kabul eder. */
const TELEGRAM_LIMIT = 4096;

/**
 * Uzun metni Telegram'ın kabul edeceği parçalara böler.
 * Satır sınırlarını korur — bir tabloyu ya da listeyi ortasından kesmek okunaksız olurdu.
 */
export function splitMessage(text: string, limit = TELEGRAM_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    // Tek başına sınırı aşan satır (çok uzun bir varlık adı gibi) — sert böl.
    if (line.length > limit) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += limit) chunks.push(line.slice(i, i + limit));
      continue;
    }
    if (current.length + line.length + 1 > limit) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** HTML biçiminde, gerekiyorsa bölerek gönderir. */
export async function sendHtml(ctx: Context, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const parts = splitMessage(text);
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    await ctx.reply(parts[i] as string, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      // Butonlar yalnızca SON parçaya eklenir — yoksa her parçada tekrar görünürdü.
      ...(isLast && keyboard ? { reply_markup: keyboard } : {}),
    });
  }
}

/** Bot API'sinden doğrudan mesaj göndermek için (zamanlayıcı kullanır — ctx yok). */
export async function pushHtml(bot: Bot, chatId: number, text: string): Promise<void> {
  for (const part of splitMessage(text)) {
    await bot.api.sendMessage(chatId, part, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
  }
}

// ── Onay bekleyen aksiyonlar ────────────────────────────────────────────────
// Bellekte değil VERİTABANINDA tutulur: Jarvis yeniden başlasa bile kullanıcının
// ekranındaki "Onayla" butonu çalışmaya devam eder.

export function savePendingAction(db: Db, chatId: number, action: PendingAction): string {
  const id = randomUUID();
  db.prepare('INSERT INTO pending_actions (id, chat_id, payload, created_at, resolved) VALUES (?, ?, ?, ?, NULL)')
    .run(id, chatId, JSON.stringify(action), new Date().toISOString());
  return id;
}

export interface PendingRecord {
  id: string;
  chat_id: number;
  action: PendingAction;
  resolved: string | null;
  created_at: string;
}

export function loadPendingAction(db: Db, id: string): PendingRecord | undefined {
  const row = db.prepare('SELECT * FROM pending_actions WHERE id = ?').get(id) as
    | { id: string; chat_id: number; payload: string; created_at: string; resolved: string | null }
    | undefined;
  if (!row) return undefined;
  try {
    return { id: row.id, chat_id: row.chat_id, action: JSON.parse(row.payload) as PendingAction, resolved: row.resolved, created_at: row.created_at };
  } catch {
    return undefined;
  }
}

/**
 * Aksiyonu çözümlenmiş olarak işaretler.
 * `changes === 0` demek başkası (ya da çift tıklama) daha önce çözümlemiş demektir —
 * çağıran taraf bunu görüp işlemi TEKRAR UYGULAMAZ. Çift işlem yazılmasına karşı kilit.
 */
export function resolvePendingAction(db: Db, id: string, outcome: 'confirmed' | 'cancelled'): boolean {
  return db
    .prepare('UPDATE pending_actions SET resolved = ? WHERE id = ? AND resolved IS NULL')
    .run(outcome, id).changes > 0;
}

/** Onay bekleyen aksiyonun geçerlilik süresi — eskimiş bir öneriyi uygulamak tehlikeli. */
export const PENDING_TTL_MS = 30 * 60 * 1000;

export function isPendingExpired(record: PendingRecord): boolean {
  return Date.now() - new Date(record.created_at).getTime() > PENDING_TTL_MS;
}

export function confirmKeyboard(pendingId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Onayla', `ok:${pendingId}`)
    .text('✖️ Vazgeç', `no:${pendingId}`);
}

/** Eski, çözümlenmiş kayıtları temizler — tablo sonsuza kadar büyümesin. */
export function prunePendingActions(db: Db): number {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  return db.prepare('DELETE FROM pending_actions WHERE created_at < ?').run(cutoff).changes;
}

// ── Bot kurulumu ────────────────────────────────────────────────────────────

export interface BotDeps {
  db: Db;
  config: JarvisConfig;
  /** Serbest metni yanıtlayan katman (kural tabanlı ya da dil katmanı destekli). */
  handleText: (text: string, chatId: number) => Promise<{ text: string; pending?: PendingAction | undefined }>;
  /** Onaylanan aksiyonu uygular. */
  applyAction: (action: PendingAction) => string;
  /** Sesli mesajı metne çevirir; ses servisi kapalıysa undefined döner. */
  transcribeVoice?: ((fileUrl: string) => Promise<string>) | undefined;
  /** Yanıtı sese çevirir; kapalıysa undefined. */
  synthesizeVoice?: ((text: string) => Promise<Buffer>) | undefined;
}

export function createBot(deps: BotDeps): Bot {
  const { db, config } = deps;
  const bot = new Bot(config.telegramToken);
  const allowed = new Set(config.ownerChatIds);

  // ── ALLOWLIST — her şeyden önce ───────────────────────────────────────────
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (chatId === undefined || !allowed.has(chatId)) {
      // Sessizce yok say. Cevap vermek ("yetkin yok") bile botun canlı olduğunu
      // doğrular ve deneme yapmaya davet eder.
      return;
    }
    await next();
  });

  bot.catch(err => {
    console.error('[telegram] işlenmemiş hata:', err.error instanceof Error ? err.error.message : err.error);
  });

  // ── Onay butonları ────────────────────────────────────────────────────────
  bot.on('callback_query:data', async ctx => {
    const data = ctx.callbackQuery.data;
    const match = data.match(/^(ok|no):(.+)$/);
    if (!match) {
      await ctx.answerCallbackQuery();
      return;
    }
    const [, decision, pendingId] = match;
    const record = loadPendingAction(db, pendingId as string);

    if (!record) {
      await ctx.answerCallbackQuery({ text: 'Bu öneri artık geçerli değil.' });
      return;
    }
    if (record.resolved) {
      await ctx.answerCallbackQuery({ text: 'Bu öneriyi zaten cevaplamıştın.' });
      return;
    }
    if (isPendingExpired(record)) {
      resolvePendingAction(db, record.id, 'cancelled');
      await ctx.answerCallbackQuery({ text: 'Öneri zaman aşımına uğradı.' });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await sendHtml(ctx, '⏳ Bu öneri 30 dakikadan eski olduğu için iptal ettim. Güncel fiyatlarla tekrar sorabilirsin.');
      return;
    }

    if (decision === 'no') {
      resolvePendingAction(db, record.id, 'cancelled');
      await ctx.answerCallbackQuery({ text: 'Vazgeçildi.' });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      await sendHtml(ctx, '✖️ Vazgeçtim — hiçbir şey değiştirmedim.');
      return;
    }

    // Kilit: yalnızca ilk tıklama uygular.
    if (!resolvePendingAction(db, record.id, 'confirmed')) {
      await ctx.answerCallbackQuery({ text: 'Bu öneri az önce işlendi.' });
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Uygulanıyor...' });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    try {
      await sendHtml(ctx, deps.applyAction(record.action));
    } catch (err) {
      await sendHtml(ctx, `⚠️ Uygularken hata oldu: ${(err as Error).message}`);
    }
  });

  // ── Sesli mesaj ───────────────────────────────────────────────────────────
  bot.on(['message:voice', 'message:audio'], async ctx => {
    if (!deps.transcribeVoice) {
      await sendHtml(
        ctx,
        '🎙 Ses servisi kapalı. Açmak için <code>docker compose --profile voice up -d</code> ' +
        've .env dosyasında <code>VOICE_ENABLED=true</code>.',
      );
      return;
    }
    await ctx.replyWithChatAction('typing');
    try {
      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
      const transcript = await deps.transcribeVoice(url);
      if (!transcript.trim()) {
        await sendHtml(ctx, 'Sesini anlayamadım — tekrar dener misin?');
        return;
      }
      await sendHtml(ctx, `🎙 <i>“${transcript}”</i>`);
      await handleUserText(ctx, transcript, deps, true);
    } catch (err) {
      await sendHtml(ctx, `🎙 Sesi çözemedim: ${(err as Error).message}`);
    }
  });

  // ── Serbest metin ─────────────────────────────────────────────────────────
  bot.on('message:text', async ctx => {
    await handleUserText(ctx, ctx.message.text, deps, false);
  });

  return bot;
}

async function handleUserText(ctx: Context, text: string, deps: BotDeps, wantsVoice: boolean): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;

  await ctx.replyWithChatAction('typing').catch(() => {});
  let result: { text: string; pending?: PendingAction | undefined };
  try {
    result = await deps.handleText(text, chatId);
  } catch (err) {
    console.error('[telegram] yanıt üretilemedi:', err);
    await sendHtml(ctx, `⚠️ Bir şeyler ters gitti: ${(err as Error).message}`);
    return;
  }

  const keyboard = result.pending
    ? confirmKeyboard(savePendingAction(deps.db, chatId, result.pending))
    : undefined;

  await sendHtml(ctx, result.text, keyboard);

  // Kullanıcı sesle sorduysa sesle cevap ver — ama onay bekleyen bir aksiyon varsa
  // sesli okumak yerine butonlara bakmasını isteriz.
  if (wantsVoice && deps.synthesizeVoice && !result.pending) {
    try {
      const audio = await deps.synthesizeVoice(stripHtml(result.text));
      await ctx.replyWithVoice(new (await import('grammy')).InputFile(audio, 'jarvis.ogg'));
    } catch (err) {
      console.warn('[ses] sentez başarısız:', (err as Error).message);
    }
  }
}

/** Sesli okuma için HTML etiketlerini ve emojileri temizler. */
export function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
