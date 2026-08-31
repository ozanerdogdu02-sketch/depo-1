// Portföy muhasebesi — projedeki en kritik matematik.
// Buradaki bir hata kullanıcının kâr/zararını yanlış gösterir, yani Jarvis'in
// varlık sebebini ortadan kaldırır.
import { beforeEach, describe, expect, it } from 'vitest';
import { openMemoryDb, type Db } from '../src/db.ts';
import {
  addHolding, addTxn, allocation, findHoldingByName, listHoldings, listTxns,
  pnlOf, PortfolioError, rankByPnl, removeHolding, totalCost, totalValue, updateHoldingValue,
} from '../src/core/portfolio.ts';
import { buildInsights, isCashLike } from '../src/core/insights.ts';
import { createAlert, evaluateAlerts, isTriggered, listAlerts, PORTFOLIO_TARGET } from '../src/core/alerts.ts';

const TZ = 'Europe/Istanbul';
let db: Db;

beforeEach(() => {
  db = openMemoryDb();
});

describe('varlık ekleme', () => {
  it('varlık ekler ve ÖRTÜK bir alış işlemi düşer', () => {
    const h = addHolding(db, { name: 'Gram Altın', kind: 'altin', amount: 25_000 }, TZ);
    expect(h.amount).toBe(25_000);
    expect(h.cost_basis).toBe(25_000);

    // Örtük kayıt olmasa varlık portföyde görünür ama defterde hiç görünmezdi.
    const txns = listTxns(db);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.kind).toBe('alis');
    expect(txns[0]!.amount).toBe(25_000);
    expect(txns[0]!.holding_id).toBe(h.id);
  });

  it('aynı adı ikinci kez eklemeyi engeller (Türkçe büyük/küçük harf dahil)', () => {
    addHolding(db, { name: 'Işık Fonu', kind: 'fon', amount: 1000 }, TZ);
    expect(() => addHolding(db, { name: 'IŞIK FONU', kind: 'fon', amount: 500 }, TZ)).toThrow(PortfolioError);
    expect(() => addHolding(db, { name: '  ışık fonu  ', kind: 'fon', amount: 500 }, TZ)).toThrow(PortfolioError);
  });

  it('geçersiz tutarı reddeder', () => {
    expect(() => addHolding(db, { name: 'X', kind: 'hisse', amount: 0 }, TZ)).toThrow(PortfolioError);
    expect(() => addHolding(db, { name: 'X', kind: 'hisse', amount: -5 }, TZ)).toThrow(PortfolioError);
    expect(() => addHolding(db, { name: '  ', kind: 'hisse', amount: 100 }, TZ)).toThrow(PortfolioError);
  });

  it('Türkçe karakterli adı bulur', () => {
    addHolding(db, { name: 'Şişecam', kind: 'hisse', amount: 5000 }, TZ);
    expect(findHoldingByName(db, 'şişecam')?.name).toBe('Şişecam');
    expect(findHoldingByName(db, 'ŞİŞECAM')?.name).toBe('Şişecam');
  });
});

