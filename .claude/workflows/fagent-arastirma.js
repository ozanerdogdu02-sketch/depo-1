export const meta = {
  name: 'fagent-arastirma',
  description: 'FAGENT ekibinin yaptığı işi dünyadaki en iyi örneklerle karşılaştırır: yönetmen istem yazar, roller araştırır, yönetmen öncelikli iyileştirme listesi çıkarır',
  whenToUse: 'Bir ekip koşusu bittikten sonra, yapılan işi en iyi örneklerle kıyaslamak için. Kod değiştirmez. args: { konu: "…", roller?: ["fagent-tasarim", …] }',
  phases: [
    { title: 'Brifing', detail: 'yönetmen yapılan işi okur, her rol için araştırma istemi yazar' },
    { title: 'Araştırma', detail: 'roller kendi alanında en iyi örnekleri derinlemesine inceler' },
    { title: 'Sentez', detail: 'yönetmen birleştirir, çelişkileri çözer, kurala aykırıyı eler, önceliklendirir' },
  ],
}

const girdi = typeof args === 'string' ? { konu: args } : (args || {})
const KONU = (girdi.konu || '').trim()
if (!KONU) throw new Error('args.konu boş — hangi işin araştırılacağını yaz.')
const ROLLER = girdi.roller || ['fagent-tasarim', 'fagent-veri-akisi', 'fagent-guvenlik', 'fagent-uyum', 'fagent-test']

// Bütçe koruması: fagent-ekip ile aynı ilke — aşama sınırında güvenli durdurma.
const BUTCE_ESIGI = girdi.butceEsigi || 120000
function butceAz() {
  return !!(budget && budget.total && budget.remaining() < BUTCE_ESIGI)
}

// Araştırma modelleri: yönetmen muhakeme yapar (Opus); roller okur ve kıyaslar (Sonnet);
// güvenlik araştırması yine Opus'ta (kullanıcı kararı: güvenlik en üst seviyede).
const MODEL = {
  'yonetmen': { model: 'opus', effort: 'medium' },
  'fagent-guvenlik': { model: 'opus', effort: 'high' },
  'varsayilan': { model: 'sonnet', effort: 'medium' },
}
const ayar = rol => MODEL[rol] || MODEL.varsayilan
const kisa = rol => rol.replace('fagent-', '')

const ORTAK = [
  'Repo kökü FAGENT ürün dalıdır (Vite + React + TS). Kurallar: AGENTS.md §0.',
  'Bu bir ARAŞTIRMA görevidir: hiçbir dosyayı değiştirme, commit atma, dal değiştirme.',
  'Web araması için WebSearch ve WebFetch araçlarını kullan (gerekirse ToolSearch ile yükle). Kaynağı olmayan iddia yazma.',
].join('\n- ')

const BRIFING = {
  type: 'object',
  properties: {
    ozet: { type: 'string' },
    duzen: { type: 'array', items: { type: 'string' } },
    gorevler: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rol: { type: 'string', enum: ROLLER },
          odak: { type: 'string' },
          istem: { type: 'string' },
          referanslar: { type: 'array', items: { type: 'string' } },
        },
        required: ['rol', 'odak', 'istem', 'referanslar'],
      },
    },
  },
  required: ['ozet', 'duzen', 'gorevler'],
}

const ARASTIRMA = {
  type: 'object',
  properties: {
    ozet: { type: 'string' },
    karsilastirmalar: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          referans: { type: 'string' },
          kaynak: { type: 'string' },
          neYapiyorlar: { type: 'string' },
          bizde: { type: 'string' },
          oneri: { type: 'string' },
          oncelik: { type: 'string', enum: ['yuksek', 'orta', 'dusuk'] },
          efor: { type: 'string', enum: ['kucuk', 'orta', 'buyuk'] },
          kuralRiski: { type: 'string' },
        },
        required: ['referans', 'kaynak', 'neYapiyorlar', 'bizde', 'oneri', 'oncelik', 'efor'],
      },
    },
    bulunamayanlar: { type: 'array', items: { type: 'string' } },
  },
  required: ['ozet', 'karsilastirmalar'],
}

const SENTEZ = {
  type: 'object',
  properties: {
    ozet: { type: 'string' },
    oncelikli: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sira: { type: 'integer' },
          baslik: { type: 'string' },
          neden: { type: 'string' },
          referans: { type: 'string' },
          kaynak: { type: 'string' },
          getiren: { type: 'string' },
          planAdimi: { type: 'string' },
          oncelik: { type: 'string', enum: ['yuksek', 'orta', 'dusuk'] },
          efor: { type: 'string', enum: ['kucuk', 'orta', 'buyuk'] },
        },
        required: ['sira', 'baslik', 'neden', 'referans', 'getiren', 'planAdimi', 'oncelik', 'efor'],
      },
    },
    reddedilenler: {
      type: 'array',
      items: { type: 'object', properties: { oneri: { type: 'string' }, neden: { type: 'string' } }, required: ['oneri', 'neden'] },
    },
    sonrakiIstemler: { type: 'array', items: { type: 'string' } },
  },
  required: ['ozet', 'oncelikli', 'reddedilenler'],
}

