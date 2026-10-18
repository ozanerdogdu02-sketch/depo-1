// Gerçek AI katmanı — İSTEĞE BAĞLI, KAPALI başlar. Kullanıcı kendi Cloudflare Worker'ının adresini
// girmedikçe hiçbir dış isteğe çıkılmaz; agent.ts'teki yerel kural motoru (chatReply) HER ZAMAN
// çalışır durumda kalır (AGENTS.md §0.1 "anahtarsız çalışmayı asla bırakmamalı"). Bu katman yalnızca
// kullanıcı BİLEREK kendi worker'ını bağladığında VE yerel kurallar bir soruyu tanımadığında
// (chatReply → isFallback) devreye girer — App.tsx'teki send() bu sırayı uygular, burada değil.
//
// Mimari (2026-07-08'de onaylandı, bkz. memory fagent-anahtarsiz-ai-plani): kullanıcı kendi
// Gemini/Claude anahtarını bir Cloudflare Worker'a (ücretsiz katman) koyar, bu uygulama yalnızca
// o worker'ın PUBLIC adresine POST atar. Anahtar tarayıcıya hiç inmez — AGENTS.md §0.1'i ("API
// ANAHTARI YOK — istemci tarafında") bozmadan gerçek bir dil modeline bağlanmanın tek yolu bu.
//
// Sözleşme (worker'ın beklediği/döndürdüğü — bkz. Downloads/fagent-worker.js):
//   İSTEK:  POST { system: string, messages: [{role:'user'|'assistant', content:string}], maxTokens: number }
//   YANIT:  { text: string, saglayici?: string } BAŞARILI ise, { error: string } başarısızsa
import { PortfolioState, totalValue, totalCost, pnlOf, fmtTL, fmtPct, ASSET_LABELS } from './store';
import { allocation } from './analytics';

const KEY = 'fagent.ai.proxyurl.v1';

// Yalnızca https:// (localhost'ta http:// da olur — yerel worker testi için) ve URL'de kullanıcı
// adı/parola gömülü OLMAYAN adresler kabul edilir. Güvenlik nedeni: burası kullanıcının PORTFÖY
// ÖZETİNİ göndereceği adres — doğrulanmamış bir adres, yanlışlıkla (kimlik avı vb.) yapıştırılırsa
// veriyi başka birinin sunucusuna taşır (Codex denetiminde bulundu, 2026-09-04).
export function validateAiProxyUrl(url: string): string | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined; // boş = bağlantıyı kaldır, geçerli
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { return 'Geçerli bir adres değil.'; }
  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLocalhost)) {
    return 'Yalnızca https:// kabul edilir (localhost hariç).';
  }
  if (parsed.username || parsed.password) return 'Adres kullanıcı adı/parola içeremez.';
  return undefined; // geçerli
}

export function getAiProxyUrl(): string {
  try { return (localStorage.getItem(KEY) ?? '').trim(); } catch { return ''; }
}

// Geçersiz bir adres SESSİZCE kaydedilmez — çağıran taraf (UI) validateAiProxyUrl ile önce
// kontrol etmeli ve hatayı kullanıcıya göstermeli. Burada da ikinci bir savunma katmanı olarak
// aynı kontrol tekrarlanır (yalnızca UI'ya güvenmemek için).
export function setAiProxyUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed && validateAiProxyUrl(trimmed) !== undefined) return false;
  try {
    if (trimmed) localStorage.setItem(KEY, trimmed); else localStorage.removeItem(KEY);
    return true;
  } catch {
    return false; // kota — bellekte kalır, sayfa yenilenince kaybolur
  }
}

export function isAiConfigured(): boolean {
  return getAiProxyUrl().length > 0;
}

// SIFIRLA ile birlikte çağrılır (diğer altı katmanla aynı desen).
export function resetAiProxyUrl(): void {
  try { localStorage.removeItem(KEY); } catch { /* yok */ }
}

export class AiProxyError extends Error {}

export interface AiChatMessage { role: 'user' | 'assistant'; content: string }

const TIMEOUT_MS = 12_000; // worker yanıt vermezse hızlıca yerel metne düşülsün, kullanıcı asılı kalmasın
const MAX_TOKENS = 700;

