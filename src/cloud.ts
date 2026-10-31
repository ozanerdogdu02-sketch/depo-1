// Hesap ve bulut senkronu (Supabase). Tamamen OPSİYONEL:
// - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY tanımlı değilse bulut kapalıdır:
//   Supabase istemcisi oluşturulmaz (kütüphane bile yüklenmez — dinamik import), hiçbir ağ
//   isteği atılmaz ve uygulama bugünkü gibi yalnızca tarayıcıda (localStorage) çalışır.
// - Bulut yalnızca kullanıcı AÇIKÇA giriş yaptıktan sonra devreye girer; anonim oturum yok.
// - Giriş yapan kullanıcının TÜM kullanıcı katmanları (backup.ts → BACKED_UP_KEYS: portföy,
//   ajan hafızası, öğretilen bilgi, vergi oranları, hedef dağılım) `portfolios` tablosunda tek
//   satır (jsonb) olarak tutulur; satır erişimi RLS ile yalnızca sahibine açıktır.
//
// Satır biçimi (yazılan):   { fagentBackup: 1, data: snapshotUserData() }
// Okunan biçimler:
//   (i)   yeni biçim                     → applyUserData(..., 'replace')
//   (ii)  eski standalone biçimi (çıplak PortfolioState: düz nesne, holdings/txns dizi,
//         fagentBackup alanı yok)        → yalnızca portföy, 'portfolioOnly' (diğer katmanlar korunur)
//   (iii) tanınmayan biçim               → localStorage'a HİÇBİR ŞEY yazılmaz, upsert yapılmaz.
// Bulut satırı, kullanıcının kendi satırı olsa da GÜVENİLMEYEN girdidir (kullanıcı kendi
// token'ıyla REST'e rastgele jsonb yazabilir) — bu yüzden yalnızca backup.ts'in ortak
// doğrula-yaz çekirdeğinden (applyUserData) geçer.
//
// OTURUM GÜVENLİĞİ: Supabase istemcisi PKCE akışıyla kurulur (flowType: 'pkce'). Varsayılan
// 'implicit' akışta URL fragment'indeki access_token+refresh_token çifti HİÇBİR doğrulama olmadan
// oturum olarak benimsenirdi — saldırganın hazırladığı bir bağlantıyla kurban sessizce saldırganın
// hesabına girerdi (login CSRF) ve ortak cihazda token'lar tarayıcı geçmişine düşerdi. PKCE'de
// e-posta bağlantıları `?code=` taşır ve kod yalnızca akışı BAŞLATAN tarayıcıdaki code_verifier ile
// oturuma çevrilir; hash'te token taşıyan bir URL ise (ayrıca getClient'ta URL'den silinir) asla
// oturum olmaz. Bedeli: doğrulama / şifre sıfırlama bağlantısı, isteğin yapıldığı tarayıcıda
// açılmalıdır (başka tarayıcıda açılırsa kod değişmez; kullanıcı yeniden dener / şifreyle girer).
//
// GİRİŞTE VERİ SAHİPLİĞİ: bulutta kayıt YOKSA ve bu tarayıcıda veri varsa, sahiplik işareti bu
// hesabı göstermiyorsa veri hesaba OTOMATİK yüklenmez (hesapsız kullanımda işaret hiç yazılmaz;
// verinin kime ait olduğu bilinmez — ortak cihazda başka birinin verisi olabilir). Kullanıcıya
// 'cakisma' durumuyla açık seçim sunulur: yükle / sil / çıkış (bkz. resolveConflict).
//
// KARANTİNA (35b/35c, src/karantina.ts): oturum düşüşünde (başka sekmeden çıkış, süre dolması) ve kullanıcının
// Çıkış'ında hesaba GİTMEMİŞ yerel veri silinmez; hesap kimliğinin özetiyle etiketli tek kopya olarak bu
// cihazda en çok 7 gün saklanır. Aynı hesapla girişte 'indir / hesaba yükle / sil' sorulur; başka hesapla
// girişte, SIFIRLA'da, hesap silmede ve süre dolunca silinir. Karantina buluta ve yedek dosyasına GİRMEZ.
//
// SÜRÜMLÜ YAZIM (27, src/surum.ts + supabase/migrations/20261031000000_portfolios_version.sql): satırda
// `version` sütunu varsa yazım 'yalnız sürüm eşleşirse' yapılır; eşleşmezse bu cihazın kopyası karantinaya
// alınır ve kullanıcıya çakışma kartı çıkar (bulut ezilmez). Sütun yoksa (eski veritabanı) düz upsert'e düşülür.
//
// GİZLİLİK: bu modül console'a, analitiğe ya da telemetriye veri, e-posta, user id veya ham
// hata gövdesi YAZMAZ. Hatalar kullanıcıya yalnızca sabit Türkçe mesajlarla gösterilir.
// Supabase dışında hiçbir uca kullanıcı verisi gitmez.
import { useSyncExternalStore } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { subscribePortfolio } from './store';
import {
  applyUserData, snapshotUserData, subscribeUserData, whitelistUserData, BACKED_UP_KEYS,
  type ApplyMode,
} from './backup';
import { clearForSignOut, getCloudOwner, getCloudBase, setCloudOwner } from './localData';
import {
  deleteQuarantine, deleteQuarantineAt, listQuarantine, quarantineFile, writeQuarantine,
  type QuarantineReason,
} from './karantina';
import { eklemeSonucu, guncellemeSonucu, satirSurumu, surumSutunuYok, type YazmaSonucu } from './surum';

// ---- Yapılandırma ----

function readEnv(v: string | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

function validSupabaseUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch { return false; }
}

const SUPABASE_URL = readEnv(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_KEY = readEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY && validSupabaseUrl(SUPABASE_URL));

