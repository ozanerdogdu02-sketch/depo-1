export const meta = {
  name: 'fagent-ekip',
  description: 'FAGENT çok ajanlı geliştirme ekibi: plan → danışma → uygulama → test → çapraz inceleme → düzeltme → karar',
  whenToUse: 'FAGENT reposunda bir geliştirme görevini ürün lideri, tasarım, veri akışı, güvenlik, uyum ve test rollerine dağıtıp birbirlerinin işini denetleterek yürütmek için. args: { gorev: "…", maksKalem?: 4, maksDuzeltmeTuru?: 2 } ya da doğrudan görev metni.',
  phases: [
    { title: 'Plan', detail: 'ürün lideri görevi iş kalemlerine böler' },
    { title: 'Danışma', detail: 'güvenlik ve uyum plana kısıt koyar, lider planı revize eder' },
    { title: 'Uygulama', detail: 'her kalemin sahibi sırayla uygular ve teslim notu bırakır' },
    { title: 'Test', detail: 'typecheck + build + e2e kapısı' },
    { title: 'İnceleme', detail: 'güvenlik, uyum ve ilgili alan sahipleri çapraz inceler' },
    { title: 'Düzeltme', detail: 'engelleyici bulgular sahibine döner, yeniden test edilir' },
    { title: 'Karar', detail: 'ürün lideri birleştirilebilirlik kararı verir' },
  ],
}

// ───────────────────────────── Girdi ─────────────────────────────
const girdi = typeof args === 'string' ? { gorev: args } : (args || {})
const GOREV = (girdi.gorev || '').trim()
if (!GOREV) throw new Error('args.gorev boş — ekibe bir görev ver.')
const MAKS_KALEM = girdi.maksKalem || 4
const MAKS_TUR = girdi.maksDuzeltmeTuru === undefined ? 2 : girdi.maksDuzeltmeTuru
// DEVAM KİPİ: durdurulmuş bir koşuyu kaldığı yerden sürdürür. Plan ve danışma YENİDEN yapılmaz —
// güvenlik/uyum kısıtları önceki koşuda revize planın kalem açıklamalarına işlenmiştir.
//   devam: { plan: <revize PLAN>, tamamlanan: ['K1'], yarim: ['K2'], onceTeslimler: [<TESLIM + kalem, sahip>] }
// Tamamlanan kalemler atlanır; yarım kalan kalemin sahibi çalışma ağacındaki mevcut değişiklikleri
// okuyup tamamlar. Test, iki mercekli güvenlik incelemesi ve karar her zaman baştan yapılır.
const DEVAM = girdi.devam || null
if (DEVAM && (!DEVAM.plan || !Array.isArray(DEVAM.plan.kalemler))) throw new Error('args.devam.plan geçersiz — revize plan nesnesi gerekli.')

// ───────────────────────────── Bütçe koruması (güvenli durdurma) ─────────────────────────────
// Kullanım limiti tükenmeye yaklaşınca akış bir ajanı YARIDA KESMEZ — yarıda kesilen uygulayıcı
// yarım dosya bırakır. Bunun yerine bir sonraki AŞAMA SINIRINDA durur: yeni iş başlatmaz, o ana
// kadarki panoyu ve nerede kaldığını döndürür ve kararı kodla "birleştirilemez"e kilitler.
// Yalnızca bir token hedefi verildiğinde çalışır (ör. mesaja "+800k" yazılarak); hedef yoksa
// akış limiti bilemez. Eşik: bir aşamanın en pahalı hâli (Opus/max güvenlik incelemesi) sığsın.
const BUTCE_ESIGI = girdi.butceEsigi || 150000
let durdurmaNedeni = null
function butceAz(asama) {
  if (durdurmaNedeni) return true
  if (!budget || !budget.total) return false
  const kalan = budget.remaining()
  if (kalan >= BUTCE_ESIGI) return false
  durdurmaNedeni = `Bütçe eşiğin altına düştü (${Math.round(kalan / 1000)}k < ${Math.round(BUTCE_ESIGI / 1000)}k) — "${asama}" aşaması başlatılmadan güvenli biçimde durduruldu.`
  log(durdurmaNedeni)
  return true
}

