// Demo Ajan — API anahtarı gerektirmez. Portföyü yerel kurallarla analiz eder.
// Gerçek AI'a geçiş: bu modüldeki fonksiyonları bir sunucu proxy çağrısıyla değiştirmek yeterli.
import { PortfolioState, totalValue, fmtTL, ASSET_LABELS, AssetType } from './store';

export interface AgentMessage {
  role: 'agent' | 'user';
  text: string;
}

function allocation(s: PortfolioState): { type: AssetType; amount: number; pct: number }[] {
  const total = totalValue(s);
  const byType = new Map<AssetType, number>();
  for (const h of s.holdings) byType.set(h.type, (byType.get(h.type) ?? 0) + h.amount);
  return [...byType.entries()]
    .map(([type, amount]) => ({ type, amount, pct: total ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function analyzePortfolio(s: PortfolioState): string[] {
  const total = totalValue(s);
  if (!s.holdings.length) {
    return ['Portföyün henüz boş. Panel sekmesinden varlık ekle ya da örnek veriyle başla, sonra tekrar analiz edelim.'];
  }

  const alloc = allocation(s);
  const top = alloc[0];
  const notes: string[] = [];

  notes.push(
    `Portföy özeti: toplam ${fmtTL(total)}, ${s.holdings.length} varlık, ${alloc.length} farklı sınıf. ` +
    `En büyük ağırlık ${ASSET_LABELS[top.type]} (%${top.pct.toFixed(0)}).`,
  );

  if (top.pct > 50) {
    notes.push(
      `⚠ Konsantrasyon uyarısı: portföyün yarısından fazlası tek sınıfta (${ASSET_LABELS[top.type]}). ` +
      'Bu sınıf değer kaybederse toplam portföy sert etkilenir; ağırlığı kademeli azaltmayı değerlendirebilirsin.',
    );
  } else if (alloc.length >= 4) {
    notes.push('✓ Çeşitlendirme iyi görünüyor: dört veya daha fazla varlık sınıfına yayılmışsın, tek bir şoka bağımlılık düşük.');
  } else {
    notes.push('Çeşitlendirme orta düzeyde. Farklı davranan sınıflar (ör. altın + hisse + mevduat) birlikte tutulduğunda dalgalanma yumuşar.');
  }

  const cashLike = alloc.filter(a => a.type === 'mevduat' || a.type === 'doviz').reduce((s2, a) => s2 + a.pct, 0);
  if (cashLike < 10) {
    notes.push('Nakit benzeri (mevduat/döviz) oranın %10\'un altında — acil durum tamponu için biraz likidite ayırmak rahatlatır.');
  } else if (cashLike > 60) {
    notes.push(`Nakit benzeri ağırlık yüksek (%${cashLike.toFixed(0)}). Enflasyonist ortamda uzun vadede reel getiri erimesi riskine dikkat.`);
  }

  const recentSells = s.txns.slice(0, 10).filter(t => t.kind === 'satis').length;
  const recentBuys = s.txns.slice(0, 10).filter(t => t.kind === 'alis').length;
  if (recentBuys + recentSells >= 3) {
    notes.push(
      recentSells > recentBuys
        ? 'Son işlemlerinde satış ağırlığı var — plan dahilindeyse sorun yok, ama panik satışları uzun vadeli getiriyi en çok aşındıran davranıştır.'
        : 'Son işlemlerin alım ağırlıklı — düzenli alım (maliyet ortalaması) zamanlama riskini azaltan sağlam bir disiplindir.',
    );
  }

  notes.push('Not: Bu analiz demo ajan tarafından yerel kurallarla üretildi; yatırım tavsiyesi değildir.');
  return notes;
}

const CHAT_RULES: { test: RegExp; reply: (s: PortfolioState) => string }[] = [
  {
    test: /merhaba|selam|naber|nasılsın/i,
    reply: () => 'Merhaba! Portföyün hakkında soru sorabilir ya da "analiz" yazarak genel değerlendirme isteyebilirsin.',
  },
  {
    test: /analiz|değerlendir|yorumla/i,
    reply: s => analyzePortfolio(s).join('\n\n'),
  },
  {
    test: /toplam|ne kadar|değer/i,
    reply: s => `Portföyünün güncel toplamı ${fmtTL(totalValue(s))} (${s.holdings.length} varlık).`,
  },
  {
    test: /dağılım|çeşitlendirme|ağırlık/i,
    reply: s => {
      const alloc = allocation(s);
      if (!alloc.length) return 'Henüz varlık yok; Panel sekmesinden ekleyebilirsin.';
      return 'Sınıf dağılımın:\n' + alloc.map(a => `• ${ASSET_LABELS[a.type]}: ${fmtTL(a.amount)} (%${a.pct.toFixed(0)})`).join('\n');
    },
  },
  {
    test: /enflasyon/i,
    reply: () => 'Enflasyon dönemlerinde nakitte kalmak reel kayıp demektir; enflasyona dirençli varlıklar (hisse, altın, dövize endeksli araçlar) ile likidite arasında denge kurmak klasik yaklaşımdır.',
  },
  {
    test: /faiz|mevduat/i,
    reply: () => 'Mevduat faizi öngörülebilir getiri sağlar ama getirisi enflasyonun altında kalırsa reel kayıp yaşarsın. Faiz getirisini enflasyon beklentisiyle karşılaştırarak değerlendir.',
  },
  {
    test: /altın/i,
    reply: () => 'Altın tarihsel olarak kriz ve enflasyon dönemlerinde koruma sağlar; getirisi dalgalıdır ama portföyde %10-20 bandında tampon görevi görmesi yaygın bir tercih.',
  },
  {
    test: /projeksiyon|gelecek|birikim|hedef/i,
    reply: () => 'Projeksiyon sekmesinde aylık katkı ve beklenen yıllık getiriyi ayarlayarak birikiminin yıllara göre nasıl büyüyeceğini görebilirsin. Bileşik getiri en çok süreden beslenir — erken başlamak miktardan değerlidir.',
  },
  {
    test: /risk/i,
    reply: s => {
      const alloc = allocation(s);
      const top = alloc[0];
      if (!top) return 'Risk değerlendirmesi için önce portföyüne varlık ekle.';
      return top.pct > 50
        ? `Ana riskin konsantrasyon: %${top.pct.toFixed(0)} ağırlıkla ${ASSET_LABELS[top.type]}. Tek sınıfa bağımlılığı azaltmak ilk adım olabilir.`
        : 'Portföyün sınıflara dağılmış durumda; ana riskler piyasa geneli (sistematik) risk ve enflasyon. Vade ufkunu netleştirmek risk toleransını belirlemenin en sağlam yolu.';
    },
  },
];

export function chatReply(s: PortfolioState, userText: string): string {
  for (const rule of CHAT_RULES) {
    if (rule.test.test(userText)) return rule.reply(s);
  }
  return (
    'Bunu demo ajan olarak yanıtlayamıyorum — "analiz", "dağılım", "risk", "toplam", "projeksiyon", "enflasyon", "faiz" veya "altın" hakkında sorabilirsin. ' +
    'Gerçek AI sohbeti, sunucu tarafına Anthropic anahtarı eklendiğinde otomatik devreye girecek şekilde tasarlandı.'
  );
}