const TABLE = 'portfolios';
const ROW_FORMAT_VERSION = 1;
// İstemci tarafı boyut sınırı (JSON.stringify uzunluğu). Migration'daki
// pg_column_size(data) < 2000000 kısıtının altında kalır; okuma da aynı sınırla korunur.
// TODO(hukuk): bulut senkronu açılacaksa KVKK aydınlatma/açık rıza, veri işleyen (Supabase) sözleşmesi ve yurt dışına aktarım gözden geçirilmedi.
export const MAX_SYNC_CHARS = 1_500_000;
// Kayıt gecikmesi — kısa tutuldu: kullanıcının başlatmadığı bir oturum düşüşünde yerel veri
// temizlenir; henüz gönderilmemiş son değişikliğin kaybolma penceresi bu kadardır.
const SAVE_DEBOUNCE_MS = 1000;
// Uzak veri uygulandıktan sonraki sayfa yenilemesini oturum başına bir kezle sınırlar.
const RELOAD_FLAG = 'fagent.cloud.reloaded.v1';

let clientPromise: Promise<SupabaseClient> | null = null;

function stripTokensFromUrl(): void {
  try {
    if (/(^#|&)(access_token|refresh_token|provider_token|provider_refresh_token)=/.test(window.location.hash)) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  } catch { /* yok */ }
}

function getClient(): Promise<SupabaseClient> | null {
  if (!cloudEnabled) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(m => {
      // PKCE'de meşru hiçbir bağlantı hash'te token taşımaz; taşıyorsa enjeksiyon girişimidir.
      // Kütüphane görmeden URL'den silinir (oturum olmaz, token'lar geçmişte/adres çubuğunda kalmaz).
      stripTokensFromUrl();
      return m.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    });
  }
  return clientPromise;
}

// ---- Durum (React'e useCloud ile açılır) ----

// 'cakisma': bulutta farklı veri var VE bu tarayıcıda (hesaba ait olduğu bilinmeyen ya da
// eşitlemeden sonra değişmiş) veri var. Bu durumda bulut verisi OTOMATİK uygulanmaz ve
// upsert YAPILMAZ; kullanıcı resolveConflict() ya da signOut() ile karar verir.
export type SyncStatus = 'kapali' | 'bekliyor' | 'senkron' | 'kaydediliyor' | 'hata' | 'cakisma';

export interface CloudState {
  ready: boolean; // ilk oturum kontrolü bitti mi
  email: string | null;
  status: SyncStatus;
  recovery: boolean; // şifre sıfırlama bağlantısıyla gelindi, yeni şifre bekleniyor
  error: string | null;
  // status === 'cakisma' iken türü:
  //   'bulut-kaydi-var' — hesabında farklı bir kayıt var VE bu tarayıcıda veri var
  //   'bulut-bos'       — hesabında kayıt yok, bu tarayıcıda sahibi belirsiz veri var; yükleme onayı bekliyor
  conflictKind: ConflictKind | null;
  // Bu hesaba ait, hesaba gitmemiş yerel kopya bu cihazda saklanıyor mu (karantina.ts)? İçerik burada TUTULMAZ.
  // Kayıt kimliği = savedAt (en yeni başta, en çok KARANTINA_MAKS_KAYIT).
  quarantine: { savedAt: number; reason: QuarantineReason }[];
  // Sürüm çakışmasında bu cihazın kopyası saklanamadı (yer yok): kart "önce yedeğini indir" uyarısını gösterir.
  conflictCopyFailed: boolean;
}

export type ConflictKind = 'bulut-kaydi-var' | 'bulut-bos';

let cloud: CloudState = { ready: !cloudEnabled, email: null, status: 'kapali', recovery: false, error: null, conflictKind: null, quarantine: [], conflictCopyFailed: false };
const listeners = new Set<() => void>();

function set(patch: Partial<CloudState>): void {
  // Çakışma durumundan çıkılınca tür de temizlenir.
  if (patch.status !== undefined && patch.status !== 'cakisma' && patch.conflictKind === undefined) {
    patch = { ...patch, conflictKind: null, conflictCopyFailed: false };
  }
  cloud = { ...cloud, ...patch };
  listeners.forEach(fn => fn());
}

export function getCloudState(): CloudState {
  return cloud;
}

export function useCloud(): CloudState {
  return useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => cloud,
  );
}

// ---- Yardımcılar ----

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// JSON metnini anahtarları sıralı biçimde yeniden üretir — jsonb anahtar sırasını değiştirdiği
// için (eski biçimli satır) karşılaştırmada ham metin kullanılamaz.
function canonicalJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), (_k, v: unknown) =>
      isPlainObject(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  } catch { return text; }
}

function canonicalSnapshot(data: Record<string, string>): string {
  const parts: Record<string, string> = {};
  for (const key of BACKED_UP_KEYS) {
    if (typeof data[key] === 'string') parts[key] = canonicalJson(data[key]);
  }
  return JSON.stringify(parts);
}

// FNV-1a 32 bit — yalnızca "değişti mi" karşılaştırması için; güvenlik amacı yok.
function hashSnapshot(data: Record<string, string>): string {
  const s = canonicalSnapshot(data);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function portfolioOnboarded(data: Record<string, string>): boolean {
  const raw = data['fagent.portfolio.v1'];
  if (typeof raw !== 'string') return false;
  try {
    const p = JSON.parse(raw) as { onboarded?: unknown };
    return p?.onboarded === true;
  } catch { return false; }
}

function hasTrainedFacts(data: Record<string, string>): boolean {
  const raw = data['fagent.agent.training.v1'];
  if (typeof raw !== 'string') return false;
  try {
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) && p.length > 0;
  } catch { return false; }
}

function hasLayer(data: Record<string, string>, key: string): boolean {
  return typeof data[key] === 'string' && data[key].length > 0;
}