// ───────────────────────────── Model ve çaba iş bölümü ─────────────────────────────
// İlke: hatası pahalı olan adıma güçlü model, mekanik adıma ucuz model. Güvenlik her adımda
// en güçlü model ve en yüksek çabada çalışır (kullanıcı kararı) — kaçan bir açık, harcanan
// tokendan her zaman pahalıdır. Tasarruf güvenlikten değil, mekanik adımlardan yapılır. Uygulama
// Sonnet'te; arkasında Opus güvenlik incelemesi olduğu için yeterli. Yalnızca komut çalıştırıp
// sonuç okuyan adımlar Haiku'da. `args.modeller` ile adım adım ezilebilir:
//   { modeller: { 'veri-akisi:uygulama': { model: 'opus', effort: 'high' } } }
const VARSAYILAN_MODELLER = {
  'lider:plan': { model: 'opus', effort: 'medium' },
  'lider:revizyon': { model: 'sonnet', effort: 'low' },
  'lider:karar': { model: 'opus', effort: 'medium' },
  'guvenlik:danisma': { model: 'opus', effort: 'high' },
  'uyum:danisma': { model: 'sonnet', effort: 'low' },
  'guvenlik-erisim:inceleme': { model: 'opus', effort: 'max' },
  'guvenlik-istemci:inceleme': { model: 'opus', effort: 'max' },
  'uyum:inceleme': { model: 'sonnet', effort: 'low' },
  'tasarim:inceleme': { model: 'sonnet', effort: 'low' },
  'veri-akisi:inceleme': { model: 'sonnet', effort: 'medium' },
  'tasarim:uygulama': { model: 'sonnet', effort: 'medium' },
  'veri-akisi:uygulama': { model: 'sonnet', effort: 'high' },
  'test:uygulama': { model: 'sonnet', effort: 'low' },
  'test:yaz-ve-kos': { model: 'sonnet', effort: 'low' },
  'test:yeniden-kos': { model: 'haiku', effort: 'low' },
}
const MODELLER = Object.assign({}, VARSAYILAN_MODELLER, girdi.modeller || {})
const kisa = rol => rol.replace('fagent-', '')
function ayar(adim) {
  const m = MODELLER[adim]
  if (!m) return {}
  const o = {}
  if (m.model) o.model = m.model
  if (m.effort) o.effort = m.effort
  return o
}
log('Model iş bölümü: ' + Object.entries(MODELLER).map(([k, v]) => `${k}=${v.model}/${v.effort}`).join(', '))

// ───────────────────────────── Pano (ajanların ortak konuşma alanı) ─────────────────────────────
// Her ajan bir sonraki ajana doğrudan değil, bu pano üzerinden konuşur. Her istem panonun
// son mesajlarını taşır; böylece tasarım, güvenliğin koyduğu kısıtı; test, veri akışının
// devir notunu görür. Pano iş akışının dönüş değerinde de yer alır (insan için kayıt).
const pano = []
function yaz(kimden, kime, tur, icerik) {
  pano.push({ sira: pano.length + 1, kimden, kime, tur, icerik })
}
const kalemSahibi = {}
function ilgili(rol, m) {
  if (rol === 'fagent-urun-lideri') return true
  return m.kimden === rol || m.kime === rol || m.kime === 'ekip' || m.kime === 'insan' || kalemSahibi[m.kime] === rol
}
function panoMetni(rol, son) {
  const suzulmus = pano.filter(m => ilgili(rol, m))
  const parca = suzulmus.slice(-(son || 25))
  if (!parca.length) return '(pano boş)'
  return parca
    .map(m => `#${m.sira} [${m.tur}] ${m.kimden} → ${m.kime}: ${typeof m.icerik === 'string' ? m.icerik : JSON.stringify(m.icerik)}`)
    .join('\n')
}

const ORTAK = [
  'Repo kökü FAGENT ürün dalıdır (Vite + React + TS, kod `src/`, testler `tests/e2e/`).',
  'Değişmez kurallar `AGENTS.md` §0 — özellikle: istemcide API anahtarı yok, kişiye özel al/sat önerisi yok, gerçek işlem yürütme yok, sahte veri yok.',
  'Commit atma, push etme, dal değiştirme, `git stash`/`git reset` yapma. Değişiklikler çalışma ağacında kalır; birleştirme kararı insanındır.',
  'Bu ortamın ağı dış API\'leri engeller; dış uçları doğrulayamadıysan bunu açıkça yaz, tahmin etme.',
].join('\n- ')

function rolIstemi(rol, gorevMetni, panoSon) {
  return [
    `Sen FAGENT geliştirme ekibinin \`${rol}\` rolüsün. İşe başlamadan önce \`.claude/agents/${rol}.md\` dosyasını Read ile oku ve oradaki rol kurallarına uy.`,
    `Ortak kurallar:\n- ${ORTAK}`,
    `Ekibin ana görevi:\n${GOREV}`,
    `Ekip panosu (sana, ekibe ya da senin kalemlerine yazılmış mesajlar — dikkate al, çelişiyorsan gerekçesiyle belirt):\n${panoMetni(rol, panoSon)}`,
    `Senin bu adımdaki işin:\n${gorevMetni}`,
  ].join('\n\n')
}

