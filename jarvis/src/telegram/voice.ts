// Ses servisi istemcisi. Servis kapalıysa ya da düşerse Jarvis metin akışıyla
// normal çalışmaya devam eder — ses HİÇBİR ZAMAN zorunlu bir bağımlılık değildir.
import type { JarvisConfig } from '../config.ts';

export class VoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceError';
  }
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>, label: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new VoiceError(`${label} ${ms / 1000} saniyede tamamlanmadı.`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class VoiceClient {
  constructor(private readonly url: string) {}

  async health(timeoutMs = 8000): Promise<{ stt: boolean; tts: boolean; detay?: string }> {
    return withTimeout(timeoutMs, async signal => {
      const res = await fetch(`${this.url}/health`, { signal });
      if (!res.ok) throw new VoiceError(`Ses servisi HTTP ${res.status}`);
      return (await res.json()) as { stt: boolean; tts: boolean; detay?: string };
    }, 'Ses servisi sağlık kontrolü');
  }

  /** Telegram'daki sesli mesajı indirir ve metne çevirir. */
  async transcribe(fileUrl: string): Promise<string> {
    // Whisper ilk çağrıda modeli indirir — bu birkaç dakika sürebilir, cömert davran.
    return withTimeout(180_000, async signal => {
      const audioRes = await fetch(fileUrl, { signal });
      if (!audioRes.ok) throw new VoiceError(`Sesli mesaj indirilemedi (HTTP ${audioRes.status}).`);
      const audio = Buffer.from(await audioRes.arrayBuffer());

      const res = await fetch(`${this.url}/stt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: audio,
        signal,
      });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || json.error) throw new VoiceError(json.error ?? `Ses çözümlenemedi (HTTP ${res.status}).`);
      return (json.text ?? '').trim();
    }, 'Konuşma çözümleme');
  }

  async synthesize(text: string): Promise<Buffer> {
    return withTimeout(120_000, async signal => {
      const res = await fetch(`${this.url}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new VoiceError(`Seslendirme başarısız (HTTP ${res.status}) ${detail.slice(0, 200)}`);
      }
      return Buffer.from(await res.arrayBuffer());
    }, 'Seslendirme');
  }
}

/** Ses açıksa istemciyi kurar; kapalıysa undefined döner. */
export function createVoiceClient(config: JarvisConfig): VoiceClient | undefined {
  return config.voiceEnabled ? new VoiceClient(config.voiceUrl) : undefined;
}
