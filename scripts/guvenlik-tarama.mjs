#!/usr/bin/env node
// Deterministik güvenlik taraması — model görüşüne bağlı olmayan, her koşuda aynı sonucu veren
// kontroller. Ajan ekibinin güvenlik incelemesinin ve CI'ın ilk kapısıdır; bir LLM'in "temiz"
// demesinin yerini tutmaz, ondan önce gelir.
//
// Kullanım: npm run guvenlik            (kaynak + varsa dist/ + bağımlılıklar)
//           npm run guvenlik -- --dist   (önce derleme bekler; dist/ yoksa hata verir)
// Çıkış kodu: kritik bulgu varsa 1, yoksa 0. `uyari` çıkışı bozmaz ama raporlanır.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const bulgular = [];
const ekle = (ciddiyet, kural, yer, aciklama) => bulgular.push({ ciddiyet, kural, yer, aciklama });

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
}

// Taranan metin dosyaları: git'in izlediği her şey (node_modules ve dist zaten izlenmez).
const izlenen = git(['ls-files']);
const ikili = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|zip|pdf)$/i;
// Bu betik ve kural belgeleri desenleri tarif ettiği için kendileriyle eşleşir; taranmaz.
const muaf = new Set(['scripts/guvenlik-tarama.mjs']);

// ───────────── 1. Gizli anahtar desenleri ─────────────
const GIZLI = [
  { kural: 'anthropic-anahtari', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { kural: 'openai-anahtari', re: /\bsk-(proj-)?[A-Za-z0-9]{32,}/ },
  { kural: 'supabase-gizli-anahtar', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { kural: 'ozel-anahtar', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kural: 'aws-erisim-anahtari', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kural: 'github-belirteci', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { kural: 'stripe-gizli-anahtar', re: /\bsk_live_[A-Za-z0-9]{20,}/ },
  { kural: 'atanmis-gizli-degisken', re: /\b(EVDS_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{12,}/ },
];
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function jwtRolu(payloadB64) {
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')).role;
  } catch {
    return undefined;
  }
}

function metniTara(yer, metin) {
  for (const { kural, re } of GIZLI) {
    const m = metin.match(re);
    if (m) ekle('kritik', kural, yer, `Gizli anahtar deseni bulundu: ${m[0].slice(0, 12)}…`);
  }
  for (const m of metin.matchAll(JWT)) {
    const rol = jwtRolu(m[1]);
    if (rol === 'service_role') ekle('kritik', 'supabase-service-role', yer, 'service_role JWT — tüm RLS politikalarını atlar, istemcide/repoda asla bulunmamalı.');
    else ekle('uyari', 'jwt', yer, `JWT bulundu (rol: ${rol ?? 'bilinmiyor'}). Yalnızca anon/publishable anahtarsa kabul edilebilir — doğrula.`);
  }
}

for (const f of izlenen) {
  if (ikili.test(f) || muaf.has(f) || !existsSync(f) || statSync(f).size > 2_000_000) continue;
  metniTara(f, readFileSync(f, 'utf8'));
}

// ───────────── 2. İzlenen ortam dosyası ─────────────
for (const f of izlenen) {
  if (/(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f)) {
    ekle('kritik', 'izlenen-env', f, '.env dosyası git tarafından izleniyor — gizli değerler repoya girer.');
  }
}

// ───────────── 3. Tarayıcıya inen gizli değişken adı ─────────────
// VITE_ önekli her değişken derlemede istemci paketine gömülür.
const VITE_GIZLI = /\bVITE_[A-Z0-9_]*(SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN|API_KEY)[A-Z0-9_]*/;
for (const f of izlenen) {
  if (!/\.(ts|tsx|js|mjs|cjs|json|html|example|toml|ya?ml)$/.test(f) || muaf.has(f) || !existsSync(f)) continue;
  const m = readFileSync(f, 'utf8').match(VITE_GIZLI);
  if (m) ekle('kritik', 'vite-gizli-degisken', f, `${m[0]} — VITE_ önekli değişken tarayıcıya iner; gizli değer taşıyamaz.`);
}

// ───────────── 4. Tehlikeli DOM/çalıştırma noktaları ─────────────
const TEHLIKELI = [
  { kural: 'dangerouslySetInnerHTML', re: /dangerouslySetInnerHTML/ },
  { kural: 'innerHTML-atama', re: /\.(inner|outer)HTML\s*=/ },
  { kural: 'eval', re: /\beval\s*\(/ },
  { kural: 'new-Function', re: /new\s+Function\s*\(/ },
  { kural: 'document.write', re: /document\.write\s*\(/ },
];
for (const f of izlenen.filter(f => /^src\/.*\.(ts|tsx)$/.test(f))) {
  const metin = readFileSync(f, 'utf8');
  for (const { kural, re } of TEHLIKELI) if (re.test(metin)) ekle('uyari', kural, f, 'Kullanıcı verisi buraya ulaşabiliyorsa XSS/kod çalıştırma riski — gerekçesini doğrula.');
}

// ───────────── 5. Derleme çıktısı ─────────────
const distIste = process.argv.includes('--dist');
if (existsSync('dist')) {
  const yuru = d => readdirSync(d).flatMap(n => (statSync(join(d, n)).isDirectory() ? yuru(join(d, n)) : [join(d, n)]));
  for (const f of yuru('dist')) if (!ikili.test(f)) metniTara(f, readFileSync(f, 'utf8'));
} else if (distIste) {
  ekle('kritik', 'dist-yok', 'dist/', '--dist istendi ama derleme çıktısı yok; önce npm run build.');
}

// ───────────── 6. Bağımlılık açıkları ─────────────
let audit = 'calismadi';
try {
  const cikti = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  audit = JSON.parse(cikti);
} catch (e) {
  // npm audit açık bulunca da 1 ile çıkar; JSON yine stdout'tadır.
  try { audit = JSON.parse(e.stdout); } catch { audit = 'calismadi'; }
}
if (audit === 'calismadi' || !audit.metadata) {
  ekle('uyari', 'npm-audit', 'package-lock.json', 'npm audit çalıştırılamadı (ağ?) — bağımlılık açıkları DOĞRULANMADI.');
} else {
  const v = audit.metadata.vulnerabilities || {};
  if ((v.critical || 0) + (v.high || 0) > 0) ekle('kritik', 'npm-audit', 'package-lock.json', `Üretim bağımlılıklarında ${v.critical || 0} kritik, ${v.high || 0} yüksek açık.`);
  else if ((v.moderate || 0) > 0) ekle('uyari', 'npm-audit', 'package-lock.json', `Üretim bağımlılıklarında ${v.moderate} orta seviye açık.`);
}

// ───────────── Rapor ─────────────
const kritik = bulgular.filter(b => b.ciddiyet === 'kritik');
const uyari = bulgular.filter(b => b.ciddiyet === 'uyari');
console.log(`Güvenlik taraması: ${izlenen.length} izlenen dosya${existsSync('dist') ? ' + dist/' : ''}, npm audit ${audit === 'calismadi' || !audit.metadata ? 'ÇALIŞMADI' : 'çalıştı'}.`);
for (const b of [...kritik, ...uyari]) console.log(`${b.ciddiyet === 'kritik' ? '✗ KRİTİK' : '! uyarı '} [${b.kural}] ${b.yer} — ${b.aciklama}`);
console.log(`SONUÇ: ${kritik.length} kritik, ${uyari.length} uyarı.`);
process.exit(kritik.length ? 1 : 0);