// Güvenli durdurma sonucu. Henüz oluşmamış aşama verileri `durum` nesnesinden okunur
// (her aşama bitince buraya yazılır), böylece hangi aşamada durulursa durulsun tutarlıdır.
const durum = { plan: null, teslimler: [], test: null, bulgular: [], eksikIncelemeler: [], tur: 0 }
function guvenliDur() {
  yaz('sistem', 'insan', 'karar', 'BİRLEŞTİRİLEMEZ — ' + durdurmaNedeni + ' Çalışma ağacındaki değişiklikler İNCELENMEMİŞ olabilir; commit etmeden önce ayrı bir dala kaydet ve incelemeyi tamamla.')
  return {
    gorev: GOREV,
    durduruldu: durdurmaNedeni,
    karar: {
      birlestirilebilir: false,
      ozet: durdurmaNedeni,
      kilitler: ['bütçe koruması: akış tamamlanmadı'],
      yapilanlar: durum.teslimler.map(t => `${t.kalem} [${t.durum}]: ${t.ozet}`),
      insanKarari: [
        'Çalışma ağacını incelenmemiş say: ayrı bir wip/ dalına kaydet, ürün dalına commit etme.',
        'Daha yüksek bir token hedefiyle aynı görevi yeniden başlat ya da resumeFromRunId ile kaldığı yerden sürdür.',
      ],
    },
    plan: durum.plan,
    teslimler: durum.teslimler,
    test: durum.test,
    bulgular: durum.bulgular,
    eksikIncelemeler: durum.eksikIncelemeler,
    duzeltmeTuru: durum.tur,
    pano,
  }
}

// ───────────────────────────── Şemalar ─────────────────────────────
const UYGULAYICILAR = ['fagent-tasarim', 'fagent-veri-akisi', 'fagent-test']
const CIDDIYET = ['kritik', 'yuksek', 'orta', 'dusuk']

const PLAN = {
  type: 'object',
  properties: {
    ozet: { type: 'string' },
    kalemler: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          baslik: { type: 'string' },
          sahip: { type: 'string', enum: UYGULAYICILAR },
          aciklama: { type: 'string' },
          kabulOlcutleri: { type: 'array', items: { type: 'string' } },
          dosyalar: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'baslik', 'sahip', 'aciklama', 'kabulOlcutleri'],
      },
    },
    ertelenenler: { type: 'array', items: { type: 'string' } },
    riskler: { type: 'array', items: { type: 'string' } },
  },
  required: ['ozet', 'kalemler'],
}

const DANISMA = {
  type: 'object',
  properties: {
    planOnayli: { type: 'boolean' },
    kisitlar: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kalemId: { type: 'string' }, kisit: { type: 'string' }, ciddiyet: { type: 'string', enum: CIDDIYET } },
        required: ['kalemId', 'kisit', 'ciddiyet'],
      },
    },
    itirazlar: {
      type: 'array',
      items: {
        type: 'object',
        properties: { kalemId: { type: 'string' }, gerekce: { type: 'string' }, oneri: { type: 'string' } },
        required: ['kalemId', 'gerekce', 'oneri'],
      },
    },
  },
  required: ['planOnayli', 'kisitlar', 'itirazlar'],
}

const TESLIM = {
  type: 'object',
  properties: {
    durum: { type: 'string', enum: ['tamam', 'kismi', 'engellendi'] },
    degisenDosyalar: { type: 'array', items: { type: 'string' } },
    ozet: { type: 'string' },
    incelemeNotu: { type: 'string' },
    gerekenTestler: { type: 'array', items: { type: 'string' } },
    devir: {
      type: 'array',
      items: { type: 'object', properties: { kime: { type: 'string' }, not: { type: 'string' } }, required: ['kime', 'not'] },
    },
  },
  required: ['durum', 'degisenDosyalar', 'ozet'],
}

const TEST = {
  type: 'object',
  properties: {
    gecti: { type: 'boolean' },
    typecheck: { type: 'string', enum: ['gecti', 'kaldi', 'calismadi'] },
    build: { type: 'string', enum: ['gecti', 'kaldi', 'calismadi'] },
    e2eGecen: { type: 'integer' },
    e2eKalan: { type: 'integer' },
    kirikTakimlar: { type: 'array', items: { type: 'string' } },
    yazilanTestler: { type: 'array', items: { type: 'string' } },
    ciktiOzeti: { type: 'string' },
    dogrulanamayanlar: { type: 'array', items: { type: 'string' } },
  },
  required: ['gecti', 'typecheck', 'build', 'e2eGecen', 'e2eKalan', 'ciktiOzeti'],
}

const BULGU = {
  type: 'object',
  properties: {
    bulgular: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ciddiyet: { type: 'string', enum: CIDDIYET },
          dosya: { type: 'string' },
          satir: { type: 'integer' },
          baslik: { type: 'string' },
          aciklama: { type: 'string' },
          oneri: { type: 'string' },
          sahip: { type: 'string', enum: UYGULAYICILAR },
        },
        required: ['ciddiyet', 'dosya', 'baslik', 'aciklama', 'oneri', 'sahip'],
      },
    },
  },
  required: ['bulgular'],
}

const KARAR = {
  type: 'object',
  properties: {
    birlestirilebilir: { type: 'boolean' },
    ozet: { type: 'string' },
    yapilanlar: { type: 'array', items: { type: 'string' } },
    dogrulananlar: { type: 'array', items: { type: 'string' } },
    dogrulanamayanlar: { type: 'array', items: { type: 'string' } },
    acikBulgular: { type: 'array', items: { type: 'string' } },
    insanKarari: { type: 'array', items: { type: 'string' } },
  },
  required: ['birlestirilebilir', 'ozet', 'yapilanlar', 'insanKarari'],
}

const engelleyici = b => b.ciddiyet === 'kritik' || b.ciddiyet === 'yuksek'