describe('ağırlıklı ortalama maliyet', () => {
  it('alış hem değeri hem maliyeti artırır', () => {
    const h = addHolding(db, { name: 'BTC', kind: 'kripto', amount: 10_000 }, TZ);
    const { holding } = addTxn(db, h.id, 'alis', 5_000, TZ);
    expect(holding.amount).toBe(15_000);
    expect(holding.cost_basis).toBe(15_000);
  });

  // EN KRİTİK TEST: kısmi satış kâr/zarar YÜZDESİNİ değiştirmemeli.
  // 100 maliyetle alınıp 150 olmuş bir varlığın yarısı satılınca kalan yarı hâlâ %50 kârda.
  it('kısmi satış kâr/zarar yüzdesini KORUR', () => {
    const h = addHolding(db, { name: 'Fon', kind: 'fon', amount: 100_000 }, TZ);
    // Değer 150.000'e çıktı (maliyet hâlâ 100.000 → %50 kâr)
    updateHoldingValue(db, h.id, 150_000);
    const before = pnlOf(150_000, 100_000);
    expect(before.pct).toBeCloseTo(50, 6);

    // Yarısını sat
    const { holding } = addTxn(db, h.id, 'satis', 75_000, TZ);
    expect(holding.amount).toBeCloseTo(75_000, 6);
    expect(holding.cost_basis).toBeCloseTo(50_000, 6); // maliyet de yarıya indi

    const after = pnlOf(holding.amount, holding.cost_basis);
    expect(after.pct).toBeCloseTo(50, 6); // yüzde değişmedi
  });

  it('tamamını satınca değer ve maliyet sıfırlanır', () => {
    const h = addHolding(db, { name: 'Fon', kind: 'fon', amount: 40_000 }, TZ);
    const { holding } = addTxn(db, h.id, 'satis', 40_000, TZ);
    expect(holding.amount).toBeCloseTo(0, 9);
    expect(holding.cost_basis).toBeCloseTo(0, 9);
  });

  it('bakiyeyi aşan satışı SESSİZCE KIRPMAZ, hata verir', () => {
    const h = addHolding(db, { name: 'Fon', kind: 'fon', amount: 1_200 }, TZ);
    expect(() => addTxn(db, h.id, 'satis', 5_000, TZ)).toThrow(/Bakiyeyi aşamaz/);
    // Defter değişmemiş olmalı
    expect(listHoldings(db)[0]!.amount).toBe(1_200);
    expect(listTxns(db)).toHaveLength(1); // sadece örtük alış
  });

  it('elle değer güncelleme maliyete DOKUNMAZ', () => {
    const h = addHolding(db, { name: 'Mevduat', kind: 'mevduat', amount: 50_000 }, TZ);
    const updated = updateHoldingValue(db, h.id, 53_000);
    expect(updated.amount).toBe(53_000);
    expect(updated.cost_basis).toBe(50_000);
  });

  it('negatif değer sıfıra kırpılır', () => {
    const h = addHolding(db, { name: 'X', kind: 'hisse', amount: 100 }, TZ);
    expect(updateHoldingValue(db, h.id, -50).amount).toBe(0);
  });

  it('varlık silinince işlem geçmişi KALIR', () => {
    const h = addHolding(db, { name: 'Eski Fon', kind: 'fon', amount: 1000 }, TZ);
    addTxn(db, h.id, 'alis', 500, TZ);
    removeHolding(db, h.id);
    expect(listHoldings(db)).toHaveLength(0);
    const txns = listTxns(db);
    expect(txns).toHaveLength(2);
    // İşlem anındaki ad korunduğu için kayıt hâlâ okunabilir
    expect(txns[0]!.holding_name).toBe('Eski Fon');
  });
});

describe('toplamlar ve dağılım', () => {
  beforeEach(() => {
    addHolding(db, { name: 'THYAO', kind: 'hisse', amount: 60_000 }, TZ);
    addHolding(db, { name: 'Gram Altın', kind: 'altin', amount: 30_000 }, TZ);
    addHolding(db, { name: 'Dolar', kind: 'doviz', amount: 10_000 }, TZ);
  });

  it('toplam değer ve maliyeti hesaplar', () => {
    expect(totalValue(listHoldings(db))).toBe(100_000);
    expect(totalCost(listHoldings(db))).toBe(100_000);
  });

  it('dağılımı büyükten küçüğe yüzdeyle verir', () => {
    const alloc = allocation(listHoldings(db));
    expect(alloc[0]).toMatchObject({ kind: 'hisse', pct: 60 });
    expect(alloc[1]).toMatchObject({ kind: 'altin', pct: 30 });
    expect(alloc.reduce((s, a) => s + a.pct, 0)).toBeCloseTo(100, 6);
  });

  it('kâr/zarara göre sıralar', () => {
    const h = findHoldingByName(db, 'THYAO')!;
    updateHoldingValue(db, h.id, 90_000); // %50 kâr
    const ranked = rankByPnl(listHoldings(db));
    expect(ranked[0]!.name).toBe('THYAO');
    expect(ranked[0]!.pnl.pct).toBeCloseTo(50, 6);
  });

  it('maliyeti sıfır olanda yüzdeyi sonsuz yapmaz', () => {
    expect(pnlOf(500, 0)).toEqual({ abs: 500, pct: 0 });
  });
});

