// scripts/build.mjs: VITE_SUPABASE_URL doluysa https zorunlu (A-D4-2). Derleme başlamadan durmalı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const calistir = (url: string) => spawnSync(process.execPath, ['scripts/build.mjs'], {
  env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_sahte', BUILD_OUT_DIR: 'dist-build-env-test' /* derleme başlamadan durmalı: dizin oluşmaz */ },
  encoding: 'utf8', timeout: 120_000,
});

test('KIRMIZI/YEŞİL A-D4-2: http: ve geçersiz Supabase adresi derlemeyi durdurur', () => {
  for (const url of ['http://sahte.supabase.co', 'ftp://x.supabase.co', 'sahte.supabase.co']) {
    const r = calistir(url);
    assert.equal(r.status, 1, url);
    assert.match(r.stderr, /DERLEME DURDURULDU: VITE_SUPABASE_URL/, url);
  }
});
