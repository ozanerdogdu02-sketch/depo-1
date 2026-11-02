#!/usr/bin/env node
// Bölüm sonu kod denetimi — otomatik kısım. Yalnız OKUR; ağ çağrısı YAPMAZ; .env* dosyalarına dokunmaz.
// Süreç ve rapor şablonu: .claude/skills/bolum-denetimi/SKILL.md
//
// Kullanım: npm run denetim                 (insan okunur Türkçe özet)
//           npm run denetim -- --json        (makine okunur)
//           npm run denetim -- --kok <dizin> (başka bir kök dizini denetle; testler bunu kullanır)
// Çıkış kodu: HATA varsa 1, yoksa 0. UYARI ve BILGI çıkışı bozmaz.
//
// Kontroller: 1 ağ envanteri  2 CSP uyumu  3 depolama anahtarları  4 paket bütçesi
//             5 sunucu fonksiyonu koruması  6 VITE_ gizli anahtar adı
// "Güncel/doğru veri" ve "yanlış kodlanmış yol" (ağ dışı) boyutları betikle tam denetlenemez: insan/ajan
// incelemesi gerekir (bkz. skill). Betik yalnız mekanik kısmı kanıtlar.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

/* ───────────── Ayarlar (bilerek sabit; değişirse gerekçesiyle) ───────────── */

// Paket bütçesi: 2026-11-02 ölçümü (JS toplam 1.035.317 B, en büyük parça 576.789 B, CSS 11.240 B) + ~%20.
export const BUTCE = { jsToplam: 1_250_000, jsEnBuyuk: 700_000, cssToplam: 14_000 };

// İzinli ana bilgisayarlar — koddan çıkarıldı (2026-11-02 grep: src/, api/, netlify/); yenisi eklenirse
// önce Üst Kurul/güvenlik denetimi, sonra buraya ve CSP'ye.
export const IZIN_ISTEMCI_FETCH = ['api.frankfurter.dev', 'api.coingecko.com']; // tarayıcının doğrudan çağırdığı
export const IZIN_SUNUCU = ['evds2.tcmb.gov.tr', 'www.kap.org.tr', 'www.borsaistanbul.com']; // yalnız api/ ve netlify/
export const IZIN_BAGLANTI = ['www.kap.org.tr']; // src/ içinde yalnız tıklanabilir bağlantı (fetch değil)
// İstemcide fetch/XHR/sendBeacon/WebSocket/EventSource/Image/window.open çağrısının ilk argümanı (a) izinli host içeren sabit dize,
// (b) aynı dosyada böyle bir sabite çözülen tanımlayıcı ya da (c) '/api/...' yolu olmalı; aksi halde 'ag-dinamik-hedef' HATA.
// Aşağıdakiler tek tek gerekçeli istisnalardır (toptan muafiyet yok). dosya + satır deseni eşleşmeli.
// İstisna = dosya + o satırın TAM metni (yorum çıkarılmış, boşluk normalize). Satır değişirse/ikinci çağrı eklenirse istisna
// kendiliğinden düşer. `url` tanımlayıcılı istisnada ayrıca `url` kaynağı izlenir (bkz. istisnaDogrula).
export const IZIN_DINAMIK_CAGRI = [
  { dosya: 'src/kaynaklar/kap.ts', satir: 'const varsayilanFetch: FetchLike = (url, init) => fetch(url, init);', gerekce: 'ince sarmalayıcı; çağıran yalnız FN_URL (/api/kap) verir (çağrılar ayrıca denetlenir)' },
  { dosya: 'src/kaynaklar/bist.ts', satir: 'const varsayilanFetch: FetchLike = (url, init) => fetch(url, init);', gerekce: 'ince sarmalayıcı; çağıran yalnız FN_URL (/api/bist) verir (çağrılar ayrıca denetlenir)' },
  { dosya: 'src/kaynaklar/tcmb.ts', satir: 'const varsayilanFetch: FetchLike = (url, init) => fetch(url, init);', gerekce: 'ince sarmalayıcı; çağıran yalnız FN_URL (/api/evds) verir (çağrılar ayrıca denetlenir)' },
  {
    dosya: 'src/kaynaklar/tcmb.ts', satir: 'const res = await fetchFn(url, { signal });',
    gerekce: 'evdsSatirlari(url, ...): url parametre; tüm çağrılar `${FN_URL}?...` verir',
    izle: { fonksiyon: 'evdsSatirlari' },
  },
];
// index.html ve public/ içindeki dış bağlantılar: bilinçli olarak boş (hiçbir dış script/stil/görsel yok).
export const IZIN_HTML_DIS = [];
export const IZIN_AG_DISI = ['www.w3.org', 'localhost', '127.0.0.1']; // xmlns vb.; ağ isteği değil
// Supabase adresi koda gömülü değil, VITE_SUPABASE_URL ortamından gelir; CSP'de bu desenle izinlidir.
export const SUPABASE_DESENI = '*.supabase.co';

// Yedeğe girmeyen ama bilinçli olan kalıcı anahtarlar (neden koddaki adından/yorumundan doğrulandı).
// '.' ile bitenler önektir.
export const YEDEKSIZ_BILINEN = {
  'fagent.backup.v1': 'yedek üst verisi (cihaza özgü)',
  'fagent.cloud.owner.v1': 'bulut hesap eşlemesi (cihaza özgü)',
  'fagent.cloud.base.v1': 'bulut taban özeti (cihaza özgü)',
  'fagent.cloud.reloaded.v1': 'bulut yeniden yükleme işareti',
  'fagent.quarantine.v1': 'çıkış karantinası (cihaza özgü, 7 gün)',
  'fagent.mirror.cleared.v1': 'SIFIRLA işareti',
  'fagent.recovery.': 'kurtarma/bozuk-veri kopyaları',
  'fagent.pricehistory.v1.': 'herkese açık fiyat geçmişi önbelleği',
  'fagent.cryptomarket.cache.v2': 'herkese açık kripto piyasa önbelleği',
  'fagent.kaynak.': 'dış kaynak önbelleği (TCMB/KAP/BİST)',
  'fagent.evds.v1': 'eski enflasyon önbelleği (göçle fagent.kaynak.tcmb.tufe.v1 anahtarına taşınır)',
  'fagent.ai.proxyurl.v1': 'eski anahtar (LEGACY_KEYS, silinir)',
};