// ── 1. Brifing: yönetmen istemleri yazar
phase('Brifing')
if (butceAz()) return { durduruldu: 'Bütçe eşiğin altında — araştırma başlatılmadı.' }
const brifing = await agent(
  [
    'Sen FAGENT ekibinin yönetmenisin. Önce `.claude/agents/fagent-yonetmen.md` dosyasını Read ile oku ve ona uy.',
    `Ortak kurallar:\n- ${ORTAK}`,
    `Araştırılacak iş: ${KONU}`,
    `Şu roller için birer araştırma görevi yaz: ${ROLLER.join(', ')}. Her rolün kendi tanımı .claude/agents/<rol>.md dosyasında.`,
    'Önce ekibin yaptığı işi gerçekten oku (git log, git diff --stat, ilgili dosyalar). Sonra her rol için o işe özel, adlandırılmış dünya çapında referanslarla dolu bir `istem` yaz — rol bu istemi aynen alacak.',
    '`duzen` alanına bu araştırmada tüm rollerin uyacağı düzen kurallarını yaz.',
  ].join('\n\n'),
  { ...ayar('yonetmen'), label: 'yonetmen:brifing', phase: 'Brifing', schema: BRIFING },
)
if (!brifing) throw new Error('Yönetmen brifing üretemedi.')
log(`Yönetmen ${brifing.gorevler.length} araştırma görevi yazdı.`)

// ── 2. Araştırma: roller paralel çalışır (kimse dosya değiştirmez, çakışma yok)
phase('Araştırma')
if (butceAz()) return { durduruldu: 'Bütçe eşiğin altında — brifingden sonra durduruldu.', brifing }
const sonuclar = await parallel(brifing.gorevler.map(g => async () => {
  const r = await agent(
    [
      `Sen FAGENT ekibinin \`${g.rol}\` rolüsün. Önce \`.claude/agents/${g.rol}.md\` dosyasını Read ile oku.`,
      `Ortak kurallar:\n- ${ORTAK}`,
      `Yönetmenin düzen kuralları:\n- ${brifing.duzen.join('\n- ')}`,
      `Yönetmenin sana yazdığı araştırma istemi:\n${g.istem}`,
      `Önerilen referanslar: ${g.referanslar.join(' · ')}`,
      'Her karşılaştırmada: referans ne yapıyor (kaynakla), bizde ne var (dosya ile), ne önerirsin, öncelik ve efor. Kurallarla çelişme riski varsa `kuralRiski`ne yaz. Bulamadığın ya da doğrulayamadığın şeyi `bulunamayanlar`a yaz.',
    ].join('\n\n'),
    { ...ayar(g.rol), label: `${kisa(g.rol)}:arastirma`, phase: 'Araştırma', schema: ARASTIRMA },
  )
  return r ? { rol: g.rol, ...r } : { rol: g.rol, ozet: 'Araştırma sonuç döndürmedi.', karsilastirmalar: [], bulunamayanlar: ['Ajan sonuç döndürmedi'] }
}))
const arastirmalar = sonuclar.filter(Boolean)

// ── 3. Sentez: yönetmen birleştirir ve önceliklendirir
phase('Sentez')
if (butceAz()) return { durduruldu: 'Bütçe eşiğin altında — sentez yapılmadı.', brifing, arastirmalar }
const sentez = await agent(
  [
    'Sen FAGENT ekibinin yönetmenisin. `.claude/agents/fagent-yonetmen.md` → "Sentezlerken" bölümüne uy.',
    `Araştırılan iş: ${KONU}`,
    'Rollerin araştırma sonuçları:\n' + JSON.stringify(arastirmalar, null, 1),
    'Birleştir, çelişkileri çöz, AGENTS.md §0 kurallarına aykırı ya da kaynaksız önerileri `reddedilenler`e gerekçesiyle yaz. Kalanları satışa hazırlığa katkısına göre sırala ve her birini 8 adımlık plandan birine bağla (CLAUDE.md → Geliştirme planı).',
    '`sonrakiIstemler`e, öncelikli ilk işler için ekibe verilecek hazır görev metinlerini yaz.',
  ].join('\n\n'),
  { ...ayar('yonetmen'), label: 'yonetmen:sentez', phase: 'Sentez', schema: SENTEZ },
)

return { konu: KONU, brifing, arastirmalar, sentez }
