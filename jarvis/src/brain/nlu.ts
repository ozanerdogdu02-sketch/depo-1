// NLU — serbest Türkçeyi yapılandırılmış niyete çeviren katman.
//
// Modelin görevi SADECE "kullanıcı ne demek istedi" sorusunu cevaplamak. Hesap yapmaz,
// veri okumaz, rakam üretmez. Çıktısı JSON şemasıyla kısıtlanır ve zod ile doğrulanır;
// şemaya uymayan yanıt sessizce reddedilir ve akış kural tabanlı yola geri düşer.
import { z } from 'zod';
import type { AssetKind } from '../db.ts';
import { ASSET_KINDS } from '../db.ts';
import { ollamaChat, type OllamaOptions } from './ollama.ts';
import type { Intent } from './intents.ts';
import { normalizeName } from '../core/format.ts';
import { parseTurkishAmount, resolveSymbolAlias } from './parse.ts';

const NIYETLER = [
  'portfoy', 'brifing', 'dagilim', 'analiz', 'en_iyi_kotu', 'gecmis', 'yardim',
  'selam', 'tesekkur', 'fiyat_guncelle', 'fiyat_sorgu', 'varlik_sorgu',
  'varlik_sil', 'islem', 'alarm_kur', 'alarm_listele', 'bilinmiyor',
] as const;

/** Ollama'ya verilen JSON şeması — model bunun dışında bir yapı üretemez. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    niyet: { type: 'string', enum: [...NIYETLER] },
    varlik: { type: 'string' },
    sembol: { type: 'string' },
    tutar: { type: 'number' },
    yon: { type: 'string', enum: ['ustunde', 'altinda'] },
    islem_turu: { type: 'string', enum: ['alis', 'satis'] },
  },
  required: ['niyet'],
} as const;

const ResponseSchema = z.object({
  niyet: z.enum(NIYETLER),
  varlik: z.string().optional(),
  sembol: z.string().optional(),
  tutar: z.number().optional(),
  yon: z.enum(['ustunde', 'altinda']).optional(),
  islem_turu: z.enum(['alis', 'satis']).optional(),
});

function systemPrompt(holdingNames: string[]): string {
  const liste = holdingNames.length ? holdingNames.join(', ') : '(portföy boş)';
  return `Sen bir Türk finansal asistanının niyet çözümleyicisisin.
Kullanıcının cümlesini oku ve SADECE hangi niyete karşılık geldiğini JSON olarak döndür.

Kullanıcının portföyündeki varlıklar: ${liste}

Niyetler:
- portfoy: portföy özeti isteniyor
- brifing: kapsamlı rapor isteniyor
- dagilim: varlık sınıfı dağılımı
- analiz: yorum, risk değerlendirmesi
- en_iyi_kotu: en çok kazandıran/kaybettiren
- gecmis: geçmiş işlemler
- fiyat_sorgu: bir varlığın güncel fiyatı (sembol alanını doldur: USD, EUR, GRAM, ONS, BTC, ETH ya da BIST kodu)
- varlik_sorgu: portföydeki BELİRLİ bir varlığın durumu (varlik alanına yukarıdaki listeden BİREBİR kopyala)
- islem: alım/satım kaydı (varlik + tutar + islem_turu doldur)
- varlik_sil: portföyden varlık çıkarma (varlik doldur)
- alarm_kur: fiyat alarmı (sembol + tutar + yon doldur)
- alarm_listele: alarmları görme
- fiyat_guncelle: fiyatları tazeleme
- yardim / selam / tesekkur: sırasıyla yardım isteği, selamlama, teşekkür
- bilinmiyor: yukarıdakilerden hiçbiri değilse

KURALLAR:
1. Emin değilsen "bilinmiyor" döndür. Tahmin etme.
2. "varlik" alanını YALNIZCA yukarıdaki listeden birebir kopyalayarak doldur. Listede yoksa boş bırak.
3. "tutar" alanına yalnızca kullanıcının CÜMLESİNDE GEÇEN sayıyı yaz. Sayı yoksa alanı hiç ekleme.
4. Hesap yapma, yorum yapma, açıklama yazma. Sadece JSON.

Örnekler:
"portföyüm ne durumda" -> {"niyet":"portfoy"}
"altına ne kadar yatırmıştım" -> {"niyet":"varlik_sorgu","varlik":"Gram Altın"}
"dolar kaç oldu" -> {"niyet":"fiyat_sorgu","sembol":"USD"}
"bugün hava nasıl" -> {"niyet":"bilinmiyor"}`;
}

/**
 * Modelin döndürdüğü ham niyeti GÜVENLİ bir Intent'e çevirir.
 *
 * Buradaki doğrulamalar modelin uydurmasına karşı savunma:
 *  - varlık adı gerçekten portföyde olmalı,
 *  - işlem/alarm tutarı kullanıcının KENDİ cümlesinde geçmeli.
 * İkincisi kritik: model "500 TL sattım" cümlesinden 5000 üretirse ve kullanıcı
 * onay ekranını hızlıca onaylarsa defter bozulurdu.
 */