/* ───────────── Yardımcılar ───────────── */

const args = process.argv.slice(2);
const JSON_CIKTI = args.includes('--json');
const kokIdx = args.indexOf('--kok');
const KOK = resolve(kokIdx >= 0 && args[kokIdx + 1] ? args[kokIdx + 1] : process.cwd());

const bulgular = [];
const bilgi = {}; // rapora giren envanter bölümleri
const ekle = (ciddiyet, kural, yer, aciklama) => bulgular.push({ ciddiyet, kural, yer, aciklama });

const yol = (...p) => join(KOK, ...p);
const goreli = (f) => relative(KOK, f).split('\\').join('/');
const oku = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : undefined);

const ATLA_DIZIN = new Set(['node_modules', '.git', 'dist', 'dist-e2e-cloud']);
function dosyalar(dizin, uzantilar) {
  const cikti = [];
  if (!existsSync(dizin)) return cikti;
  for (const ad of readdirSync(dizin)) {
    if (ATLA_DIZIN.has(ad)) continue;
    const tam = join(dizin, ad);
    let st;
    try { st = statSync(tam); } catch { continue; }
    if (st.isDirectory()) cikti.push(...dosyalar(tam, uzantilar));
    else if (uzantilar.some((u) => ad.endsWith(u)) && existsSync(tam)) cikti.push(tam);
  }
  return cikti;
}