// Yerelde kaybedilmesi üzücü (ya da hesaba gitmemesi gereken) veri var mı?
//   'replace'       — bulut verisi yerelin YERİNE geçer: onboarded portföy, öğretilen bilgi VE
//                     kullanıcının girdiği vergi oranı / hedef dağılım / ajan belleği (portföysüz
//                     olsa bile) kaybolur → hepsi sayılır.
//   'portfolioOnly' — yalnızca portföy yazılır, diğer katmanlar korunur → onboarded portföy ya da
//                     öğretilen bilgi (eski davranış).
function localHasData(data: Record<string, string>, mode: ApplyMode = 'replace'): boolean {
  if (portfolioOnboarded(data) || hasTrainedFacts(data)) return true;
  if (mode === 'portfolioOnly') return false;
  return hasLayer(data, 'fagent.tax.v1') || hasLayer(data, 'fagent.target.v1') || hasLayer(data, 'fagent.agent.memory.v1');
}

interface ParsedRemote {
  mode: ApplyMode;
  payload: Record<string, string>; // applyUserData'ya verilecek (beyaz listeden geçecek)
}

// Bulut satırının biçimini tanır. Tanınmazsa undefined — çağıran HİÇBİR ŞEY yazmaz.
export function parseRemoteRow(value: unknown): ParsedRemote | undefined {
  if (!isPlainObject(value)) return undefined;
  if ('fagentBackup' in value) {
    if (value.fagentBackup !== ROW_FORMAT_VERSION || !isPlainObject(value.data)) return undefined;
    const pairs = whitelistUserData(value.data, 'replace');
    if (!pairs || pairs.length === 0) return undefined;
    return { mode: 'replace', payload: Object.fromEntries(pairs) };
  }
  // Eski standalone biçimi: çıplak PortfolioState.
  if (Array.isArray(value.holdings) && Array.isArray(value.txns)) {
    return { mode: 'portfolioOnly', payload: { 'fagent.portfolio.v1': JSON.stringify(value) } };
  }
  return undefined;
}

// Uzak veri uygulanınca yerelin alacağı hâl (karşılaştırma için; hiçbir şey yazmaz).
function effectiveAfterApply(remote: ParsedRemote, local: Record<string, string>): Record<string, string> {
  return remote.mode === 'replace' ? { ...remote.payload } : { ...local, ...remote.payload };
}

function sizeOk(value: unknown): boolean {
  try {
    return JSON.stringify(value).length <= MAX_SYNC_CHARS;
  } catch { return false; }
}

// ---- Senkron ----

let userId: string | null = null;
// Uzak veri uygulanırken / yerel temizlik yapılırken kayıt zamanlanmasın.
let suppress = false;
// İlk okuma başarıyla bitip karar verilene kadar upsert yapılmaz (okunamayan bulutun
// üzerine yerel veri yazılmasın).
let syncReady = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
// Kullanıcı Çıkış/Hesabı sil'e bastı mı (SIGNED_OUT olayının kaynağını ayırmak için).
let userInitiatedSignOut = false;
// Çakışma durumundaki uzak veri + yerel verinin bu hesaba ait olup olmadığı.
// remote === null: bulutta kayıt yok, bekleyen şey bu tarayıcıdaki verinin hesaba yüklenme onayı.
let pendingRemote: { uid: string; remote: ParsedRemote | null; localOwned: boolean } | null = null;
// Sürümlü yazım durumu: 'yes' = portfolios.version var; 'no' = yok (eski veritabanı → düz upsert);
// 'unknown' = henüz okunmadı. knownVersion: okunan satırın sürümü; null = bulutta satır yok (ilk kayıt = insert).
let versionMode: 'unknown' | 'yes' | 'no' = 'unknown';
let knownVersion: number | null = null;
// Girişliyken SIFIRLA yapıldı, yeniden kurulum henüz olmadı: kayıt gitmez; yeniden kurulunca bulut kopyasıyla
// karşılaştırılır (pull) ve çakışmada kullanıcıya sorulur (34+33).
let localResetPending = false;

function describeQuarantine(uid: string | null): CloudState['quarantine'] {
  return listQuarantine(uid).map(r => ({ savedAt: r.savedAt, reason: r.reason }));
}

function cancelSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function scheduleSave(): void {
  if (!userId || suppress || !syncReady || cloud.status === 'cakisma') return;
  cancelSave();
  const uid = userId;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void save(uid);
  }, SAVE_DEBOUNCE_MS);
}

// YA HEP YA HİÇ: portföy anahtarı yoksa ya da onboarded=false ise HİÇBİR katman gönderilmez.
// Böylece SIFIRLA'dan ya da çıkıştan sonra boş/kısmi bir anlık görüntü buluttaki tam satırın
// üzerine yazılamaz.
// Girişliyken SIFIRLA'dan sonra yeniden kurulum (örnek veri / boş başlangıç) buluttaki satırı SORMADAN
// ezmez: ilk kayıt denemesinde pull() ile bulut kopyasıyla karşılaştırılır, farklıysa çakışma kartı çıkar (34+33).
async function save(uid: string): Promise<void> {
  if (suppress || !syncReady || userId !== uid || cloud.status === 'cakisma') return;
  const client = getClient();
  if (!client) return;
  const snapshot = snapshotUserData();
  if (!portfolioOnboarded(snapshot)) {
    set({ status: 'senkron', error: null });
    return;
  }
  // Bu hesabın sahiplik işareti yoksa (başka sekmede SIFIRLA yapıldı ya da hiç eşitlenmedi) bayrak açıkmış gibi
  // davranılır: hesaptaki kayıt sormadan ezilmez, önce bulutla karşılaştırılır (bayrak yalnız bu sekmenin belleğindedir).
  if (localResetPending || getCloudOwner() !== uid) {
    localResetPending = false;
    await pull(uid, true);
    return;
  }
  const body = { fagentBackup: ROW_FORMAT_VERSION, data: snapshot };
  if (!sizeOk(body)) {
    set({ status: 'hata', error: 'Veri, hesap senkronu için çok büyük; buluta kaydedilmedi.' });
    return;
  }
  set({ status: 'kaydediliyor' });
  let result: YazmaSonucu;
  try {
    result = await writeRow(await client, uid, body);
  } catch {
    result = { tur: 'hata' };
  }
  if (userId !== uid) return; // bu arada çıkış yapıldı
  if (result.tur === 'cakisma') {
    // Başka bir cihaz hesabı değiştirmiş: bu cihazın kopyası kaybeden olur ama SİLİNMEZ (karantina);
    // bulut ezilmez; güncel bulut kaydı okunur ve kullanıcıya çakışma kartı çıkar.
    // Karara bağlanmamış eski kopya varsa üzerine yazılmaz (ikinci kayıt olur); yer yoksa eskiler dokunulmadan kalır.
    const saved = writeQuarantine(uid, 'surum-cakismasi', snapshot);
    const newId = saved ? listQuarantine(uid)[0]?.savedAt : undefined;
    set({ quarantine: describeQuarantine(uid) });
    syncReady = false;
    await pull(uid);
    if (userId === uid && cloud.status === 'senkron') {
      // Çakışma yokmuş (içerikler eşit çıktı): bu kopya gereksiz; yalnız o kayıt silinir.
      if (newId !== undefined) deleteQuarantineAt(newId);
      set({ quarantine: describeQuarantine(uid) });
    } else if (userId === uid && getCloudState().status === 'cakisma' && !saved) {
      set({ conflictCopyFailed: true });
    }
    return;
  }
  if (result.tur !== 'ok') {
    set({ status: 'hata', error: 'Buluta kaydedilemedi.' });
    return;
  }
  setCloudOwner(uid, hashSnapshot(snapshot));
  set({ status: 'senkron', error: null });
}

