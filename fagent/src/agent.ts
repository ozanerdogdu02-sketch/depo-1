// Demo Ajan — API anahtarı gerektirmez. Portföyü yerel kurallarla analiz eder ve
// sohbet eder. Niyet algılama + kısa süreli bağlam hafızası + grafik çizme içerir.
// Gerçek AI'a geçiş: bu modüldeki fonksiyonları bir sunucu proxy çağrısıyla değiştirmek yeterli.
import {
  PortfolioState, totalValue, fmtTL, fmtPct, fmtSigned, pnlOf, ASSET_LABELS, AssetType,
  investmentHistoryOf,
} from './store';

export interface ChartSpec {
  kind: 'pie' | 'area' | 'bar';
  title: string;
  data: Record<string, string | number>[];
  dataKey: string; // sayısal değer alanı
  nameKey: string; // kategori/x-ekseni etiketi
}

export interface AgentMessage {
  role: 'agent' | 'user';
  text: string;
  chart?: ChartSpec;
  intentId?: string;
}

export interface AgentReply {
  text: string;
  chart?: ChartSpec;
  intentId?: string;
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

// --- Grafik çizme --------------------------------------------------------

function allocationChart(s: PortfolioState): ChartSpec | undefined {
  const alloc = allocation(s);
  if (!alloc.length) return undefined;
  return {
    kind: 'pie',
    title: 'Sınıf Dağılımı',
    dataKey: 'value',
    nameKey: 'name',
    data: alloc.map(a => ({ name: ASSET_LABELS[a.type], value: Math.round(a.amount) })),
  };
}

function investmentHistoryChart(s: PortfolioState): ChartSpec | undefined {
  const history = investmentHistoryOf(s);
  if (history.length < 2) return undefined;
  return {
    kind: 'area',
    title: 'Net Yatırım Tutarı Geçmişi',
    dataKey: 'tutar',
    nameKey: 'tarih',
    data: history.map(p => ({ tarih: p.tarih, tutar: Math.round(p.tutar) })),
  };
}

function pnlBarChart(s: PortfolioState): ChartSpec | undefined {
  if (!s.holdings.length) return undefined;
  return {
    kind: 'bar',
    title: 'Varlık Bazlı Kâr/Zarar',
    dataKey: 'deger',
    nameKey: 'name',
    data: s.holdings.map(h => ({ name: h.name, deger: Math.round(h.amount - h.costBasis) })),
  };
}

function detectChartRequest(s: PortfolioState, text: string): { chart: ChartSpec; intentId: string } | undefined {
  // "graf" kökü kullanılır — "grafik" kelimesi iyelik ekiyle "grafiğimi/grafiğini" gibi ünsüz
  // yumuşamasına uğrar (k→ğ), tam "grafik" eşleşmesi bu biçimleri kaçırırdı.
  if (!/graf|çiz|görselleştir|görsel|chart|pasta/i.test(text)) return undefined;
  if (/kâr|kar|zarar|karşılaştır|kıyasla|bazlı/i.test(text)) {
    const chart = pnlBarChart(s);
    return chart ? { chart, intentId: 'grafik-pnl' } : undefined;
  }
  if (/yatırım|trend|net|geçmiş|birikim/i.test(text)) {
    const chart = investmentHistoryChart(s);
    return chart ? { chart, intentId: 'grafik-yatirim' } : undefined;
  }
  // Varsayılan: dağılım grafiği (en sık istenen) — yoksa yatırım geçmişine düş.
  const chart = allocationChart(s) ?? investmentHistoryChart(s);
  return chart ? { chart, intentId: chart.title === 'Sınıf Dağılımı' ? 'grafik-dagilim' : 'grafik-yatirim' } : undefined;
}

// --- Varlık bazlı sorgular -------------------------------------------------

function bestWorstReply(s: PortfolioState, text: string): string | undefined {
  if (!/en (çok|fazla|iyi|kötü|başarılı)|hangi varlığım (kâr|zarar)/i.test(text)) return undefined;
  if (!s.holdings.length) return 'Henüz varlığın yok — Panel sekmesinden ekleyince kıyaslayabilirim.';
  const withPnl = s.holdings.map(h => ({ h, pnl: pnlOf(h.amount, h.costBasis) }));
  const best = [...withPnl].sort((a, b) => b.pnl.pct - a.pnl.pct)[0];
  const worst = [...withPnl].sort((a, b) => a.pnl.pct - b.pnl.pct)[0];
  if (/kötü|kaybet|zarar/i.test(text)) {
    return `En geride kalan varlığın: ${worst.h.name} — ${fmtPct(worst.pnl.pct)} (${fmtSigned(worst.pnl.abs)}).`;
  }
  if (/iyi|kazan|başarılı/i.test(text)) {
    return `En iyi performans: ${best.h.name} — ${fmtPct(best.pnl.pct)} (${fmtSigned(best.pnl.abs)}).`;
  }
  return `En iyi: ${best.h.name} (${fmtPct(best.pnl.pct)}) · En geride: ${worst.h.name} (${fmtPct(worst.pnl.pct)}).`;
}

function holdingLookupReply(s: PortfolioState, text: string): string | undefined {
  const q = text.trim().toLocaleLowerCase('tr-TR').replace(/nasıl|gidiyor|durumu|ne\s*kadar|\?/gi, '').trim();
  if (q.length < 2) return undefined;
  const matches = s.holdings.filter(h => h.name.toLocaleLowerCase('tr-TR').includes(q));
  if (matches.length === 0) return undefined;
  return matches.map(h => {
    const { abs, pct } = pnlOf(h.amount, h.costBasis);
    return `${h.name} (${ASSET_LABELS[h.type]}): güncel değer ${fmtTL(h.amount)}, maliyet ${fmtTL(h.costBasis)} — ${abs >= 0 ? 'kârda' : 'zararda'}, ${fmtSigned(abs)} (${fmtPct(pct)}).`;
  }).join('\n');
}

// --- Genel niyetler ---------------------------------------------------------

type Rule = { id?: string; test: RegExp; reply: (s: PortfolioState) => string };

const CHAT_RULES: Rule[] = [
  {
    test: /teşekkür|sağ ?ol|eyvallah|süper|harika/i,
    reply: () => 'Rica ederim! Başka bir sorun olursa buradayım.',
  },
  {
    test: /görüşürüz|hoşça kal|bay ?bay|kapat/i,
    reply: () => 'Görüşmek üzere! Portföyünle ilgili aklına bir şey gelirse yine buradayım.',
  },
  {
    test: /merhaba|selam|naber|nasılsın/i,
    reply: () => 'Merhaba! Portföyün hakkında soru sorabilir, "analiz et" yazabilir ya da "dağılımımı çiz" gibi bir istekle grafik çizmemi isteyebilirsin.',
  },
  {
    test: /yardım|ne yapabilirsin|neler yapabilirsin|komutlar|nasıl kullan/i,
    reply: () => [
      'Şunları yapabilirim:',
      '• "analiz et" — portföyünün genel değerlendirmesi',
      '• "dağılımım nasıl" — sınıf bazlı ağırlıklar',
      '• "THYAO nasıl gidiyor" gibi varlık bazlı sorular',
      '• "en çok kazandıran ne" / "en çok kaybettiren ne" — kıyaslama',
      '• "dağılımımı çiz" ya da "yatırım grafiğimi göster" — sohbet içinde grafik çizerim',
      '• enflasyon, faiz, altın, risk, projeksiyon gibi genel konular',
    ].join('\n'),
  },
  {
    id: 'analiz',
    test: /analiz|değerlendir|yorumla/i,
    reply: s => analyzePortfolio(s).join('\n\n'),
  },
  {
    test: /toplam|ne kadar param|portföy değer/i,
    reply: s => `Portföyünün güncel toplamı ${fmtTL(totalValue(s))} (${s.holdings.length} varlık).`,
  },
  {
    id: 'dagilim',
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
    test: /\baltın\b/i,
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

const FOLLOWUP_TEST = /^(devam et|biraz daha( anlat)?|detaylandır|peki|başka|daha fazla|derinleş)/i;

// Önceki ajan mesajlarından intentId taşıyan en son olanı bulur (kısa süreli "bağlam hafızası").
function lastIntentFrom(history: AgentMessage[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === 'agent' && m.intentId) return m.intentId;
  }
  return undefined;
}

export function chatReply(s: PortfolioState, userText: string, history: AgentMessage[] = []): AgentReply {
  const text = userText.trim();
  if (!text) return { text: 'Bir şey yazmadın — bir soru sorabilir ya da "yardım" yazabilirsin.' };

  // Takip cümlesi ("devam et", "biraz daha anlat"...) — son konuşulan konuyu genişlet.
  if (FOLLOWUP_TEST.test(text)) {
    const lastIntent = lastIntentFrom(history);
    if (lastIntent === 'analiz') return { text: analyzePortfolio(s).join('\n\n'), intentId: 'analiz' };
    if (lastIntent === 'grafik-dagilim' || lastIntent === 'grafik-yatirim' || lastIntent === 'grafik-pnl') {
      const chart = lastIntent === 'grafik-dagilim' ? allocationChart(s)
        : lastIntent === 'grafik-yatirim' ? investmentHistoryChart(s)
        : pnlBarChart(s);
      if (chart) return { text: `${chart.title} grafiğini büyütüyorum:`, chart, intentId: lastIntent };
    }
    return { text: 'Hangi konuda devam edeyim? "analiz", "dağılım", "risk" ya da bir varlık adı yazabilirsin.' };
  }

  // Grafik isteği — sohbet içinde doğrudan görsel üretir.
  const chartReq = detectChartRequest(s, text);
  if (chartReq) {
    return { text: `İşte "${chartReq.chart.title}" grafiğin:`, chart: chartReq.chart, intentId: chartReq.intentId };
  }

  // En iyi/en kötü performans kıyaslaması.
  const bw = bestWorstReply(s, text);
  if (bw) return { text: bw };

  // Genel niyet kuralları (analiz, dağılım, risk, enflasyon, küçük sohbet...).
  for (const rule of CHAT_RULES) {
    if (rule.test.test(text)) {
      return { text: rule.reply(s), intentId: rule.id };
    }
  }

  // Varlık adıyla arama (ör. kullanıcı doğrudan "THYAO" ya da "THYAO nasıl gidiyor" yazdıysa).
  const lookup = holdingLookupReply(s, text);
  if (lookup) return { text: lookup };

  return {
    text:
      'Bunu tam olarak anlayamadım. "analiz et", "dağılımım nasıl", "en çok kazandıran ne", bir varlık adı ' +
      '(ör. "THYAO nasıl gidiyor") ya da "dağılımımı çiz" gibi bir grafik isteği deneyebilirsin. "yardım" yazarsan tüm yeteneklerimi listelerim.',
  };
}