export function toIntent(
  raw: z.infer<typeof ResponseSchema>,
  userText: string,
  holdingNames: string[],
): Intent | undefined {
  const findHolding = (name?: string): string | undefined => {
    if (!name) return undefined;
    const target = normalizeName(name);
    return holdingNames.find(h => normalizeName(h) === target);
  };

  /** Model tutarı gerçekten kullanıcının cümlesinden mi almış? */
  const amountIsGrounded = (value: number | undefined): value is number => {
    if (value === undefined || !Number.isFinite(value) || value <= 0) return false;
    const fromText = parseTurkishAmount(userText);
    if (fromText === undefined) return false;
    // Küçük yuvarlama farklarına izin ver, uydurmaya izin verme.
    return Math.abs(fromText - value) < Math.max(0.01, Math.abs(fromText) * 0.001);
  };

  switch (raw.niyet) {
    case 'portfoy': case 'brifing': case 'dagilim': case 'analiz':
    case 'en_iyi_kotu': case 'gecmis': case 'yardim': case 'selam':
    case 'tesekkur': case 'fiyat_guncelle': case 'alarm_listele':
      return { id: raw.niyet };

    case 'fiyat_sorgu': {
      const symbol = raw.sembol?.trim().toUpperCase();
      if (!symbol) return undefined;
      const alias = resolveSymbolAlias(symbol);
      if (alias) return { id: 'fiyat_sorgu', symbol: alias.symbol, kind: alias.kind };
      if (symbol === 'GRAM' || symbol === 'ONS') return { id: 'fiyat_sorgu', symbol, kind: 'altin' };
      if (/^[A-Z0-9]{2,6}$/.test(symbol)) return { id: 'fiyat_sorgu', symbol, kind: 'hisse' };
      return undefined;
    }

    case 'varlik_sorgu': {
      const name = findHolding(raw.varlik);
      return name ? { id: 'varlik_sorgu', name } : undefined;
    }

    case 'varlik_sil': {
      const name = findHolding(raw.varlik);
      return name ? { id: 'varlik_sil', name } : undefined;
    }

    case 'islem': {
      const name = findHolding(raw.varlik);
      if (!name || !raw.islem_turu) return undefined;
      if (!amountIsGrounded(raw.tutar)) return undefined;
      return { id: 'islem', name, txnKind: raw.islem_turu, amount: raw.tutar };
    }

    case 'alarm_kur': {
      if (!raw.yon || !amountIsGrounded(raw.tutar)) return undefined;
      const symbol = raw.sembol?.trim().toUpperCase();
      if (!symbol) return undefined;
      if (symbol === 'PORTFOY') {
        return { id: 'alarm_kur', target: 'PORTFOY', kind: 'portfoy', direction: raw.yon, threshold: raw.tutar };
      }
      const alias = resolveSymbolAlias(symbol);
      const kind: AssetKind = alias?.kind
        ?? (symbol === 'GRAM' || symbol === 'ONS' ? 'altin' : 'hisse');
      if (!(ASSET_KINDS as readonly string[]).includes(kind)) return undefined;
      return {
        id: 'alarm_kur',
        target: alias?.symbol ?? symbol,
        kind,
        direction: raw.yon,
        threshold: raw.tutar,
      };
    }

    case 'bilinmiyor':
      return undefined;
  }
}

/** Modele niyet sorar. Herhangi bir aksaklıkta undefined döner — çağıran kurallara düşer. */
export async function inferIntent(
  userText: string,
  holdingNames: string[],
  opts: OllamaOptions,
): Promise<Intent | undefined> {
  const content = await ollamaChat(
    [
      { role: 'system', content: systemPrompt(holdingNames) },
      { role: 'user', content: userText },
    ],
    { ...opts, format: RESPONSE_SCHEMA, temperature: 0, numPredict: 200 },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Bazı modeller JSON'u ```json bloğu içinde döndürür.
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }

  const result = ResponseSchema.safeParse(parsed);
  if (!result.success) return undefined;
  return toIntent(result.data, userText, holdingNames);
}
