import { useSyncExternalStore } from 'react';
import { track } from './api';

export type Plan = 'free' | 'premium';

export const FREE_DAILY_AI_LIMIT = 3;

const PLAN_KEY = 'aura.plan';
const USAGE_KEY = 'aura.aiUsage';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

function readPlan(): Plan {
  return localStorage.getItem(PLAN_KEY) === 'premium' ? 'premium' : 'free';
}

function readUsageToday(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null') as { date: string; count: number } | null;
    const today = new Date().toISOString().slice(0, 10);
    return raw && raw.date === today ? raw.count : 0;
  } catch {
    return 0;
  }
}

// Demo yükseltme: gerçek tahsilat yok. Gerçek ödemeye geçerken bu fonksiyon,
// Stripe/İyzico checkout dönüşünde sunucunun doğruladığı bir çağrıyla değiştirilecek.
export function upgradeToPremium(): void {
  localStorage.setItem(PLAN_KEY, 'premium');
  track('plan_changed', { plan: 'premium' });
  notify();
}

export function cancelPremium(): void {
  localStorage.setItem(PLAN_KEY, 'free');
  track('plan_changed', { plan: 'free' });
  notify();
}

export function registerAiUse(): void {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem(USAGE_KEY, JSON.stringify({ date: today, count: readUsageToday() + 1 }));
  notify();
}

export interface SubscriptionState {
  plan: Plan;
  aiUsedToday: number;
  aiRemainingToday: number | null; // null = sınırsız (premium)
  canUseAi: boolean;
}

let cache: SubscriptionState | null = null;

function snapshot(): SubscriptionState {
  const plan = readPlan();
  const used = readUsageToday();
  const next: SubscriptionState = {
    plan,
    aiUsedToday: used,
    aiRemainingToday: plan === 'premium' ? null : Math.max(0, FREE_DAILY_AI_LIMIT - used),
    canUseAi: plan === 'premium' || used < FREE_DAILY_AI_LIMIT,
  };
  // useSyncExternalStore referans eşitliği ister; değişmediyse aynı nesneyi döndür.
  if (
    cache &&
    cache.plan === next.plan &&
    cache.aiUsedToday === next.aiUsedToday
  ) {
    return cache;
  }
  cache = next;
  return next;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  window.addEventListener('storage', fn); // başka sekmede plan değişirse
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
}

export function useSubscription(): SubscriptionState {
  return useSyncExternalStore(subscribe, snapshot);
}