// ───────────────────────────── 1. Plan ─────────────────────────────
let plan
if (DEVAM) {
  phase('Plan')
  plan = DEVAM.plan
  durum.plan = plan
  log(`Devam kipi: önceki koşunun revize planı kullanılıyor; plan ve danışma atlandı. Tamamlanan: ${(DEVAM.tamamlanan || []).join(', ') || '-'} · yarım: ${(DEVAM.yarim || []).join(', ') || '-'}`)
  yaz('fagent-urun-lideri', 'ekip', 'plan-v2', { devam: true, kalemler: plan.kalemler.map(k => `${k.id} (${k.sahip}): ${k.baslik}`), tamamlanan: DEVAM.tamamlanan || [], yarim: DEVAM.yarim || [] })
} else {
phase('Plan')
if (butceAz('Plan')) return guvenliDur()
plan = await agent(
  rolIstemi('fagent-urun-lideri', [
    'Görevi en fazla ' + MAKS_KALEM + ' iş kalemine böl. Önce ilgili kodu gerçekten oku.',
    'Her kalemin tek bir sahibi olsun (fagent-tasarim, fagent-veri-akisi veya fagent-test).',
    'Kabul ölçütleri gözlemlenebilir olsun. Aynı dosyaya dokunan kalemleri ardışık sırala.',
    'Kapsam dışı bıraktığını `ertelenenler`e gerekçesiyle yaz.',
  ].join('\n')),
  { ...ayar('lider:plan'), label: 'lider:plan', phase: 'Plan', schema: PLAN },
)
if (!plan) throw new Error('Ürün lideri plan üretemedi.')
durum.plan = plan
yaz('fagent-urun-lideri', 'ekip', 'plan', { ozet: plan.ozet, kalemler: plan.kalemler.map(k => `${k.id} (${k.sahip}): ${k.baslik}`) })

// ───────────────────────────── 2. Danışma ─────────────────────────────
// Bariyer bilinçli: lider iki denetçinin de görüşünü birlikte görüp planı tek seferde revize eder.
phase('Danışma')
if (butceAz('Danışma')) return guvenliDur()
const planMetni = JSON.stringify(plan, null, 1)
const danismanlar = ['fagent-guvenlik', 'fagent-uyum']
const gorusler = await parallel(danismanlar.map(rol => () =>
  agent(
    rolIstemi(rol, [
      'Aşağıdaki planı UYGULAMA BAŞLAMADAN önce incele. Kod yazma.',
      'Her kalem için uygulayıcının uyması gereken somut kısıtları yaz (ör. "anahtar VITE_ değişkenine konmaz", "metin betimleyici kipte olmalı").',
      'Kalem kuralları ihlal ediyorsa itiraz et ve alternatif öner.',
      'PLAN:\n' + planMetni,
    ].join('\n')),
    { ...ayar(`${kisa(rol)}:danisma`), label: `${kisa(rol)}:danisma`, phase: 'Danışma', schema: DANISMA },
  ).then(g => ({ rol, g })),
))
// KAPI KAPALI KALIR: güvenlik görüşü alınamazsa bir kez daha denenir; yine yoksa uygulama
// başlamaz. Güvenlik kısıtı olmadan yazılan kod, sonradan bulunacak açıkların kaynağıdır.
let guvenlikGorusu = gorusler.find(x => x && x.rol === 'fagent-guvenlik' && x.g)
if (!guvenlikGorusu) {
  log('Güvenlik danışması sonuç döndürmedi — bir kez daha deneniyor.')
  const g = await agent(
    rolIstemi('fagent-guvenlik', 'Aşağıdaki planı UYGULAMA BAŞLAMADAN önce incele ve her kalem için somut güvenlik kısıtlarını yaz. Kod yazma.\nPLAN:\n' + planMetni),
    { ...ayar('guvenlik:danisma'), label: 'guvenlik:danisma-tekrar', phase: 'Danışma', schema: DANISMA },
  )
  if (!g) throw new Error('Güvenlik danışması iki kez sonuç döndürmedi — güvenlik kısıtları olmadan uygulama başlatılmıyor.')
  gorusler.push({ rol: 'fagent-guvenlik', g })
}
for (const r of gorusler.filter(Boolean)) {
  if (!r.g) continue
  for (const k of r.g.kisitlar) yaz(r.rol, k.kalemId, 'kisit', `[${k.ciddiyet}] ${k.kisit}`)
  for (const i of r.g.itirazlar) yaz(r.rol, 'fagent-urun-lideri', 'itiraz', `${i.kalemId}: ${i.gerekce} → öneri: ${i.oneri}`)
}

const revize = await agent(
  rolIstemi('fagent-urun-lideri', [
    'Panodaki kısıt ve itirazları değerlendir ve planı revize et.',
    'İtirazı kabul ediyorsan kalemi değiştir; reddediyorsan gerekçesini `riskler`e yaz.',
    'Kısıtları ilgili kalemin `aciklama`sına ekle ki uygulayıcı görsün.',
    'Kalem sayısı en fazla ' + MAKS_KALEM + '.',
    'İLK PLAN:\n' + planMetni,
  ].join('\n')),
  { ...ayar('lider:revizyon'), label: 'lider:revizyon', phase: 'Danışma', schema: PLAN },
)
if (revize) plan = revize
durum.plan = plan
}
let kalemler = plan.kalemler
if (kalemler.length > MAKS_KALEM) {
  log(`Plan ${kalemler.length} kalem içeriyor; ilk ${MAKS_KALEM} kalem uygulanacak, kalanlar ertelendi: ${kalemler.slice(MAKS_KALEM).map(k => k.id).join(', ')}`)
  plan.ertelenenler = (plan.ertelenenler || []).concat(kalemler.slice(MAKS_KALEM).map(k => `${k.id}: ${k.baslik} (kalem sınırı)`))
  kalemler = kalemler.slice(0, MAKS_KALEM)
}
for (const k of kalemler) kalemSahibi[k.id] = k.sahip
yaz('fagent-urun-lideri', 'ekip', 'plan-v2', { kalemler: kalemler.map(k => `${k.id} (${k.sahip}): ${k.baslik}`), riskler: plan.riskler || [] })