// Yorumları siler, satır sayısını korur (satır numaraları doğru kalsın).
function yorumsuz(kod) {
  const blok = kod.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  return blok.split('\n').map((s) => (/^\s*\/\//.test(s) ? '' : s.replace(/(^|\s)\/\/.*$/, '$1')));
}

const hostEslesir = (desen, host) => (desen.startsWith('*.') ? host.endsWith(desen.slice(1)) : desen === host);

/* ───────────── 1. Ağ envanteri ───────────── */

const ISTEMCI = dosyalar(yol('src'), ['.ts', '.tsx', '.js', '.mjs']);
const SUNUCU = [...dosyalar(yol('api'), ['.mjs', '.js', '.ts']), ...dosyalar(yol('netlify'), ['.mjs', '.js', '.ts'])];

// Çağrı argümanı çıkarıcı: metin[bas] '(' sonrasıdır. Dize/şablon içini atlar, parantez dengesini izler.
function cagriArgumani(metin, bas) {
  let d = 0, q = null, ilkSon = -1, i = bas;
  for (; i < metin.length; i++) {
    const c = metin[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) { if (ilkSon < 0) ilkSon = i; break; } d--; }
    else if (c === ',' && d === 0 && ilkSon < 0) ilkSon = i;
  }
  return { ilk: metin.slice(bas, ilkSon < 0 ? i : ilkSon).trim(), tum: metin.slice(bas, i) };
}
const satirNo = (metin, idx) => metin.slice(0, idx).split('\n').length;

// (a) izinli host içeren sabit dize ya da (c) '/api/...' yolu mu? Dize açılış tırnağıyla başlamalı.
function sabitIzinli(metin, hostlar) {
  const m = metin.match(/^(['"`])([\s\S]*)/);
  if (!m) return false;
  const ic = m[2];
  if (/^\/api\/[a-z0-9-]+/.test(ic)) return true;
  const h = ic.match(/^https:\/\/([A-Za-z0-9.-]+)(?:[/?#:]|['"`]|$)/);
  return !!h && hostlar.includes(h[1].toLowerCase());
}
// (b) tanımlayıcıysa aynı dosyada, çağrıdan önceki en yakın `const|let|var ad = ...` başlangıcına çöz.
function hedefIzinli(arg, metin, konum, hostlar) {
  if (sabitIzinli(arg, hostlar)) return true;
  if (!/^[A-Za-z_$][\w$]*$/.test(arg)) return false;
  const re = new RegExp(`(?:const|let|var)\\s+${arg.replace(/\$/g, '\\$')}\\b[^=\\n]*=\\s*`, 'g');
  let son;
  for (const m of metin.slice(0, konum).matchAll(re)) son = m;
  return !!son && sabitIzinli(metin.slice(son.index + son[0].length), hostlar);
}


const normSatir = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
const istisnaBul = (dosyaAdi, satirMetni) => IZIN_DINAMIK_CAGRI.find((z) => z.dosya === dosyaAdi && normSatir(z.satir) === normSatir(satirMetni));
const FN_ONEK = /^(?:`\$\{FN_URL\}|FN_URL\b|['"`]\/api\/)/;
// İstisnalı çağrıda `url` kaynağını izler. Sorun varsa açıklama döner (HATA), yoksa undefined.
function istisnaDogrula(ist, metin, satirlar, satirIdx, ilkArg) {
  if (ilkArg !== 'url') return "istisna yalnız `url` tanımlayıcılı çağrı için geçerli.";
  if (!ist.izle) return undefined; // ince sarmalayıcı: url parametre; asıl çağrılar ayrıca denetlenir
  // Aynı fonksiyon: çağrıdan önceki en yakın `function` satırından çağrıya kadar `url = ...` atamaları.
  let bas = satirIdx;
  while (bas > 0 && !/\bfunction\s+[\w$]+/.test(satirlar[bas])) bas--;
  for (let i = bas; i <= satirIdx; i++) {
    const m = satirlar[i].match(/(?<![\w$.])url\s*=(?![=>])\s*(.*)$/);
    if (m && i !== bas) {
      const rhs = m[1];
      if (!(FN_ONEK.test(rhs) || sabitIzinli(rhs, IZIN_ISTEMCI_FETCH))) return `url, fonksiyon içinde izinsiz kaynaktan atanıyor: '${rhs.slice(0, 50)}'.`;
    }
  }
  // Parametre ise tüm çağrılar FN_URL ile başlamalı.
  const fn = ist.izle.fonksiyon;
  const re = new RegExp(`(?<![\\w$.])${fn}\\s*\\(`, 'g');
  for (const m of metin.matchAll(re)) {
    const onceki = metin.slice(Math.max(0, m.index - 20), m.index);
    if (/function\s+$/.test(onceki)) continue; // bildirim
    const { ilk } = cagriArgumani(metin, m.index + m[0].length);
    if (!FN_ONEK.test(ilk)) return `${fn}(...) çağrısının ilk argümanı FN_URL ile başlamıyor: '${ilk.slice(0, 50)}'.`;
  }
  if (!hedefIzinli('FN_URL', metin, metin.length, IZIN_ISTEMCI_FETCH)) return 'FN_URL izinli /api/ sabitine çözülmüyor.';
  return undefined;
}

const istemciFetchHostlari = new Set();
const agEnvanteri = [];
let supabaseKullaniliyor = false;

// Varsayılan ret: bu ağ API'leri için src/ içinde hiçbir kullanım serbest değil (gerekçeli istisna yoksa HATA).
const DIGER_AG = [
  { ad: 'XMLHttpRequest', re: /\bnew\s+XMLHttpRequest\b|\bXMLHttpRequest\s*\(/g },
  { ad: 'WebSocket', re: /\bnew\s+WebSocket\b/g },
  { ad: 'EventSource', re: /\bnew\s+EventSource\b/g },
  { ad: 'sendBeacon', re: /\bsendBeacon\s*\(/g },
  { ad: 'new Image', re: /\bnew\s+Image\s*\(/g },
  { ad: 'window.open', re: /\bwindow\.open\s*\(/g },
];
const dinamikIzinli = (dosyaAdi, satirMetni) => !!istisnaBul(dosyaAdi, satirMetni);

for (const f of ISTEMCI) {
  const ad = goreli(f);
  const satirlar = yorumsuz(readFileSync(f, 'utf8'));
  const metin = satirlar.join('\n');
  satirlar.forEach((s, i) => {
    if (/@supabase\/supabase-js|VITE_SUPABASE_URL/.test(s)) supabaseKullaniliyor = true;
    for (const m of s.matchAll(/(?:https?|wss?):\/\/([^\s/'"`<>]*@)?([A-Za-z0-9.*_-]+)/g)) {
      const yer = `${ad}:${i + 1}`;
      if (m[1]) ekle('HATA', 'ag-kimlikli-url', yer, `URL içinde kimlik bilgisi (userinfo '@'): '${m[0]}' — gerçek ana bilgisayar '@' sonrasıdır, izinli liste atlatılabilir.`);
      const host = m[2].toLowerCase();
      if (IZIN_AG_DISI.includes(host)) continue;
      // fetch hedefi mi? Aynı satırda fetch( ya da sonraki 8 satırda fetch( (url önce değişkene atanıyor).
      const pencere = satirlar.slice(i, i + 9).join('\n');
      const fetchHedefi = /\bfetch\(/.test(pencere);
      agEnvanteri.push({ yer, host, tur: fetchHedefi ? 'istemci-fetch' : 'baglanti' });
      if (fetchHedefi) {
        istemciFetchHostlari.add(host);
        if (!IZIN_ISTEMCI_FETCH.includes(host)) {
          ekle('HATA', 'ag-izinsiz-host', yer, `İstemci '${host}' adresine istek atıyor; izinli istemci listesinde yok (${IZIN_ISTEMCI_FETCH.join(', ')}).`);
        }
      } else if (![...IZIN_ISTEMCI_FETCH, ...IZIN_BAGLANTI].includes(host)) {
        ekle('HATA', 'ag-izinsiz-host', yer, `İstemci kodunda izinli listede olmayan ana bilgisayar: '${host}'.`);
      }
    }
    // Protokolsüz '//host/...' dizeleri de ana bilgisayardır.
    for (const m of s.matchAll(/['"`]\/\/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
      const host = m[1].toLowerCase();
      const yer = `${ad}:${i + 1}`;
      agEnvanteri.push({ yer, host, tur: 'protokolsuz' });
      if (![...IZIN_ISTEMCI_FETCH, ...IZIN_BAGLANTI].includes(host)) {
        ekle('HATA', 'ag-izinsiz-host', yer, `Protokolsüz adres ('//${host}'): izinli listede yok.`);
      }
    }
    // Göreli fonksiyon yolları: /api/<ad> için api/<ad>.mjs olmalı (yanlış kodlanmış yol).
    for (const m of s.matchAll(/['"`]\/api\/([a-z0-9-]+)/g)) {
      const fn = m[1];
      const yer = `${ad}:${i + 1}`;
      agEnvanteri.push({ yer, host: `(kendi) /api/${fn}`, tur: 'istemci-fetch' });
      if (!existsSync(yol('api', `${fn}.mjs`))) {
        ekle('HATA', 'ag-api-yolu-yok', yer, `İstemci '/api/${fn}' çağırıyor ama api/${fn}.mjs yok.`);
      }
    }
    // Varsayılan ret: fetch dışı ağ API'leri.
    for (const { ad: apiAd, re } of DIGER_AG) {
      if (new RegExp(re.source).test(s) && !dinamikIzinli(ad, s)) {
        const yer = `${ad}:${i + 1}`;
        agEnvanteri.push({ yer, host: '(dinamik)', tur: 'diger-ag-api' });
        ekle('HATA', 'ag-diger-api', yer, `${apiAd} kullanımı varsayılan olarak reddedilir; gerekçeli istisna yoksa kaldır ya da IZIN_DINAMIK_CAGRI'ya ekle.`);
      }
    }
  });
  // Çağrı yeri analizi: her fetch/fetchFn çağrısının hedefi sabit-izinli olmalı.
  for (const m of metin.matchAll(/(?<![\w$.])(?:globalThis\.|window\.)?(?:fetch|fetchFn)\s*\(/g)) {
    const bas = m.index + m[0].length;
    const satir = satirNo(metin, m.index);
    const satirMetni = satirlar[satir - 1] ?? '';
    const { ilk } = cagriArgumani(metin, bas);
    const ist = istisnaBul(ad, satirMetni);
    if (ist) {
      const sorun = istisnaDogrula(ist, metin, satirlar, satir - 1, ilk);
      if (sorun) ekle('HATA', 'ag-dinamik-hedef', `${ad}:${satir}`, `İstisnalı fetch çağrısı doğrulanamadı: ${sorun}`);
      continue;
    }
    if (!hedefIzinli(ilk, metin, m.index, IZIN_ISTEMCI_FETCH)) {
      ekle('HATA', 'ag-dinamik-hedef', `${ad}:${satir}`, `fetch hedefi izinli sabit değil ('${ilk.slice(0, 60)}'): izinli host içeren sabit dize, böyle bir sabite çözülen tanımlayıcı ya da '/api/...' olmalı.`);
    }
  }
  // Dolaylı çağrı: fetch'i çağrı dışında kullanma (takma ad, argüman, Reflect.apply, .call/.bind), köşeli erişim, dinamik global anahtar.
  satirlar.forEach((s, i) => {
    if (dinamikIzinli(ad, s)) return;
    const yer = `${ad}:${i + 1}`;
    for (const m of s.matchAll(/(?<![\w$])fetch(?![\w$])/g)) {
      const once = s.slice(0, m.index);
      const sonra = s.slice(m.index + 5);
      const nokta = once.match(/([\w$]+)\s*\.\s*$/);
      if (nokta && !['globalThis', 'window'].includes(nokta[1])) { ekle('HATA', 'ag-dolayli-cagri', yer, `'${nokta[1]}.fetch' dolaylı erişim.`); continue; }
      if (/^\s*\(/.test(sonra)) continue; // doğrudan çağrı: hedef yukarıda denetlendi
      if (/^\s*:/.test(sonra) && /[{,]\s*$/.test(once)) continue; // nesne anahtarı (ör. { fetch: ... }) çağrı değil
      ekle('HATA', 'ag-dolayli-cagri', yer, "`fetch` tanımlayıcısı çağrı dışında kullanılıyor (takma ad / argüman / Reflect.apply / call / bind).");
    }
    if (/\[\s*['"`]\s*fe(?:t(?:c(?:h)?)?)?\s*['"`]?/.test(s)) ekle('HATA', 'ag-dolayli-cagri', yer, "Köşeli erişimle 'fetch' kurulabilir (['fet'+'ch'] vb.).");
    if (/(?<![\w$])(?:globalThis|window|self)\s*\[/.test(s)) ekle('HATA', 'ag-dolayli-cagri', yer, 'globalThis[...] / window[...] dinamik anahtar erişimi.');
  });
  // FN_URL sabiti: '/api/<ad>' olmalı VE api/<ad>.mjs var olmalı (izinli dış hosta çevirme de HATA).
  satirlar.forEach((s, i) => {
    const m = s.match(/(?:const|let|var)\s+FN_URL\b[^=\n]*=\s*(.*)$/);
    if (!m) return;
    const yer = `${ad}:${i + 1}`;
    const g = m[1].match(/^(['"`])\/api\/([a-z0-9-]+)\1/);
    if (!g) ekle('HATA', 'ag-fn-url', yer, `FN_URL '/api/<ad>' biçiminde sabit olmalı (bulunan: '${m[1].slice(0, 50)}'); dış host ya da dinamik değer yasak.`);
    else if (!existsSync(yol('api', `${g[2]}.mjs`))) ekle('HATA', 'ag-fn-url', yer, `FN_URL '/api/${g[2]}' ama api/${g[2]}.mjs yok.`);
  });
  // Yönlendirme: location atamaları/assign/replace sağ tarafı sabit göreli yol ('/x' ya da '#x') olmalı.
  const goreliYol = (t) => /^(['"`])(?:\/(?!\/)|#)/.test(t.trim());
  satirlar.forEach((s, i) => {
    if (dinamikIzinli(ad, s)) return;
    const yer = `${ad}:${i + 1}`;
    for (const m of s.matchAll(/(?<![\w$.])(?:(?:window|document|self|top|parent)\.)?location(?:\.href)?\s*=(?![=>])\s*([^;]*)/g)) {
      if (!goreliYol(m[1])) ekle('HATA', 'ag-yonlendirme', yer, `location yönlendirmesi sabit göreli yol değil ('${m[1].trim().slice(0, 50)}'); CSP yönlendirmeyi engellemez.`);
    }
    for (const m of s.matchAll(/(?<![\w$.])(?:(?:window|document|self|top|parent)\.)?location\.(?:assign|replace)\s*\(/g)) {
      const { ilk } = cagriArgumani(satirlar.slice(i).join('\n'), m.index + m[0].length);
      if (!goreliYol(ilk)) ekle('HATA', 'ag-yonlendirme', yer, `location.assign/replace argümanı sabit göreli yol değil ('${ilk.slice(0, 50)}').`);
    }
  });
  // Worker / SharedWorker: ilk argüman sabit göreli yol (ya da new URL('./x', import.meta.url)).
  for (const m of metin.matchAll(/\bnew\s+(?:Shared)?Worker\s*\(/g)) {
    const { ilk } = cagriArgumani(metin, m.index + m[0].length);
    const tamam = /^(['"])(?:\.{1,2}\/|\/(?!\/))[^'"`$]*\1$/.test(ilk)
      || /^new URL\(\s*(['"])\.{1,2}\/[^'"`$]*\1\s*,\s*import\.meta\.url\s*\)$/.test(ilk);
    const satir = satirNo(metin, m.index);
    if (!tamam && !dinamikIzinli(ad, satirlar[satir - 1])) ekle('HATA', 'ag-worker', `${ad}:${satir}`, `Worker kaynağı sabit göreli yol değil ('${ilk.slice(0, 50)}').`);
  }
  // createElement('script'): ardından gelen src atamasının sağ tarafı sabit göreli yol olmalı; src yoksa (satır içi kod) HATA.
  satirlar.forEach((s, i) => {
    if (!/\bcreateElement\s*\(\s*['"`]script['"`]/.test(s) || dinamikIzinli(ad, s)) return;
    const pencere = satirlar.slice(i, i + 9).join('\n');
    const src = pencere.match(/\.src\s*=(?!=)\s*([^;\n]*)/) ?? pencere.match(/setAttribute\(\s*['"`]src['"`]\s*,\s*([^)\n]*)/);
    if (!src || !/^(['"`])(?:\.{1,2}\/|\/(?!\/))/.test(src[1].trim())) {
      ekle('HATA', 'ag-script-elemani', `${ad}:${i + 1}`, `createElement('script') için sabit göreli src atanmıyor (${src ? `'${src[1].trim().slice(0, 40)}'` : 'src yok'}): çalışma zamanında kod yüklenebilir.`);
    }
  });
}

for (const f of SUNUCU) {
  yorumsuz(readFileSync(f, 'utf8')).forEach((s, i) => {
    const yer = `${goreli(f)}:${i + 1}`;
    for (const m of s.matchAll(/(?:https?|wss?):\/\/([^\s/'"`<>]*@)?([A-Za-z0-9.*_-]+)/g)) {
      if (m[1]) ekle('HATA', 'ag-kimlikli-url', yer, `URL içinde kimlik bilgisi (userinfo '@'): '${m[0]}'.`);
      const host = m[2].toLowerCase();
      if (IZIN_AG_DISI.includes(host)) continue;
      agEnvanteri.push({ yer, host, tur: 'sunucu-fetch' });
      if (!IZIN_SUNUCU.includes(host)) {
        ekle('HATA', 'ag-izinsiz-host', yer, `Sunucu fonksiyonu '${host}' adresine gidiyor; izinli sunucu listesinde yok (${IZIN_SUNUCU.join(', ')}).`);
      }
    }
    for (const m of s.matchAll(/['"`]\/\/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
      const host = m[1].toLowerCase();
      agEnvanteri.push({ yer, host, tur: 'protokolsuz' });
      if (!IZIN_SUNUCU.includes(host)) ekle('HATA', 'ag-izinsiz-host', yer, `Protokolsüz adres ('//${host}'): izinli sunucu listesinde yok.`);
    }
  });
}

const BAGIMLILIKLAR = new Set();
try {
  const pj = JSON.parse(oku(yol('package.json')) ?? '{}');
  for (const k of Object.keys({ ...pj.dependencies, ...pj.devDependencies })) BAGIMLILIKLAR.add(k);
} catch { /* package.json yok/bozuk: yalnız göreli yol serbest */ }
// Dinamik kod: import() ilk argümanı sabit göreli yol olmalı; eval / new Function yasak (src + sunucu).
for (const f of [...ISTEMCI, ...SUNUCU]) {
  const ad = goreli(f);
  const satirlar = yorumsuz(readFileSync(f, 'utf8'));
  const metin = satirlar.join('\n');
  for (const m of metin.matchAll(/(?<![\w$.])import\s*\(/g)) {
    const { ilk } = cagriArgumani(metin, m.index + m[0].length);
    const paket = ilk.match(/^(['"])([^'"`$]+)\1$/)?.[2];
    // Serbest: sabit göreli yol ya da package.json bağımlılığı olan sabit paket adı (Vite pakete gömer, ağdan yüklemez).
    if (!(/^(['"])\.{1,2}\/[^'"`$]*\1$/.test(ilk) || (paket && BAGIMLILIKLAR.has(paket)))) {
      ekle('HATA', 'ag-dinamik-import', `${ad}:${satirNo(metin, m.index)}`, `import() ilk argümanı sabit göreli yol değil ('${ilk.slice(0, 50)}'): uzaktan/dinamik modül yüklenebilir.`);
    }
  }
  satirlar.forEach((s, i) => {
    if (/(?<![\w$.])eval\s*\(/.test(s) || /(?<![\w$.])(?:new\s+)?Function\s*\(/.test(s)) {
      ekle('HATA', 'kod-dinamik-calistirma', `${ad}:${i + 1}`, 'eval( / Function( ile dize koddan çalıştırma yasak (ağ izinli listesini ve CSP\'yi atlatır).');
    }
  });
}

// index.html ve public/ altındaki html: dış script/link/img/iframe/source bağlantıları.
const HTML_DOSYALAR = [yol('index.html'), ...dosyalar(yol('public'), ['.html', '.htm'])].filter((f) => existsSync(f));
for (const f of HTML_DOSYALAR) {
  readFileSync(f, 'utf8').split('\n').forEach((s, i) => {
    for (const etiket of s.matchAll(/<(script|link|img|iframe|source|embed|object)\b[^>]*>/gi)) {
      for (const a of etiket[0].matchAll(/\b(?:src|href|data)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi)) {
        const yer = `${goreli(f)}:${i + 1}`;
        const u = a[1];
        const host = (u.replace(/^(?:https?:)?\/\//i, '').split(/[/?#]/)[0] ?? '').toLowerCase();
        agEnvanteri.push({ yer, host, tur: `html-${etiket[1].toLowerCase()}` });
        if (host.includes('@')) ekle('HATA', 'ag-kimlikli-url', yer, `HTML bağlantısında kimlik bilgisi (userinfo '@'): '${u}'.`);
        else if (!IZIN_HTML_DIS.includes(host)) ekle('HATA', 'ag-izinsiz-host', yer, `HTML'de dış kaynak <${etiket[1]}> '${host}' izinli değil (IZIN_HTML_DIS boş).`);
      }
    }
  });
}
// public/ altındaki tüm metin dosyaları (svg, html, txt, json, webmanifest, xml): dış http(s)/'//' URL envanteri.
// svg/html içinde dış href/src/data = HATA (html'de etiket taraması yukarıda), diğer dosyalarda ve diğer URL'lerde UYARI.
const PUBLIC_METIN = dosyalar(yol('public'), ['.svg', '.html', '.htm', '.txt', '.json', '.webmanifest', '.xml']);
for (const f of PUBLIC_METIN) {
  const ad = goreli(f);
  const svgMi = /\.svg$/i.test(f);
  readFileSync(f, 'utf8').split('\n').forEach((s, i) => {
    const yer = `${ad}:${i + 1}`;
    const raporlanan = new Set();
    if (svgMi) {
      for (const a of s.matchAll(/\b(?:xlink:)?(?:href|src|data)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi)) {
        const host = (a[1].replace(/^(?:https?:)?\/\//i, '').split(/[/?#]/)[0] ?? '').toLowerCase();
        raporlanan.add(a[1]);
        agEnvanteri.push({ yer, host, tur: 'public-svg' });
        if (host.includes('@')) ekle('HATA', 'ag-kimlikli-url', yer, `SVG bağlantısında kimlik bilgisi (userinfo '@'): '${a[1]}'.`);
        else if (!IZIN_HTML_DIS.includes(host)) ekle('HATA', 'ag-izinsiz-host', yer, `SVG'de dış kaynak '${host}' izinli değil (IZIN_HTML_DIS boş).`);
      }
    }
    for (const a of s.matchAll(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'<>)]*/g)) {
      if (raporlanan.has(a[0]) || /\.html?$/i.test(f) && /<(script|link|img|iframe|source|embed|object)\b/i.test(s)) continue;
      const host = a[0].replace(/^(?:https?:)?\/\//i, '').split(/[/?#]/)[0].toLowerCase();
      if (IZIN_AG_DISI.includes(host)) continue;
      agEnvanteri.push({ yer, host, tur: 'public-metin' });
      ekle('UYARI', 'public-dis-url', yer, `public/ dosyasında dış adres '${host}' (pakete girer): gerekli mi?`);
    }
  });
}
bilgi.agEnvanteri = agEnvanteri;

/* ───────────── 2. CSP uyumu ───────────── */

function cspConnect(metin) {
  if (!metin) return undefined;
  const m = metin.match(/connect-src([^;"\\]*)/);
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : undefined;
}
const vercelMetin = oku(yol('vercel.json'));
const netlifyMetin = oku(yol('netlify.toml'));
const cspVercel = cspConnect(vercelMetin);
const cspNetlify = cspConnect(netlifyMetin);
bilgi.csp = { vercel: cspVercel, netlify: cspNetlify };

if (!cspVercel) ekle('HATA', 'csp-yok', 'vercel.json', 'connect-src bulunamadı (CSP yok ya da dosya yok).');
if (!cspNetlify) ekle('HATA', 'csp-yok', 'netlify.toml', 'connect-src bulunamadı (CSP yok ya da dosya yok).');
if (cspVercel && cspNetlify && [...cspVercel].sort().join(' ') !== [...cspNetlify].sort().join(' ')) {
  ekle('HATA', 'csp-uyumsuz', 'vercel.json / netlify.toml', `connect-src iki dosyada farklı: vercel=[${cspVercel.join(' ')}] netlify=[${cspNetlify.join(' ')}].`);
}
for (const [ad, csp] of [['vercel.json', cspVercel], ['netlify.toml', cspNetlify]]) {
  if (!csp) continue;
  const hostlar = csp.filter((t) => t !== "'self'").map((t) => t.replace(/^[a-z]+:\/\//, ''));
  // Eksik: istemcinin çağırdığı ama CSP'de olmayan.
  const gerekli = new Set(istemciFetchHostlari);
  if (supabaseKullaniliyor) gerekli.add(SUPABASE_DESENI);
  for (const h of gerekli) {
    if (!hostlar.some((d) => hostEslesir(d, h) || d === h)) {
      ekle('HATA', 'csp-eksik', ad, `İstemci '${h}' adresini çağırıyor ama connect-src'de yok (tarayıcı engeller).`);
    }
  }
  // Fazla: CSP'de olup kodda kullanılmayan.
  for (const d of hostlar) {
    const kullanilan = [...istemciFetchHostlari].some((h) => hostEslesir(d, h)) || (supabaseKullaniliyor && d === SUPABASE_DESENI);
    if (!kullanilan) ekle('UYARI', 'csp-fazla', ad, `connect-src '${d}' izni var ama istemci kodunda bu adrese istek yok (izin daraltılabilir).`);
  }
}

// Netlify yönlendirmesi: her api/<ad>.mjs için toml'da /api/<ad> ve netlify/functions/<ad>.mjs.
for (const f of dosyalar(yol('api'), ['.mjs'])) {
  const ad = goreli(f).replace(/^api\//, '').replace(/\.mjs$/, '');
  if (netlifyMetin !== undefined && !netlifyMetin.includes(`from = "/api/${ad}"`)) {
    ekle('UYARI', 'netlify-yonlendirme-yok', `api/${ad}.mjs`, `netlify.toml'da /api/${ad} yönlendirmesi yok (Netlify'da uç çalışmaz).`);
  }
  if (!existsSync(yol('netlify', 'functions', `${ad}.mjs`))) {
    ekle('UYARI', 'netlify-yonlendirme-yok', `api/${ad}.mjs`, `netlify/functions/${ad}.mjs yok (api/ ince sarmalayıcı; asıl kod orada).`);
  }
}

/* ───────────── 3. Depolama anahtarları ───────────── */

const backupMetin = oku(yol('src', 'backup.ts'));
let yedekAnahtarlar = [];
if (backupMetin) {
  const m = backupMetin.match(/BACKED_UP_KEYS\s*=\s*\[([\s\S]*?)\]/);
  if (m) yedekAnahtarlar = [...yorumsuz(m[1]).join('\n').matchAll(/['"`](fagent\.[a-z0-9._-]+)['"`]/g)].map((x) => x[1]);
}
if (!yedekAnahtarlar.length) ekle('UYARI', 'depolama-yedek-listesi', 'src/backup.ts', 'BACKED_UP_KEYS okunamadı ya da boş; yedeklenen katman karşılaştırması yapılamadı.');

const anahtarYerleri = new Map(); // anahtar -> ilk yer
for (const f of ISTEMCI) {
  yorumsuz(readFileSync(f, 'utf8')).forEach((s, i) => {
    for (const m of s.matchAll(/['"`](fagent\.[a-z0-9._-]+)/g)) {
      if (!anahtarYerleri.has(m[1])) anahtarYerleri.set(m[1], `${goreli(f)}:${i + 1}`);
    }
  });
}
const bilinenCovers = (k) => Object.keys(YEDEKSIZ_BILINEN).find((b) => (b.endsWith('.') ? k.startsWith(b) : k === b));
const yedekliler = [];
const yedeksizAciklanmis = [];
const yedeksizAciklanmamis = [];
for (const [k, yer] of anahtarYerleri) {
  if (yedekAnahtarlar.includes(k)) yedekliler.push(k);
  else if (bilinenCovers(k)) yedeksizAciklanmis.push({ anahtar: k, neden: YEDEKSIZ_BILINEN[bilinenCovers(k)] });
  else {
    yedeksizAciklanmamis.push(k);
    ekle('UYARI', 'depolama-yedeksiz', yer, `'${k}' kalıcı anahtarı BACKED_UP_KEYS'te yok ve açıklanmış istisna değil: yedeğe/SIFIRLA'ya/buluta eklenmeli mi?`);
  }
}
for (const k of yedekAnahtarlar) {
  if (!anahtarYerleri.has(k) && backupMetin && !new RegExp(`['"\`]${k.replace(/\./g, '\\.')}['"\`]`).test(backupMetin.replace(/BACKED_UP_KEYS[\s\S]*?\]/, ''))) {
    // Yalnız listede geçiyor: başka dosyada kullanılan anahtar olabilir; src genelinde geçmiyorsa uyar.
    ekle('UYARI', 'depolama-yedek-olu', 'src/backup.ts', `BACKED_UP_KEYS'teki '${k}' src/ içinde başka yerde kullanılmıyor.`);
  }
}
const haritaMetin = oku(yol('.claude', 'skills', 'veri-akisi-haritasi', 'SKILL.md'));
if (haritaMetin) {
  for (const k of yedekAnahtarlar) {
    if (!haritaMetin.includes(k)) ekle('UYARI', 'depolama-harita', '.claude/skills/veri-akisi-haritasi/SKILL.md', `Yedeklenen '${k}' veri akışı haritası skill'inde yok.`);
  }
}
bilgi.depolama = { yedekli: yedekliler, yedeksizAciklanmis, yedeksizAciklanmamis };

/* ───────────── 4. Paket bütçesi ───────────── */

function distDosyalari(dizin) {
  const c = [];
  if (!existsSync(dizin)) return c;
  for (const ad of readdirSync(dizin)) {
    const t = join(dizin, ad);
    if (statSync(t).isDirectory()) c.push(...distDosyalari(t));
    else c.push(t);
  }
  return c;
}
const distDizin = yol('dist');
if (!existsSync(distDizin)) {
  bilgi.butce = { atlandi: true };
  ekle('BILGI', 'butce-atlandi', 'dist/', 'dist/ yok: paket bütçesi atlandı (önce npm run build).');
} else {
  const dosya = distDosyalari(distDizin);
  const boyut = (f) => statSync(f).size;
  const js = dosya.filter((f) => f.endsWith('.js'));
  const css = dosya.filter((f) => f.endsWith('.css'));
  const jsToplam = js.reduce((a, f) => a + boyut(f), 0);
  const cssToplam = css.reduce((a, f) => a + boyut(f), 0);
  const enBuyuk = js.map((f) => ({ f, b: boyut(f) })).sort((a, b) => b.b - a.b)[0];
  const gzipJs = js.reduce((a, f) => a + gzipSync(readFileSync(f)).length, 0);
  bilgi.butce = { jsToplam, gzipJs, cssToplam, enBuyuk: enBuyuk ? { dosya: goreli(enBuyuk.f), bayt: enBuyuk.b } : null, sinir: BUTCE };
  if (jsToplam > BUTCE.jsToplam) ekle('HATA', 'butce-asimi', 'dist/', `JS toplam ${jsToplam} B > bütçe ${BUTCE.jsToplam} B.`);
  if (enBuyuk && enBuyuk.b > BUTCE.jsEnBuyuk) ekle('HATA', 'butce-asimi', goreli(enBuyuk.f), `En büyük JS parçası ${enBuyuk.b} B > bütçe ${BUTCE.jsEnBuyuk} B.`);
  if (cssToplam > BUTCE.cssToplam) ekle('HATA', 'butce-asimi', 'dist/', `CSS toplam ${cssToplam} B > bütçe ${BUTCE.cssToplam} B.`);
  // dist kaynaktan eskiyse ölçüm bayat olabilir.
  const distZaman = Math.max(0, ...dosya.map((f) => statSync(f).mtimeMs));
  const srcZaman = Math.max(0, ...ISTEMCI.map((f) => statSync(f).mtimeMs));
  if (srcZaman > distZaman) ekle('UYARI', 'butce-bayat', 'dist/', 'dist/, src/ içindeki en yeni dosyadan eski: ölçüm güncel kodu yansıtmıyor olabilir (npm run build).');
}

/* ───────────── 5. Sunucu fonksiyonu koruması ───────────── */

const ortakMetin = oku(yol('netlify', 'ortak', 'sunucu-ortak.mjs'));
const ortakSaglam = !!ortakMetin
  && /export\s+async\s+function\s+yukariAkisaGit[\s\S]*?AbortSignal\.timeout[\s\S]*?redirect:\s*['"]error['"]/.test(ortakMetin);
const yukariAkisaGitKullananlar = [];

for (const f of SUNUCU) {
  const ad = goreli(f);
  const kod = yorumsuz(readFileSync(f, 'utf8'));
  const govde = kod.join('\n');
  const ortakKullanir = /\byukariAkisaGit\s*\(/.test(govde);
  if (ortakKullanir) yukariAkisaGitKullananlar.push(ad);
  // Her ham çağrı AYRI değerlendirilir: kendi çağrı nesnesinde signal ve redirect:'error' olmalı.
  // Varsayılan sarmalayıcı (fetchFn = (...a) => globalThis.fetch(...a)) ve `yukariAkisaGit(fetchFn, ...)` çağrı sayılmaz.
  for (const m of govde.matchAll(/(?<![\w$.])(?:globalThis\.)?(?:fetch|fetchFn)\s*\(/g)) {
    const satir = satirNo(govde, m.index);
    const satirMetni = kod[satir - 1] ?? '';
    if (/=>\s*globalThis\.fetch\(\.\.\.\w+\)/.test(satirMetni) || /fetchFn\s*=\s*\(/.test(satirMetni)) continue;
    const { tum } = cagriArgumani(govde, m.index + m[0].length);
    const zamanAsimi = /\bsignal\b\s*[:,}]/.test(tum) && /AbortSignal\.timeout\s*\(|\.signal\b|AbortController/.test(tum);
    const yonlendirme = /redirect\s*:\s*['"]error['"]/.test(tum);
    if (!zamanAsimi) ekle('HATA', 'sunucu-fetch-korumasiz', `${ad}:${satir}`, 'Bu fetch çağrısının kendi nesnesinde zaman aşımı (signal: AbortSignal.timeout(...)) yok; yukariAkisaGit kullan.');
    if (!yonlendirme) ekle('HATA', 'sunucu-fetch-korumasiz', `${ad}:${satir}`, "Bu fetch çağrısının kendi nesnesinde redirect:'error' yok (yönlendirme ile izinli listeden çıkılabilir); yukariAkisaGit kullan.");
  }
  if (ortakKullanir) {
    if (!ortakSaglam) ekle('HATA', 'sunucu-fetch-korumasiz', ad, 'yukariAkisaGit kullanıyor ama netlify/ortak/sunucu-ortak.mjs içindeki yukariAkisaGit zaman aşımı + redirect:\'error\' içermiyor.');
    // Gövde sınırı: .json()/.text() ile sınırsız okuma (yukarı akış yanıtı için sinirliOku/ilkBaytlariOku gerekir).
    const sinirsiz = kod.findIndex((s) => /\b(?:res|g\.res|response)\.(?:json|text|arrayBuffer)\(/.test(s));
    if (sinirsiz >= 0 && !/sinirliOku|ilkBaytlariOku/.test(govde)) {
      ekle('UYARI', 'sunucu-govde-sinirsiz', `${ad}:${sinirsiz + 1}`, 'Yukarı akış yanıtı sınırsız okunuyor; sinirliOku(res, maks) kullan (bellek).');
    }
  }
  const rnd = kod.findIndex((s) => /Math\.random\(/.test(s));
  if (rnd >= 0) ekle('UYARI', 'sunucu-math-random', `${ad}:${rnd + 1}`, 'Sunucuda Math.random(): güvenlik amaçlıysa crypto.getRandomValues kullan.');
}
bilgi.sunucu = { yukariAkisaGitKullananlar, ortakSaglam };

/* ───────────── 6. VITE_ gizli anahtar adı ───────────── */

// .env* dosyaları okunmaz; yalnız koddaki/yapılandırmadaki VITE_ adları taranır.
const viteDosyalar = [
  ...ISTEMCI, ...SUNUCU,
  ...['vercel.json', 'netlify.toml', 'vite.config.ts', 'index.html'].map((a) => yol(a)).filter((f) => existsSync(f)),
];
const viteAdlari = new Set();
for (const f of viteDosyalar) {
  readFileSync(f, 'utf8').split('\n').forEach((s, i) => {
    for (const m of s.matchAll(/\bVITE_[A-Z0-9_]+/g)) {
      viteAdlari.add(m[0]);
      if (/SECRET|SERVICE_ROLE|PRIVATE/.test(m[0])) {
        ekle('HATA', 'vite-gizli-ad', `${goreli(f)}:${i + 1}`, `'${m[0]}' istemci paketine gömülür; gizli anahtar VITE_ ile başlayamaz.`);
      }
    }
  });
}
bilgi.viteAdlari = [...viteAdlari].sort();

/* ───────────── Çıktı ───────────── */

const sayim = { HATA: 0, UYARI: 0, BILGI: 0 };
for (const b of bulgular) sayim[b.ciddiyet] += 1;

if (JSON_CIKTI) {
  console.log(JSON.stringify({ kok: KOK, sayim, bulgular, bilgi }, null, 2));
} else {
  const L = (s = '') => console.log(s);
  L('FAGENT bölüm sonu denetimi (otomatik kısım)');
  L(`Kök: ${KOK}`);
  L();
  L(`1) Ağ envanteri: ${agEnvanteri.length} adres/yol`);
  const gruplar = new Map();
  for (const a of agEnvanteri) {
    const k = `${a.tur} -> ${a.host}`;
    gruplar.set(k, (gruplar.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...gruplar].sort()) L(`   ${k}  (${n})`);
  L(`2) CSP connect-src: vercel=[${(cspVercel ?? ['-']).join(' ')}]`);
  L(`                    netlify=[${(cspNetlify ?? ['-']).join(' ')}]`);
  L(`3) Depolama: ${yedekliler.length} yedekli, ${yedeksizAciklanmis.length} açıklanmış yedeksiz, ${yedeksizAciklanmamis.length} açıklanmamış`);
  for (const x of yedeksizAciklanmis) L(`   yedeksiz (bilinçli): ${x.anahtar} — ${x.neden}`);
  if (bilgi.butce?.atlandi) L('4) Paket bütçesi: atlandı (dist/ yok)');
  else {
    const b = bilgi.butce;
    L(`4) Paket: JS ${b.jsToplam} B (gzip ${b.gzipJs} B; sınır ${b.sinir.jsToplam}), en büyük ${b.enBuyuk?.dosya} ${b.enBuyuk?.bayt} B (sınır ${b.sinir.jsEnBuyuk}), CSS ${b.cssToplam} B (sınır ${b.sinir.cssToplam})`);
  }
  L(`5) Sunucu: yukariAkisaGit kullanan ${yukariAkisaGitKullananlar.length} dosya; ortak modül ${ortakSaglam ? 'sağlam' : 'EKSİK/BOZUK'}`);
  L(`6) VITE_ adları: ${bilgi.viteAdlari.join(', ') || '(yok)'}`);
  L();
  for (const c of ['HATA', 'UYARI', 'BILGI']) {
    for (const b of bulgular.filter((x) => x.ciddiyet === c)) L(`[${c}] ${b.kural} @ ${b.yer}: ${b.aciklama}`);
  }
  L();
  L(`Sonuç: ${sayim.HATA} HATA, ${sayim.UYARI} UYARI, ${sayim.BILGI} BILGI.${sayim.HATA ? ' (çıkış kodu 1)' : ''}`);
  L('Not: güncel/doğru veri ve ağ dışı yanlış kodlanmış yollar betikle denetlenmez; skill\'e göre ajan/lider inceler.');
}
process.exit(sayim.HATA ? 1 : 0);