describe('içgörüler', () => {
  it('tek sınıfta %50 üstü yoğunlaşmayı uyarı olarak verir', () => {
    addHolding(db, { name: 'BTC', kind: 'kripto', amount: 80_000 }, TZ);
    addHolding(db, { name: 'Dolar', kind: 'doviz', amount: 20_000 }, TZ);
    const insights = buildInsights({ holdings: listHoldings(db), inflationPct: 40 });
    expect(insights.some(i => i.level === 'uyari' && /tek sınıfta/i.test(i.text))).toBe(true);
  });

  it('nakit benzeri varlıkların enflasyon aşınmasını TL olarak hesaplar', () => {
    addHolding(db, { name: 'Mevduat', kind: 'mevduat', amount: 100_000 }, TZ);
    addHolding(db, { name: 'THYAO', kind: 'hisse', amount: 100_000 }, TZ);
    const insights = buildInsights({ holdings: listHoldings(db), inflationPct: 40 });
    const cash = insights.find(i => /reel değer kaybediyor/i.test(i.text));
    expect(cash).toBeDefined();
    // 100.000 × %40 = 40.000 TL yıllık aşınma
    expect(cash!.text).toMatch(/40\.000/);
  });

  it('stablecoin nakit benzeri sayılır, bitcoin sayılmaz', () => {
    const usdt = addHolding(db, { name: 'Tether', kind: 'kripto', amount: 1000, symbol: 'USDT', quantity: 24 }, TZ);
    const btc = addHolding(db, { name: 'Bitcoin', kind: 'kripto', amount: 1000, symbol: 'BTC', quantity: 0.01 }, TZ);
    expect(isCashLike(usdt)).toBe(true);
    expect(isCashLike(btc)).toBe(false);
  });

  it('tek VARLIKTA yoğunlaşmayı sınıf dağılımı dengeliyken bile yakalar', () => {
    // Sınıflar dengeli görünür ama tek hisse portföyün %40'ı
    addHolding(db, { name: 'THYAO', kind: 'hisse', amount: 40_000 }, TZ);
    addHolding(db, { name: 'Altın', kind: 'altin', amount: 30_000 }, TZ);
    addHolding(db, { name: 'Dolar', kind: 'doviz', amount: 30_000 }, TZ);
    const insights = buildInsights({ holdings: listHoldings(db), inflationPct: 40 });
    expect(insights.some(i => /Tek bir varlık/i.test(i.text))).toBe(true);
  });

  it('boş portföyde içgörü üretmez', () => {
    expect(buildInsights({ holdings: [], inflationPct: 40 })).toEqual([]);
  });

  it('önceki ölçüme göre değişimi bildirir', () => {
    addHolding(db, { name: 'BTC', kind: 'kripto', amount: 110_000 }, TZ);
    const insights = buildInsights({
      holdings: listHoldings(db),
      inflationPct: 40,
      previousValue: 100_000,
      previousDateLabel: 'Düne',
    });
    expect(insights[0]!.text).toMatch(/\+10\.000/);
    expect(insights[0]!.text).toMatch(/\+%10/);
  });
});

describe('alarmlar', () => {
  it('yön mantığı doğru', () => {
    expect(isTriggered('ustunde', 100, 90)).toBe(true);
    expect(isTriggered('ustunde', 80, 90)).toBe(false);
    expect(isTriggered('altinda', 80, 90)).toBe(true);
    expect(isTriggered('altinda', 100, 90)).toBe(false);
    // Eşiğe tam değmek de tetikler
    expect(isTriggered('ustunde', 90, 90)).toBe(true);
    expect(isTriggered('altinda', 90, 90)).toBe(true);
  });

  it('portföy alarmı ağa çıkmadan değerlendirilir ve TEK ATIŞtır', async () => {
    addHolding(db, { name: 'BTC', kind: 'kripto', amount: 150_000 }, TZ);
    createAlert(db, { target: PORTFOLIO_TARGET, kind: 'portfoy', direction: 'ustunde', threshold: 100_000 });

    const first = await evaluateAlerts(db);
    expect(first.triggered).toHaveLength(1);
    expect(first.triggered[0]!.message).toMatch(/Portföyün/);

    // İkinci yoklamada tekrar bildirim GELMEMELİ (spam koruması)
    const second = await evaluateAlerts(db);
    expect(second.triggered).toHaveLength(0);
    expect(listAlerts(db, true)).toHaveLength(0);
  });

  it('eşik aşılmadıysa alarm aktif kalır', async () => {
    addHolding(db, { name: 'BTC', kind: 'kripto', amount: 50_000 }, TZ);
    createAlert(db, { target: PORTFOLIO_TARGET, kind: 'portfoy', direction: 'ustunde', threshold: 100_000 });
    const result = await evaluateAlerts(db);
    expect(result.triggered).toHaveLength(0);
    expect(listAlerts(db, true)).toHaveLength(1);
    // Son görülen değer kaydedilmiş olmalı
    expect(listAlerts(db, true)[0]!.last_value).toBe(50_000);
  });

  it('geçersiz eşiği reddeder', () => {
    expect(() => createAlert(db, { target: 'BTC', kind: 'kripto', direction: 'ustunde', threshold: 0 })).toThrow();
  });
});
