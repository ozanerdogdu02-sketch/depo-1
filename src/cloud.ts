// Hesap ve bulut senkronu (Supabase). Tamamen opsiyonel:
// - VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY tanımlı değilse bulut kapalıdır ve
//   uygulama eskisi gibi yalnızca tarayıcıda (localStorage) çalışır.
// - Giriş yapan kullanıcının portföyü `portfolios` tablosunda tek satır (jsonb) olarak tutulur;
//   satır erişimi RLS ile yalnızca sahibine açıktır.
import { useSyncExternalStore } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { actions, getPortfolio, subscribePortfolio } from './store';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const cloudEnabled = Boolean(URL && KEY);
const supabase: SupabaseClient | null = cloudEnabled ? createClient(URL!, KEY!) : null;

export type SyncStatus = 'kapali' | 'bekliyor' | 'senkron' | 'kaydediliyor' | 'hata';

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

export function useCloud(): CloudState {
  return useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => cloud,
  );
}

// ---- Senkron ----

let userId: string | null = null;
let applyingRemote = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function pullOrSeed(uid: string): Promise<void> {
  if (!supabase) return;
  set({ status: 'bekliyor' });
  const { data, error } = await supabase.from('portfolios').select('data').eq('user_id', uid).maybeSingle();
  if (error) {
    set({ status: 'hata', error: 'Bulut verisi okunamadı.' });
    return;
  }
  if (data?.data) {
    // Bulutta kayıt varsa o esas alınır (başka cihazdan girilen veriler).
    applyingRemote = true;
    actions.replaceAll(data.data);
    applyingRemote = false;
    set({ status: 'senkron', error: null });
  } else {
    // İlk giriş: bu tarayıcıdaki portföy (varsa) hesaba yüklenir.
    await save(uid);
  }
}

async function save(uid: string): Promise<void> {
  if (!supabase) return;
  const current = getPortfolio();
  if (!current.onboarded) {
    set({ status: 'senkron' });
    return;
  }
  set({ status: 'kaydediliyor' });
  const { error } = await supabase
    .from('portfolios')
    .upsert({ user_id: uid, data: current, updated_at: new Date().toISOString() });
  set(error ? { status: 'hata', error: 'Buluta kaydedilemedi.' } : { status: 'senkron', error: null });
}

function scheduleSave(): void {
  if (!userId || applyingRemote) return;
  if (saveTimer) clearTimeout(saveTimer);
  const uid = userId;
  saveTimer = setTimeout(() => void save(uid), 1200);
}

function onSession(session: Session | null): void {
  const nextId = session?.user.id ?? null;
  if (nextId === userId) {
    set({ email: session?.user.email ?? null, ready: true });
    return;
  }
  userId = nextId;
  set({ email: session?.user.email ?? null, ready: true, status: nextId ? 'bekliyor' : 'kapali' });
  if (nextId) void pullOrSeed(nextId);
}

if (supabase) {
  subscribePortfolio(scheduleSave);
  supabase.auth.getSession().then(({ data }) => onSession(data.session));
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    // Supabase, olay geri çağrısı içinde başka bir auth çağrısı beklenmemesini öneriyor.
    setTimeout(() => onSession(session), 0);
  });
}

// ---- Hesap işlemleri ----

function trError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (m.includes('email not confirmed')) return 'E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.';
  if (m.includes('already registered')) return 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.';
  if (m.includes('password should be')) return 'Şifre en az 6 karakter olmalı.';
  if (m.includes('rate limit')) return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
}

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string };

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Hesap sistemi bu kurulumda kapalı.' };
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) return { ok: false, message: trError(error.message) };
  if (!data.session) {
    return { ok: true, message: 'Doğrulama bağlantısı e-postana gönderildi. Bağlantıya tıkladıktan sonra giriş yapabilirsin.' };
  }
  return { ok: true };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Hesap sistemi bu kurulumda kapalı.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: trError(error.message) } : { ok: true };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Hesap sistemi bu kurulumda kapalı.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  return error
    ? { ok: false, message: trError(error.message) }
    : { ok: true, message: 'Şifre sıfırlama bağlantısı e-postana gönderildi.' };
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Hesap sistemi bu kurulumda kapalı.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: trError(error.message) };
  set({ recovery: false });
  return { ok: true, message: 'Şifren güncellendi.' };
}

// Çıkışta bu tarayıcıdaki portföy temizlenir: veri bulutta durur, ortak bir cihazda
// başkasının görmesi engellenir.
export async function signOut(): Promise<void> {
  if (!supabase) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (userId) await save(userId);
  await supabase.auth.signOut();
  applyingRemote = true;
  actions.reset();
  applyingRemote = false;
}

// KVKK: kullanıcı hesabını ve buluttaki tüm verisini kendisi silebilir.
// `delete_my_account` veritabanı fonksiyonu yalnızca oturum sahibinin hesabını siler;
// portföy satırı yabancı anahtar üzerinden (on delete cascade) birlikte silinir.
export async function deleteAccount(): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Hesap sistemi bu kurulumda kapalı.' };
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return { ok: false, message: 'Hesap silinemedi. Lütfen tekrar dene.' };
  userId = null;
  await supabase.auth.signOut();
  set({ email: null, status: 'kapali', error: null });
  applyingRemote = true;
  actions.reset();
  applyingRemote = false;
  return { ok: true, message: 'Hesabın ve buluttaki verilerin silindi.' };
}