// Satırı yazar. Sürüm sütunu varsa KOŞULLU (yalnız sürüm eşleşirse), yoksa bugünkü düz upsert.
// Eşleşmeyen sürüm / çift ilk kayıt yorumu src/surum.ts'te tek yerdedir (gerçek projede doğrulanmadı).
async function writeRow(supabase: SupabaseClient, uid: string, body: unknown): Promise<YazmaSonucu> {
  const updated_at = new Date().toISOString();
  if (versionMode === 'yes') {
    let r: YazmaSonucu;
    if (knownVersion === null) {
      const { data, error } = await supabase.from(TABLE).insert({ user_id: uid, data: body, updated_at }).select('version');
      r = eklemeSonucu(error, data);
    } else {
      const { data, error } = await supabase.from(TABLE)
        .update({ data: body, updated_at }).eq('user_id', uid).eq('version', knownVersion).select('version');
      r = guncellemeSonucu(error, data);
    }
    if (r.tur === 'ok') {
      if (r.surum === null) versionMode = 'no'; // sürüm okunamadı: koşullu yazıma güvenilmez
      else knownVersion = r.surum;
      return r;
    }
    if (r.tur !== 'surum-yok') return r;
    versionMode = 'no'; // sütun yok (eski veritabanı): bugünkü davranışa düş
  }
  const { error } = await supabase.from(TABLE).upsert({ user_id: uid, data: body, updated_at });
  return error ? { tur: 'hata' } : { tur: 'ok', surum: null };
}

// Uzak veriyi uygular ve (gerekirse) sayfayı BİR KEZ yeniler — dosyadan geri yüklemeyle aynı
// yöntem: modüllerin bellekteki durumu ancak yeniden yüklemeyle tazelenir.
function applyRemote(uid: string, remote: ParsedRemote): void {
  cancelSave();
  suppress = true; // tazeleme bitene kadar (yeniden yüklemeye dek) kayıt zamanlanmaz
  const result = applyUserData(remote.payload, { mode: remote.mode });
  if (!result.ok) {
    suppress = false;
    syncReady = false;
    set({ status: 'hata', error: 'Hesaptaki veri bu tarayıcıya yazılamadı.' });
    return;
  }
  setCloudOwner(uid, hashSnapshot(snapshotUserData()));
  pendingRemote = null;
  reloadOnce();
}

function reloadOnce(): void {
  let alreadyReloaded = false;
  try { alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { /* yok */ }
  if (alreadyReloaded) {
    // Döngü koruması: bu oturumda zaten bir kez yenilendi. Bellekteki durum eski olabilir;
    // eski durum bulutu ezmesin diye senkron kapalı kalır, kullanıcıdan yenilemesi istenir.
    syncReady = false;
    set({ status: 'hata', error: 'Hesabındaki veri yüklendi. Görmek için sayfayı yenile.' });
    return;
  }
  try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* yok */ }
  window.location.reload();
}

