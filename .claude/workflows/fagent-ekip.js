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

// ───────────────────────────── Pano (ajanların ortak konuşma alanı) ─────────────────────────────
// Her ajan bir sonraki ajana doğrudan değil, bu pano üzerinden konuşur. Her istem panonun
// son mesajlarını taşır; böylece tasarım, güvenliğin koyduğu kısıtı; test, veri akışının
// devir notunu görür. Pano iş akışının dönüş değerinde de yer alır (insan için kayıt).
const pano = []
function yaz(kimden, kime, tur, icerik) {
  pano.push({ sira: pano.length + 1, kimden, kime, tur, icerik })
}
function panoMetni(son) {
  const parca = son ? pano.slice(-son) : pano
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
    `Ekip panosu (diğer rollerin mesajları — bunları dikkate al, çelişiyorsan gerekçesiyle belirt):\n${panoMetni(panoSon)}`,
    `Senin bu adımdaki işin:\n${gorevMetni}`,
  ].join('\n\n')
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
phase('Plan')
let plan = await agent(
  rolIstemi('fagent-urun-lideri', [
    'Görevi en fazla ' + MAKS_KALEM + ' iş kalemine böl. Önce ilgili kodu gerçekten oku.',
    'Her kalemin tek bir sahibi olsun (fagent-tasarim, fagent-veri-akisi veya fagent-test).',
    'Kabul ölçütleri gözlemlenebilir olsun. Aynı dosyaya dokunan kalemleri ardışık sırala.',
    'Kapsam dışı bıraktığını `ertelenenler`e gerekçesiyle yaz.',
  ].join('\n')),
  { label: 'lider:plan', phase: 'Plan', schema: PLAN },
)
if (!plan) throw new Error('Ürün lideri plan üretemedi.')
yaz('fagent-urun-lideri', 'ekip', 'plan', { ozet: plan.ozet, kalemler: plan.kalemler.map(k => `${k.id} (${k.sahip}): ${k.baslik}`) })

// ───────────────────────────── 2. Danışma ─────────────────────────────
// Bariyer bilinçli: lider iki denetçinin de görüşünü birlikte görüp planı tek seferde revize eder.
phase('Danışma')
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
    { label: `${rol.replace('fagent-', '')}:danisma`, phase: 'Danışma', schema: DANISMA },
  ).then(g => ({ rol, g })),
))
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
  { label: 'lider:revizyon', phase: 'Danışma', schema: PLAN },
)
if (revize) plan = revize
let kalemler = plan.kalemler
if (kalemler.length > MAKS_KALEM) {
  log(`Plan ${kalemler.length} kalem içeriyor; ilk ${MAKS_KALEM} kalem uygulanacak, kalanlar ertelendi: ${kalemler.slice(MAKS_KALEM).map(k => k.id).join(', ')}`)
  plan.ertelenenler = (plan.ertelenenler || []).concat(kalemler.slice(MAKS_KALEM).map(k => `${k.id}: ${k.baslik} (kalem sınırı)`))
  kalemler = kalemler.slice(0, MAKS_KALEM)
}
yaz('fagent-urun-lideri', 'ekip', 'plan-v2', { kalemler: kalemler.map(k => `${k.id} (${k.sahip}): ${k.baslik}`), riskler: plan.riskler || [] })

// ───────────────────────────── 3. Uygulama ─────────────────────────────
// Sıralı, çünkü uygulayıcılar aynı çalışma ağacını düzenler; paralel düzenleme çakışırdı.
phase('Uygulama')
const teslimler = []
for (const k of kalemler) {
  const t = await agent(
    rolIstemi(k.sahip, [
      `Kalem ${k.id}: ${k.baslik}`,
      k.aciklama,
      'Kabul ölçütleri:\n- ' + k.kabulOlcutleri.join('\n- '),
      k.dosyalar && k.dosyalar.length ? 'İlgili dosyalar: ' + k.dosyalar.join(', ') : '',
      'Panodaki sana ya da bu kaleme yazılmış kısıtlara uy.',
      'Bitirince `npm run typecheck` çalıştır. Başka bir rolün işi gerekiyorsa `devir`e yaz.',
    ].filter(Boolean).join('\n')),
    { label: `${k.sahip.replace('fagent-', '')}:${k.id}`, phase: 'Uygulama', schema: TESLIM },
  )
  if (!t) {
    yaz(k.sahip, 'fagent-urun-lideri', 'teslim', `${k.id}: ajan sonuç döndürmedi`)
    continue
  }
  teslimler.push({ kalem: k.id, sahip: k.sahip, ...t })
  yaz(k.sahip, 'ekip', 'teslim', `${k.id} [${t.durum}] ${t.ozet} — dosyalar: ${t.degisenDosyalar.join(', ')}${t.incelemeNotu ? ' — inceleyene not: ' + t.incelemeNotu : ''}`)
  for (const d of t.devir || []) yaz(k.sahip, d.kime, 'devir', d.not)
}

