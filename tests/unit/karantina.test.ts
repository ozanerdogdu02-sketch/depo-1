// Karantina (hesaba gitmemiş yerel kopya) ve sürümlü yazım yorumu: saf birim testler.
// Koşucu: node --test. Depo bellekte taklit edilir; gerçek tarayıcı/Supabase yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUARANTINE_KEY, ownerDigest, writeQuarantine, readQuarantine, listQuarantine, deleteQuarantine, deleteQuarantineAt,
  quarantineFile, type KVStore,
} from '../../src/karantina.ts';
import { KARANTINA_OMRU_MS, KARANTINA_MAKS_KAYIT } from '../../src/config/varsayilanlar.ts';
import { BACKED_UP_KEYS } from '../../src/backup.ts';
import { guncellemeSonucu, eklemeSonucu, surumSutunuYok, satirSurumu } from '../../src/surum.ts';

const mem = (): KVStore & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: k => { m.delete(k); } };
};
const UID_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const UID_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const DATA = { 'fagent.portfolio.v1': '{"onboarded":true}' };
const T0 = 1_800_000_000_000;

test('karantina anahtarı BACKED_UP_KEYS (yedek/bulut) içinde DEĞİL', () => {
  assert.ok(!(BACKED_UP_KEYS as readonly string[]).includes(QUARANTINE_KEY));
});

test('ömür 7 gün', () => { assert.equal(KARANTINA_OMRU_MS, 7 * 86_400_000); });

test('ownerDigest: kararlı, kimliği düz yazmaz, hesaplar farklı', () => {
  assert.equal(ownerDigest(UID_A), ownerDigest(UID_A));
  assert.notEqual(ownerDigest(UID_A), ownerDigest(UID_B));
  assert.ok(!ownerDigest(UID_A).includes('aaaaaaaa-'));
  assert.equal(ownerDigest(UID_A).length, 16);
});

test('yaz/oku: aynı hesap okur, kayıt düz kimlik içermez', () => {
  const st = mem();
  assert.equal(writeQuarantine(UID_A, 'cikis', DATA, T0, st), true);
  assert.ok(!st.m.get(QUARANTINE_KEY)!.includes(UID_A));
  const r = readQuarantine(UID_A, T0 + 1000, st);
  assert.equal(r?.reason, 'cikis');
  assert.deepEqual(r?.data, DATA);
});

test('başka hesap okumaya çalışınca kayıt SİLİNİR', () => {
  const st = mem();
  writeQuarantine(UID_A, 'oturum-dustu', DATA, T0, st);
  assert.equal(readQuarantine(UID_B, T0 + 1, st), null);
  assert.equal(st.m.has(QUARANTINE_KEY), false);
});

test('7 gün dolunca (sınır dahil) silinir; 7 günden az kalırsa durur', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', DATA, T0, st);
  assert.ok(readQuarantine(UID_A, T0 + KARANTINA_OMRU_MS - 1, st));
  assert.equal(readQuarantine(UID_A, T0 + KARANTINA_OMRU_MS, st), null);
  assert.equal(st.m.has(QUARANTINE_KEY), false);
});

test('uid=null: yalnız süre temizliği; başka hesabın kaydı silinmez, süresi dolan silinir', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', DATA, T0, st);
  assert.ok(readQuarantine(null, T0 + 5, st));
  assert.equal(readQuarantine(null, T0 + KARANTINA_OMRU_MS + 1, st), null);
  assert.equal(st.m.has(QUARANTINE_KEY), false);
});

test('bozuk ya da yabancı biçimli kayıt silinir, çökmez', () => {
  const st = mem();
  st.setItem(QUARANTINE_KEY, '{bozuk');
  assert.equal(readQuarantine(UID_A, T0, st), null);
  assert.equal(st.m.has(QUARANTINE_KEY), false);
  st.setItem(QUARANTINE_KEY, JSON.stringify({ v: 1, owner: ownerDigest(UID_A), savedAt: T0, reason: 'x', data: {} }));
  assert.equal(readQuarantine(UID_A, T0, st), null);
  st.setItem(QUARANTINE_KEY, JSON.stringify({ v: 1, owner: ownerDigest(UID_A), savedAt: T0, reason: 'cikis', data: { a: 5 } }));
  assert.equal(readQuarantine(UID_A, T0, st), null);
});

test('gelecekteki tarih (saat bozuk) kaydı süresiz tutmaz', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', DATA, T0 + 10 * KARANTINA_OMRU_MS, st);
  assert.equal(readQuarantine(UID_A, T0, st), null);
});

