// A-D5-2: guvenlik-tarama.mjs dizine sembolik bağ içeren bir çalışma ağacında EISDIR ile çökmez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('guvenlik-tarama: dizine bağlı sembolik bağ çökertmez (izlenmeyen dosya olarak listelenir, isFile() süzer)', () => {
  const betik = resolve('scripts/guvenlik-tarama.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'fagent-tarama-'));
  try {
    const git = (...a: string[]) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    assert.equal(git('init', '-q').status, 0);
    mkdirSync(join(dir, 'gercek'));
    writeFileSync(join(dir, 'gercek', 'a.txt'), 'merhaba\n');
    symlinkSync('gercek', join(dir, 'baglanti')); // dizine sembolik bağ
    const r = spawnSync(process.execPath, [betik], { cwd: dir, encoding: 'utf8' });
    assert.doesNotMatch(r.stderr, /EISDIR/);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /0 kritik/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