// ───────────────────────────── 4. Test kapısı ─────────────────────────────
async function testKapisi(etiket, ekNot) {
  const gereken = teslimler.flatMap(t => (t.gerekenTestler || []).map(g => `${t.kalem}: ${g}`))
  const r = await agent(
    rolIstemi('fagent-test', [
      gereken.length ? 'Önce şu davranışlar için e2e kontrolü yaz (yoksa):\n- ' + gereken.join('\n- ') : 'Yeni davranış için gereken e2e kontrollerini değerlendir.',
      ekNot || '',
      'Sonra kapıyı sırayla çalıştır (typecheck, build, e2e) ve gerçek çıktıya göre raporla.',
    ].filter(Boolean).join('\n'), 30),
    { label: `test:${etiket}`, phase: etiket === 'ilk' ? 'Test' : 'Düzeltme', schema: TEST },
  )
  if (r) yaz('fagent-test', 'ekip', 'test', `${r.gecti ? 'YEŞİL' : 'KIRMIZI'} — typecheck ${r.typecheck}, build ${r.build}, e2e ${r.e2eGecen}✓/${r.e2eKalan}✗${(r.kirikTakimlar || []).length ? ' kırık: ' + r.kirikTakimlar.join(', ') : ''}`)
  return r
}
phase('Test')
let test = await testKapisi('ilk')

// ───────────────────────────── 5. Çapraz inceleme ─────────────────────────────
function incelemeciler() {
  const dosyalar = teslimler.flatMap(t => t.degisenDosyalar || [])
  const roller = ['fagent-guvenlik', 'fagent-uyum']
  const sahipler = new Set(teslimler.map(t => t.sahip))
  // Alan sahipleri, kendi alanına başka bir rol dokunduysa çapraz inceleme yapar.
  if (dosyalar.some(f => /\.(tsx|css)$/.test(f)) && (!sahipler.has('fagent-tasarim') || sahipler.size > 1)) roller.push('fagent-tasarim')
  if (dosyalar.some(f => /(store|analytics|agent|cloud|backup|market|evds|inflation|priceHistory|supabase|api\/|netlify)/.test(f)) && (!sahipler.has('fagent-veri-akisi') || sahipler.size > 1)) roller.push('fagent-veri-akisi')
  return roller
}

async function incele(roller, tur) {
  const sonuclar = await parallel(roller.map(rol => () =>
    agent(
      rolIstemi(rol, [
        'Ekibin yaptığı değişiklikleri incele. Değişiklikler commit edilmedi: `git status` ve `git diff` ile gör (yeni dosyalar için `git status`taki izlenmeyenleri de oku).',
        'Yalnızca kendi alanındaki somut sorunları yaz; dosya ve mümkünse satır ver.',
        'Her bulgunun `sahip`i, düzeltmesi gereken uygulayıcı rol olsun.',
        'Sorun yoksa boş liste döndür — bulgu uydurma.',
      ].join('\n'), 40),
      { label: `${rol.replace('fagent-', '')}:inceleme${tur ? '-' + tur : ''}`, phase: tur ? 'Düzeltme' : 'İnceleme', schema: BULGU },
    ).then(r => (r ? r.bulgular.map(b => ({ ...b, inceleyen: rol })) : [])),
  ))
  const hepsi = sonuclar.filter(Boolean).flat()
  for (const b of hepsi) yaz(b.inceleyen, b.sahip, 'bulgu', `[${b.ciddiyet}] ${b.dosya}${b.satir ? ':' + b.satir : ''} — ${b.baslik}: ${b.aciklama} → ${b.oneri}`)
  return hepsi
}