async function pull(uid: string, afterReset = false): Promise<void> {
  const client = getClient();
  if (!client) return;
  syncReady = false;
  pendingRemote = null;
  localResetPending = false;
  set({ status: 'bekliyor', error: null });

  // Hesaplar arası sızıntı koruması: yerel veri BAŞKA bir hesaba aitse, bu hesaba YÜKLENMEZ;
  // önce temizlenir (seed yapılmaz).
  const owner = getCloudOwner();
  if (owner && owner !== uid) {
    suppress = true;
    try { clearForSignOut(); } finally { suppress = false; } // başka hesabın karantinası da burada silinir
  }
  set({ quarantine: describeQuarantine(uid) }); // başka hesaba ait / süresi dolmuş kayıt okunurken silinir

  let row: unknown;
  try {
    const supabase = await client;
    const fetchRow = async (cols: string) => {
      const r = await supabase.from(TABLE).select(cols).eq('user_id', uid).maybeSingle();
      return { data: r.data as unknown, error: r.error };
    };
    let res = await fetchRow(versionMode === 'no' ? 'data' : 'data,version');
    if (res.error && versionMode !== 'no' && surumSutunuYok(res.error)) {
      versionMode = 'no'; // eski veritabanı: sürüm sütunu yok → düz upsert modu
      res = await fetchRow('data');
    }
    if (userId !== uid) return;
    if (res.error) {
      set({ status: 'hata', error: 'Bulut verisi okunamadı.' });
      return;
    }
    const rec = res.data as { data?: unknown } | null;
    row = rec?.data;
    if (versionMode !== 'no') {
      if (rec === null || rec === undefined) { versionMode = 'yes'; knownVersion = null; }
      else {
        const v = satirSurumu(rec);
        if (v === undefined) versionMode = 'no'; else { versionMode = 'yes'; knownVersion = v; }
      }
    }
  } catch {
    if (userId === uid) set({ status: 'hata', error: 'Bulut verisi okunamadı.' });
    return;
  }

  const local = snapshotUserData();
  const localHash = hashSnapshot(local);
  const ownedByThisUser = getCloudOwner() === uid;

  if (row === undefined || row === null) {
    if (ownedByThisUser || afterReset || !localHasData(local)) {
      // Güvenli yol: yerel veri bu hesaba ait (işaret bu uid) ya da yerelde yüklenecek hiçbir şey
      // yok. İşaret bu noktadan sonra bu hesabı gösterir.
      syncReady = true;
      setCloudOwner(uid, localHash);
      clearReloadFlag();
      await save(uid);
      if (userId === uid && cloud.status === 'bekliyor') set({ status: 'senkron', error: null });
      return;
    }
    // Bu tarayıcıdaki verinin kime ait olduğu bilinmiyor (sahiplik işareti yok: girişten önce,
    // hesapsız kullanılmış — ortak cihazda başkasının verisi olabilir). Kullanıcı açıkça onaylamadan
    // buluta HİÇBİR ŞEY gönderilmez: syncReady false kalır, upsert yok.
    pendingRemote = { uid, remote: null, localOwned: false };
    set({ status: 'cakisma', error: null, conflictKind: 'bulut-bos' });
    return;
  }

  if (!sizeOk(row)) {
    set({ status: 'hata', error: 'Hesaptaki veri beklenenden büyük; yüklenmedi.' });
    return;
  }
  const remote = parseRemoteRow(row);
  if (!remote) {
    // Tanınmayan biçim: hiçbir şey yazılmaz, upsert de yapılmaz (syncReady false kalır).
    set({ status: 'hata', error: 'Hesaptaki veri tanınmadı; bu tarayıcıdaki veriye dokunulmadı.' });
    return;
  }

  const effective = effectiveAfterApply(remote, local);
  const remoteHash = hashSnapshot(effective);

  if (remoteHash === localHash) {
    // Zaten eşit.
    setCloudOwner(uid, localHash);
    syncReady = true;
    clearReloadFlag();
    set({ status: 'senkron', error: null });
    return;
  }

  if (!localHasData(local, remote.mode)) {
    // Yerelde kaybedilecek veri yok: hesabın verisi yüklenir.
    applyRemote(uid, remote);
    return;
  }

  if (ownedByThisUser) {
    const base = getCloudBase();
    if (base === localHash) {
      // Yerel, son eşitlemeden beri değişmedi; bulut değişmiş (ör. başka cihaz) → bulut.
      applyRemote(uid, remote);
      return;
    }
    if (base === remoteHash) {
      // Bulut değişmedi; yerel değişmiş (ör. kayıt gönderilmeden sekme kapandı, dosyadan
      // geri yükleme) → yerel buluta gönderilir.
      syncReady = true;
      clearReloadFlag();
      await save(uid);
      return;
    }
  }

  // Gerçek çakışma: otomatik karar verilmez, upsert yapılmaz.
  pendingRemote = { uid, remote, localOwned: ownedByThisUser };
  set({ status: 'cakisma', error: null, conflictKind: 'bulut-kaydi-var' });
}

function clearReloadFlag(): void {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* yok */ }
}

// Çakışma çözümü (arayüz çağırır). `conflictKind`a göre geçerli seçimler:
//   'bulut-kaydi-var':
//     'remote'  — "Hesabımdaki veriyi yükle": bu tarayıcıdaki verinin yerine geçer. Arayüz bundan
//                 önce downloadBackup() bağlantısını sunmalıdır.
//     'local'   — bu tarayıcıdaki veri hesaba yüklenir (buluttakinin ÜZERİNE YAZAR).
//   'bulut-bos':
//     'local'   — "Bu tarayıcıdaki veriyi hesabıma yükle": kullanıcı açıkça onayladı, yüklenir.
//     'discard' — "Bu tarayıcıdaki veriyi sil": veri kullanıcıya ait değil / hesabına gitmesin;
//                 bu tarayıcıdaki kullanıcı katmanları (ve önbellekler) temizlenir, hesap boş başlar.
//   "Çıkış yap" yolu için signOut() kullanılır (hesaba ait olmayan yerel veri olduğu gibi kalır).
export async function resolveConflict(choice: 'remote' | 'local' | 'discard'): Promise<void> {
  const p = pendingRemote;
  if (!p || cloud.status !== 'cakisma' || userId !== p.uid) return;
  if (choice === 'remote') {
    if (!p.remote) return; // bulutta uygulanacak kayıt yok
    applyRemote(p.uid, p.remote);
    return;
  }
  if (choice === 'discard') {
    if (p.remote) return; // kayıt varken "sil" seçeneği yok; kullanıcı 'remote' ile yerini değiştirir
    cancelSave();
    suppress = true;
    try { clearForSignOut(true); } finally { suppress = false; }
    cancelSave();
    pendingRemote = null;
    setCloudOwner(p.uid, hashSnapshot(snapshotUserData()));
    syncReady = true;
    clearReloadFlag();
    set({ status: 'senkron', error: null });
    return;
  }
  pendingRemote = null;
  // Bulut boşken kullanıcı yüklemeyi onayladı: kaybedilecek bir bulut kaydı yok, bu yüzden sahiplik
  // hemen yazılır (yükleme ağ hatasıyla düşse de bir sonraki girişte soru yeniden sorulmaz).
  if (!p.remote) setCloudOwner(p.uid, hashSnapshot(snapshotUserData()));
  // Bulutta kayıt varken "bu tarayıcıdaki veriyi yükle" onaylandı: yazım başarılı olana kadar eşitlenmiş sayılmasın
  // diye gerçek bir özet yerine eşleşmeyen yer tutucu yazılır (save() sahiplik işaretini ister).
  else setCloudOwner(p.uid, 'yazilmadi');
  syncReady = true;
  set({ status: 'bekliyor', error: null });
  await save(p.uid);
}

