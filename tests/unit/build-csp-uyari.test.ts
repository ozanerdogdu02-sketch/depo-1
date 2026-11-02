// Bilgi: VITE_SUPABASE_URL doluyken CSP connect-src'de o proje host'u yoksa derleme UYARI verir (sessiz kırılma olmasın).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { supabaseCspEksikleri } from '../../scripts/csp-kontrol.mjs';

const csp = (ek: string) => `Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.coingecko.com ${ek}; object-src 'none'`;

test('supabaseCspEksikleri: host yoksa dosya adını döndürür; varsa (https/wss, port/yol/büyük harf farkı) boş', () => {
  const url = 'https://abcdefgh.supabase.co';
  assert.deepEqual(supabaseCspEksikleri(url, { 'vercel.json': csp(''), 'netlify.toml': csp('') }), ['vercel.json', 'netlify.toml']);
  assert.deepEqual(supabaseCspEksikleri(url, { 'vercel.json': csp('https://abcdefgh.supabase.co wss://abcdefgh.supabase.co'), 'netlify.toml': csp('') }), ['netlify.toml']);
  assert.deepEqual(supabaseCspEksikleri(url, { 'vercel.json': csp('HTTPS://ABCDEFGH.supabase.co:443/rest'), 'netlify.toml': csp('https://abcdefgh.supabase.co') }), []);
  // başka projenin host'u ya da joker bu projeyi KAPSAMAZ sayılır (joker zaten denetimde HATA)
  assert.deepEqual(supabaseCspEksikleri(url, { 'vercel.json': csp('https://baska.supabase.co'), 'netlify.toml': csp('https://*.supabase.co') }), ['vercel.json', 'netlify.toml']);
  assert.deepEqual(supabaseCspEksikleri('', { 'vercel.json': csp('') }), [], 'URL boşsa (hesapsız derleme) uyarı yok');
});

test('build.mjs: VITE_SUPABASE_URL dolu ve CSP\'de yoksa UYARI yazar ama derlemeyi DURDURMAZ', () => {
  const cikis = mkdtempSync(join(tmpdir(), 'fagent-csp-uyari-'));
  const r = spawnSync(process.execPath, ['scripts/build.mjs'], {
    env: { ...process.env, VITE_SUPABASE_URL: 'https://uyaritesti.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_sahte', BUILD_OUT_DIR: cikis },
    encoding: 'utf8', timeout: 180_000,
  });
  rmSync(cikis, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr + r.stdout, /UYARI: VITE_SUPABASE_URL .*uyaritesti\.supabase\.co.*connect-src/s);
});
