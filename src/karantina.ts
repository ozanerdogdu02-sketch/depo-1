// Karantina: hesaba GİTMEMİŞ yerel verinin, silinmeden önce bu cihazda en çok KARANTINA_OMRU_MS (7 gün)
// ayrı bir anahtarda saklanan tek kopyası. Amaç veri kaybını önlemek (bulut-senkron-arastirma.md 35b/35c, 2b).
//
// Kurallar:
//   * Anahtar BACKED_UP_KEYS'te DEĞİL: yedek dosyasına, buluta ve IndexedDB aynasına GİRMEZ. Yalnız
//     kullanıcının açıkça "indir" demesiyle ayrı bir dosya olarak çıkar.
//   * Kayıt hesap kimliğinin ÖZETİ ile etiketlenir (e-posta ya da düz kullanıcı kimliği yazılmaz). Yalnız aynı
//     hesapla girişte gösterilir; başka hesapla girişte, SIFIRLA'da, hesap silmede ve süre dolunca silinir.
//   * En çok KARANTINA_MAKS_KAYIT (2) kayıt tutulur, en yeni başta. Karara bağlanmamış bir kopyanın üzerine yenisi
//     SESSİZCE yazılmaz (ikinci kayıt olur); üçüncüde en eski düşer. Yazma başarısız olursa (kota) eski kayıtlar
//     OLDUĞU GİBİ kalır (önce silip sonra yazma yok).
//   * Saf modül: depo parametre olarak girer (node --test doğrudan koşar); I/O yalnız verilen depo.
// Gizlilik bedeli: kopya düz metindir ve çıkış sonrası cihazda kalır (ortak cihaz riski); süre sınırı ve
// hesap eşleşmesi bunu dengeler. TODO(hukuk): bu saklamanın aydınlatma/silme yükümlülüğü açısından yeri; aydınlatma metni (canlı-öncesi madde 47, docs/yasal/aydinlatma-kvkk.md) bu cihazdaki karantina kopyasını anlatmalı.
import { KARANTINA_OMRU_MS, KARANTINA_MAKS_KAYIT } from './config/varsayilanlar.ts';

export const QUARANTINE_KEY = 'fagent.quarantine.v1';

export type QuarantineReason =
  | 'oturum-dustu'      // başka sekmeden çıkış, oturum süresi dolması, token hatası
  | 'cikis'             // kullanıcı Çıkış'a bastı; son değişiklikler hesaba gitmemişti
  | 'surum-cakismasi';  // başka cihaz hesabı değiştirmişti; bu cihazın kopyası kaybeden oldu

export interface QuarantineRecord {
  v: 1;
  owner: string;                 // hesap kimliğinin özeti
  savedAt: number;               // ms
  reason: QuarantineReason;
  data: Record<string, string>;  // snapshotUserData() biçimi
}

export interface KVStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultStore(): KVStore | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

// Hesap kimliğinin özeti: yalnızca eşitlik karşılaştırması içindir (güvenlik/şifreleme amacı yok). İki farklı
// tohumlu FNV-1a (32 bit) birleşimi; kimliği bilen biri özetle eşleşmeyi doğrulayabilir, yani gizleme değil
// yalnızca düz yazmama önlemidir.
export function ownerDigest(uid: string): string {
  const run = (seed: number): string => {
    let h = seed;
    for (let i = 0; i < uid.length; i++) {
      h ^= uid.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  return run(0x811c9dc5) + run(0x9747b28c);
}

function validRecord(v: unknown): v is QuarantineRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.v !== 1 || typeof r.owner !== 'string' || typeof r.savedAt !== 'number' || !Number.isFinite(r.savedAt)) return false;
  if (r.reason !== 'oturum-dustu' && r.reason !== 'cikis' && r.reason !== 'surum-cakismasi') return false;
  if (typeof r.data !== 'object' || r.data === null || Array.isArray(r.data)) return false;
  return Object.values(r.data as Record<string, unknown>).every(x => typeof x === 'string');
}

export function deleteQuarantine(store: KVStore | null = defaultStore()): void {
  try { store?.removeItem(QUARANTINE_KEY); } catch { /* yok */ }
}