test('kota hatası: false döner, çökmez; yeni kayıt eskisinin yerine geçer; deleteQuarantine siler', () => {
  const dolu: KVStore = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.equal(writeQuarantine(UID_A, 'cikis', DATA, T0, dolu), false);
  const st = mem();
  writeQuarantine(UID_A, 'cikis', DATA, T0, st);
  writeQuarantine(UID_A, 'surum-cakismasi', { 'fagent.portfolio.v1': '{"x":1}' }, T0 + 5, st);
  assert.equal(readQuarantine(UID_A, T0 + 6, st)?.reason, 'surum-cakismasi');
  deleteQuarantine(st);
  assert.equal(st.m.size, 0);
});

test('quarantineFile: yedek dosyası biçimi (fagentBackup, createdAt, data)', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', DATA, T0, st);
  const f = quarantineFile(readQuarantine(UID_A, T0, st)!);
  assert.equal(f.fagentBackup, 1);
  assert.equal(f.createdAt, new Date(T0).toISOString());
  assert.deepEqual(f.data, DATA);
});

// ---- Sürümlü yazım yorumu (src/surum.ts) ----
test('güncelleme: eşleşen sürüm → ok + yeni sürüm', () => {
  assert.deepEqual(guncellemeSonucu(null, [{ version: 4 }]), { tur: 'ok', surum: 4 });
});
test('güncelleme: eşleşmeyen sürüm → BOŞ dizi → çakışma (varsayım: gerçek projede doğrulanmadı)', () => {
  assert.deepEqual(guncellemeSonucu(null, []), { tur: 'cakisma' });
});
test('güncelleme: dizi olmayan yanıt ve hata → hata; sütun yok → surum-yok', () => {
  assert.deepEqual(guncellemeSonucu(null, null), { tur: 'hata' });
  assert.deepEqual(guncellemeSonucu({ code: '500' }, null), { tur: 'hata' });
  assert.deepEqual(guncellemeSonucu({ code: '42703' }, null), { tur: 'surum-yok' });
  assert.deepEqual(guncellemeSonucu({ code: 'PGRST204' }, null), { tur: 'surum-yok' });
  // D5: yalnız hata koduyla düşülür; iletide "version" geçen başka hata düz upsert'e düşürmez
  assert.deepEqual(guncellemeSonucu({ message: 'column portfolios.version does not exist' }, null), { tur: 'hata' });
  assert.deepEqual(guncellemeSonucu({ code: '42501', message: 'permission denied for column version' }, null), { tur: 'hata' });
  assert.equal(surumSutunuYok({ message: 'version column' }), false);
});
test('ekleme: 23505 → çakışma; başarılı → ok; sütun yok → surum-yok', () => {
  assert.deepEqual(eklemeSonucu({ code: '23505' }, null), { tur: 'cakisma' });
  assert.deepEqual(eklemeSonucu(null, [{ version: 0 }]), { tur: 'ok', surum: 0 });
  assert.deepEqual(eklemeSonucu({ code: '42703' }, null), { tur: 'surum-yok' });
  assert.deepEqual(eklemeSonucu({ code: '42501' }, null), { tur: 'hata' });
});
test('satirSurumu: sayı değilse undefined (düz upsert moduna düşer)', () => {
  assert.equal(satirSurumu({ data: {}, version: 3 }), 3);
  assert.equal(satirSurumu({ data: {} }), undefined);
  assert.equal(satirSurumu({ version: '3' }), undefined);
  assert.equal(surumSutunuYok(null), false);
});

// ---- Tur 2: D1 (kayıt sınırı, kota), liste biçimi ----
test('D1: karara bağlanmamış kopyanın üzerine yazılmaz; ikinci kayıt eklenir, en yeni başta', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', { 'fagent.portfolio.v1': '{"a":1}' }, T0, st);
  writeQuarantine(UID_A, 'surum-cakismasi', { 'fagent.portfolio.v1': '{"b":2}' }, T0 + 10, st);
  const l = listQuarantine(UID_A, T0 + 20, st);
  assert.equal(l.length, 2);
  assert.equal(l[0].data['fagent.portfolio.v1'], '{"b":2}');
  assert.equal(l[1].data['fagent.portfolio.v1'], '{"a":1}');
});