// ───────────────────────────── 3. Uygulama ─────────────────────────────
// Sıralı, çünkü uygulayıcılar aynı çalışma ağacını düzenler; paralel düzenleme çakışırdı.
phase('Uygulama')
const teslimler = DEVAM ? (DEVAM.onceTeslimler || []).slice() : []
for (const t of teslimler) yaz(t.sahip, 'ekip', 'teslim', `${t.kalem} [${t.durum}] (önceki koşu) ${String(t.ozet).slice(0, 600)}`)
durum.teslimler = teslimler
const tamamlanan = new Set(DEVAM ? DEVAM.tamamlanan || [] : [])
const yarim = new Set(DEVAM ? DEVAM.yarim || [] : [])
for (const k of kalemler) {
  if (tamamlanan.has(k.id)) { log(`${k.id} önceki koşuda tamamlandı — atlandı.`); continue }
  if (butceAz(`Uygulama ${k.id}`)) return guvenliDur()
  const t = await agent(
    rolIstemi(k.sahip, [
      yarim.has(k.id) ? `DİKKAT — DEVAM: Bu kalem önceki koşuda uygulanırken YARIDA KESİLDİ. Çalışma ağacında yarım değişiklikler var. Önce \`git status\` ve \`git diff\` ile mevcut durumu oku (izlenmeyen yeni dosyalar dahil), yarım kalanı TAMAMLA; baştan yazma, başka kalemlerin (${[...tamamlanan].join(', ') || '-'}) değişikliklerini bozma.` : '',
      `Kalem ${k.id}: ${k.baslik}`,
      k.aciklama,
      'Kabul ölçütleri:\n- ' + k.kabulOlcutleri.join('\n- '),
      k.dosyalar && k.dosyalar.length ? 'İlgili dosyalar: ' + k.dosyalar.join(', ') : '',
      'Panodaki sana ya da bu kaleme yazılmış kısıtlara uy.',
      'Bitirince `npm run typecheck` çalıştır. Başka bir rolün işi gerekiyorsa `devir`e yaz.',
    ].filter(Boolean).join('\n')),
    { ...ayar(`${kisa(k.sahip)}:uygulama`), label: `${kisa(k.sahip)}:${k.id}`, phase: 'Uygulama', schema: TESLIM },
  )
  if (!t) {
    yaz(k.sahip, 'fagent-urun-lideri', 'teslim', `${k.id}: ajan sonuç döndürmedi`)
    continue
  }
  teslimler.push({ kalem: k.id, sahip: k.sahip, ...t })
  durum.teslimler = teslimler
  yaz(k.sahip, 'ekip', 'teslim', `${k.id} [${t.durum}] ${t.ozet} — dosyalar: ${t.degisenDosyalar.join(', ')}${t.incelemeNotu ? ' — inceleyene not: ' + t.incelemeNotu : ''}`)
  for (const d of t.devir || []) yaz(k.sahip, d.kime, 'devir', d.not)
}

