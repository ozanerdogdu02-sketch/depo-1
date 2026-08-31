// Ollama istemcisi — düz `fetch`, SDK yok.
//
// TASARIM KURALI: Bu katman ASLA finansal hesap yapmaz. Modelin iki işi var:
//   1) kullanıcının serbest Türkçesini yapılandırılmış bir niyete çevirmek (NLU),
//   2) `core/` katmanının ÜRETTİĞİ rakamları doğal bir cümleye dökmek (NLG).
// Rakamlar her zaman koddan gelir. Küçük yerel modeller sayı uydurur; portföy
// rakamlarını onlara hesaplatmak Jarvis'i yalancı yapardı.
import { setTimeout as delay } from 'node:timers/promises';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaOptions {
  url: string;
  model: string;
  timeoutMs?: number;
  /** Düşük sıcaklık = daha az yaratıcılık, daha çok talimata uyma. NLU için şart. */
  temperature?: number;
  /** JSON şeması ya da 'json' — yapılandırılmış çıktı için. */
  format?: 'json' | Record<string, unknown>;
  /** Üretilecek en fazla jeton. Telegram mesajı zaten kısa olmalı. */
  numPredict?: number;
}

export class OllamaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

async function post(url: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OllamaError(`Ollama HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    return await res.json();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new OllamaError(
        `Ollama ${timeoutMs} ms içinde yanıt vermedi. Model ilk çağrıda belleğe yükleniyor olabilir ` +
        '(büyük modellerde bu 1-2 dakika sürebilir), ya da sunucunun RAM\'i yetmiyor.',
      );
    }
    if (err instanceof OllamaError) throw err;
    throw new OllamaError(`Ollama'ya ulaşılamadı (${url}): ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Tek turluk sohbet çağrısı. Yanıt metnini döner. */
export async function ollamaChat(messages: OllamaMessage[], opts: OllamaOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.2,
      num_predict: opts.numPredict ?? 400,
    },
  };
  if (opts.format) body['format'] = opts.format;

  const json = (await post(`${opts.url}/api/chat`, body, opts.timeoutMs ?? 60_000)) as {
    message?: { content?: unknown };
    error?: unknown;
  };
  if (typeof json.error === 'string') throw new OllamaError(json.error);
  const content = json.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new OllamaError('Ollama boş yanıt döndü.');
  }
  return content.trim();
}

export interface OllamaModelInfo {
  name: string;
  sizeBytes: number;
}

/** Kurulu modelleri listeler. */
export async function listModels(url: string, timeoutMs = 8000): Promise<OllamaModelInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/api/tags`, { signal: controller.signal });
    if (!res.ok) throw new OllamaError(`Ollama HTTP ${res.status}`);
    const json = (await res.json()) as { models?: Array<{ name?: unknown; size?: unknown }> };
    return (json.models ?? [])
      .map(m => ({
        name: typeof m.name === 'string' ? m.name : '',
        sizeBytes: typeof m.size === 'number' ? m.size : 0,
      }))
      .filter(m => m.name);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new OllamaError('Ollama model listesi zaman aşımına uğradı.');
    if (err instanceof OllamaError) throw err;
    throw new OllamaError(`Ollama'ya ulaşılamadı (${url}): ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * İstenen model kurulu mu? Ollama etiketleri "qwen2.5:7b-instruct" biçimindedir ama
 * kullanıcı "qwen2.5" yazmış olabilir; ":latest" eki de düşebilir. Esnek eşleştir.
 */
export function hasModel(models: OllamaModelInfo[], wanted: string): boolean {
  const target = wanted.includes(':') ? wanted : `${wanted}:latest`;
  return models.some(m => m.name === wanted || m.name === target || m.name.split(':')[0] === wanted);
}

/** Ollama ayakta mı ve model gerçekten cevap veriyor mu? */
export async function probeOllama(
  url: string,
  model: string,
  timeoutMs = 90_000,
): Promise<{ ok: boolean; models: OllamaModelInfo[]; reply?: string; detail?: string; ms: number }> {
  const started = Date.now();
  try {
    const models = await listModels(url);
    if (!hasModel(models, model)) {
      return {
        ok: false,
        models,
        detail:
          `"${model}" kurulu değil. Kurmak için:  ollama pull ${model}` +
          (models.length ? `\n   Kurulu olanlar: ${models.map(m => m.name).join(', ')}` : '\n   Hiç model kurulu değil.'),
        ms: Date.now() - started,
      };
    }
    // Gerçekten Türkçe konuşabiliyor mu — kısa, kesin cevaplı bir soruyla ölç.
    const reply = await ollamaChat(
      [
        { role: 'system', content: 'Sadece Türkçe cevap ver. Tek cümle, en fazla 10 kelime.' },
        { role: 'user', content: 'Portföy çeşitlendirmesi neden önemlidir?' },
      ],
      { url, model, timeoutMs, numPredict: 60 },
    );
    return { ok: true, models, reply, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, models: [], detail: (err as Error).message, ms: Date.now() - started };
  }
}

/** İlk çağrıda model belleğe yüklenirken kısa bir bekleme gerekebilir. */
export async function warmUp(url: string, model: string): Promise<void> {
  try {
    await ollamaChat([{ role: 'user', content: 'merhaba' }], { url, model, timeoutMs: 120_000, numPredict: 5 });
  } catch {
    // Isınma başarısızsa sorun değil — ilk gerçek mesajda tekrar denenir.
  }
  await delay(0);
}
