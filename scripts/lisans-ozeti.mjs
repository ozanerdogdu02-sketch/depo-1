// Üçüncü taraf lisans özeti: package.json'daki doğrudan (dependencies) paketlerin ve onların kurulu
// sürümlerinin lisansını node_modules/*/package.json'dan okur. Yeni bağımlılık YOK. Alıcı due diligence içindir.
// Çıktı: docs/devir/ucuncu-taraf-lisanslar.md  (npm ci sonrası çalıştır: node scripts/lisans-ozeti.mjs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const kapsam = [['Çalışma zamanı (dependencies)', pkg.dependencies ?? {}], ['Geliştirme (devDependencies)', pkg.devDependencies ?? {}]];
const lic = (p) => { const l = p.license ?? (p.licenses && p.licenses.map(x => x.type).join(' OR ')); return typeof l === 'object' ? l.type : (l ?? 'BELİRSİZ'); };
const satirlar = []; const uyari = [];
for (const [baslik, deps] of kapsam) {
  satirlar.push(`\n## ${baslik}\n\n| Paket | Sürüm | Lisans |\n|---|---|---|`);
  for (const ad of Object.keys(deps).sort()) {
    const yol = join('node_modules', ad, 'package.json');
    if (!existsSync(yol)) { satirlar.push(`| ${ad} | (kurulu değil) | — |`); continue; }
    const p = JSON.parse(readFileSync(yol, 'utf8'));
    const l = lic(p);
    satirlar.push(`| ${ad} | ${p.version} | ${l} |`);
    if (!/^(MIT|ISC|BSD|Apache|0BSD|BlueOak|Unlicense|CC0|Python)/i.test(String(l))) uyari.push(`${ad}: ${l}`);
  }
}
const govde = `# Üçüncü taraf lisans özeti\n\nOluşturan: \`scripts/lisans-ozeti.mjs\` (yalnızca doğrudan bağımlılıklar; geçişli bağımlılıklar için \`npm ls\`). Hukuki görüş değildir.\n` +
  (uyari.length ? `\n**İnceleme gerektiren lisanslar (izin verici listede olmayanlar):** ${uyari.join('; ')}\n` : `\nİzin verici listede (MIT/ISC/BSD/Apache…) olmayan doğrudan bağımlılık yok.\n`) + satirlar.join('\n') + '\n';
writeFileSync('docs/devir/ucuncu-taraf-lisanslar.md', govde);
console.log(`Yazıldı: docs/devir/ucuncu-taraf-lisanslar.md (${uyari.length} uyarı)`);