// ───────────────────────────── 4. Test kapısı ─────────────────────────────
async function testKapisi(etiket, yalnizKos) {
  const gereken = teslimler.flatMap(t => (t.gerekenTestler || []).map(g => `${t.kalem}: ${g}`))
  const adim = yalnizKos ? 'test:yeniden-kos' : 'test:yaz-ve-kos'
  const r = await agent(
    rolIstemi('fagent-test', yalnizKos
      ? 'Bu bir düzeltme turundan sonraki yeniden doğrulamadır. Test YAZMA ve kod değiştirme; yalnızca kapıyı sırayla çalıştır (typecheck, build, e2e) ve gerçek çıktıya göre raporla. Kırık varsa kırılan kontrolün adını ve ilgili çıktı satırlarını ver.'
      : [
          gereken.length ? 'Önce şu davranışlar için e2e kontrolü yaz (yoksa):\n- ' + gereken.join('\n- ') : 'Yeni davranış için gereken e2e kontrollerini değerlendir.',
          'Sonra kapıyı sırayla çalıştır (typecheck, build, e2e) ve gerçek çıktıya göre raporla.',
        ].join('\n'), 15),
    { ...ayar(adim), label: `test:${etiket}`, phase: etiket === 'ilk' ? 'Test' : 'Düzeltme', schema: TEST },
  )
  // KAPI KAPALI KALIR: test ajanı sonuç döndürmezse kapı kırmızı sayılır, yeşil değil.
  if (!r) {
    yaz('fagent-test', 'ekip', 'test', 'KIRMIZI — test ajanı sonuç döndürmedi, kapı doğrulanamadı')
    return { gecti: false, typecheck: 'calismadi', build: 'calismadi', e2eGecen: 0, e2eKalan: 0, ciktiOzeti: 'Test ajanı sonuç döndürmedi; kapı doğrulanamadı.' }
  }
  if (r) yaz('fagent-test', 'ekip', 'test', `${r.gecti ? 'YEŞİL' : 'KIRMIZI'} — typecheck ${r.typecheck}, build ${r.build}, e2e ${r.e2eGecen}✓/${r.e2eKalan}✗${(r.kirikTakimlar || []).length ? ' kırık: ' + r.kirikTakimlar.join(', ') : ''}`)
  return r
}
phase('Test')
if (butceAz('Test')) return guvenliDur()
let test = await testKapisi('ilk', false)
durum.test = test

// ───────────────────────────── 5. Çapraz inceleme ─────────────────────────────
// Güvenlik iki ayrı mercekle, her koşuda ve her düzeltme turundan sonra yeniden inceler.
const GUVENLIK_MERCEKLERI = [
  {
    ad: 'guvenlik-erisim',
    odak: [
      'MERCEĞİN: ERİŞİM VE VERİ. Yalnızca şunlara odaklan, derinlemesine:',
      '- Kimlik doğrulama ve oturum akışları (kayıt, giriş, çıkış, şifre sıfırlama, e-posta doğrulama yönlendirmeleri).',
      '- Supabase migration\'ları: her tabloda RLS açık mı, her politika auth.uid() ile satır sahibine mi sınırlı, insert/update with check var mı, security definer fonksiyonlarında search_path sabit ve execute yetkisi doğru mu.',
      '- Bulut senkronu: başka bir kullanıcının satırı okunabilir/yazılabilir mi, çıkışta yerel veri gerçekten temizleniyor mu, iki sekme/iki hesap arasında veri karışabilir mi, sunucudan gelen veri doğrulanmadan localStorage\'a yazılıyor mu (beyaz liste).',
      '- Hesap silme gerçekten tüm veriyi siliyor mu (KVKK).',
      'Saldırgan gözüyle düşün: kötü niyetli bir oturum açmış kullanıcı ne yapabilir?',
    ].join('\n'),
  },
  {
    ad: 'guvenlik-istemci',
    odak: [
      'MERCEĞİN: İSTEMCİ VE TEDARİK ZİNCİRİ. Önce şu komutları ÇALIŞTIR ve çıktısını kanıt olarak kullan:',
      '  npm run build && npm run guvenlik -- --dist',
      'Tarama betiğinin her "KRİTİK" satırı senin için kritik bulgudur; "npm audit ÇALIŞMADI" ise bunu doğrulanamayan olarak yaz.',
      'Sonra derinlemesine incele:',
      '- Gizli anahtar: kaynakta, testlerde, dist/ çıktısında; VITE_ önekli değişkenlerin yalnızca publishable değer taşıdığı.',
      '- XSS/enjeksiyon: kullanıcı ya da sunucu verisinin DOM\'a, URL\'e, href\'e ulaştığı her yer.',
      '- İçe aktarma (yedek/CSV/JSON): beyaz liste, boyut sınırı, ya hep ya hiç, prototype pollution (__proto__, constructor anahtarları).',
      '- Dış istekler: portföy içeriği üçüncü tarafa gidiyor mu; sunucu fonksiyonları açık proxy\'ye dönüşebilir mi.',
      '- Yeni bağımlılıklar: gerçekten gerekli mi, sürüm sabit mi.',
    ].join('\n'),
  },
]

function incelemeciler() {
  const dosyalar = teslimler.flatMap(t => t.degisenDosyalar || [])
  const liste = GUVENLIK_MERCEKLERI.map(m => ({ rol: 'fagent-guvenlik', ad: m.ad, odak: m.odak, zorunlu: true }))
  // Kullanıcıya görünen metin (arayüz, ajan yanıtı, README, belge) değişmediyse uyum denetimi atlanır.
  if (dosyalar.some(f => /^(src\/|README|docs\/|index\.html|public\/)/.test(f))) liste.push({ rol: 'fagent-uyum', ad: 'uyum' })
  else log('Uyum incelemesi atlandı: kullanıcıya görünen metin içeren dosya değişmedi.')
  const sahipler = new Set(teslimler.map(t => t.sahip))
  // Alan sahipleri, kendi alanına başka bir rol dokunduysa çapraz inceleme yapar.
  if (dosyalar.some(f => /\.(tsx|css)$/.test(f)) && (!sahipler.has('fagent-tasarim') || sahipler.size > 1)) liste.push({ rol: 'fagent-tasarim', ad: 'tasarim' })
  if (dosyalar.some(f => /(store|analytics|agent|cloud|backup|market|evds|inflation|priceHistory|supabase|api\/|netlify)/.test(f)) && (!sahipler.has('fagent-veri-akisi') || sahipler.size > 1)) liste.push({ rol: 'fagent-veri-akisi', ad: 'veri-akisi' })
  return liste
}

