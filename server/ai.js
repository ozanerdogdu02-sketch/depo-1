import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.AI_MODEL || 'claude-opus-4-8';
const MAX_FIELD_LENGTH = 2000;

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export const demoMode = !client;

const SYSTEM_PROMPT = `Sen bilişsel davranışçı terapi (BDT) ilkelerine hakim, destekleyici bir asistansın.
Kullanıcı sana bir durumu ve o durumda aklından geçen otomatik düşünceyi verecek.
Görevin: bu düşünceyi daha dengeli, gerçekçi ve yapıcı bir bakış açısıyla yeniden çerçevelemek.

Kurallar:
- Türkçe yaz.
- 2-4 cümle, sıcak ama abartısız bir ton.
- Kullanıcının duygusunu küçümseme; önce geçerli olduğunu kabul et, sonra dengeli bakışı sun.
- Tanı koyma, ilaç veya terapi önerme; sadece düşünceyi yeniden çerçevele.
- Yanıt olarak SADECE yeniden çerçevelenmiş düşünce metnini döndür, başlık veya açıklama ekleme.`;

// Anahtar yokken de "önce dene" deneyimi sunan basit şablon yanıt.
function demoReframe({ automaticThought }) {
  return (
    `Bu düşüncenin ("${automaticThought.slice(0, 120)}") şu an sana ağır geldiğini görüyorum ve bu anlaşılır. ` +
    'Yine de bu, anın verdiği bir yorum; kanıtlara baktığında ilerlediğin ve iyi giden alanlar da var. ' +
    'Tek bir zor an, tüm gidişatı tanımlamaz — küçük adımlar saymaya devam ediyor. (Demo modu yanıtı)'
  );
}

function validate(body) {
  const errors = [];
  const { situation, automaticThought, emotions, score } = body ?? {};

  if (typeof situation !== 'string' || !situation.trim()) errors.push('situation zorunlu bir metin alanıdır.');
  if (typeof automaticThought !== 'string' || !automaticThought.trim()) errors.push('automaticThought zorunlu bir metin alanıdır.');
  if (typeof situation === 'string' && situation.length > MAX_FIELD_LENGTH) errors.push(`situation en fazla ${MAX_FIELD_LENGTH} karakter olabilir.`);
  if (typeof automaticThought === 'string' && automaticThought.length > MAX_FIELD_LENGTH) errors.push(`automaticThought en fazla ${MAX_FIELD_LENGTH} karakter olabilir.`);
  if (emotions !== undefined && (!Array.isArray(emotions) || emotions.some(e => typeof e !== 'string' || e.length > 40) || emotions.length > 10)) {
    errors.push('emotions en fazla 10 kısa metinden oluşan bir liste olmalıdır.');
  }
  if (score !== undefined && (!Number.isInteger(score) || score < 1 || score > 5)) {
    errors.push('score 1-5 arası bir tam sayı olmalıdır.');
  }
  return errors;
}

export async function reframe(body) {
  const errors = validate(body);
  if (errors.length) {
    return { status: 400, payload: { error: 'validation_error', messages: errors } };
  }

  const { situation, automaticThought, emotions = [], score } = body;

  if (!client) {
    return { status: 200, payload: { reframedThought: demoReframe(body), demo: true } };
  }

  const userContent = [
    `Durum: ${situation.trim()}`,
    `Otomatik düşünce: ${automaticThought.trim()}`,
    emotions.length ? `Hissedilen duygular: ${emotions.join(', ')}` : null,
    score ? `Ruh hali skoru (1-5): ${score}` : null,
  ].filter(Boolean).join('\n');

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    if (response.stop_reason === 'refusal') {
      return { status: 200, payload: { reframedThought: demoReframe(body), demo: true } };
    }

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim();

    if (!text) {
      return { status: 502, payload: { error: 'empty_response', message: 'AI servisinden boş yanıt alındı, lütfen tekrar dene.' } };
    }
    return { status: 200, payload: { reframedThought: text, demo: false } };
  } catch (err) {
    // Anahtar veya sağlayıcı detaylarını asla istemciye sızdırma.
    if (err instanceof Anthropic.RateLimitError) {
      return { status: 429, payload: { error: 'ai_rate_limited', message: 'AI servisi şu an yoğun, biraz sonra tekrar dene.' } };
    }
    console.error('[ai] upstream error:', err?.status ?? '', err?.message ?? err);
    return { status: 502, payload: { error: 'ai_unavailable', message: 'AI servisine şu an ulaşılamıyor, lütfen tekrar dene.' } };
  }
}
