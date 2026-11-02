// Supabase adresi doğrulaması (SAF). Yalnız https kabul edilir: http: ile anahtar ve oturum düz metin gider.
export function validSupabaseUrl(u: string): boolean {
  try {
    return new URL(u).protocol === 'https:';
  } catch { return false; }
}