// İncelemeleri koşturur. Zorunlu (güvenlik) bir inceleme sonuç döndürmezse bir kez yeniden
// denenir; yine dönmezse `eksik`e yazılır ve karar kodla "birleştirilemez"e kilitlenir.
async function incele(liste, tur) {
  const tek = (x, deneme) => agent(
    rolIstemi(x.rol, [
      x.odak || '',
      'Ekibin yaptığı değişiklikleri incele. Değişiklikler commit edilmedi: `git status` ve `git diff` ile gör (izlenmeyen yeni dosyaları da oku).',
      'Yalnızca kendi alanındaki somut sorunları yaz; dosya ve mümkünse satır ver.',
      'Her bulgunun `sahip`i, düzeltmesi gereken uygulayıcı rol olsun.',
      'Sorun yoksa boş liste döndür — bulgu uydurma. Ama emin olamadığın bir riski atlama: "doğrulanamadı" diye yaz.',
    ].filter(Boolean).join('\n'), 25),
    { ...ayar(`${x.ad}:inceleme`), label: `${x.ad}:inceleme${tur ? '-' + tur : ''}${deneme ? '-tekrar' : ''}`, phase: tur ? 'Düzeltme' : 'İnceleme', schema: BULGU },
  )
  const sonuclar = await parallel(liste.map(x => async () => {
    let r = await tek(x, false)
    if (!r && x.zorunlu) {
      log(`${x.ad} incelemesi sonuç döndürmedi — bir kez daha deneniyor.`)
      r = await tek(x, true)
    }
    return { x, r }
  }))
  const bulgular = []
  const eksik = []
  for (const s of sonuclar) {
    if (!s || !s.r) {
      if (s && s.x.zorunlu) eksik.push(s.x.ad)
      continue
    }
    for (const b of s.r.bulgular) bulgular.push({ ...b, inceleyen: s.x.rol, mercek: s.x.ad })
  }
  for (const b of bulgular) yaz(b.mercek, b.sahip, 'bulgu', `[${b.ciddiyet}] ${b.dosya}${b.satir ? ':' + b.satir : ''} — ${b.baslik}: ${b.aciklama} → ${b.oneri}`)
  for (const e of eksik) yaz(e, 'insan', 'bulgu', `[kritik] ${e} incelemesi iki denemede de tamamlanamadı — güvenlik doğrulanmadı.`)
  return { bulgular, eksik }
}

phase('İnceleme')
if (butceAz('İnceleme')) return guvenliDur()
let inceleme = await incele(incelemeciler(), 0)
let bulgular = inceleme.bulgular
let eksikIncelemeler = inceleme.eksik
durum.bulgular = bulgular
durum.eksikIncelemeler = eksikIncelemeler