phase('İnceleme')
let bulgular = await incele(incelemeciler(), 0)

// ───────────────────────────── 6. Düzeltme döngüsü ─────────────────────────────
let tur = 0
while (tur < MAKS_TUR && (bulgular.some(engelleyici) || (test && !test.gecti))) {
  tur++
  phase('Düzeltme')
  const acik = bulgular.filter(engelleyici)
  // Kırmızı test kapısında kırığın kimden geldiği bilinmez; bu turda iş teslim eden herkes bakar.
  const sahipler = [...new Set(acik.map(b => b.sahip).concat(test && !test.gecti ? teslimler.map(t => t.sahip) : []))]
  log(`Düzeltme turu ${tur}: ${acik.length} engelleyici bulgu${test && !test.gecti ? ' + kırmızı test kapısı' : ''} → ${sahipler.join(', ')}`)
  for (const sahip of sahipler) {
    const benim = acik.filter(b => b.sahip === sahip)
    const r = await agent(
      rolIstemi(sahip, [
        benim.length ? 'Şu engelleyici bulguları düzelt:\n' + benim.map(b => `- [${b.ciddiyet}] ${b.dosya}${b.satir ? ':' + b.satir : ''} ${b.baslik}: ${b.aciklama} → ${b.oneri} (inceleyen: ${b.inceleyen})`).join('\n') : '',
        test && !test.gecti ? 'Test kapısı kırmızı: ' + test.ciktiOzeti + '\nKendi alanına düşen kırığı düzelt.' : '',
        'Bir bulguya katılmıyorsan düzeltme yapma, `incelemeNotu`na gerekçeni yaz — ürün lideri karar verir.',
      ].filter(Boolean).join('\n'), 40),
      { label: `${sahip.replace('fagent-', '')}:duzeltme-${tur}`, phase: 'Düzeltme', schema: TESLIM },
    )
    if (r) yaz(sahip, 'ekip', 'duzeltme', `tur ${tur}: ${r.ozet}${r.incelemeNotu ? ' — not: ' + r.incelemeNotu : ''}`)
  }
  test = await testKapisi('tur-' + tur, 'Bu bir düzeltme turundan sonraki yeniden doğrulamadır.')
  const tekrar = [...new Set(acik.map(b => b.inceleyen))]
  const yeni = tekrar.length ? await incele(tekrar, tur) : []
  // Yeniden incelenmeyen rollerin engelleyici olmayan bulguları kayıtta kalır.
  bulgular = bulgular.filter(b => !tekrar.includes(b.inceleyen)).concat(yeni)
}

// ───────────────────────────── 7. Karar ─────────────────────────────
phase('Karar')
const karar = await agent(
  rolIstemi('fagent-urun-lideri', [
    'Ekibin işini değerlendir ve insan için son kararı yaz. Panonun tamamı yukarıda.',
    'Son test sonucu: ' + JSON.stringify(test),
    'Açık bulgular: ' + JSON.stringify(bulgular),
    'Engelleyici (kritik/yüksek) bulgu açıksa ya da test kırmızıysa birlestirilebilir=false.',
    '`git diff --stat` ile değişiklik kapsamını kendin de gör.',
  ].join('\n')),
  { label: 'lider:karar', phase: 'Karar', schema: KARAR },
)
if (karar) yaz('fagent-urun-lideri', 'insan', 'karar', `${karar.birlestirilebilir ? 'BİRLEŞTİRİLEBİLİR' : 'BİRLEŞTİRİLEMEZ'} — ${karar.ozet}`)

return {
  gorev: GOREV,
  karar,
  plan: { ozet: plan.ozet, kalemler, ertelenenler: plan.ertelenenler || [], riskler: plan.riskler || [] },
  teslimler,
  test,
  bulgular,
  duzeltmeTuru: tur,
  pano,
}
