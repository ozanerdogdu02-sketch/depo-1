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
  parseInflationPct, afterTaxOf, allocation, driftOf, stressTest, counterfactualDeposit,
} from './analytics';

export interface ChartSpec {
  kind: 'pie' | 'area' | 'bar';
  title: string;
  data: Record<string, string | number>[];
  dataKey: string; // sayısal değer alanı
  nameKey: string; // kategori/x-ekseni etiketi
}

export interface AgentMessage {
  id?: string; // yalnızca AI mesajlarında dolu — yanıt gelince bu id'den bulunup güncellenir
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
  // Gerçek AI katmanı (aiAgent.ts) — yalnızca kullanıcı kendi Worker'ını bağladıysa VE yerel
  // kurallar soruyu tanımadıysa (fallback) devreye girer. aiPending: yanıt bekleniyor (yükleniyor
  // göstergesi). aiGenerated: bu metin YEREL KURALLARDAN değil bir dil modelinden geldi — kullanıcı
  // hangi cevabın "hesaplanmış" hangisinin "sohbet edilmiş" olduğunu ayırt edebilsin diye rozetlenir.
  aiPending?: boolean;
  aiGenerated?: boolean;
}

export interface AgentReply {
  text: string;
  chart?: ChartSpec;
  intentId?: string;
  trainedFactId?: string; // dolu ise bu yanıt öğretilmiş bir bilgiden geldi (kullanım sayacı için)
  isFallback?: boolean;
  pendingAction?: PendingAction;
  // Kullanıcı bekleyen işlem önerisini YAZIYLA iptal etti ("vazgeç", "iptal"). App.tsx bunu
  // görünce ilgili mesajı actionResolved:'cancelled' yapar. agent.ts saf kalır — burada
  // hiçbir veri değişmez, tıpkı Vazgeç düğmesinde olduğu gibi.
  cancelPending?: boolean;
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
  'stres-testi': 'şok senaryosu',
  'karsi-olgusal': 'mevduat karşılaştırması',
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
  // "Ajan Ne Biliyor?" panelinden kullanıcının belirttiği risk toleransı. Verilmezse ya da
  // hiç dokunulmamış varsayılan 'orta' ise ilgili içgörü çıkmaz (bkz. aşağıdaki 6. madde).
  memory?: AgentMemoryProfile,
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

