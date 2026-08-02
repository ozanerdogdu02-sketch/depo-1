// Demo Ajan — API anahtarı gerektirmez. Portföyü yerel kurallarla analiz eder ve
// sohbet eder. Niyet algılama + kısa süreli bağlam hafızası + grafik çizme içerir.
// Gerçek AI'a geçiş: bu modüldeki fonksiyonları bir sunucu proxy çağrısıyla değiştirmek yeterli.
import {
  PortfolioState, Holding, totalValue, totalCost, fmtTL, fmtPct, fmtSigned, pnlOf, ASSET_LABELS, AssetType,
  investmentHistoryOf,
  fmtDec,
} from './store';
import { AgentMemoryProfile, RiskLevel, AgentMode, VadeTercihi, mostAskedTopic, mostMentionedHolding } from './agentMemory';
import { TrainedFact, findBestMatch } from './agentTraining';
import {
  realReturnPct, xirrOf, concentrationOf, attributionOf, contributionOf, investmentPaceOf,
  parseInflationPct, afterTaxOf, allocation, driftOf,
} from './analytics';

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
  'reel-getiri': 'reel getiri',
  'vergi-sonrasi': 'vergi sonrası net getiri',
  'risk-metrik': 'risk metrikleri',
  'hedef-dagilim': 'hedef dağılım sapması',
  trained: 'senin öğrettiğin bir konu',
};

// BLOK 1 — tercih etiketleri (bellek şeffaflığı metinleri için).
const RISK_LABELS: Record<RiskLevel, string> = { dusuk: 'düşük', orta: 'orta', yuksek: 'yüksek' };
const MODE_LABELS: Record<AgentMode, string> = { temkinli: 'temkinli', dengeli: 'dengeli', agresif: 'agresif' };
const VADE_LABELS: Record<VadeTercihi, string> = { kisa: 'kısa', orta: 'orta', uzun: 'uzun' };