// Worker'a HAM soruyu değil, PORTFÖYÜN GERÇEK SAYILARINI da içeren bir sistem mesajı gönderir —
// dil modelinin finans matematiğini kendi UYDURMASI yerine burada VERİLEN gerçek rakamları
// konuşma diline çevirmesi istenir. Bu, ürünün "sahte veri yok" ilkesinin AI katmanındaki karşılığı.
function buildSystemPrompt(s: PortfolioState): string {
  const total = totalValue(s);
  const cost = totalCost(s);
  const lines: string[] = [
    'Sen FAGENT adlı bir kişisel yatırım takip uygulamasının sohbet asistanısın. Türkçe, kısa ve ' +
    'sohbet diliyle yanıt ver — madde madde robotik listeler yerine doğal cümleler kur.',
    '',
    'KESİN KURALLAR (bunları asla ihlal etme):',
    '1. AL/SAT TAVSİYESİ VEREMEZSİN. "Hangi hisseyi alayım", "portföyümü nasıl değiştirmeliyim" gibi ' +
    'sorularda net bir eylem önerme; bunun yalnızca SPK lisanslı kurumların yapabileceği bir şey ' +
    'olduğunu kısaca söyle ve konuyu betimleyici tarafta tut (ne olduğunu anlat, ne yapılacağını değil).',
    '2. UYDURMA SAYI KULLANMA. Aşağıda verilen rakamların DIŞINDA hiçbir fiyat, oran ya da tutar ' +
    'söyleme. Bir şeyi bilmiyorsan/verilmemişse "bunu bilmiyorum" de.',
    '3. Sen yerel bir kural motorunun ANLAYAMADIĞI bir soruya yanıt veriyorsun — kullanıcı zaten ' +
    '"anlaşılamadı" mesajını gördü, şimdi senin görevin GERÇEKTEN yardımcı olmak.',
    '4. Bu bir yatırım tavsiyesi değildir; gerekirse bunu doğal bir cümleyle hatırlat, her cevaba ' +
    'yapıştırma.',
    '',
    `PORTFÖY DURUMU (${new Date().toLocaleDateString('tr-TR')} itibarıyla, gerçek veri):`,
    `Toplam güncel değer: ${fmtTL(total)}. Toplam maliyet: ${fmtTL(cost)}.`,
  ];

  if (s.holdings.length === 0) {
    lines.push('Portföy henüz boş — hiç varlık eklenmemiş.');
  } else {
    lines.push('Varlıklar:');
    for (const h of s.holdings) {
      const { abs, pct } = pnlOf(h.amount, h.costBasis);
      lines.push(`- ${h.name} (${ASSET_LABELS[h.type]}): ${fmtTL(h.amount)}, kâr/zarar ${fmtTL(abs)} (${fmtPct(pct)})`);
    }
    const alloc = allocation(s);
    if (alloc.length) {
      lines.push('Sınıf dağılımı: ' + alloc.map(a => `${ASSET_LABELS[a.type]} %${a.pct.toFixed(0)}`).join(', ') + '.');
    }
  }

  lines.push(
    '',
    'Kullanıcı bu sayıların dışında bir şey sorarsa (ör. genel piyasa yorumu, kavram açıklaması), ' +
    'bunu GERÇEK ZAMANLI PİYASA VERİN OLMADIĞINI açıkça belirterek genel/eğitici bilgi ver — ' +
    'belirli bir fiyat ya da güncel bir olay biliyormuş gibi davranma.',
  );

  return lines.join('\n');
}

// history: App.tsx'teki AgentMessage[] — burada import ETMİYORUZ (agent.ts'e bağımlılık döngüsü
// yaratmamak için) — çağıran taraf {role, content} biçimine kendi çevirir.
export async function askAi(s: PortfolioState, userText: string, history: AiChatMessage[]): Promise<string> {
  const url = getAiProxyUrl();
  if (!url) throw new AiProxyError('AI bağlantısı kurulmamış.');

  const messages: AiChatMessage[] = [...history, { role: 'user', content: userText }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: buildSystemPrompt(s), messages, maxTokens: MAX_TOKENS }),
      signal: controller.signal,
    });
  } catch {
    throw new AiProxyError(controller.signal.aborted ? 'AI yanıtı zaman aşımına uğradı.' : 'AI bağlantısına ulaşılamadı.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new AiProxyError(body?.error || `AI servisi hata döndürdü (${res.status}).`);
  }
  const data = await res.json().catch(() => null) as { text?: string } | null;
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  if (!text) throw new AiProxyError('AI boş yanıt döndürdü.');
  return text;
}