  // 6) Beyan edilen risk toleransı ile portföyün gerçek şekli arasında uyumsuzluk. Yalnızca
  // kullanıcı "Ajan Ne Biliyor?" panelinden bunu bilerek DÜŞÜK ya da YÜKSEK seçtiyse tetiklenir —
  // varsayılan 'orta' hiç dokunulmamış da olabilir, ona dayanarak yorum yapmak yanıltıcı olur.
  // Betimleyici kip: UYUMSUZLUĞU söyler, ne yapılması gerektiğini önermez — risk toleransına göre
  // dağılım önermek (örn. "%X kriptoya çek") SPK'nın yalnızca lisanslı kurumlara bıraktığı bir
  // tavsiye olurdu (bkz. id:'tavsiye' kuralı, targetAllocation.ts "hedef önermez" ilkesiyle aynı sınır).
  if (memory && memory.prefs.riskLevel !== 'orta') {
    const riskliPct = alloc.filter(a => a.type === 'kripto' || a.type === 'hisse').reduce((sum, a) => sum + a.pct, 0);
    if (memory.prefs.riskLevel === 'dusuk' && riskliPct > 50) {
      out.push({
        level: 'uyari',
        text: `Risk toleransını "düşük" olarak belirtmiştin ("Ajan Ne Biliyor?" paneli) ama portföyünün ` +
          `%${fmtDec(riskliPct, 0)}'ı kripto ve hisse gibi tarihsel olarak oynak sınıflarda — beyan ettiğin ` +
          `tolerans ile portföyünün şekli arasında bir uyumsuzluk var.`,
      });
    } else if (memory.prefs.riskLevel === 'yuksek' && riskliPct < 20 && cashLikePct > 50) {
      out.push({
        level: 'bilgi',
        text: `Risk toleransını "yüksek" olarak belirtmiştin ama portföyünün %${fmtDec(cashLikePct, 0)}'ı ` +
          `mevduat/döviz gibi düşük oynaklıklı sınıflarda — beyan ettiğin tolerans ile portföyünün şekli ` +
          `arasında bir uyumsuzluk var.`,
      });
    }
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

// "Mevduatta tutsaydım" karşı-olgusalı için varsayılan yıllık faiz — RiskPanel.tsx'teki
// DEFAULT_RISK_FREE_PCT ile aynı gerekçe: Türkiye için anahtarsız/resmi bir kaynak yok,
// kullanıcı metinde bir oran belirtirse o kullanılır (parseInflationPct ile ayrıştırılır).
const DEFAULT_DEPOSIT_RATE_PCT = 45;

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
// Tutarı metinden çıkarır. "TL"/"₺" ile işaretlenmiş sayı VARSA o tercih edilir — kullanıcı
// birimi yazdıysa kastettiği odur. Yoksa kalan ilk sayıya düşülür.
function parseTradeAmount(text: string): number | undefined {
  const m = text.match(/(\d[\d.,]*)\s*(?:tl|₺)/i) ?? text.match(/(\d[\d.,]*)/);
  if (!m) return undefined;
  const n = Math.round(Number(m[1].replace(/\./g, '').replace(',', '.')));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function detectTradeCommand(s: PortfolioState, text: string): PendingAction | undefined {
  const isSell = /\b(sat|satış|satayım|satmak istiyorum)\b/i.test(text);
  const isBuy = /\b(al|alış|ekle|alayım|almak istiyorum)\b/i.test(text);
  if (isSell === isBuy) return undefined; // ikisi de yok ya da ikisi de var (belirsiz) — atla

  const lower = text.toLocaleLowerCase('tr-TR');
  const candidates = s.holdings.filter(h => lower.includes(h.name.toLocaleLowerCase('tr-TR')));
  if (candidates.length !== 1) return undefined; // hiç ya da birden fazla eşleşme — güvenli değil

  const holding = candidates[0];

  // KRİTİK: tutar, varlık adı metinden ÇIKARILDIKTAN sonra aranır. Önceden metindeki ilk sayı
  // alınıyordu ve "BIST 30 Fonu 1000 TL al" komutu ₺30 olarak ayrıştırılıyordu — adın içindeki
  // 30 tutar sanılıyordu. Adında rakam geçen her varlık (BIST 30 Fonu, BIST 100, S&P 500) bu
  // hatadan etkileniyordu. Kesme işlemi `lower` üzerinde yapılıyor: `lower` ve `lowerName` aynı
  // locale ile küçültüldüğü için indeksler tutarlı (Türkçe 'İ' küçülünce uzunluk değişebilir,
  // orijinal metin üzerinde indekslemek kayma yaratırdı). Rakamlar küçültmeden etkilenmez.
  const lowerName = holding.name.toLocaleLowerCase('tr-TR');
  const at = lower.indexOf(lowerName);
  const rest = lower.slice(0, at) + ' ' + lower.slice(at + lowerName.length);

  const amount = parseTradeAmount(rest);
  if (amount === undefined) return undefined;

  return { kind: isSell ? 'satis' : 'alis', holdingId: holding.id, holdingName: holding.name, amount };
}

// Bekleyen (henüz onaylanmamış/vazgeçilmemiş) bir işlem önerisi var mı? Yazıyla iptal yalnızca
// varsa devreye girer; yoksa cümle normal akışa düşer — kullanıcı gerçekten "vazgeçtim" diye
// sohbet ediyor olabilir.
function hasUnresolvedAction(history: AgentMessage[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].pendingAction) return !history[i].actionResolved;
  }
  return false;
}

// UI'da "Vazgeç" düğmesi var ama bekleyen bir öneri dururken en doğal refleks bunu YAZMAK.
// Not: Türkçe'de 'ı/ş/ç' JS'in \w sınıfında olmadığı için \b sınırlarına güvenilmez —
// burada bilinçli olarak kelime köküyle eşleşiliyor (bkz. CLAUDE.md §1.18).
const CANCEL_PHRASE = /^\s*(vazgeç|iptal|boş ?ver|hayır|olmaz|onaylamıyorum|istemiyorum|yapma)|işlem(i|den)? *(iptal|vazgeç)|(satış|alış)ı iptal/i;

// --- Şok senaryosu (stres testi) — belirli bir sınıf + yüzde ayrıştırma ----

const STRESS_ASSET_WORDS: Record<string, AssetType> = {
  kripto: 'kripto', hisse: 'hisse', borsa: 'hisse', fon: 'fon',
  altın: 'altin', altin: 'altin', döviz: 'doviz', dolar: 'doviz', euro: 'doviz',
  mevduat: 'mevduat', tahvil: 'tahvil', eurobond: 'tahvil', bes: 'bes', gayrimenkul: 'gayrimenkul',
};

// "kripto %50 düşerse", "borsa yüzde 30 çökerse ne olur" gibi cümlelerden sınıf + yüzde çıkarır.
// Eşleşmezse undefined — çağıran taraf o zaman GENEL (varsayılan) senaryoya düşer.
function detectStressTest(text: string): { type: AssetType; shockPct: number } | undefined {
  const q = text.toLocaleLowerCase('tr-TR');
  const m = q.match(
    /(kripto|hisse|borsa|fon|altın|altin|döviz|dolar|euro|mevduat|tahvil|eurobond|bes|gayrimenkul)[^%\d]{0,15}%?\s*(\d{1,3})\s*%?[^a-zğüşöçı]{0,3}(düşerse|çökerse|kaybederse|erirse|gerilerse|inerse)/,
  );
  if (!m) return undefined;
  const type = STRESS_ASSET_WORDS[m[1]];
  const pct = Number(m[2]);
  if (!type || !Number.isFinite(pct) || pct <= 0 || pct > 100) return undefined;
  return { type, shockPct: pct };
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
    // Girişli ve bulut senkronu açık mı (App.tsx cloud durumundan geçirir; agent.ts cloud.ts'i
    // import ETMEZ). Yalnızca gizlilik cümlelerini değiştirir; false/undefined iken metinler aynıdır.
    cloudSynced?: boolean,
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
  // ── Regülasyon sınırı: al/sat tavsiyesi ────────────────────────────────────────────
  // SPK'ya göre genel yatırım tavsiyesi yalnızca aracı kurum/banka/portföy yönetim şirketlerince
  // verilebilir. Bu soruya "anlayamadım" demek hem kaba hem yanıltıcı — ürünün sınırı bilinçli,
  // bir eksiklik değil. Cevap reddi AÇIKÇA söylüyor ve hemen yapabildiklerine yönlendiriyor.
  // Bu kural `analiz`/`dagilim` gibi genel kurallardan ÖNCE gelmeli, yoksa "portföyümü optimize
  // et" gibi cümleler onlara takılır.
  {
    id: 'tavsiye',
    test: /(hangi|ne|neyi)\s*\S*\s*(al(malı|ayım|sam|ır mıyım)|sat(malı|ayım|sam|ar mıyım))|yatırım tavsiye|tavsiye ver|tavsiyen ne|al ?sat tavsiye|ne önerirsin|bana öneri|optimize et|portföyümü optimize/i,
    reply: (s) => {
      const lines = [
        'Al/sat tavsiyesi veremem — bu, yalnızca SPK lisanslı aracı kurumların yapabileceği bir şey. Bilerek böyle tasarlandı.',
        'Ama sana şunları söyleyebilirim:',
        '• "analiz et" — portföyünün tamamını değerlendiririm',
        '• "riskimi analiz et" — volatilite, yoğunlaşma, çeşitlendirme faydası',
        '• "reel getirim ne" — enflasyon sonrası gerçek durumun',
        '• "vergiden sonra ne kalıyor" — stopaj sonrası net',
      ];
      if (s.holdings.length) {
        lines.push('Ayrıca hedef dağılımını Panel\'den girersen, kendi koyduğun hedeften ne kadar saptığını hesaplarım — bu bir tavsiye değil, aritmetik.');
      }
      return lines.join('\n');
    },
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

      // Yukarıdaki zincir yalnızca ELİNDE DURAN pozisyonların gerçekleşmemiş kazancını kapsar.
      // Geçmişte kapattığın (sattığın) pozisyonlardan gelen gerçekleşmiş K/Z ayrı tutulur —
      // hangi varlık sınıfından geldiği kayıtlı olmadığı için ona bir stopaj oranı uydurmuyoruz.
      if (r.realizedGain !== 0) {
        lines.push(
          `Ayrıca: geçmişte kapattığın pozisyonlardan bugüne dek toplam ${fmtSigned(r.realizedGain)} ` +
          `gerçekleşmiş kâr/zararın var (Panel'deki "Gerçekleşen K/Z" kartı). Bu, yukarıdaki zincire ` +
          `DAHİL DEĞİL — hangi varlık sınıfından geldiği ayrı tutulmadığından doğru stopaj oranını ` +
          `bilemiyorum, bir oran uydurmak yerine ayrı bir kalem olarak söylüyorum.`,
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
    test: /volatilite|standart sapma|sharpe|sortino|beta\b|oynaklık|drawdown|düşüş oranı|korelasyon|risk analizi/i,
    reply: (s) => {
      const canCover = s.holdings.filter(h => h.symbol && (h.type === 'kripto' || h.type === 'doviz'));
      const lines = [
        'Bunları hesaplıyorum — Panel sekmesindeki "Risk Analizi" kartını aç ve "Hesapla"ya bas.',
        'Volatilite, maksimum düşüş, Sharpe ve Sortino oranı GEÇMİŞ FİYAT SERİSİ ister. Bu seriyi son 90 gün için ' +
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
  // Şok senaryosu / stres testi. Yeni veri kaynağı GEREKMEZ — bir sınıfın güncel değerine
  // varsayımsal bir düşüş uygulayıp portföy toplamına etkisini gösteren basit aritmetik
  // (analytics.ts → stressTest). Korelasyon/diğer sınıfların tepkisi VARSAYILMAZ, bu açıkça
  // söylenir — gerçek bir çoklu-varlık simülasyonu değil.
  {
    id: 'stres-testi',
    test: /stres testi|şok senaryosu|(kripto|hisse|borsa|fon|altın|altin|döviz|dolar|euro|mevduat|tahvil|eurobond|bes|gayrimenkul)[^\n]{0,25}(düşerse|çökerse|kaybederse|erirse|gerilerse|inerse)/i,
    reply: (s, text) => {
      const specific = detectStressTest(text);
      if (specific) {
        const r = stressTest(s, specific.type, specific.shockPct);
        if (!r) return `Portföyünde ${ASSET_LABELS[specific.type]} sınıfında varlık yok — bu senaryoyu hesaplayamam.`;
        return [
          `${ASSET_LABELS[r.type]} %${fmtDec(r.shockPct, 0)} değer kaybederse:`,
          `• O sınıftaki ${fmtTL(r.affectedValue)}'nin ${fmtTL(r.lossAmount)}'si gider.`,
          `• Portföy toplamın ${fmtTL(totalValue(s))} → ${fmtTL(r.newTotal)}'e iner.`,
          'Bu basit bir "ne olurdu" hesabı — diğer sınıfların o anda nasıl tepki vereceğini (korelasyon) varsaymaz, yatırım tavsiyesi değildir.',
        ].join('\n');
      }
      // allocation() büyükten küçüğe SIRALI döner — alloc[0] GERÇEKTEN en büyük ağırlık.
      // Önceden "önce kripto, sonra hisse" arıyordu; bu, metnin kendi iddiasıyla ("en büyük
      // ağırlığın X") çelişen YANLIŞ bir sınıf söyleyebiliyordu (Codex denetiminde bulundu,
      // 2026-09-04: %90 mevduat + %10 kripto olan bir portföyde "en büyük ağırlığın kripto"
      // diyordu). Metin "en büyük" dediği için gerçekten en büyüğü kullanmalı.
      const alloc = allocation(s);
      const riskiest = alloc[0];
      if (!riskiest) return 'Stres testi için önce portföyüne varlık eklemen gerek.';
      const r20 = stressTest(s, riskiest.type, 20);
      const r40 = stressTest(s, riskiest.type, 40);
      if (!r20 || !r40) return 'Stres testi için önce portföyüne varlık eklemen gerek.';
      return [
        `En büyük ağırlığın ${ASSET_LABELS[riskiest.type]} (%${fmtDec(riskiest.pct, 0)}). İki basit şok senaryosu:`,
        `• %20 düşerse: ${fmtTL(totalValue(s))} → ${fmtTL(r20.newTotal)} (-${fmtTL(r20.lossAmount)}).`,
        `• %40 düşerse: ${fmtTL(totalValue(s))} → ${fmtTL(r40.newTotal)} (-${fmtTL(r40.lossAmount)}).`,
        'Belirli bir sınıf ve yüzde söylersen (ör. "kripto %60 düşerse ne olur") onu hesaplarım. Korelasyon/diğer sınıfların tepkisi dahil değildir — yatırım tavsiyesi değildir.',
      ].join('\n');
    },
  },
  // Karşı-olgusal: "mevduatta tutsaydım" — aynı alış/satış nakit akışları, yatırım yerine
  // sabit oranlı mevduatta büyüseydi bugün ne olurdu? Oran risksiz faiz/enflasyon varsayımlarıyla
  // AYNI mantık: anahtarsız kaynağı yok, kullanıcı girer, "varsayım" diye etiketlenir.
  {
    id: 'karsi-olgusal',
    test: /mevduatta (tutsayd|kalsayd|bıraksayd)|mevduata yatırsayd|hep mevduatta olsa|bankada tutsayd|mevduatla karşılaştır/i,
    reply: (s, text) => {
      const rate = parseInflationPct(text) ?? DEFAULT_DEPOSIT_RATE_PCT;
      const hypothetical = counterfactualDeposit(s, rate);
      if (hypothetical === undefined) return 'Bu karşılaştırmayı yapmak için önce bir işlem geçmişin olması gerek.';
      // "Gerçekte elindeki" yalnızca güncel varlıkların değeri DEĞİL — kapattığın pozisyonlardan
      // gelen gerçekleşmiş kâr/zarar VE temettü/faiz de gerçekten cebine giren para (realizedPnl).
      // Bunu dışarıda bırakmak "gerçekte elindeki"ni olduğundan düşük gösterirdi (Codex denetiminde
      // bulundu, 2026-09-04) — özellikle temettü almış bir kullanıcı için.
      const actual = totalValue(s) + s.realizedPnl;
      const diff = actual - hypothetical;
      return [
        `Aynı parayı yatırdığın tarihlerde, yatırım yerine %${fmtDec(rate, 0)} yıllık sabit mevduat faiziyle ` +
        `bıraksaydın bugün ${fmtTL(hypothetical)}'ye sahip olurdun.`,
        `Gerçekte bugün elindeki ${fmtTL(actual)} — aradaki fark ${fmtSigned(diff)} ` +
        `(${diff >= 0 ? 'yatırımların bu mevduat senaryosunu geçti' : 'bu mevduat senaryosu daha iyi çıkardı'}).`,
        `%${fmtDec(rate, 0)} oranı bir VARSAYIM — Türkiye için anahtarsız/resmi bir tarihsel mevduat faizi ` +
        `kaynağı yok, bu yüzden sabit tutuluyor. Farklı bir oranla denemek için "%50 mevduat faiziyle karşılaştır" gibi yaz.`,
      ].join('\n');
    },
  },
  // Yedekleme / geri yükleme. Bu yetenekler üründe ZATEN VAR (Panel ve İşlemler kartlarındaki
  // CSV düğmeleri) ama ajan bunları bilmiyordu; "portföyümü aklında tut, sonra geri döneyim"
  // gibi son derece doğal bir istek fallback'e düşüyordu. Ajanın kendi ürününü bilmesi şart.
  {
    id: 'yedek',
    test: /yedek|geri yükle|geri dön(mek|üş)|kaybetme|kaybolur|csv|dışa aktar|içe aktar|aklında tut|not al|kaydet/i,
    reply: (_s, _t, _tr, _tg, _inf, cloudSynced) => [
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
      cloudSynced
        ? 'Not: hesabınla giriş yaptığın için bu katmanlar bu tarayıcıda tutulur ve Fagent hesabına da eşitlenir. "SIFIRLA" yalnızca bu tarayıcıdaki kopyayı siler; hesabındaki kopya için Hesabım → Hesabımı sil.'
        : 'Not: verilerin yalnızca bu tarayıcıda tutulur. "SIFIRLA" dersen ya da tarayıcı verisi temizlenirse kalıcı olarak gider.',
    ].join('\n'),
  },
  {
    test: /yardım|ne yapabilirsin|neler yapabilirsin|komutlar|nasıl kullan/i,
    reply: (_s, _t, _tr, _tg, _inf, cloudSynced) => [
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
      '• "kripto %50 düşerse ne olur" / "stres testi" — basit şok senaryosu',
      '• "mevduatta tutsaydım ne olurdu" — aynı parayı sabit faizli mevduatta bıraksaydın bugün ne olurdu',
      '• "nasıl yedek alırım" — portföyünü CSV\'ye aktarma ve geri yükleme adımları',
      cloudSynced
        ? '• "beni ne hatırlıyorsun" — zamanla hangi konularla ilgilendiğini öğrenirim (bu tarayıcıda saklanır ve Fagent hesabına eşitlenir)'
        : '• "beni ne hatırlıyorsun" — zamanla hangi konularla ilgilendiğini öğrenirim (yalnızca tarayıcında saklanır)',
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
    // Betimleyici kipte — belirli bir oran ÖNERMEZ (bkz. §1.13 fiil kipi düzeltmesi, targetAllocation.ts
    // "ürün hedef önermez" ilkesiyle aynı sınır). Ne kadar altın tutulacağı SPK lisanslı kurumların işi.
    reply: () => 'Altın tarihsel olarak kriz ve enflasyon dönemlerinde değer koruma eğilimi gösterir; kısa vadede fiyatı dalgalı olabilir. Portföyde ne kadar yer tutması gerektiği kişisel risk toleransına bağlıdır — bu bir oran önermez, yalnızca altının bu davranışını anlatır.',
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
        // Betimleyici kipte — analyzePortfolio'daki konsantrasyon uyarısıyla (§1.13) aynı örüntü:
        // SONUCU anlatır, EYLEMİ önermez.
        ? `Ana riskin konsantrasyon: %${fmtDec(top.pct, 0)} ağırlıkla ${ASSET_LABELS[top.type]}. Bu sınıf değer kaybederse toplam portföyün orantısız etkilenir — tek bir şoka bağımlılığın yüksek.`
        : 'Portföyün sınıflara dağılmış durumda; ana riskler piyasa geneli (sistematik) risk ve enflasyon. Vade ufkunu netleştirmek risk toleransını belirlemenin en sağlam yolu.';
    },
  },
];

// Kullanıcı ajanın kendisi hakkında ne öğrendiğini sorarsa (şeffaflık — KVKK'ya uyumlu:
// bu bilgi varsayılan olarak yalnızca tarayıcıda tutulur; hesap açıksa hesaba eşitlendiği açıkça belirtilir).
function memoryQueryReply(memory: AgentMemoryProfile | undefined, text: string, cloudSynced?: boolean): string | undefined {
  if (!/beni (ne )?hat[ıi]rl|hakkımda ne biliyorsun|profilim(i)?( ne)?|hafızan(da)?/i.test(text)) return undefined;
  if (!memory || memory.totalTurns === 0) {
    return cloudSynced
      ? 'Henüz hakkında bir şey öğrenmedim — birkaç soru sorunca hangi konularla ilgilendiğini fark etmeye başlarım. Bu bilgi bu tarayıcıda saklanır ve Fagent hesabına (yalnızca sana açık, RLS korumalı kayıt) eşitlenir.'
      : 'Henüz hakkında bir şey öğrenmedim — birkaç soru sorunca hangi konularla ilgilendiğini fark etmeye başlarım. Bu bilgi yalnızca tarayıcında saklanır, hiçbir yere gönderilmez.';
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
  parts.push(cloudSynced
    ? 'Tüm bunları "Ajan Ne Biliyor?" panelinde görüp düzenleyebilirsin. Bu bilgi bu tarayıcıda saklanır ve Fagent hesabına (yalnızca sana açık, RLS korumalı kayıt) eşitlenir — "SIFIRLA" bu tarayıcıdaki kopyayı siler; hesabındaki kopya için Hesabım → Hesabımı sil.'
    : 'Tüm bunları "Ajan Ne Biliyor?" panelinde görüp düzenleyebilirsin. Bu bilgi yalnızca tarayıcında saklanır, hiçbir sunucuya gönderilmez — "SIFIRLA" ile bunu da silebilirsin.');
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
  // Girişli ve bulut senkronu açık mı (cloud.ts → isCloudSynced; App.tsx geçirir). agent.ts saf
  // kalsın diye cloud.ts burada import EDİLMEZ. Yalnızca gizlilik cümlelerini değiştirir
  // (yedek/yardım/"beni ne hatırlıyorsun"); false/undefined iken tüm metinler bugünküyle aynıdır.
  cloudSynced?: boolean,
): AgentReply {
  const text = userText.trim();
  if (!text) return { text: 'Bir şey yazmadın — bir soru sorabilir ya da "yardım" yazabilirsin.' };

  // GÜVENLİK SIRASI — bu ikisi öğretilmiş bilgiden bile ÖNCE gelir ve hiçbir koşulda
  // ezilemez: (1) SPK al/sat tavsiyesi reddi, (2) bekleyen işlem iptali. "Eğitim" özelliği
  // kullanıcının BİLEREK öğrettiği davranışı değiştirsin diye built-in kuralların önüne
  // geçebiliyor (agentTraining.ts'teki bilinçli tasarım) — ama bulanık (Jaccard) bir eşleşme
  // regülasyon reddini ya da bir işlem iptalini gölgelememeli. Anayasa: bir denetim/güvenlik
  // engeli ajan çıktısıyla geçersiz kılınamaz.
  const tavsiyeRule = CHAT_RULES.find(r => r.id === 'tavsiye');
  if (tavsiyeRule?.test.test(text)) {
    return { text: tavsiyeRule.reply(s, text, taxRates, targets, inflationPct, cloudSynced), intentId: 'tavsiye' };
  }
  // Yazıyla iptal — yalnızca gerçekten bekleyen bir öneri varsa. Alım/satım ayrıştırmasından
  // ÖNCE gelmeli: "satışı iptal et" cümlesi içinde "satış" geçtiği için aksi halde yanlışlıkla
  // yeni bir satış komutu gibi değerlendirilebilirdi.
  if (hasUnresolvedAction(history) && CANCEL_PHRASE.test(text)) {
    return { text: 'Tamam, bekleyen işlemi iptal ettim. Hiçbir veri değişmedi.', cancelPending: true };
  }

  // Kullanıcının doğrudan öğrettiği bilgiler — yukarıdaki iki güvenlik kontrolünden SONRA,
  // ama diğer built-in kurallardan ÖNCE kontrol edilir; kullanıcı bunu bilerek/isteyerek
  // öğretti, ajanın davranışını gerçekten değiştirebilmesi bunun anlamlı olmasının şartı.
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
  const memoryReply = memoryQueryReply(memory, text, cloudSynced);
  if (memoryReply) return { text: memoryReply };

  // Takip cümlesi ("devam et", "biraz daha anlat"...) — son konuşulan konuyu genişlet.
  if (FOLLOWUP_TEST.test(text)) {
    const lastIntent = lastIntentFrom(history);
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
    // Diğer TÜM built-in kural konularında da devam edilebilsin (önceden yalnızca 'analiz' ve
    // üç grafik türü destekleniyordu; vergi/XIRR/hedef/risk gibi konulardan sonra "devam et"
    // fallback'e düşüyordu). 'tavsiye' BİLEREK DIŞLANMAZ — daha önce dışlanıyordu ("bir reddin
    // devamı olmaz") ama bu, tavsiye reddinden hemen sonra "devam et" yazan kullanıcıyı fallback'e
    // düşürüyordu; App.tsx fallback'i AI'a yönlendiriyor, yani SPK reddi bir "devam et" ile AI'a
    // atlanabiliyordu (Codex denetiminde bulundu, 2026-09-04). Güvenlik: bir denetim engeli hiçbir
    // yoldan (agent çıktısı dahil) geçersiz kılınamaz — reddi TEKRARLAMAK, sessizce atlamaktan iyidir.
    if (lastIntent) {
      const rule = CHAT_RULES.find(r => r.id === lastIntent);
      if (rule) return { text: rule.reply(s, text, taxRates, targets, inflationPct, cloudSynced), intentId: lastIntent };
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
      return { text: rule.reply(s, text, taxRates, targets, inflationPct, cloudSynced), intentId: rule.id };
    }
  }

  // Varlık adıyla arama (ör. kullanıcı doğrudan "THYAO" ya da "THYAO nasıl gidiyor" yazdıysa).
  const lookup = holdingLookupReply(s, text);
  if (lookup) return { text: lookup };

  return { text: fallbackText(s), isFallback: true };
}

// Anlaşılmayan soruda "anlayamadım" deyip susmak, ajanı olduğundan yeteneksiz gösteriyordu.
// Onun yerine somut ve TIKLANABİLİR olmayan ama YAZILABİLİR örnekler veriliyor; örneklerden
// biri kullanıcının kendi portföyünden geliyor, böylece cevap jenerik durmuyor.
function fallbackText(s: PortfolioState): string {
  const example = s.holdings[0]?.name;
  const lines = [
    'Bunu tam olarak anlayamadım — ama şunları sorabilirsin:',
    '• "analiz et" — portföyünün tamamını değerlendiririm',
    '• "reel getirim ne" — enflasyon sonrası gerçek durumun',
    '• "vergiden sonra ne kalıyor" — stopaj sonrası net getirin',
    '• "riskimi analiz et" — volatilite ve yoğunlaşma',
    '• "kâr zarar grafiği çiz" — sohbetin içine grafik çizerim',
    example
      ? `• "${example} nasıl gidiyor" — tek bir varlığın durumu`
      : '• bir varlık adı yazarsan o varlığın durumunu veririm',
    '',
    '"yardım" yazarsan tüm yeteneklerimi listelerim.',
  ];
  return lines.join('\n');
}
