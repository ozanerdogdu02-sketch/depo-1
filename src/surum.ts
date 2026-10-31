// Sürümlü (koşullu) yazım: portfolios.version sütunu ile "yalnız sürüm eşleşirse yaz" (iyimser kilit).
// SAF: Supabase istemcisi burada yok; cloud.ts çağrıyı yapar, sonucu BURADAKİ tek yer yorumlar.
//
// VARSAYIM (tek yerde): koşullu `update ... where user_id=? and version=?` sürüm eşleşmezse HATA DEĞİL,
// BOŞ sonuç (0 satır; `.select('version')` ile boş dizi) döner; ilk kayıt `insert` çakışırsa Postgres
// 23505 (unique_violation) döner; sütun yoksa 42703 (undefined_column) ya da PGRST204 döner.
// TODO(dogrulama): bu üç yanıt biçimi GERÇEK Supabase/PostgREST projesinde DOĞRULANMADI (yalnız sahte
// Supabase taklidiyle sınandı; plan adım 5, migration uygulandıktan sonra iki istemciyle denenecek).

export type YazmaSonucu =
  | { tur: 'ok'; surum: number | null }   // yazıldı; yeni sürüm (bilinmiyorsa null)
  | { tur: 'cakisma' }                     // başka bir yazım araya girdi; hiçbir şey yazılmadı
  | { tur: 'surum-yok' }                   // veritabanında version sütunu yok (eski veritabanı): düz upsert'e düş
  | { tur: 'hata' };                       // ağ/yetki/başka hata: yazılmadı

export interface HataBicimi { code?: string | null; message?: string | null }

// Eski veritabanına düşüş YALNIZ hata koduyla tetiklenir (ileti metnine bakılmaz: başka bir hata iletisinde
// "version" geçmesi düz upsert'e düşürüp koşullu yazımı sessizce kapatmasın).
// 42703 = undefined_column (select/filtre); PGRST204 = PostgREST şema önbelleğinde sütun yok (insert/update gövdesi).
export function surumSutunuYok(error: HataBicimi | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

function surumOku(rows: unknown): number | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const v = (rows[0] as { version?: unknown } | null)?.version;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Koşullu güncellemenin sonucunu yorumlar (var olan satır).
export function guncellemeSonucu(error: HataBicimi | null | undefined, rows: unknown): YazmaSonucu {
  if (error) return surumSutunuYok(error) ? { tur: 'surum-yok' } : { tur: 'hata' };
  if (!Array.isArray(rows)) return { tur: 'hata' };
  if (rows.length === 0) return { tur: 'cakisma' }; // eşleşmeyen sürüm → 0 satır (varsayım, bkz. üst not)
  return { tur: 'ok', surum: surumOku(rows) };
}

// İlk kaydın (satır yok) sonucunu yorumlar.
export function eklemeSonucu(error: HataBicimi | null | undefined, rows: unknown): YazmaSonucu {
  if (error) {
    if (error.code === '23505') return { tur: 'cakisma' }; // satır bu arada başka cihazca eklendi
    return surumSutunuYok(error) ? { tur: 'surum-yok' } : { tur: 'hata' };
  }
  return { tur: 'ok', surum: surumOku(rows) };
}

// Okunan satırdan sürüm: sayı değilse (eski veritabanı ya da beklenmeyen biçim) undefined → düz upsert modu.
export function satirSurumu(row: unknown): number | undefined {
  const v = (row as { version?: unknown } | null)?.version;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
