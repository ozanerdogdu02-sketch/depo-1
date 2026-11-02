// Portföy iç şeması doğrulaması (SAF; hiçbir içe aktarma yok). store.ts load(), otoAktarim.ts, backup.ts (yedek/bulut
// yazma çekirdeği) ve cloud.ts aynı kuralı kullanır: hesaba giren sayı alanları sonlu ve >=0; alan yoksa (eski biçim)
// geçerli; realizedPnl negatif olabilir (zarar). Güvenilmeyen girdi (disk, dosya, bulut) bu kapıdan geçmeden yazılmaz.
// DİKKAT: store.ts bunu modül yüklenirken (load) çağırır; bu dosyada TDZ yaratacak üst düzey const kullanma.

function sayiYok(v: unknown): boolean { return v === undefined || v === null; }
function sonluSayi(v: unknown, negatifOlur = false): boolean { return typeof v === 'number' && Number.isFinite(v) && (negatifOlur || v >= 0); }
function secenekSayi(v: unknown): boolean { return sayiYok(v) || sonluSayi(v); }
function nesneMi(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }

export function portfoyIcSemasiGecerli(p: { holdings: unknown[]; txns: unknown[]; realizedPnl?: unknown }): boolean {
  if (!(sayiYok(p.realizedPnl) || sonluSayi(p.realizedPnl, true))) return false;
  for (const h of p.holdings) {
    if (!nesneMi(h) || !sonluSayi(h.amount) || !secenekSayi(h.costBasis) || !secenekSayi(h.quantity)) return false;
  }
  for (const t of p.txns) {
    if (!nesneMi(t) || !sonluSayi(t.amount) || !secenekSayi(t.commission) || !secenekSayi(t.quantity) || !secenekSayi(t.unitPrice)) return false;
  }
  return true;
}

// Ham metin (localStorage değeri) için: JSON, nesne, holdings/txns dizi ve iç şema geçerli mi.
export function portfoyMetniGecerli(raw: string): boolean {
  try {
    const p = JSON.parse(raw) as unknown;
    return nesneMi(p) && Array.isArray(p.holdings) && Array.isArray(p.txns) && portfoyIcSemasiGecerli(p as { holdings: unknown[]; txns: unknown[]; realizedPnl?: unknown });
  } catch { return false; }
}
