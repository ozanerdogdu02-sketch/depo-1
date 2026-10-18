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
export const MAX_SYNC_CHARS = 1_500_000;
// Kayıt gecikmesi — kısa tutuldu: kullanıcının başlatmadığı bir oturum düşüşünde yerel veri
// temizlenir; henüz gönderilmemiş son değişikliğin kaybolma penceresi bu kadardır.
const SAVE_DEBOUNCE_MS = 1000;
// Uzak veri uygulandıktan sonraki sayfa yenilemesini oturum başına bir kezle sınırlar.
const RELOAD_FLAG = 'fagent.cloud.reloaded.v1';

let clientPromise: Promise<SupabaseClient> | null = null;

function getClient(): Promise<SupabaseClient> | null {
  if (!cloudEnabled) return null;
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(m =>
      m.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      }),
    );
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
}

let cloud: CloudState = { ready: !cloudEnabled, email: null, status: 'kapali', recovery: false, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<CloudState>): void {
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

// Yerelde kaybedilmesi üzücü olacak veri var mı (onboarded portföy ya da öğretilen bilgi)?
function localHasData(data: Record<string, string>): boolean {
  return portfolioOnboarded(data) || hasTrainedFacts(data);
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
let pendingRemote: { uid: string; remote: ParsedRemote; localOwned: boolean } | null = null;

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
// NOT: girişliyken SIFIRLA'dan sonra yeniden onboard olunursa (örnek veri / boş başlangıç),
// bu yeni veri buluttaki satırın ÜZERİNE YAZILIR — kullanıcı girişliyken yaptığı her
// değişiklik hesabına eşitlenir.
async function save(uid: string): Promise<void> {
  if (suppress || !syncReady || userId !== uid || cloud.status === 'cakisma') return;
  const client = getClient();
  if (!client) return;
  const snapshot = snapshotUserData();
  if (!portfolioOnboarded(snapshot)) {
    set({ status: 'senkron', error: null });
    return;
  }
  const body = { fagentBackup: ROW_FORMAT_VERSION, data: snapshot };
  if (!sizeOk(body)) {
    set({ status: 'hata', error: 'Veri, hesap senkronu için çok büyük; buluta kaydedilmedi.' });
    return;
  }
  set({ status: 'kaydediliyor' });
  try {
    const supabase = await client;
    const { error } = await supabase
      .from(TABLE)
      .upsert({ user_id: uid, data: body, updated_at: new Date().toISOString() });
    if (userId !== uid) return; // bu arada çıkış yapıldı
    if (error) {
      set({ status: 'hata', error: 'Buluta kaydedilemedi.' });
      return;
    }
    setCloudOwner(uid, hashSnapshot(snapshot));
    set({ status: 'senkron', error: null });
  } catch {
    if (userId === uid) set({ status: 'hata', error: 'Buluta kaydedilemedi.' });
  }
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

async function pull(uid: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  syncReady = false;
  pendingRemote = null;
  set({ status: 'bekliyor', error: null });

  // Hesaplar arası sızıntı koruması: yerel veri BAŞKA bir hesaba aitse, bu hesaba YÜKLENMEZ;
  // önce temizlenir (seed yapılmaz).
  const owner = getCloudOwner();
  if (owner && owner !== uid) {
    suppress = true;
    try { clearForSignOut(); } finally { suppress = false; }
  }

  let row: unknown;
  try {
    const supabase = await client;
    const { data, error } = await supabase.from(TABLE).select('data').eq('user_id', uid).maybeSingle();
    if (userId !== uid) return;
    if (error) {
      set({ status: 'hata', error: 'Bulut verisi okunamadı.' });
      return;
    }
    row = (data as { data?: unknown } | null)?.data;
  } catch {
    if (userId === uid) set({ status: 'hata', error: 'Bulut verisi okunamadı.' });
    return;
  }

  const local = snapshotUserData();
  const localHash = hashSnapshot(local);
  const ownedByThisUser = getCloudOwner() === uid;

  if (row === undefined || row === null) {
    // Bulutta kayıt yok: bu tarayıcıdaki veri (varsa) hesaba yüklenir. Yerel veri başka
    // hesaba aitse yukarıda zaten temizlendi — seed yalnızca işaret yoksa ya da aynı uid'de.
    syncReady = true;
    setCloudOwner(uid, localHash);
    clearReloadFlag();
    await save(uid);
    if (userId === uid && cloud.status === 'bekliyor') set({ status: 'senkron', error: null });
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

  if (!localHasData(local)) {
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
  set({ status: 'cakisma', error: null });
}

function clearReloadFlag(): void {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* yok */ }
}

// Çakışma çözümü (K2 arayüzü çağırır):
//   'remote' — "Hesabımdaki veriyi yükle": bu tarayıcıdaki verinin yerine geçer. Arayüz bundan
//              önce downloadBackup() bağlantısını sunmalıdır.
//   'local'  — bu tarayıcıdaki veri hesaba yüklenir (buluttakinin ÜZERİNE YAZAR). Opsiyonel
//              üçüncü yol; arayüz göstermek zorunda değil.
// "Çıkış yap" yolu için signOut() kullanılır (çakışmada yerel veri, hesaba ait değilse bırakılır).
export async function resolveConflict(choice: 'remote' | 'local'): Promise<void> {
  const p = pendingRemote;
  if (!p || cloud.status !== 'cakisma' || userId !== p.uid) return;
  if (choice === 'remote') {
    applyRemote(p.uid, p.remote);
    return;
  }
  pendingRemote = null;
  syncReady = true;
  set({ status: 'bekliyor', error: null });
  await save(p.uid);
}

// Yerel kullanıcı katmanlarının çıkış sırası (#7):
// (1) zamanlayıcı iptal, (2) userId=null + suppress, (3) temizlik, (4) suppress kapalı,
// (5) zamanlayıcı yeniden iptal.
function localSignOutCleanup(keepLocalData: boolean): void {
  cancelSave();
  userId = null;
  syncReady = false;
  pendingRemote = null;
  suppress = true;
  try {
    if (!keepLocalData) clearForSignOut();
  } finally {
    suppress = false;
    cancelSave();
  }
  set({ email: null, status: 'kapali', error: null, recovery: false });
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
    if (prevId !== null && !userInitiatedSignOut) localSignOutCleanup(false);
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
      localSignOutCleanup(false);
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

// Çıkış: bu tarayıcıdaki kullanıcı katmanları + sembol içeren önbellekler + Supabase oturumu
// temizlenir (ortak cihazda bir sonraki kişi görmesin); veri hesapta durur.
// İstisna: çakışma durumunda yerel veri hesaba ait DEĞİLSE (girişten önce bu tarayıcıda
// olan veri) "Çıkış yap" onu olduğu gibi bırakır.
export async function signOut(): Promise<void> {
  const client = getClient();
  if (!client) return;
  const keepLocalData = cloud.status === 'cakisma' && pendingRemote !== null && !pendingRemote.localOwned;
  userInitiatedSignOut = true;
  try {
    // Bekleyen kayıt varsa önce gönderilir (son değişiklik kaybolmasın). save() kendi
    // korumalarına tabidir: onboarded=false / çakışma / okunmamış bulutta göndermez.
    if (saveTimer && userId) {
      const uid = userId;
      cancelSave();
      await save(uid);
    }
    cancelSave();
    userId = null;
    suppress = true;
    try {
      const supabase = await client;
      await endSession(supabase);
    } catch { /* yok — yerel temizlik yine de yapılır */ }
  } finally {
    removeAuthStorage();
    localSignOutCleanup(keepLocalData);
    userInitiatedSignOut = false;
  }
}

// KVKK: kullanıcı hesabını ve buluttaki tüm verisini kendisi silebilir. Arayüz bunu ancak
// açık bir onay adımından sonra çağırır. `delete_my_account` veritabanı fonksiyonu
// parametresizdir ve yalnızca oturum sahibinin hesabını siler; portföy satırı yabancı anahtar
// üzerinden (on delete cascade) birlikte gider.
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
    localSignOutCleanup(false);
    userInitiatedSignOut = false;
  }
  return { ok: true, message: 'Hesabın ve hesabındaki tüm veriler silindi.' };
}

// Ajan metinleri için (agent.ts cloud'u import ETMEZ; App bu değeri chatReply'ye parametre
// olarak geçirebilir): girişli ve senkron açık mı?
export function isCloudSynced(state: CloudState = cloud): boolean {
  return cloudEnabled && state.email !== null && state.status !== 'kapali';
}
