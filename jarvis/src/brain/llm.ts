// Dil katmanının bağlanma noktası + DEVRE KESİCİ.
//
// Devre kesici neden şart: Ollama kapalıysa her mesaj için 60 saniye beklenip sonra
// kurallara düşülürdü — Jarvis kullanılamaz hale gelirdi. Arka arkaya birkaç hata
// sonrası katman bir süreliğine devre dışı bırakılır ve mesajlar ANINDA kural tabanlı
// yoldan cevaplanır. Süre dolunca kendini yeniden dener.
import type { JarvisConfig } from '../config.ts';
import type { Intent } from './intents.ts';
import { inferIntent } from './nlu.ts';
import { rewrite } from './nlg.ts';
import { probeOllama, warmUp } from './ollama.ts';
import type { OllamaOptions } from './ollama.ts';

const ARIZA_ESIGI = 3;
const DINLENME_MS = 5 * 60 * 1000;

export class LanguageLayer {
  private failures = 0;
  private disabledUntil = 0;
  private readonly opts: OllamaOptions;

  constructor(config: JarvisConfig) {
    this.opts = {
      url: config.ollamaUrl,
      model: config.ollamaModel,
      // NLU/NLG kısa işler; ilk çağrıdaki model yükleme payını da kapsayacak kadar geniş,
      // ama kullanıcıyı dakikalarca bekletmeyecek kadar dar.
      timeoutMs: 45_000,
    };
  }

  get available(): boolean {
    return Date.now() >= this.disabledUntil;
  }

  private onSuccess(): void {
    this.failures = 0;
  }

  private onFailure(err: unknown): void {
    this.failures++;
    if (this.failures >= ARIZA_ESIGI) {
      this.disabledUntil = Date.now() + DINLENME_MS;
      this.failures = 0;
      console.warn(
        `[dil] ${ARIZA_ESIGI} ardışık hata sonrası dil katmanı ${DINLENME_MS / 60_000} dakika devre dışı. ` +
        `Jarvis kural tabanlı yanıt vermeye devam ediyor. Son hata: ${(err as Error).message}`,
      );
    }
  }

  async nlu(text: string, holdingNames: string[]): Promise<Intent | undefined> {
    if (!this.available) return undefined;
    try {
      const intent = await inferIntent(text, holdingNames, this.opts);
      this.onSuccess();
      return intent;
    } catch (err) {
      this.onFailure(err);
      return undefined;
    }
  }

  async nlg(draft: string, userText: string): Promise<string | undefined> {
    if (!this.available) return undefined;
    try {
      const result = await rewrite(draft, userText, this.opts);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      return undefined;
    }
  }

  /** Açılışta modeli sınar ve belleğe ısıtır. Başarısızlık ölümcül DEĞİLDİR. */
  async start(): Promise<boolean> {
    const probe = await probeOllama(this.opts.url, this.opts.model, 120_000);
    if (!probe.ok) {
      console.warn(`[dil] Ollama hazır değil: ${probe.detail}`);
      console.warn('[dil] Jarvis kural tabanlı modda çalışacak — tüm hesaplar ve brifingler normal işler.');
      this.disabledUntil = Date.now() + DINLENME_MS;
      return false;
    }
    console.log(`[dil] "${this.opts.model}" hazır (${(probe.ms / 1000).toFixed(1)} sn). Örnek yanıt: "${probe.reply}"`);
    void warmUp(this.opts.url, this.opts.model);
    return true;
  }
}