// Hesaba gitmemiş yerel veri var mı (karantinaya alınacak)? Yerelde kaybı üzücü veri olmalı VE son
// başarılı eşitlemenin parmak izinden farklı olmalı (eşitse bulutta zaten var).
function unsyncedSnapshot(): Record<string, string> | null {
  const snap = snapshotUserData();
  if (!localHasData(snap)) return null;
  const base = getCloudBase();
  return base !== null && base === hashSnapshot(snap) ? null : snap;
}

// Yerel kullanıcı katmanlarının çıkış sırası (#7):
// (1) zamanlayıcı iptal, (2) userId=null + suppress, (3) [karantina kopyası al] + temizlik + [karantinayı yaz],
// (4) suppress kapalı, (5) zamanlayıcı yeniden iptal.
// quarantine: null = karantina da silinir (hesap silme). Nesne = var olan karantina korunur; yaz === true ise hesaba
// gitmemiş veri temizlikten önce kopyalanıp (uid etiketiyle) yazılır. yaz === false: yeni kopya alınmaz (kullanıcı
// "Sil ve çık" dedi, kopya zaten yazıldı ya da veri bu hesaba ait değil).
function localSignOutCleanup(
  keepLocalData: boolean,
  quarantine: { uid: string; reason: QuarantineReason; yaz: boolean } | null,
): void {
  cancelSave();
  userId = null;
  syncReady = false;
  pendingRemote = null;
  localResetPending = false;
  versionMode = 'unknown'; // başka hesap/başka veritabanı: sürüm kipi yeniden öğrenilir
  knownVersion = null;
  suppress = true;
  try {
    if (!keepLocalData) {
      const unsynced = quarantine?.yaz ? unsyncedSnapshot() : null;
      clearForSignOut(quarantine !== null); // var olan (aynı hesabın) karantinası korunur
      if (unsynced && quarantine) writeQuarantine(quarantine.uid, quarantine.reason, unsynced); // oturum düşüşü: kota hatası bugünkü davranışa düşer
    }
  } finally {
    suppress = false;
    cancelSave();
  }
  set({ email: null, status: 'kapali', error: null, recovery: false, quarantine: [] });
}

// Supabase'in oturum anahtarlarını (sb-<ref>-auth-token ve PKCE code-verifier) temizler —
// signOut ağ hatası verse bile bu tarayıcıda oturum kalmasın.
function removeAuthStorage(): void {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-') && (k.endsWith('-auth-token') || k.endsWith('-code-verifier'))) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* yok */ }
}

async function endSession(supabase: SupabaseClient): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut();
    if (!error) return;
  } catch { /* ağ hatası — yerel yedeğe düş */ }
  try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* yok */ }
}

function onSession(session: Session | null): void {
  const nextId = session?.user.id ?? null;
  if (nextId === userId) {
    set({ email: session?.user.email ?? null, ready: true });
    return;
  }
  const prevId = userId;
  cancelSave();
  if (nextId === null) {
    // Kullanıcının başlatmadığı oturum düşüşü (başka sekmeden çıkış, token yenileme hatası,
    // süre dolması): yerel kullanıcı katmanları da temizlenir — ortak cihazda A'nın verisi
    // kalıp B'nin hesabına yüklenmesin. (Kullanıcının bastığı Çıkış'ta userId zaten null'dır.)
    // Karantina yalnız sahiplik işareti bu hesabı gösteriyorsa alınır: sahibi belirsiz veri (girişten önce hesapsız
    // kullanılmış) hesap etiketiyle yazılmaz; yine temizlenir ama kopyalanmaz.
    if (prevId !== null && !userInitiatedSignOut) {
      localSignOutCleanup(false, { uid: prevId, reason: 'oturum-dustu', yaz: getCloudOwner() === prevId });
    }
    set({ ready: true });
    return;
  }
  userId = nextId;
  set({ email: session?.user.email ?? null, ready: true, status: 'bekliyor', error: null });
  void pull(nextId);
}

async function init(): Promise<void> {
  const client = getClient();
  if (!client) return;
  let supabase: SupabaseClient;
  try {
    supabase = await client;
  } catch {
    set({ ready: true, status: 'hata', error: 'Hesap sistemi yüklenemedi.' });
    return;
  }
  listQuarantine(null); // süresi dolmuş / bozuk karantina açılışta temizlenir
  subscribePortfolio(scheduleSave);
  subscribeUserData(scheduleSave);
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    // Supabase, olay geri çağrısı içinde başka bir auth çağrısı beklenmemesini öneriyor.
    setTimeout(() => onSession(session), 0);
  });
  try {
    const { data, error } = await supabase.auth.getSession();
    if (!error && !data.session && getCloudOwner()) {
      // Bu tarayıcıdaki veri bir hesaba ait ama oturum yok (tarayıcı kapalıyken süresi doldu
      // ya da başka yerden düşürüldü) → kullanıcının başlatmadığı oturum düşüşüyle aynı.
      localSignOutCleanup(false, { uid: getCloudOwner() as string, reason: 'oturum-dustu', yaz: true });
    }
    onSession(error ? null : data.session);
  } catch {
    set({ ready: true });
  }
}

if (cloudEnabled) void init();

// ---- Hesap işlemleri ----

