// A-D4-2: validSupabaseUrl yalnız https kabul eder; cloud.ts bu işlevi kullanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSupabaseUrl } from '../../src/supabaseUrl.ts';

test('validSupabaseUrl: https geçerli; http, ftp, şemasız, boş ve bozuk adres reddedilir', () => {
  assert.equal(validSupabaseUrl('https://abc.supabase.co'), true);
  for (const kotu of ['http://abc.supabase.co', 'ftp://abc.supabase.co', 'abc.supabase.co', '', 'https//x', 'javascript:alert(1)']) {
    assert.equal(validSupabaseUrl(kotu), false, kotu);
  }
});

test('cloud.ts yerel bir http: kabul eden doğrulayıcı tanımlamaz; ortak işlevi kullanır', () => {
  const kod = readFileSync('src/cloud.ts', 'utf8');
  assert.match(kod, /from '\.\/supabaseUrl'/);
  assert.doesNotMatch(kod, /protocol === 'http:'/);
  assert.match(kod, /cloudEnabled = Boolean\(SUPABASE_URL && SUPABASE_KEY && validSupabaseUrl\(SUPABASE_URL\)\)/);
});