// Kullanıcının serbest metninde geçen varlık adlarını bulur — "öğe (entity) belleği" için:
// agentMemory bu isimleri biriktirip zamanla "en çok bahsedilen varlık"ı çıkarabilir.
export function extractMentionedHoldings(s: PortfolioState, text: string): string[] {
  const q = text.toLocaleLowerCase('tr-TR');
  return s.holdings.filter(h => q.includes(h.name.toLocaleLowerCase('tr-TR'))).map(h => h.name);
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

export function analyzePortfolio(s: PortfolioState, inflationPct: number = VARSAYILAN_ENFLASYON): string[] {
  const total = totalValue(s);
  if (!s.holdings.length) {
    return ['Portföyün henüz boş. Panel sekmesinden varlık ekle ya da örnek veriyle başla, sonra tekrar analiz edelim.'];
  }

  const alloc = allocation(s);
  const top = alloc[0];
  const notes: string[] = [];

  notes.push(
    `Portföy özeti: toplam ${fmtTL(total)}, ${s.holdings.length} varlık, ${alloc.length} farklı sınıf. ` +
    `En büyük ağırlık ${ASSET_LABELS[top.type]} (%${fmtDec(top.pct, 0)}).`,
  );

  if (top.pct > 50) {
    notes.push(
      `⚠ Konsantrasyon uyarısı: portföyün yarısından fazlası tek sınıfta (${ASSET_LABELS[top.type]}). ` +
      'Bu sınıf değer kaybederse toplam portföy sert etkilenir — tek bir şoka bağımlılığın yüksek.',
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
    notes.push(
      `Nakit benzeri ağırlık yüksek (%${fmtDec(cashLike, 0)}). %${fmtDec(inflationPct, 0)} enflasyon varsayımıyla ` +
      `bu kısım nominal olarak durduğu yerde bile her yıl alım gücü kaybediyor.`,
    );
  } else if (stablePct >= 10) {
    notes.push(`Portföyünün %${fmtDec(stablePct, 0)}'ı stablecoin — bunu nakit pozisyonu olarak sayıyorum, dalgalanmaya karşı tamponun var.`);
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
export function proactiveInsights(
  s: PortfolioState,
  inflationPct: number,
  // Kullanıcının girdiği hedef dağılım (targetAllocation.ts). Verilmezse hedef içgörüsü çıkmaz —
  // hedef girmemiş kullanıcıya sapma uyarısı göstermek anlamsız olurdu.
  targets?: Record<AssetType, number>,
): Insight[] {
  const out: Insight[] = [];
  const total = totalValue(s);
  if (total <= 0) return out;

  const alloc = allocation(s);
  const top = alloc[0];

  // 1) Konsantrasyon riski
  if (top && top.pct > 50) {
    out.push({
      level: 'uyari',
      text: `Portföyünün %${fmtDec(top.pct, 0)}'ı tek sınıfta (${ASSET_LABELS[top.type]}). Bu sınıf sert düşerse tüm portföyün doğrudan etkilenir.`,
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
      text: `Nakit benzeri varlıkların ${fmtTL(cashLikeValue)} (portföyün %${fmtDec(cashLikePct, 0)}'ı). ` +
        `%${inflationPct} enflasyon varsayımıyla bu kısım yılda ~${fmtTL(annualErosion)} reel değer kaybediyor — ` +
        `nominal bakiyen düşmediği için ekranda görünmeyen bir alım gücü kaybı.`,
    });
  }

  // 3) Çeşitlendirme olumlu geri bildirimi (denge kurulmuşsa)
  if ((!top || top.pct <= 50) && alloc.length >= 4) {
    out.push({
      level: 'iyi',
      text: `${alloc.length} varlık sınıfına yayılmışsın — tek bir şoka bağımlılığın düşük, sağlam bir denge.`,
    });
  }

  // 4) Hedef dağılımdan sapma — yalnızca kullanıcı bir hedef girdiyse.
  //    Betimleyici kip: ne olduğunu söyler, ne yapılacağını değil (bkz. CLAUDE.md §1.13).
  const drift = targets ? driftOf(s, targets) : undefined;
  if (drift && drift.breachedCount > 0) {
    const worst = drift.rows.find(r => r.breached)!;
    const yon = worst.driftPp > 0 ? 'üzerinde' : 'altında';
    out.push({
      level: 'uyari',
      text: `${drift.breachedCount} sınıf kendi belirlediğin hedef bandının dışında. En büyük sapma ` +
        `${ASSET_LABELS[worst.type]}: hedefin %${fmtDec(worst.targetPct, 0)}, güncel %${fmtDec(worst.actualPct, 1)} — ` +
        `hedefinin ${fmtDec(Math.abs(worst.driftPp), 1)} puan ${yon} (bandın ${fmtDec(worst.bandPp, 1)} puan).`,
    });
  }

  // 5) Genel kâr/zarar bilgisi (nötr, referans)
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

/* ─────────────────────────  Grafik yorumlama  ─────────────────────────
   Ajan artık "işte grafiğin" deyip susmuyor; grafiğin ne söylediğini analytics.ts'teki
   gerçek finans matematiğiyle okuyor. Bloki'den ayrışma noktası: Bloki reel getiri
   formülünü açıklayıp hesabı kullanıcıya bırakıyordu, Fagent hesabı kendisi yapıyor. */

// SON ÇARE geri düşme değeri. Enflasyonun tek doğruluk kaynağı artık `inflation.ts` —
// App.tsx her çağrıda güncel oranı `inflationPct` parametresiyle geçirir (TCMB EVDS'den canlı,
// kullanıcının girdiği ya da varsayım). agent.ts SAF kalsın diye buradan okunmaz, geçirilir.
// Bu sabit yalnızca parametre hiç verilmediğinde (ör. doğrudan çağrılan bir test) devreye girer.
const VARSAYILAN_ENFLASYON = 32;

// Öncelik: kullanıcı cümlede bir oran yazdıysa o; yoksa App'ten gelen güncel oran; o da yoksa sabit.
function enflasyonOrani(text: string, inflationPct?: number): number {
  return parseInflationPct(text) ?? inflationPct ?? VARSAYILAN_ENFLASYON;
}

// Sınıf dağılımı (pasta) okuması — Herfindahl konsantrasyonu + etkin varlık sayısı.
function readAllocationChart(s: PortfolioState): string {
  const c = concentrationOf(s);
  if (!c) return '';
  const lines: string[] = [];
  lines.push(
    `Grafiği okuyalım: en büyük pozisyonun ${c.topName} ve tek başına portföyün %${fmtDec(c.topWeightPct, 1)}'ini tutuyor.`,
  );
  // HHI kavramını kısaca açıklayarak veriyoruz — sayıyı anlamsız bırakmamak için.
  lines.push(
    `Yoğunlaşmayı Herfindahl endeksiyle ölçüyorum (ağırlıkların karelerinin toplamı): HHI = ${fmtDec(c.hhi, 3)}. ` +
    `Bunun tersi "etkin varlık sayısı"nı verir: ${c.nominalN} varlığın var ama çeşitlenmen etkin olarak ` +
    `${fmtDec(c.effectiveN, 1)} varlığa denk geliyor.`,
  );
  if (c.level === 'yuksek') {
    lines.push('Bu yoğun bir dağılım (HHI > 0,25) — tek bir varlıktaki sert hareket portföyün tamamını belirgin biçimde etkiler.');
  } else if (c.level === 'orta') {
    lines.push('Bu orta düzey bir yoğunlaşma (HHI 0,15–0,25). Dağıtık sayılmak için ağırlıkların daha dengeli olması gerekir.');
  } else {
    lines.push('Bu dağıtık sayılır (HHI < 0,15) — tek bir varlığa bağımlılığın düşük.');
  }
  return lines.join(' ');
}

// Net yatırım geçmişi (alan) okuması — tempo + katkı/getiri ayrıştırması + XIRR.
function readInvestmentChart(s: PortfolioState, inflationPct?: number): string {
  const lines: string[] = [];
  const pace = investmentPaceOf(s);
  const attr = attributionOf(s);

  if (pace) {
    lines.push(
      `Grafiği okuyalım: ${Math.round(pace.days)} gündür (${fmtDec(pace.months, 1)} ay) yatırım yapıyorsun; ` +
      `${pace.buyCount} alış, ${pace.sellCount} satış. Net yatırdığın tutar ${fmtTL(pace.totalInvested)}` +
      (pace.months >= 1 ? `, aylık ortalama ${fmtTL(pace.monthlyAverage)}.` : '.'),
    );
  }
  if (attr) {
    lines.push(
      `Çizgi yatırdığın parayı gösterir; güncel değerin ${fmtTL(attr.value)}. ` +
      `Aradaki ${fmtSigned(attr.gain)} getiridir — yani bugünkü servetinin %${fmtDec(Math.abs(attr.gainSharePct), 1)}'i ` +
      `${attr.gain >= 0 ? 'kazançtan' : 'kayıptan'} geliyor, kalanı senin koyduğun para.`,
    );
  }

  // XIRR — para-ağırlıklı yıllık getiri. Kısa geçmişte yıllıklandırma yanıltıcı olur, söylüyoruz.
  const x = xirrOf(s);
  if (x) {
    if (x.reliable) {
      const real = realReturnPct(x.annualPct, inflationPct ?? VARSAYILAN_ENFLASYON);
      lines.push(
        `Para-ağırlıklı yıllık getirin (XIRR) %${fmtDec(x.annualPct, 1)}. ` +
        `%${fmtDec(inflationPct ?? VARSAYILAN_ENFLASYON, 0)} enflasyon varsayımıyla reel karşılığı %${fmtDec(real, 1)} ` +
        `(Fisher: (1+nominal)/(1+enflasyon)−1; "nominal eksi enflasyon" kestirmesi burada yanıltır).`,
      );
    } else {
      lines.push(
        `Geçmişin ${Math.round(x.years * 365)} günlük — bu kadar kısa bir süreyi yıllığa çevirmek yanıltıcı olur, ` +
        `o yüzden yıllık getiri (XIRR) hesabını güvenilir bulmuyorum.`,
      );
    }
  }
  return lines.join(' ');
}

// Varlık bazlı kâr/zarar (çubuk) okuması — katkı payları.
function readPnlChart(s: PortfolioState): string {
  const c = contributionOf(s);
  if (!c) return '';
  const lines: string[] = [];
  lines.push(`Grafiği okuyalım: net kâr/zararın ${fmtSigned(c.totalPnl)}.`);
  if (c.winners.length) {
    const w = c.winners[0];
    lines.push(
      `Kazandıranların toplamı ${fmtTL(c.grossGain)}; en büyük katkı ${w.name} ` +
      `(${fmtSigned(w.pnl)}, toplam hareketin %${fmtDec(w.sharePct, 0)}'ı).`,
    );
  }
  if (c.losers.length) {
    const l = c.losers[0];
    lines.push(
      `Kaybettirenlerin toplamı ${fmtTL(c.grossLoss)}; en çok ${l.name} ` +
      `(${fmtSigned(l.pnl)}, %${fmtDec(l.sharePct, 0)}).`,
    );
  }
  if (c.winners.length && c.losers.length) {
    lines.push(
      c.totalPnl >= 0
        ? 'Kazançlar kayıpları karşılamış durumda; net sonuç pozitif.'
        : 'Kayıplar kazançları aşıyor; net sonuç negatif.',
    );
  }
  return lines.join(' ');
}

// Bir grafiğe ait sayısal okumayı döner.
function readChart(s: PortfolioState, intentId: string, inflationPct?: number): string {
  if (intentId === 'grafik-dagilim') return readAllocationChart(s);
  if (intentId === 'grafik-yatirim') return readInvestmentChart(s, inflationPct);
  if (intentId === 'grafik-pnl') return readPnlChart(s);
  return '';
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

// Kurallar stopaj oranlarını 3., hedef dağılımı 4. parametreden alır — böylece agent.ts saf
// kalır (localStorage'a dokunmaz), kullanıcının düzenlediği değerler App.tsx'ten geçirilir.
type Rule = {
  id?: string;
  test: RegExp;
  reply: (
    s: PortfolioState,
    text: string,
    taxRates?: Record<AssetType, number>,
    targets?: Record<AssetType, number>,
    inflationPct?: number,
  ) => string;
};

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
  // ── İleri matematik: reel getiri (Fisher) ──────────────────────────────────────────
  // Bloki bu soruda formülü açıklayıp hesabı kullanıcıya bırakıyordu; biz hesaplıyoruz.
  {
    id: 'reel-getiri',
    test: /reel getiri|reel kazanç|enflasyondan arınd|enflasyona göre.*(getiri|kazanç|durum)|alım gücü/i,
    reply: (s, text, _taxRates, _targets, inflationPct) => {
      const attr = attributionOf(s);
      if (!attr) return 'Reel getiriyi hesaplamak için önce portföyüne varlık eklemen gerek.';
      // Kullanıcı "%55 enflasyona göre..." gibi bir oran verdiyse onu kullan.
      const inf = enflasyonOrani(text, inflationPct);
      const realTotal = realReturnPct(attr.totalReturnPct, inf);
      const lines = [
        `Toplam nominal getirin %${fmtDec(attr.totalReturnPct, 2)} (${fmtSigned(attr.gain)} / maliyet ${fmtTL(attr.invested)}).`,
        `%${inf} enflasyon varsayımıyla REEL getirin %${fmtDec(realTotal, 2)}.`,
        `Hesap Fisher denklemiyle: (1 + nominal) / (1 + enflasyon) − 1. Yaygın "nominal eksi enflasyon" kestirmesi ` +
        `%${fmtDec((attr.totalReturnPct - inf), 2)} derdi — yüksek enflasyonda bu kestirme sapar, doğrusu yukarıdaki.`,
      ];
      const x = xirrOf(s);
      if (x?.reliable) {
        lines.push(
          `Zamana yayılmış katkıların olduğu için asıl ölçüt para-ağırlıklı yıllık getiri (XIRR): %${fmtDec(x.annualPct, 1)}, ` +
          `reel karşılığı %${fmtDec(realReturnPct(x.annualPct, inf), 1)}.`,
        );
      }
      lines.push(`Enflasyon varsayımını değiştirmek istersen "%55 enflasyona göre reel getirim ne" gibi yazabilirsin.`);
      lines.push(`Not: bu hesap VERGİ ÖNCESİ. Stopajı da katmak için "vergiden sonra ne kalıyor" diye sorabilirsin.`);
      return lines.join('\n\n');
    },
  },
  // ── İleri matematik: vergi sonrası net reel getiri ─────────────────────────────────
  // Zincirin üçüncü halkası: brüt → stopaj → net → enflasyon → reel. Yaygın uygulamalar
  // brütte durur, bir kısmı reeli hesaplar; vergiyi katan neredeyse yok. Bankaların
  // göstermek istemediği katman bu — bağımsız bir ürün gösterebilir.
  {
    id: 'vergi-sonrasi',
    test: /vergi|stopaj|tevkifat|net getiri|net kazanc|net kazanç|cebe (kalan|kal)|eline geçen|vergiden sonra/i,
    reply: (s, text, taxRates, _targets, inflationPct) => {
      const inf = enflasyonOrani(text, inflationPct);
      const r = afterTaxOf(s, inf, taxRates);
      if (!r) return 'Vergi sonrası getiriyi hesaplamak için önce portföyüne varlık eklemen gerek.';

      if (r.grossGain <= 0) {
        return (
          `Şu an toplamda kâr yok (${fmtSigned(r.grossGain)}), dolayısıyla hesaplanacak bir stopaj da yok — ` +
          `vergi kazanç üzerinden alınır, anapara üzerinden değil.\n\n` +
          `%${inf} enflasyon varsayımıyla reel getirin %${fmtDec(r.realGrossReturnPct, 2)}.`
        );
      }

      const lines = [
        `Zinciri baştan sona kuralım (maliyet ${fmtTL(r.invested)}):`,
        // NOT: ajan mesajları App.tsx'te DÜZ METİN olarak basılıyor ({m.text}) — markdown
        // ayrıştırılmıyor. Buraya ** yazma, kullanıcıya yıldız olarak görünür.
        `1) Brüt kazanç: ${fmtSigned(r.grossGain)} → getiri %${fmtDec(r.grossReturnPct, 2)}\n` +
        `2) Varsayılan stopaj: −${fmtTL(r.tax)} → net kazanç ${fmtSigned(r.netGain)}, net getiri %${fmtDec(r.netReturnPct, 2)}\n` +
        `3) %${inf} enflasyon sonrası REEL net getirin: %${fmtDec(r.realNetReturnPct, 2)}`,
        `Vergi hiç olmasaydı reel getirin %${fmtDec(r.realGrossReturnPct, 2)} olurdu — aradaki ` +
        `${fmtDec((r.realGrossReturnPct - r.realNetReturnPct), 2)} puan stopajın reel maliyeti.`,
      ];

      // Hangi kalemden ne kesildiğini göster — soyut kalmasın.
      const taxed = r.byHolding.filter(h => h.tax > 0).sort((a, b) => b.tax - a.tax);
      if (taxed.length > 0) {
        lines.push(
          'Kalem bazında kesinti:\n' +
          taxed.map(h => `• ${h.name} (${ASSET_LABELS[h.type]}, %${h.ratePct}): ${fmtTL(h.tax)}`).join('\n'),
        );
      }

      lines.push(
        `Oranlar 27.03.2026 tarihli 11107 sayılı Cumhurbaşkanı Kararı'na göre VARSAYILMIŞTIR ` +
        `(fon ve 6 aya kadar vadeli TL mevduat %17,5; BIST pay senedi alım-satımında stopaj yok). ` +
        `Vade, fon türü ve istisnalar sonucu değiştirir — bu bir vergi beyannamesi değil, bir tahmindir.`,
      );

      if (r.hasUnverified) {
        lines.push(
          `Portföyünde kripto/altın/döviz var: bunlar için doğrulanmış bir stopaj oranı bulamadığımdan ` +
          `%0 varsaydım. Bu "vergi yok" demek değil — "bir oran uydurmuyorum" demek. ` +
          `Kendi oranını biliyorsan söyle, ona göre hesaplayayım.`,
        );
      }

      return lines.join('\n\n');
    },
  },
  // ── İleri matematik: yıllık getiri (XIRR) ──────────────────────────────────────────
  {
    id: 'yillik-getiri',
    test: /yıllık getiri|xirr|irr|yıllıklandır|bileşik getiri|cagr/i,
    reply: (s, text, _taxRates, _targets, inflationPct) => {
      const inf = enflasyonOrani(text, inflationPct);
      const x = xirrOf(s);
      if (!x) return 'Yıllık getiriyi hesaplamak için işlem geçmişi gerekiyor — henüz yeterli veri yok.';
      if (!x.reliable) {
        return `İşlem geçmişin ${Math.round(x.years * 365)} günlük. Bu kadar kısa bir dönemi yıllığa çevirmek ` +
          `matematiksel olarak mümkün ama yanıltıcı olur (birkaç günlük hareket yıla ölçeklenince abartılı görünür), ` +
          `o yüzden sana bir yıllık getiri rakamı vermiyorum. En az bir aylık geçmiş biriktiğinde hesaplarım.`;
      }
      return [
        `Para-ağırlıklı yıllık getirin (XIRR) %${fmtDec(x.annualPct, 2)}.`,
        `Bu, basit "son değer / ilk değer" hesabından farklıdır: paranı zaman içinde parça parça koyduğun için ` +
        `her katkının portföyde kaldığı süre ağırlıklandırılır. Teknik olarak nakit akışlarının iç verim oranıdır — ` +
        `Σ CF/(1+r)^(gün/365) = 0 denklemini çözerim.`,
        `%${fmtDec(inf, 0)} enflasyon varsayımıyla reel karşılığı %${fmtDec(realReturnPct(x.annualPct, inf), 2)}.`,
      ].join('\n\n');
    },
  },
  // ── İleri matematik: çeşitlenme / konsantrasyon ────────────────────────────────────
  {
    id: 'cesitlenme',
    test: /çeşitlen|konsantrasyon|yoğunlaş|herfindahl|hhi|ne kadar dağı/i,
    reply: (s) => {
      const c = concentrationOf(s);
      if (!c) return 'Çeşitlenmeni ölçmek için portföyünde varlık olması gerek.';
      return [
        `Konsantrasyonunu Herfindahl-Hirschman endeksiyle ölçüyorum: HHI = ${fmtDec(c.hhi, 3)}.`,
        `Bu, her varlığın ağırlığının karesinin toplamıdır. Tersi "etkin varlık sayısı"nı verir: ` +
        `nominal olarak ${c.nominalN} varlığın var, ama ağırlıklar eşit olmadığı için çeşitlenmen ` +
        `etkin olarak ${fmtDec(c.effectiveN, 1)} varlığa denk.`,
        `En büyük pozisyon ${c.topName} (%${fmtDec(c.topWeightPct, 1)}). Seviye: ` +
        (c.level === 'yuksek' ? 'yoğun (HHI > 0,25).' : c.level === 'orta' ? 'orta (HHI 0,15–0,25).' : 'dağıtık (HHI < 0,15).'),
      ].join('\n\n');
    },
  },
  // ── Hedef dağılım sapması — %5/%25 bandı ──────────────────────────────────────────
  // 'dagilim' kuralından ÖNCE gelmeli: onun testi (/dağılım/) "hedef dağılımım nasıl"ı da
  // yakalar ve önce eşleşen kural kazanır.
  // Sınır: hedefi kullanıcı girer, ürün ÖNERMEZ — bkz. targetAllocation.ts başlığı.
  {
    id: 'hedef-dagilim',
    test: /hedef dağılım|hedef dagilim|hedefim|sapma|dengele|denge(m|si)? (nasıl|ne)|band(ın|ım|im)? dışında|rebalance|yeniden denge/i,
    reply: (s, _text, _taxRates, targets) => {
      if (!s.holdings.length) return 'Hedef sapmanı ölçmek için önce portföyüne varlık eklemen gerek.';
      const d = targets ? driftOf(s, targets) : undefined;
      if (!d) {
        return [
          'Henüz bir hedef dağılım girmemişsin, o yüzden ölçecek bir sapma yok.',
          'Panel sekmesindeki "Hedef Dağılım" kartından her varlık sınıfı için hedef ağırlığını (%) girebilirsin. ' +
          'Sonra sana kendi hedefinden ne kadar uzaklaştığını puan puan söylerim.',
          'Not: sana bir hedef ÖNERMİYORUM — hangi dağılımın doğru olduğu senin kararın, ben yalnızca ' +
          'senin koyduğun hedefe göre sapmayı hesaplarım.',
        ].join('\n\n');
      }

      const lines: string[] = [];
      if (d.breachedCount === 0) {
        lines.push('Bütün sınıflar kendi bandının içinde — hedef dağılımınla aran açılmamış.');
      } else {
        lines.push(`${d.breachedCount} sınıf bandının dışında:`);
        lines.push(
          d.rows.filter(r => r.breached).map(r => {
            const yon = r.driftPp > 0 ? 'üzerinde' : 'altında';
            const tutar = r.gapTL >= 0
              ? `hedefe eşitlemek ${fmtTL(Math.abs(r.gapTL))} eksik`
              : `hedefin ${fmtTL(Math.abs(r.gapTL))} üzerinde`;
            return `• ${ASSET_LABELS[r.type]}: hedef %${fmtDec(r.targetPct, 0)}, güncel %${fmtDec(r.actualPct, 1)} — ` +
              `${fmtDec(Math.abs(r.driftPp), 1)} puan ${yon} (bant ${fmtDec(r.bandPp, 1)} puan; ${tutar}).`;
          }).join('\n'),
        );
      }

      const icerde = d.rows.filter(r => !r.breached);
      if (icerde.length > 0 && d.breachedCount > 0) {
        lines.push(`Bandın içinde kalanlar: ${icerde.map(r => ASSET_LABELS[r.type]).join(', ')}.`);
      }

      lines.push(
        'Bandı %5/%25 kuralıyla belirliyorum: bir sınıf hedefinden 5 puandan fazla ya da hedefinin ' +
        '%25\'inden fazla saparsa denge bozulmuş sayılır — hangisi önce tetiklerse. Yani bant = ' +
        'min(5 puan, hedefin dörtte biri). Küçük hedeflerde 5 puan çok gevşek, büyük hedeflerde %25 çok ' +
        'gevşek kalırdı; ikisinin küçüğü her iki ucu da korur.',
      );

      if (Math.round(d.targetSumPct) !== 100) {
        lines.push(
          `Uyarı: girdiğin hedeflerin toplamı %${fmtDec(d.targetSumPct, 1)}, %100 değil. Hesabı yine de ` +
          'yaptım ama sayıları kendiliğinden düzeltmedim — hangi sınıfın payını değiştireceğine sen karar ver.',
        );
      }

      lines.push(
        'Bu bir ölçüm, yatırım tavsiyesi değil: hedefi sen koydun, ben yalnızca hedefinle güncel durumun ' +
        'arasındaki farkı hesaplıyorum.',
      );
      return lines.join('\n\n');
    },
  },
  // ── Risk metrikleri: GERÇEK tarihsel fiyattan hesaplanır, ama kapsam sınırlıdır ───
  // Hesap ağ isteği gerektirdiği için burada yapılmaz (agent.ts SAF kalır) — kullanıcı
  // Panel'deki Risk Analizi kartına yönlendirilir ve kapsamın ne olduğu baştan söylenir.
  {
    id: 'risk-metrik',
    test: /volatilite|standart sapma|sharpe|beta\b|oynaklık|drawdown|düşüş oranı|korelasyon|risk analizi/i,
    reply: (s) => {
      const canCover = s.holdings.filter(h => h.symbol && (h.type === 'kripto' || h.type === 'doviz'));
      const lines = [
        'Bunları hesaplıyorum — Panel sekmesindeki "Risk Analizi" kartını aç ve "Hesapla"ya bas.',
        'Volatilite, maksimum düşüş ve Sharpe oranı GEÇMİŞ FİYAT SERİSİ ister. Bu seriyi son 90 gün için ' +
        'gerçek kaynaklardan çekiyorum: kripto için CoinGecko, döviz için ECB (Frankfurter). ' +
        'Portföy volatilitesini varlıkların ağırlıklı endeksinden hesaplıyorum, yani korelasyon etkisi de içinde.',
      ];
      if (canCover.length === 0) {
        lines.push(
          '⚠ Ama şu an portföyünde fiyat geçmişi çekilebilen bir varlık YOK. Bu hesap yalnızca ' +
          'CANLI FİYATA BAĞLI kripto ve döviz varlıkları için mümkün; BIST hissesi, TEFAS fonu ve altın için ' +
          'anahtarsız tarihsel kaynak bulunmadığından onları kapsayamıyorum. Kripto Piyasası sekmesinden bir coin ' +
          'eklersen ya da bir dövizi canlı fiyata bağlarsan hesaplayabilirim.',
        );
      } else {
        lines.push(
          `Şu an ${canCover.length} varlığın kapsanabiliyor (${canCover.map(h => h.name).join(', ')}). ` +
          'Kapsam dışı kalanları rapor açıkça yazar — hesaba katılmayanı varmış gibi göstermem.',
        );
      }
      return lines.join('\n\n');
    },
  },
  // Yedekleme / geri yükleme. Bu yetenekler üründe ZATEN VAR (Panel ve İşlemler kartlarındaki
  // CSV düğmeleri) ama ajan bunları bilmiyordu; "portföyümü aklında tut, sonra geri döneyim"
  // gibi son derece doğal bir istek fallback'e düşüyordu. Ajanın kendi ürününü bilmesi şart.
  {
    id: 'yedek',
    test: /yedek|geri yükle|geri dön(mek|üş)|kaybetme|kaybolur|csv|dışa aktar|içe aktar|aklında tut|not al|kaydet/i,
    reply: () => [
      'İki ayrı yol var; hangisini istediğine göre değişir:',
      '',
      'TAM YEDEK (önerilen). Panel\'deki "Veri Yedeği" kartından "Yedek Al" — tek bir JSON dosyası iner ve',
      'BEŞ katmanı birden taşır: portföy, işlem geçmişi, sana öğrettiklerim, stopaj oranların ve hedef dağılımın.',
      'Aynı karttaki "Geri Yükle" ile o dosyayı okutursun; mevcut verinin ÜZERİNE YAZAR, o yüzden önce sorar.',
      '',
      'CSV (tablo olarak çalışmak istersen). Panel\'deki "CSV" düğmesi varlıklarını, İşlemler\'deki "CSV"',
      'işlem geçmişini indirir; "İçe Aktar" varlık CSV\'sini geri okur (üzerine yazmaz, ekler).',
      'Ama dikkat: CSV yalnızca varlıkları geri getirir — işlem geçmişi ve ayarlar geri gelmez. Taşımak için tam yedeği kullan.',
      '',
      'Not: verilerin yalnızca bu tarayıcıda tutulur. "SIFIRLA" dersen ya da tarayıcı verisi temizlenirse kalıcı olarak gider.',
    ].join('\n'),
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
      '• "reel getirim ne" — enflasyondan arındırılmış getiri (Fisher denklemi)',
      '• "vergiden sonra ne kalıyor" — brüt → stopaj → net → reel zincirinin tamamı',
      '• "dağılımımı çiz" ya da "yatırım grafiğimi göster" — sohbet içinde grafik çizerim',
      '• enflasyon, faiz, altın, risk, projeksiyon gibi genel konular',
      '• "nasıl yedek alırım" — portföyünü CSV\'ye aktarma ve geri yükleme adımları',
      '• "beni ne hatırlıyorsun" — zamanla hangi konularla ilgilendiğini öğrenirim (yalnızca tarayıcında saklanır)',
      '• "Ajanı Eğit" panelinden bana yeni soru-cevaplar öğretebilirsin — öğrettiğin bilgi her zaman diğer cevaplarımdan önce gelir',
      '• her cevabımı 👍/👎 ile oylayabilirsin — 👎 dersen doğrusunu öğretmen için soru-cevap formu otomatik açılır',
    ].join('\n'),
  },
  {
    id: 'analiz',
    test: /analiz|değerlendir|yorumla/i,
    reply: (s, _t, _tr, _tg, inflationPct) => analyzePortfolio(s, inflationPct).join('\n\n'),
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
      return 'Sınıf dağılımın:\n' + alloc.map(a => `• ${ASSET_LABELS[a.type]}: ${fmtTL(a.amount)} (%${fmtDec(a.pct, 0)})`).join('\n');
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
        ? `Ana riskin konsantrasyon: %${fmtDec(top.pct, 0)} ağırlıkla ${ASSET_LABELS[top.type]}. Tek sınıfa bağımlılığı azaltmak ilk adım olabilir.`
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
  // Kullanıcının belirlediği tercihler (BLOK 1 — genişletilmiş bellek).
  parts.push(
    `Seni şöyle tanıyorum: risk seviyen ${RISK_LABELS[memory.prefs.riskLevel]}, ` +
    `ajan modun ${MODE_LABELS[memory.prefs.agentMode]}, vade tercihin ${VADE_LABELS[memory.prefs.vade]}.`,
  );
  if (memory.prefs.interests.length) {
    parts.push(`İlgi alanların: ${memory.prefs.interests.join(', ')}.`);
  }
  if (topic) parts.push(`En çok "${INTENT_LABELS[topic] ?? topic}" konusunu soruyorsun.`);
  if (holding) parts.push(`En sık bahsettiğin varlık: ${holding}.`);
  if (memory.recentQuestions.length) {
    parts.push(`Son sorularından bazıları: ${memory.recentQuestions.slice(0, 3).map(q => `"${q}"`).join(', ')}.`);
  }
  parts.push('Tüm bunları "Ajan Ne Biliyor?" panelinde görüp düzenleyebilirsin. Bu bilgi yalnızca tarayıcında saklanır, hiçbir sunucuya gönderilmez — "SIFIRLA" ile bunu da silebilirsin.');
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
  // Kullanıcının düzenlediği stopaj oranları (taxRates.ts). Verilmezse DEFAULT_TAX_RATES.
  // agent.ts saf kalsın diye localStorage'a burada DEĞİL, App.tsx'te dokunuluyor.
  taxRates?: Record<AssetType, number>,
  // Kullanıcının girdiği hedef dağılım (targetAllocation.ts). Aynı gerekçeyle dışarıdan gelir.
  // App.tsx her turda TAZE okur — kart ile ajanın farklı sayı söylemesi en kötü sonuç olurdu.
  targets?: Record<AssetType, number>,
  // Güncel enflasyon oranı (inflation.ts: TCMB EVDS'den canlı / kullanıcının girdiği / varsayım).
  // TODO: bu imza sekiz parametreye ulaştı — bir sonraki eklemede tek bir bağlam nesnesine
  // (`{ taxRates, targets, inflationPct }`) çevrilmeli. Şimdi yapılmadı çünkü her kuralın
  // imzasına dokunmak, toplantı öncesi gereksiz bir kırılma riski taşıyor.
  inflationPct?: number,
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
    if (lastIntent === 'analiz') return { text: analyzePortfolio(s, inflationPct).join('\n\n'), intentId: 'analiz' };
    if (lastIntent === 'grafik-dagilim' || lastIntent === 'grafik-yatirim' || lastIntent === 'grafik-pnl') {
      const chart = lastIntent === 'grafik-dagilim' ? allocationChart(s)
        : lastIntent === 'grafik-yatirim' ? investmentHistoryChart(s)
        : pnlBarChart(s);
      if (chart) {
        const reading = readChart(s, lastIntent, inflationPct);
        return {
          text: reading ? `${chart.title} grafiğini biraz daha açayım.\n\n${reading}` : `${chart.title} grafiğini büyütüyorum:`,
          chart,
          intentId: lastIntent,
        };
      }
    }
    return { text: 'Hangi konuda devam edeyim? "analiz", "dağılım", "risk" ya da bir varlık adı yazabilirsin.', isFallback: true };
  }

  // Grafik isteği — sohbet içinde doğrudan görsel üretir.
  const chartReq = detectChartRequest(s, text);
  if (chartReq) {
    const reading = readChart(s, chartReq.intentId, inflationPct);
    return {
      text: reading ? `İşte "${chartReq.chart.title}" grafiğin.\n\n${reading}` : `İşte "${chartReq.chart.title}" grafiğin:`,
      chart: chartReq.chart,
      intentId: chartReq.intentId,
    };
  }

  // En iyi/en kötü performans kıyaslaması.
  const bw = bestWorstReply(s, text);
  if (bw) return { text: bw };

  // Genel niyet kuralları (analiz, dağılım, risk, enflasyon, küçük sohbet...).
  for (const rule of CHAT_RULES) {
    if (rule.test.test(text)) {
      return { text: rule.reply(s, text, taxRates, targets, inflationPct), intentId: rule.id };
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