// Depodaki geçerli kayıtlar (en yeni başta). Tek nesne biçimi (ilk sürüm) ve dizi biçimi okunur.
function readRaw(store: KVStore | null): QuarantineRecord[] {
  if (!store) return [];
  let raw: string | null;
  try { raw = store.getItem(QUARANTINE_KEY); } catch { return []; }
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(validRecord).sort((a, b) => b.savedAt - a.savedAt);
  } catch { return []; }
}

function persist(recs: QuarantineRecord[], store: KVStore): boolean {
  try {
    if (recs.length === 0) store.removeItem(QUARANTINE_KEY);
    else store.setItem(QUARANTINE_KEY, JSON.stringify(recs));
    return true;
  } catch { return false; }
}

// Kaydı ekler. Yazılamazsa (kota) false döner ve ESKİ KAYITLAR OLDUĞU GİBİ KALIR; çağıran bunu bir hata olarak
// ele almalı (veriyi silmeden önce durmalı). Başka hesaba ait / süresi dolmuş kayıtlar yazmadan önce ayıklanır
// (ayıklama da yazma başarısız olursa yapılmaz). Aynı içerikli en yeni kayıt varsa yeni kayıt eklenmez.
export function writeQuarantine(
  uid: string, reason: QuarantineReason, data: Record<string, string>,
  now: number = Date.now(), store: KVStore | null = defaultStore(),
): boolean {
  if (!store) return false;
  const owner = ownerDigest(uid);
  const kept = readRaw(store).filter(r => r.owner === owner && now - r.savedAt < KARANTINA_OMRU_MS);
  const body = JSON.stringify(data);
  if (kept.length > 0 && JSON.stringify(kept[0].data) === body) return true;
  const savedAt = kept.length > 0 && kept[0].savedAt >= now ? kept[0].savedAt + 1 : now; // kimlik olarak kullanılır: benzersiz
  const rec: QuarantineRecord = { v: 1, owner, savedAt, reason, data };
  return persist([rec, ...kept].slice(0, KARANTINA_MAKS_KAYIT), store);
}

// Bu hesap için geçerli kayıtlar (en yeni başta). Süresi dolmuş, bozuk ya da BAŞKA hesaba ait kayıtlar SİLİNİR.
// uid === null: yalnız süre/bozukluk temizliği yapılır (hesap bilinmiyor); başka hesabın kaydı silinmez.
export function listQuarantine(
  uid: string | null, now: number = Date.now(), store: KVStore | null = defaultStore(),
): QuarantineRecord[] {
  if (!store) return [];
  let raw: string | null;
  try { raw = store.getItem(QUARANTINE_KEY); } catch { return []; }
  if (raw === null) return [];
  const all = readRaw(store);
  const alive = all.filter(r => now - r.savedAt < KARANTINA_OMRU_MS && r.savedAt <= now + 60_000);
  const owner = uid === null ? null : ownerDigest(uid);
  const mine = owner === null ? alive : alive.filter(r => r.owner === owner);
  const next = mine.length === 0 ? null : JSON.stringify(mine);
  if (next !== raw) persist(mine, store); // bozuk / süresi dolmuş / başka hesaba ait kayıtlar silinir
  return mine;
}

// En yeni geçerli kayıt (yoksa null).
export function readQuarantine(
  uid: string | null, now: number = Date.now(), store: KVStore | null = defaultStore(),
): QuarantineRecord | null {
  return listQuarantine(uid, now, store)[0] ?? null;
}

// Tek kaydı (savedAt kimliğiyle) siler; kalanlar durur.
export function deleteQuarantineAt(savedAt: number, store: KVStore | null = defaultStore()): void {
  if (!store) return;
  persist(readRaw(store).filter(r => r.savedAt !== savedAt), store);
}

// "indir" için ayrı dosya içeriği: yedek dosyasıyla aynı biçim (Veri Yedeği kartıyla geri yüklenebilir).
export function quarantineFile(rec: QuarantineRecord): { fagentBackup: number; createdAt: string; data: Record<string, string> } {
  return { fagentBackup: 1, createdAt: new Date(rec.savedAt).toISOString(), data: rec.data };
}
