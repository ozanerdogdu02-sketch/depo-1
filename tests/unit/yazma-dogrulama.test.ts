// G2: portföy iç şeması YAZMA yollarında da doğrulanır (otomatik aktarım, yedek geri yükleme, bulut çekirdeği).
// Geçersizse hiçbir şey yazılmaz ve kullanıcıya açık mesaj gider. Bulut satırı (cloud.ts parseRemoteRow) auth e2e (c2) ile korunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOtoAktarim } from '../../src/otoAktarim.ts';
import { restoreBackup, whitelistUserData } from '../../src/backup.ts';

const PK = 'fagent.portfolio.v1';
const kalem = (o: Record<string, unknown> = {}) => ({ id: 'h1', name: 'A', type: 'hisse', amount: 100, costBasis: 80, ...o });
const aktarim = (holdings: unknown[], txns: unknown[] = []) => JSON.stringify({ sema_surum: 1, portfoy: { holdings, txns } });
const MEVCUT = JSON.stringify({ onboarded: true, realizedPnl: -10, holdings: [{ id: 'm1', name: 'Mevcut', type: 'fon', amount: 5, costBasis: 4 }], txns: [] });

function lsKur(init: Record<string, string>) {
  const st: Record<string, string> = { ...init };
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k in st ? st[k] : null),
    setItem: (k: string, v: string) => { st[k] = v; },
    removeItem: (k: string) => { delete st[k]; },
  };
  return st;
}
const lsKaldir = () => { delete (globalThis as { localStorage?: unknown }).localStorage; };

test('G2 parseOtoAktarim: eksi/sayı olmayan maliyet, tutar, işlem tutarı ve komisyon REDDEDİLİR', () => {
  // referans: geçerli giriş kabul edilir
  assert.equal(parseOtoAktarim(aktarim([kalem()], [{ kind: 'alis', date: '2026-01-02', amount: 5, commission: 1 }])).ok, true);
  const kotu: Array<[string, string]> = [
    ['eksi costBasis', aktarim([kalem({ costBasis: -5 })])],
    ['eksi amount', aktarim([kalem({ amount: -1 })])],
    ['metin amount', aktarim([kalem({ amount: 'abc' })])],
    ['eksi işlem tutarı', aktarim([kalem()], [{ kind: 'alis', date: '2026-01-02', amount: -5 }])],
    ['metin işlem tutarı', aktarim([kalem()], [{ kind: 'alis', date: '2026-01-02', amount: 'x' }])],
    ['eksi komisyon', aktarim([kalem()], [{ kind: 'satis', date: '2026-01-02', amount: 5, commission: -1 }])],
  ];
  for (const [ad, metin] of kotu) {
    const r = parseOtoAktarim(metin);
    assert.equal(r.ok, false, ad);
    assert.equal(r.state, undefined, `${ad}: durum üretilmemeli`);
    assert.ok(r.message.length > 10, `${ad}: açık mesaj`);
  }
});

test('G2 restoreBackup: geçersiz portföy içeren yedek "geri yüklendi" DEMEZ ve mevcut veri değişmez', () => {
  const st = lsKur({ [PK]: MEVCUT, 'fagent.tax.v1': 'ESKI' });
  try {
    for (const bozuk of [
      JSON.stringify({ onboarded: true, realizedPnl: 0, holdings: [kalem({ costBasis: -5 })], txns: [] }),
      JSON.stringify({ onboarded: true, realizedPnl: 0, holdings: [kalem({ amount: 'abc' })], txns: [] }),
      'bozuk-json',
      JSON.stringify({ onboarded: true }),
    ]) {
      const r = restoreBackup(JSON.stringify({ fagentBackup: 1, data: { [PK]: bozuk, 'fagent.tax.v1': 'YENI' } }));
      assert.equal(r.ok, false, bozuk.slice(0, 40));
      assert.doesNotMatch(r.message, /geri yüklendi/i);
      assert.match(r.message, /portföy/i);
      assert.equal(st[PK], MEVCUT, 'portföy değişmedi');
      assert.equal(st['fagent.tax.v1'], 'ESKI', 'ya hep ya hiç: diğer katman da değişmedi');
    }
    // geçerli yedek hâlâ yüklenir
    const iyi = JSON.stringify({ onboarded: true, realizedPnl: -3.5, holdings: [kalem()], txns: [] });
    const r = restoreBackup(JSON.stringify({ fagentBackup: 1, data: { [PK]: iyi } }));
    assert.equal(r.ok, true);
    assert.equal(st[PK], iyi);
  } finally { lsKaldir(); }
});

test('G2 whitelistUserData (bulut/kurtarma çekirdeği): geçersiz portföy değeri tüm yazımı reddeder (undefined)', () => {
  const bozuk = JSON.stringify({ onboarded: true, realizedPnl: 0, holdings: [kalem({ costBasis: -5 })], txns: [] });
  assert.equal(whitelistUserData({ [PK]: bozuk, 'fagent.tax.v1': '{}' }, 'replace'), undefined);
  assert.equal(whitelistUserData({ [PK]: bozuk }, 'portfolioOnly'), undefined);
  assert.equal(whitelistUserData({ [PK]: bozuk }, 'selected', [PK]), undefined);
  const iyi = JSON.stringify({ onboarded: true, realizedPnl: 0, holdings: [kalem()], txns: [] });
  assert.deepEqual(whitelistUserData({ [PK]: iyi }, 'replace'), [[PK, iyi]]);
  // portföy anahtarı hiç yoksa diğer katmanlar etkilenmez
  assert.deepEqual(whitelistUserData({ 'fagent.tax.v1': '{}' }, 'replace'), [['fagent.tax.v1', '{}']]);
});