// Kullanıcıya yalnızca bu sabit mesajlar gösterilir; ham Supabase hata gövdesi DOM'a basılmaz.
function trError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (m.includes('email not confirmed')) return 'E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.';
  if (m.includes('already registered')) return 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.';
  if (m.includes('password should be')) return 'Şifre en az 6 karakter olmalı.';
  if (m.includes('rate limit')) return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
}

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string };

const DISABLED: AuthResult = { ok: false, message: 'Hesap sistemi bu kurulumda kapalı.' };
const NETWORK_ERROR: AuthResult = { ok: false, message: 'Bağlantı kurulamadı. Lütfen tekrar dene.' };

// E-posta yönlendirmeleri YALNIZCA bu sitenin kökü — URL query/hash'ten hedef kurulmaz
// (açık yönlendirme riski). Supabase panelindeki Site URL / Redirect allowlist de izinli
// alan adlarıyla sınırlanmalıdır (plan adım 5).
function redirectOrigin(): string {
  return window.location.origin;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const client = getClient();
  if (!client) return DISABLED;
  try {
    const supabase = await client;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectOrigin() },
    });
    if (error) return { ok: false, message: trError(error.message) };
    if (!data.session) {
      return { ok: true, message: 'Doğrulama bağlantısı e-postana gönderildi. Bağlantıya tıkladıktan sonra giriş yapabilirsin.' };
    }
    return { ok: true };
  } catch { return NETWORK_ERROR; }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const client = getClient();
  if (!client) return DISABLED;
  try {
    const supabase = await client;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { ok: false, message: trError(error.message) } : { ok: true };
  } catch { return NETWORK_ERROR; }
}

// Hesap numaralandırmayı önlemek için yanıt, e-postanın kayıtlı olup olmadığından bağımsız
// olarak aynı nötr mesajdır (yalnızca hız sınırı ayrıca bildirilir).
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const client = getClient();
  if (!client) return DISABLED;
  const neutral: AuthResult = { ok: true, message: 'Bu e-posta ile bir hesap varsa şifre sıfırlama bağlantısı gönderildi.' };
  try {
    const supabase = await client;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectOrigin() });
    if (error && (error.message ?? '').toLowerCase().includes('rate limit')) {
      return { ok: false, message: trError(error.message) };
    }
    return neutral;
  } catch { return NETWORK_ERROR; }
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  const client = getClient();
  if (!client) return DISABLED;
  try {
    const supabase = await client;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: trError(error.message) };
    set({ recovery: false });
    return { ok: true, message: 'Şifren güncellendi.' };
  } catch { return NETWORK_ERROR; }
}

// Çıkış öncesi: bekleyen/başarısız son kayıt bir kez daha denenir; sonra hesaba gitmemiş (ve bu hesaba ait) veri
// var mı? Arayüz true görürse çıkıştan ÖNCE sorar (sakla / indir / sil). Çakışma kartında sahibi belirsiz veri
// zaten olduğu gibi kalır, bu yüzden sorulmaz.
export async function prepareSignOut(): Promise<{ unsynced: boolean }> {
  const uid = userId;
  if (!uid) return { unsynced: false };
  if (cloud.status === 'cakisma' && pendingRemote !== null && !pendingRemote.localOwned) return { unsynced: false };
  if (saveTimer || cloud.status === 'hata') {
    cancelSave();
    await save(uid);
  }
  return { unsynced: getCloudOwner() === uid && unsyncedSnapshot() !== null };
}

// Çıkış: bu tarayıcıdaki kullanıcı katmanları + sembol içeren önbellekler + Supabase oturumu
// temizlenir (ortak cihazda bir sonraki kişi görmesin); veri hesapta durur.
// İstisna: çakışma durumunda yerel veri hesaba ait DEĞİLSE (girişten önce bu tarayıcıda
// olan veri) "Çıkış yap" onu olduğu gibi bırakır.
// choice 'sakla' (varsayılan): hesaba gitmemiş veri karantinaya alınır; kopya YAZILAMAZSA çıkış DURDURULUR
// (veri silinmez, ok:false döner; kullanıcı indirebilir ya da "Sil ve çık" diyebilir). 'sil': kopya alınmaz.
export type SignOutResult = { ok: true } | { ok: false; message: string };

export async function signOut(choice: 'sakla' | 'sil' = 'sakla'): Promise<SignOutResult> {
  const client = getClient();
  if (!client) return { ok: true };
  const keepLocalData = cloud.status === 'cakisma' && pendingRemote !== null && !pendingRemote.localOwned;
  const signOutUid = userId;
  try {
    // Bekleyen kayıt (ya da önceki başarısız kayıt) varsa önce gönderilir (son değişiklik kaybolmasın).
    // save() kendi korumalarına tabidir: onboarded=false / çakışma / okunmamış bulutta göndermez.
    if ((saveTimer || cloud.status === 'hata') && userId) {
      const uid = userId;
      cancelSave();
      await save(uid);
    }
    // Gitmeyen veri temizlikten ÖNCE karantinaya yazılır; yazılamazsa çıkılmaz (35c, D2).
    if (!keepLocalData && choice === 'sakla' && signOutUid && getCloudOwner() === signOutUid) {
      const unsynced = unsyncedSnapshot();
      if (unsynced && !writeQuarantine(signOutUid, 'cikis', unsynced)) {
        return { ok: false, message: 'Bu cihazda kopya için yer yok; çıkış yapılmadı. Önce "İndir"i kullan ya da "Sil ve çık" de.' };
      }
    }
  } catch { /* kayıt hatası çıkışı engellemez */ }
  userInitiatedSignOut = true;
  try {
    cancelSave();
    userId = null;
    suppress = true;
    try {
      const supabase = await client;
      await endSession(supabase);
    } catch { /* yok — yerel temizlik yine de yapılır */ }
  } finally {
    removeAuthStorage();
    localSignOutCleanup(keepLocalData, signOutUid ? { uid: signOutUid, reason: 'cikis', yaz: false } : null);
    userInitiatedSignOut = false;
  }
  return { ok: true };
}

