// VITE_SUPABASE_URL doluyken, o proje host'u vercel.json / netlify.toml CSP connect-src'de yoksa dosya adlarını döndürür.
// Saf (dosya okumaz): derleme betiği (build.mjs) metinleri verir. Boş URL -> [] (hesapsız derleme).
export function supabaseCspEksikleri(supabaseUrl, metinler) {
  let host;
  try { host = new URL(String(supabaseUrl ?? '').trim()).hostname.toLowerCase(); } catch { return []; }
  const eksik = [];
  for (const [ad, metin] of Object.entries(metinler)) {
    const m = String(metin ?? '').match(/connect-src([^;"\\]*)/);
    const kaynaklar = m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
    const var_ = kaynaklar.some((t) => {
      const h = t.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0].replace(/:(\d+|\*)$/, '').toLowerCase();
      return h === host;
    });
    if (!var_) eksik.push(ad);
  }
  return eksik;
}