// ───────────────────────────── 6. Düzeltme döngüsü ─────────────────────────────
let tur = 0
while (tur < MAKS_TUR && (bulgular.some(engelleyici) || eksikIncelemeler.length || !test.gecti)) {
  if (butceAz(`Düzeltme turu ${tur + 1}`)) return guvenliDur()
  tur++
  phase('Düzeltme')
  const acik = bulgular.filter(engelleyici)
  // Kırmızı test kapısında kırığın kimden geldiği bilinmez; bu turda iş teslim eden herkes bakar.
  const sahipler = [...new Set(acik.map(b => b.sahip).concat(!test.gecti ? teslimler.map(t => t.sahip) : []))]
  log(`Düzeltme turu ${tur}: ${acik.length} engelleyici bulgu${!test.gecti ? ' + kırmızı test kapısı' : ''}${eksikIncelemeler.length ? ' + eksik inceleme: ' + eksikIncelemeler.join(', ') : ''}${sahipler.length ? ' → ' + sahipler.join(', ') : ''}`)
  let degisti = false
  for (const sahip of sahipler) {
    const benim = acik.filter(b => b.sahip === sahip)
    const r = await agent(
      rolIstemi(sahip, [
        benim.length ? 'Şu engelleyici bulguları düzelt:\n' + benim.map(b => `- [${b.ciddiyet}] ${b.dosya}${b.satir ? ':' + b.satir : ''} ${b.baslik}: ${b.aciklama} → ${b.oneri} (inceleyen: ${b.mercek})`).join('\n') : '',
        !test.gecti ? 'Test kapısı kırmızı: ' + test.ciktiOzeti + '\nKendi alanına düşen kırığı düzelt.' : '',
        'Güvenlik bulgusuna katılmıyorsan bile düzeltmeyi tercih et; düzeltme mümkün değilse `incelemeNotu`na teknik gerekçeni yaz — ürün lideri ve insan karar verir.',
      ].filter(Boolean).join('\n'), 25),
      { ...ayar(`${kisa(sahip)}:uygulama`), label: `${kisa(sahip)}:duzeltme-${tur}`, phase: 'Düzeltme', schema: TESLIM },
    )
    if (r) {
      if ((r.degisenDosyalar || []).length) degisti = true
      yaz(sahip, 'ekip', 'duzeltme', `tur ${tur}: ${r.ozet}${r.incelemeNotu ? ' — not: ' + r.incelemeNotu : ''}`)
    }
  }
  if (degisti || !test.gecti) test = await testKapisi('tur-' + tur, true)
  else log(`Tur ${tur}: hiçbir dosya değişmedi, test kapısı yeniden koşulmadı.`)
  // Güvenlik HER düzeltme turundan sonra iki mercekle yeniden inceler: düzeltmeler yeni açık
  // getirebilir. Diğer roller yalnızca engelleyici bulgu açtılarsa yeniden bakar.
  const digerleri = [...new Set(acik.filter(b => b.inceleyen !== 'fagent-guvenlik').map(b => b.mercek))]
  // Dosya değiştiyse iki güvenlik merceği de baştan bakar; değişmediyse yalnızca tamamlanamamış
  // olan yeniden denenir (aynı koda ikinci kez bakmak token harcar, güvenlik kazandırmaz).
  const yeniListe = incelemeciler().filter(x =>
    (x.zorunlu && (degisti || eksikIncelemeler.includes(x.ad))) || digerleri.includes(x.ad))
  const sonraki = yeniListe.length ? await incele(yeniListe, tur) : { bulgular: [], eksik: [] }
  const yenidenBakan = yeniListe.map(x => x.ad)
  // Yeniden incelenmeyen merceklerin bulguları kayıtta kalır.
  bulgular = bulgular.filter(b => !yenidenBakan.includes(b.mercek)).concat(sonraki.bulgular)
  eksikIncelemeler = sonraki.eksik.concat(eksikIncelemeler.filter(e => !yenidenBakan.includes(e)))
  Object.assign(durum, { test, bulgular, eksikIncelemeler, tur })
}

// ───────────────────────────── 7. Karar ─────────────────────────────
phase('Karar')
if (butceAz('Karar')) return guvenliDur()
let karar = await agent(
  rolIstemi('fagent-urun-lideri', [
    'Ekibin işini değerlendir ve insan için son kararı yaz. Panonun tamamı yukarıda.',
    'Son test sonucu: ' + JSON.stringify(test),
    'Açık bulgular: ' + JSON.stringify(bulgular),
    'Tamamlanamayan zorunlu incelemeler: ' + JSON.stringify(eksikIncelemeler),
    'Engelleyici (kritik/yüksek) bulgu açıksa, zorunlu inceleme eksikse ya da test kırmızıysa birlestirilebilir=false.',
    '`git diff --stat` ile değişiklik kapsamını kendin de gör.',
  ].join('\n')),
  { ...ayar('lider:karar'), label: 'lider:karar', phase: 'Karar', schema: KARAR },
)

// KARAR KODLA KİLİTLİ: liderin değerlendirmesi ne olursa olsun, şu koşullardan biri varsa
// sonuç "birleştirilemez"dir. Bir modelin "sorun yok" demesi bu kapıyı açamaz.
const kilitler = []
const acikEngel = bulgular.filter(engelleyici)
if (acikEngel.length) kilitler.push(`${acikEngel.length} açık engelleyici bulgu (${[...new Set(acikEngel.map(b => b.mercek))].join(', ')})`)
if (eksikIncelemeler.length) kilitler.push('tamamlanamayan zorunlu inceleme: ' + eksikIncelemeler.join(', '))
if (!test.gecti) kilitler.push('test kapısı kırmızı')
if (!karar) karar = { birlestirilebilir: false, ozet: 'Ürün lideri karar üretemedi.', yapilanlar: teslimler.map(t => `${t.kalem}: ${t.ozet}`), insanKarari: ['Sonuçları elle değerlendir.'] }
if (kilitler.length && karar.birlestirilebilir) {
  log('Lider "birleştirilebilir" dedi ama kod kilidi devrede: ' + kilitler.join('; '))
}
if (kilitler.length) {
  karar.birlestirilebilir = false
  karar.kilitler = kilitler
  karar.acikBulgular = (karar.acikBulgular || []).concat(kilitler.map(k => 'KİLİT: ' + k))
}
yaz('fagent-urun-lideri', 'insan', 'karar', `${karar.birlestirilebilir ? 'BİRLEŞTİRİLEBİLİR' : 'BİRLEŞTİRİLEMEZ'} — ${karar.ozet}${kilitler.length ? ' [kilit: ' + kilitler.join('; ') + ']' : ''}`)

return {
  gorev: GOREV,
  karar,
  plan: { ozet: plan.ozet, kalemler, ertelenenler: plan.ertelenenler || [], riskler: plan.riskler || [] },
  teslimler,
  test,
  bulgular,
  eksikIncelemeler,
  duzeltmeTuru: tur,
  pano,
}
