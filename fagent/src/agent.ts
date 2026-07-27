// Demo Ajan — API anahtarı gerektirmez. Portföyü yerel kurallarla analiz eder ve
// sohbet eder. Niyet algılama + kısa süreli bağlam hafızası + grafik çizme içerir.
// Gerçek AI'a geçiş: bu modüldeki fonksiyonları bir sunucu proxy çağrısıyla değiştirmek yeterli.
import {
  PortfolioState, Holding, totalValue, totalCost, fmtTL, fmtPct, fmtSigned, pnlOf, ASSET_LABELS, AssetType,
  investmentHistoryOf,
} from './store';
import { AgentMemoryProfile, mostAskedTopic, mostMentionedHolding } from './agentMemory';
import { TrainedFact, findBestMatch } from './agentTraining';

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
  trainedFactId?: string; // dolu ise bu yanıt öğretilmiş bir bilgiden geldi
  isFallback?: boolean; // "anlayamadım" türü — 👍 anlamsız, otomatik öğretilmiş bilgiye terfi engellenmeli
  ratable?: boolean; // 👍/👎 gösterilsin mi — karşılama mesajı gibi statik metinlerde false
  rated?: 'up' | 'down';
  pendingAction?: PendingAction; // dolu ise Onayla/Vazgeç butonları gösterilir
  actionResolved?: 'confirmed' | 'cancelled';
}

export interface AgentReply {
  text: string;
  chart?: ChartSpec;
  intentId?: string;
  trainedFactId?: string; // dolu ise bu yanıt öğretilmiş bir bilgiden geldi (kullanım sayacı için)
  isFallback?: boolean;
  pendingAction?: PendingAction;
}

// Ajanın chat üzerinden ÖNERDİĞİ ama henüz UYGULAMADIĞI bir işlem — kullanıcı onaylamadan
// hiçbir gerçek veri değişikliği olmaz (bkz. App.tsx'teki Onayla/Vazgeç butonları). agent.ts
// saf kalmaya devam ediyor: burada yalnızca komut ayrıştırılıyor, actions.addTxn hiç çağrılmıyor.
export interface PendingAction {
  kind: 'alis' | 'satis';
  holdingId: string;
  holdingName: string;
  amount: number;
}

// intentId -> okunabilir Türkçe etiket. Kişiselleştirilmiş karşılamada ve "beni ne
// hatırlıyorsun" yanıtında kullanılır.
const INTENT_LABELS: Record<string, string> = {
  analiz: 'genel analiz',
  dagilim: 'sınıf dağılımı',
  'grafik-dagilim': 'dağılım grafiği',
  'grafik-yatirim': 'yatırım geçmişi grafiği',
  'grafik-pnl': 'kâr/zarar grafiği',
  trained: 'senin öğrettiğin bir konu',
};

// Kullanıcının serbest metninde geçen varlık adlarını bulur — "öğe (entity) belleği" için:
// agentMemory bu isimleri biriktirip zamanla "en çok bahsedilen varlık"ı çıkarabilir.
export function extractMentionedHoldings(s: PortfolioState, text: string): string[] {
  const q = text.toLocaleLowerCase('tr-TR');
  return s.holdings.filter(h => q.includes(h.name.toLocaleLowerCase('tr-TR'))).map(h => h.name);
}