test('D1: sayı sınırlı (en çok KARANTINA_MAKS_KAYIT); üçüncüde en eski düşer', () => {
  assert.equal(KARANTINA_MAKS_KAYIT, 2);
  const st = mem();
  for (let i = 1; i <= 3; i++) writeQuarantine(UID_A, 'cikis', { 'fagent.portfolio.v1': `{"n":${i}}` }, T0 + i, st);
  const l = listQuarantine(UID_A, T0 + 10, st);
  assert.deepEqual(l.map(r => r.data['fagent.portfolio.v1']), ['{"n":3}', '{"n":2}']);
});

test('D1: aynı içerik ikinci kez kayıt açmaz; aynı milisaniyede kimlik (savedAt) benzersiz kalır', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', { 'fagent.portfolio.v1': '{"x":1}' }, T0, st);
  writeQuarantine(UID_A, 'cikis', { 'fagent.portfolio.v1': '{"x":1}' }, T0 + 5, st);
  assert.equal(listQuarantine(UID_A, T0 + 6, st).length, 1);
  writeQuarantine(UID_A, 'cikis', { 'fagent.portfolio.v1': '{"x":2}' }, T0, st);
  const l = listQuarantine(UID_A, T0 + 6, st);
  assert.equal(l.length, 2);
  assert.notEqual(l[0].savedAt, l[1].savedAt);
});

test('D1: kota hatasında ESKİ KAYITLAR SİLİNMEZ (false döner)', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', DATA, T0, st);
  const before = st.m.get(QUARANTINE_KEY);
  const dolu: KVStore = { getItem: k => st.getItem(k), setItem: () => { throw new Error('quota'); }, removeItem: k => st.removeItem(k) };
  assert.equal(writeQuarantine(UID_A, 'surum-cakismasi', { 'fagent.portfolio.v1': '{"y":1}' }, T0 + 5, dolu), false);
  assert.equal(st.m.get(QUARANTINE_KEY), before);
});

test('deleteQuarantineAt yalnız seçilen kaydı siler; başka hesabın kaydı yazarken ayıklanır', () => {
  const st = mem();
  writeQuarantine(UID_A, 'cikis', { 'fagent.portfolio.v1': '{"1":1}' }, T0, st);
  writeQuarantine(UID_A, 'cikis', { 'fagent.portfolio.v1': '{"2":2}' }, T0 + 5, st);
  const [yeni, eski] = listQuarantine(UID_A, T0 + 6, st);
  deleteQuarantineAt(yeni.savedAt, st);
  assert.deepEqual(listQuarantine(UID_A, T0 + 6, st).map(r => r.savedAt), [eski.savedAt]);
  writeQuarantine(UID_B, 'cikis', DATA, T0 + 7, st);
  assert.equal(listQuarantine(UID_B, T0 + 8, st).length, 1);
  assert.equal(listQuarantine(UID_A, T0 + 9, st).length, 0); // başka hesap okuyunca B'nin kaydı silinir (kural)
});

test('ilk sürümün tek nesne biçimi hâlâ okunur', () => {
  const st = mem();
  st.setItem(QUARANTINE_KEY, JSON.stringify({ v: 1, owner: ownerDigest(UID_A), savedAt: T0, reason: 'cikis', data: DATA }));
  assert.equal(listQuarantine(UID_A, T0 + 1, st).length, 1);
});

test('D3/D4: migration ekleme tetikleyicisi sürümü 0 yapar, check (version >= 0) var, geri alma adımları yorumda', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261031000000_portfolios_version.sql', import.meta.url), 'utf8');
  assert.match(sql, /before insert on public\.portfolios/);
  assert.match(sql, /new\.version := 0;/);
  assert.match(sql, /check \(version >= 0\)/);
  assert.match(sql, /before update on public\.portfolios/);
  assert.match(sql, /-- GERİ ALMA \(down\)/);
  assert.match(sql, /--\s+alter table public\.portfolios drop column if exists version;/);
  // eski migration'a dokunulmadı: sürüm sütunu orada yok
  const old = readFileSync(new URL('../../supabase/migrations/20261018000000_portfolios_and_account_deletion.sql', import.meta.url), 'utf8');
  assert.ok(!/version/.test(old));
});

test('D7: ownerDigest yorumu gizleme iddia etmez', () => {
  const src = readFileSync(new URL('../../src/karantina.ts', import.meta.url), 'utf8');
  assert.ok(!/geri okunamaz/.test(src));
  assert.match(src, /eşleşmeyi doğrulayabilir/);
});