// KVKK: kullanıcı hesabını ve buluttaki tüm verisini kendisi silebilir. Arayüz bunu ancak
// açık bir onay adımından sonra çağırır. `delete_my_account` veritabanı fonksiyonu
// parametresizdir ve yalnızca oturum sahibinin hesabını siler; portföy satırı yabancı anahtar
// üzerinden (on delete cascade) birlikte gider.
// TODO(hukuk): hesap silme akışının KVKK silme/yok etme yükümlülüğü açısından yeterliliği doğrulanmadı.
export async function deleteAccount(): Promise<AuthResult> {
  const client = getClient();
  if (!client) return DISABLED;
  cancelSave();
  let supabase: SupabaseClient;
  try {
    supabase = await client;
  } catch { return NETWORK_ERROR; }

  // Silme sürerken kayıt zamanlanmasın.
  suppress = true;
  let rpcOk = false;
  try {
    const { error } = await supabase.rpc('delete_my_account');
    rpcOk = !error;
  } catch {
    rpcOk = false;
  }
  if (!rpcOk) {
    suppress = false;
    return { ok: false, message: 'Hesap silinemedi. Lütfen tekrar dene.' };
  }

  userInitiatedSignOut = true;
  try {
    cancelSave();
    userId = null;
    // Kullanıcı silindi; sunucu tarafı signOut 403 dönebilir → yerel yedeğe düşülür.
    await endSession(supabase);
  } finally {
    removeAuthStorage();
    localSignOutCleanup(false, null); // hesap silindi: karantina da silinir
    userInitiatedSignOut = false;
  }
  return { ok: true, message: 'Hesabın ve hesabındaki tüm veriler silindi.' };
}

// Girişliyken SIFIRLA'dan ÖNCE çağrılır (App.resetAll): yeniden kurulumdaki ilk kayıt, hesaptaki kopyayı
// sormadan ezmez; önce bulutla karşılaştırılır ve farklıysa çakışma kartı çıkar (34+33).
export function noteLocalReset(): void {
  if (!userId) return;
  cancelSave();
  localResetPending = true;
}

// ---- Karantina eylemleri (Account.tsx kartı) ----

// "İndir": karantinadaki kopya (id = savedAt), yedek dosyasıyla aynı biçimde AYRI bir dosya olarak iner (karantina durur).
export function quarantineDownload(id?: number): boolean {
  const recs = listQuarantine(userId);
  const rec = id === undefined ? recs[0] : recs.find(r => r.savedAt === id);
  if (!rec) { set({ quarantine: describeQuarantine(userId) }); return false; }
  const file = quarantineFile(rec);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fagent-karantina-${file.createdAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

// "Sil": seçilen kopya kalıcı olarak silinir (diğer kopya durur).
export function quarantineDiscard(id?: number): void {
  if (id === undefined) deleteQuarantine(); else deleteQuarantineAt(id);
  set({ quarantine: describeQuarantine(userId) });
}

// "Hesaba yükle": kopya hesaptaki kaydın YERİNE yazılır (arayüz önce onay alır), sonra bu tarayıcıya uygulanır.
// Önce buluta yazılır; yazılamazsa hiçbir şey değişmez ve kopya durur.
export async function quarantineUpload(id?: number): Promise<AuthResult> {
  const uid = userId;
  if (!uid || !syncReady || cloud.status !== 'senkron') {
    return { ok: false, message: 'Hesapla eşitleme tamamlanınca tekrar dene.' };
  }
  const recs = listQuarantine(uid);
  const rec = id === undefined ? recs[0] : recs.find(r => r.savedAt === id);
  if (!rec) {
    set({ quarantine: describeQuarantine(uid) });
    return { ok: false, message: 'Kopya bulunamadı ya da süresi doldu.' };
  }
  const pairs = whitelistUserData(rec.data, 'replace');
  if (!pairs || pairs.length === 0) return { ok: false, message: 'Kopya okunamadı; silinmedi.' };
  const payload = Object.fromEntries(pairs);
  const body = { fagentBackup: ROW_FORMAT_VERSION, data: payload };
  if (!sizeOk(body)) return { ok: false, message: 'Kopya hesap senkronu için çok büyük; silinmedi.' };
  const client = getClient();
  if (!client) return DISABLED;
  cancelSave();
  suppress = true;
  let result: YazmaSonucu;
  try {
    result = await writeRow(await client, uid, body);
  } catch {
    result = { tur: 'hata' };
  }
  if (result.tur === 'cakisma') {
    suppress = false;
    syncReady = false;
    await pull(uid);
    return { ok: false, message: 'Hesabındaki kayıt bu arada değişti; kopya silinmedi.' };
  }
  if (result.tur !== 'ok') {
    suppress = false;
    return { ok: false, message: 'Buluta kaydedilemedi; kopya silinmedi.' };
  }
  const applied = applyUserData(payload, { mode: 'replace' });
  deleteQuarantineAt(rec.savedAt); // yalnız yüklenen kopya; diğeri (varsa) karar bekler
  set({ quarantine: describeQuarantine(uid) });
  suppress = false; // yenileme olmasa da senkron açık kalır (kayıt zamanlanabilir)
  if (!applied.ok) {
    return { ok: false, message: 'Kopya hesaba yüklendi ama bu tarayıcıya yazılamadı.' };
  }
  setCloudOwner(uid, hashSnapshot(snapshotUserData()));
  clearReloadFlag();
  reloadOnce();
  return { ok: true };
}

// Ajan metinleri için (agent.ts cloud'u import ETMEZ; App bu değeri chatReply'ye parametre
// olarak geçirebilir): girişli ve senkron açık mı?
export function isCloudSynced(state: CloudState = cloud): boolean {
  // Çakışma kararı beklerken hiçbir şey eşitlenmediği için "eşitlenir" metni de gösterilmez.
  return cloudEnabled && state.email !== null && state.status !== 'kapali' && state.status !== 'cakisma';
}