function allocation(s: PortfolioState): { type: AssetType; amount: number; pct: number }[] {
  const total = totalValue(s);
  const byType = new Map<AssetType, number>();
  for (const h of s.holdings) byType.set(h.type, (byType.get(h.type) ?? 0) + h.amount);
  return [...byType.entries()]
    .map(([type, amount]) => ({ type, amount, pct: total ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

// Stablecoin tespiti — canlı fiyata bağlıysa CoinGecko id'sinden, değilse addan.
// Kripto yatırımcısı için stablecoin fiilen nakit pozisyonudur; analizde öyle sayılır.
const STABLECOIN_IDS = new Set(['tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd']);
const STABLECOIN_NAME_TEST = /\b(usdt|usdc|tether|dai|busd|tusd|fdusd|stablecoin)\b/i;

function isStablecoin(h: Holding): boolean {
  if (h.type !== 'kripto') return false;
  if (h.symbol && STABLECOIN_IDS.has(h.symbol)) return true;
  return STABLECOIN_NAME_TEST.test(h.name);
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

  // Nakit benzeri oran — mevduat/döviz + STABLECOIN'ler. Stablecoin'i kripto sayıp likidite
  // uyarısı vermek, USDT'yi nakit pozisyonu olarak tutan kripto yatırımcısı için yanlış olurdu.
  const stableValue = s.holdings.filter(isStablecoin).reduce((sum, h) => sum + h.amount, 0);
  const stablePct = total > 0 ? (stableValue / total) * 100 : 0;
  const cashLike =
    alloc.filter(a => a.type === 'mevduat' || a.type === 'doviz').reduce((s2, a) => s2 + a.pct, 0) + stablePct;
  const cashLabel = stablePct > 0 ? 'mevduat/döviz/stablecoin' : 'mevduat/döviz';
  if (cashLike < 10) {
    notes.push(`Nakit benzeri (${cashLabel}) oranın %10'un altında — acil durum tamponu için biraz likidite ayırmak rahatlatır.`);
  } else if (cashLike > 60) {
    notes.push(`Nakit benzeri ağırlık yüksek (%${cashLike.toFixed(0)}). Enflasyonist ortamda uzun vadede reel getiri erimesi riskine dikkat.`);
  } else if (stablePct >= 10) {
    notes.push(`Portföyünün %${stablePct.toFixed(0)}'ı stablecoin — bunu nakit pozisyonu olarak sayıyorum, dalgalanmaya karşı tamponun var.`);
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

// --- Proaktif içgörüler (kullanıcı sormadan) --------------------------------

export type InsightLevel = 'uyari' | 'iyi' | 'bilgi';
export interface Insight {
  level: InsightLevel;
  text: string;
}

// FAGENT'ın Bloki'den ayrıştığı çekirdek yetenek: kullanıcı hiçbir şey SORMADAN, portföyü
// açar açmaz en kritik içgörüleri otomatik yüzeye çıkarır. Reel getiri hesabı gerçek: atıl
// nakit benzeri varlıkların (mevduat/döviz/stablecoin) enflasyon karşısındaki yıllık alım gücü
// kaybını somut TL olarak gösterir. SAF fonksiyon — I/O yok, enflasyon varsayımı dışarıdan
// (kullanıcı düzenleyebilir) geçirilir; sabit/uydurma bir oran gömülmez.
export function proactiveInsights(s: PortfolioState, inflationPct: number): Insight[] {
  const out: Insight[] = [];
  const total = totalValue(s);
  if (total <= 0) return out;

  const alloc = allocation(s);
  const top = alloc[0];

  // 1) Konsantrasyon riski
  if (top && top.pct > 50) {
    out.push({
      level: 'uyari',
      text: `Portföyünün %${top.pct.toFixed(0)}'ı tek sınıfta (${ASSET_LABELS[top.type]}). Bu sınıf sert düşerse tüm portföyün doğrudan etkilenir.`,
    });
  }

  // 2) Reel getiri — atıl nakit benzeri varlıkların enflasyon karşısındaki yıllık erimesi.
  //    En savunulabilir "reel getiri" uyarısı budur: getiri üretmeyen nakit, her yıl enflasyon
  //    kadar alım gücü kaybeder — bu vade karışıklığı içermeyen, matematiksel olarak net bir gerçek.
  const cashLikeValue = s.holdings
    .filter(h => h.type === 'mevduat' || h.type === 'doviz' || isStablecoin(h))
    .reduce((a, h) => a + h.amount, 0);
  const cashLikePct = (cashLikeValue / total) * 100;
  if (cashLikeValue > 0 && inflationPct > 0 && cashLikePct >= 12) {
    const annualErosion = cashLikeValue * (inflationPct / 100);
    out.push({
      level: 'uyari',
      text: `Nakit benzeri varlıkların ${fmtTL(cashLikeValue)} (portföyün %${cashLikePct.toFixed(0)}'ı). ` +
        `%${inflationPct} enflasyon varsayımıyla bu kısım yılda ~${fmtTL(annualErosion)} reel değer kaybediyor — ` +
        `getiri üreten bir sınıfa kaydırmayı değerlendirebilirsin.`,
    });
  }

  // 3) Çeşitlendirme olumlu geri bildirimi (denge kurulmuşsa)
  if ((!top || top.pct <= 50) && alloc.length >= 4) {
    out.push({
      level: 'iyi',
      text: `${alloc.length} varlık sınıfına yayılmışsın — tek bir şoka bağımlılığın düşük, sağlam bir denge.`,
    });
  }

  // 4) Genel kâr/zarar bilgisi (nötr, referans)
  const cost = totalCost(s);
  if (cost > 0) {
    const { abs, pct } = pnlOf(total, cost);
    out.push({
      level: abs >= 0 ? 'iyi' : 'uyari',
      text: `Toplam nominal getirin ${fmtSigned(abs)} (${fmtPct(pct)}). Bu, maliyetine göre — enflasyondan arındırılmış reel getiri için yukarıdaki nakit uyarısına bak.`,
    });
  }

  return out;
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

// --- İşlem komutları (aksiyon alma) -----------------------------------------

// Kullanıcının "THYAO'dan 500 TL sat" gibi bir alım/satım komutu verip vermediğini algılar.
// Bilinçli olarak SIKI kurallar: tutar + tek anlamlı fiil (al/sat) + TAM OLARAK bir varlıkla
// eşleşme gerekir; herhangi biri eksik/belirsizse undefined döner ve normal akışa (soru-cevap)
// düşülür — yanlış algılanan bir "işlem" gerçek veriyi bozabileceğinden yanlış negatif, yanlış
// pozitiften çok daha güvenlidir. Bu fonksiyon SAF'tır: hiçbir actions.* çağrısı yapmaz, yalnızca
// "kullanıcı bunu istiyor gibi görünüyor" tespitini döner — gerçek uygulama App.tsx'te, kullanıcı
// onayladıktan SONRA gerçekleşir.
function detectTradeCommand(s: PortfolioState, text: string): PendingAction | undefined {
  const amountMatch = text.match(/(\d[\d.,]*)\s*(tl|₺)?/i);
  if (!amountMatch) return undefined;
  const amountStr = amountMatch[1].replace(/\./g, '').replace(',', '.');
  const amount = Math.round(Number(amountStr));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const isSell = /\b(sat|satış|satayım|satmak istiyorum)\b/i.test(text);
  const isBuy = /\b(al|alış|ekle|alayım|almak istiyorum)\b/i.test(text);
  if (isSell === isBuy) return undefined; // ikisi de yok ya da ikisi de var (belirsiz) — atla

  const lower = text.toLocaleLowerCase('tr-TR');
  const candidates = s.holdings.filter(h => lower.includes(h.name.toLocaleLowerCase('tr-TR')));
  if (candidates.length !== 1) return undefined; // hiç ya da birden fazla eşleşme — güvenli değil

  const holding = candidates[0];
  return { kind: isSell ? 'satis' : 'alis', holdingId: holding.id, holdingName: holding.name, amount };
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
      '• "THYAO\'dan 500 TL sat" gibi bir komutla gerçek işlem önerebilirim — onaylarsan uygularım',
      '• "en çok kazandıran ne" / "en çok kaybettiren ne" — kıyaslama',
      '• "dağılımımı çiz" ya da "yatırım grafiğimi göster" — sohbet içinde grafik çizerim',
      '• enflasyon, faiz, altın, risk, projeksiyon gibi genel konular',
      '• "beni ne hatırlıyorsun" — zamanla hangi konularla ilgilendiğini öğrenirim (yalnızca tarayıcında saklanır)',
      '• "Ajanı Eğit" panelinden bana yeni soru-cevaplar öğretebilirsin — öğrettiğin bilgi her zaman diğer cevaplarımdan önce gelir',
      '• her cevabımı 👍/👎 ile oylayabilirsin — 👎 dersen doğrusunu öğretmen için soru-cevap formu otomatik açılır',
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

// Kullanıcı ajanın kendisi hakkında ne öğrendiğini sorarsa (şeffaflık — KVKK'ya uyumlu:
// bu bilgi yalnızca tarayıcıda tutulur, açıkça belirtilir).
function memoryQueryReply(memory: AgentMemoryProfile | undefined, text: string): string | undefined {
  if (!/beni (ne )?hat[ıi]rl|hakkımda ne biliyorsun|profilim(i)?( ne)?|hafızan(da)?/i.test(text)) return undefined;
  if (!memory || memory.totalTurns === 0) {
    return 'Henüz hakkında bir şey öğrenmedim — birkaç soru sorunca hangi konularla ilgilendiğini fark etmeye başlarım. Bu bilgi yalnızca tarayıcında saklanır, hiçbir yere gönderilmez.';
  }
  const topic = mostAskedTopic(memory);
  const holding = mostMentionedHolding(memory);
  const parts = [`Şimdiye kadar ${memory.totalTurns} mesaj konuştuk.`];
  if (topic) parts.push(`En çok "${INTENT_LABELS[topic] ?? topic}" konusunu soruyorsun.`);
  if (holding) parts.push(`En sık bahsettiğin varlık: ${holding}.`);
  parts.push('Bu bilgi yalnızca tarayıcında saklanır, hiçbir sunucuya gönderilmez — "SIFIRLA" ile bunu da silebilirsin.');
  return parts.join(' ');
}

// Karşılama mesajını üretir — birkaç turdan sonra dönen kullanıcıyı önceki ilgi alanlarına
// göre kişiselleştirilmiş karşılar. Bu, dersteki "kendini geliştiren ajan" (insight agent)
// deseninin anahtarsız/yerel karşılığıdır: gözlemle → depola → gelecekte kullan.
export function buildGreeting(memory?: AgentMemoryProfile): string {
  const base =
    'Merhaba! Ben FAGENT demo ajanı — anahtar gerektirmeden çalışırım. "Analiz Et" butonuna basabilir, ' +
    'portföyün hakkında soru sorabilir ya da "dağılımımı çiz" gibi bir istekle senin için grafik çizmemi isteyebilirsin.';
  if (!memory || memory.totalTurns < 3) {
    return `${base} "yardım" yazarsan neler yapabildiğimi listelerim.`;
  }
  const topic = mostAskedTopic(memory);
  const holding = mostMentionedHolding(memory);
  const bits = ['Tekrar merhaba!'];
  if (topic) bits.push(`Önceki konuşmalarımızda en çok "${INTENT_LABELS[topic] ?? topic}" hakkında konuşmuştuk.`);
  if (holding) bits.push(`${holding} de sık geçen bir konuydu.`);
  bits.push('Kaldığımız yerden devam edebiliriz, ya da "beni ne hatırlıyorsun" yazarak profilini görebilirsin.');
  return bits.join(' ');
}

const FOLLOWUP_TEST = /^(devam et|biraz daha( anlat)?|detaylandır|peki|başka|daha fazla|derinleş)/i;

// Önceki ajan mesajlarından intentId taşıyan en son olanı bulur (kısa süreli "bağlam hafızası").
function lastIntentFrom(history: AgentMessage[]): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === 'agent' && m.intentId) return m.intentId;
  }
  return undefined;
}

export function chatReply(
  s: PortfolioState,
  userText: string,
  history: AgentMessage[] = [],
  memory?: AgentMemoryProfile,
  trainedFacts: TrainedFact[] = [],
): AgentReply {
  const text = userText.trim();
  if (!text) return { text: 'Bir şey yazmadın — bir soru sorabilir ya da "yardım" yazabilirsin.' };

  // Kullanıcının doğrudan öğrettiği bilgiler — built-in kurallardan ÖNCE kontrol edilir,
  // çünkü kullanıcı bunu bilerek/isteyerek öğretti; ajanın davranışını gerçekten
  // değiştirebilmesi bunun anlamlı olmasının şartı.
  const trained = findBestMatch(trainedFacts, text);
  if (trained) return { text: trained.answer, intentId: 'trained', trainedFactId: trained.id };

  // Alım/satım komutu — gerçek veri değişikliği burada YAPILMAZ, yalnızca önerilir.
  // Kullanıcı sohbet balonundaki Onayla/Vazgeç ile onaylamadan actions.addTxn çağrılmaz.
  const pendingAction = detectTradeCommand(s, text);
  if (pendingAction) {
    const verb = pendingAction.kind === 'alis' ? 'almak' : 'satmak';
    return {
      text: `${pendingAction.holdingName} için ${fmtTL(pendingAction.amount)} ${verb} istediğini anladım. Onaylıyor musun?`,
      pendingAction,
    };
  }

  // Ajanın kendisi hakkında ne bildiğini soran meta-sorular (uzun süreli bellek şeffaflığı).
  const memoryReply = memoryQueryReply(memory, text);
  if (memoryReply) return { text: memoryReply };

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
    return { text: 'Hangi konuda devam edeyim? "analiz", "dağılım", "risk" ya da bir varlık adı yazabilirsin.', isFallback: true };
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
    isFallback: true,
  };
}
