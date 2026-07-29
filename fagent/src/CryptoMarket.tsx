import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Plus, CheckCircle2, AlertTriangle, ArrowUpDown } from 'lucide-react';
import { usePortfolio, actions, fmtTL, fmtPct, AssetType } from './store';
import { CryptoMarketCoin, CryptoMarketError, loadTopCoins, formatMarketCap, DEFAULT_COIN_COUNT } from './cryptoMarket';

const KRIPTO: AssetType = 'kripto';
const PAGE_SIZE = 50; // 250 satırı birden çizmek ağır olurdu; kademeli gösteriyoruz

type SortKey = 'rank' | 'price' | 'change' | 'cap';

// Satır içi mini grafik — 7 günlük fiyat serisinden elle çizilen hafif SVG.
// 250 satırda Recharts kullanmak ağır olurdu; tek bir polyline yeterli ve akıcı.
function Sparkline({ prices, up }: { prices: number[]; up: boolean }) {
  const path = useMemo(() => {
    // Seriyi seyrelt (~40 nokta) — görsel olarak aynı, DOM çok daha hafif.
    const step = Math.max(1, Math.floor(prices.length / 40));
    const pts = prices.filter((_, i) => i % step === 0);
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const w = 68, h = 22;
    return pts
      .map((p, i) => {
        const x = (i / (pts.length - 1)) * w;
        const y = h - ((p - min) / range) * h;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [prices]);

  return (
    <svg width="68" height="22" viewBox="0 0 68 22" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <path d={path} fill="none" stroke={up ? 'var(--accent)' : 'var(--red)'} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

export function CryptoMarket() {
  const s = usePortfolio();
  const [coins, setCoins] = useState<CryptoMarketCoin[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const snap = await loadTopCoins(DEFAULT_COIN_COUNT, { force });
      setCoins(snap.coins);
      setFetchedAt(snap.fetchedAt);
      setStale(snap.stale);
    } catch (err) {
      setError(err instanceof CryptoMarketError ? err.message : 'Piyasa verisi alınamadı.');
      setCoins(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!coins) return [];
    const q = search.trim().toLocaleLowerCase('tr-TR');
    const base = q
      ? coins.filter(c => c.name.toLocaleLowerCase('tr-TR').includes(q) || c.symbol.toLocaleLowerCase('tr-TR').includes(q))
      : coins;
    const dir = sortAsc ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case 'price': return (a.priceTry - b.priceTry) * dir;
        case 'change': return (a.change24hPct - b.change24hPct) * dir;
        case 'cap': return (a.marketCapTry - b.marketCapTry) * dir;
        default: return ((a.rank ?? 9999) - (b.rank ?? 9999)) * dir;
      }
    });
  }, [coins, search, sortKey, sortAsc]);

  const visible = filtered.slice(0, shown);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(key === 'rank'); } // sıra artan, diğerleri azalan başlar
    setShown(PAGE_SIZE);
  };

  const addCoin = (coin: CryptoMarketCoin) => {
    const tutar = Number(amounts[coin.id]);
    if (!Number.isFinite(tutar) || tutar <= 0 || coin.priceTry <= 0) return;
    actions.addHolding(coin.name, KRIPTO, Math.round(tutar), tutar / coin.priceTry, coin.id);
    setAmounts(a => ({ ...a, [coin.id]: '' }));
    setAdded(a => ({ ...a, [coin.id]: true }));
    setTimeout(() => setAdded(a => ({ ...a, [coin.id]: false })), 2500);
  };

  const owned = useMemo(() => new Set(s.holdings.map(h => h.symbol).filter(Boolean)), [s.holdings]);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      className="mini-btn cm-sort" onClick={() => toggleSort(k)} aria-pressed={sortKey === k}
      style={{ borderColor: sortKey === k ? 'var(--blue)' : undefined, color: sortKey === k ? 'var(--blue)' : undefined }}
    >
      <ArrowUpDown size={10} /> {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </button>
  );

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Kripto Piyasası</span>
          <button className="mini-btn" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 size={11} className="spin-icon" /> : <RefreshCw size={11} />}
            {loading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
        <p className="sub">
          {coins ? `${coins.length} coin · ` : ''}CoinGecko genel API üzerinden piyasa değerine göre en büyükler (anahtarsız).
          {fetchedAt && ` · Fiyatlar ${new Date(fetchedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} itibarıyla.`}
        </p>

        {stale && coins && (
          <p className="hint" style={{ marginTop: 8, color: 'var(--amber, #fbbf24)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Canlı fiyat alınamadı (ücretsiz servisin istek sınırı) — aşağıdakiler
              <strong> {new Date(fetchedAt!).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong> tarihindeki
              son gerçek fiyatlar. Birkaç dakika sonra "Yenile" ile güncelleyebilirsin.
            </span>
          </p>
        )}

        {coins && coins.length > 0 && (
          <>
            <div style={{ position: 'relative', marginTop: 12 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
              <input
                id="cm-search" className="input" placeholder={`${coins.length} coin içinde ara (ör. Bitcoin, ETH, SOL)…`}
                style={{ paddingLeft: 32 }} value={search}
                onChange={e => { setSearch(e.target.value); setShown(PAGE_SIZE); }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="hint" style={{ margin: 0 }}>Sırala:</span>
              <SortBtn k="rank" label="Sıra" />
              <SortBtn k="cap" label="Piyasa değeri" />
              <SortBtn k="change" label="24s değişim" />
              <SortBtn k="price" label="Fiyat" />
            </div>
          </>
        )}
      </div>

      {loading && !coins && (
        <div className="card">
          <p className="sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 size={14} className="spin-icon" /> Piyasa verisi çekiliyor…
          </p>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'rgba(248,113,113,0.4)' }}>
          <p className="hint" style={{ color: 'var(--red)', marginBottom: 10 }}>{error}</p>
          <button className="btn btn-primary btn-inline" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 size={13} className="spin-icon" /> : <RefreshCw size={13} />} Tekrar dene
          </button>
        </div>
      )}

      {coins && !error && (
        <div className="card">
          {filtered.length === 0 && <p className="sub">Aramanla eşleşen coin yok.</p>}
          {visible.map(coin => {
            const up = coin.change24hPct >= 0;
            return (
              <div key={coin.id} className="list-row cm-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div style={{ minWidth: 150, flex: '1 1 150px' }}>
                  <span style={{ fontWeight: 600 }}>
                    {coin.rank && <span className="hint" style={{ marginRight: 6 }}>#{coin.rank}</span>}
                    {coin.name}
                  </span>
                  <span className="badge" style={{ marginLeft: 8, textTransform: 'uppercase' }}>{coin.symbol}</span>
                  {owned.has(coin.id) && <span className="badge badge-green" style={{ marginLeft: 6 }}>PORTFÖYDE</span>}
                  <div className="sub" style={{ marginTop: 2 }}>Piyasa değeri: {formatMarketCap(coin.marketCapTry)}</div>
                </div>

                {/* 7 günlük mini grafik — gerçek veriden, ek istek yok */}
                {coin.sparkline && (
                  <div title="Son 7 gün" style={{ flexShrink: 0 }}>
                    <Sparkline prices={coin.sparkline} up={coin.sparkline[coin.sparkline.length - 1] >= coin.sparkline[0]} />
                    <div className="hint" style={{ margin: 0, fontSize: 10, textAlign: 'center' }}>7g</div>
                  </div>
                )}

                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  <div className="mono" style={{ fontWeight: 600 }}>{fmtTL(coin.priceTry)}</div>
                  <div className="mono sub" style={{ color: up ? 'var(--accent)' : 'var(--red)' }}>
                    {fmtPct(coin.change24hPct)} <span style={{ opacity: 0.7 }}>24s</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className="input cm-amount" type="number" min="1" step="any" placeholder="TL tutarı"
                    style={{ width: 110 }} value={amounts[coin.id] ?? ''}
                    onChange={e => setAmounts(a => ({ ...a, [coin.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addCoin(coin); }}
                  />
                  <button className="mini-btn cm-add" onClick={() => addCoin(coin)} disabled={!(Number(amounts[coin.id]) > 0)}>
                    {added[coin.id] ? <CheckCircle2 size={11} color="var(--accent)" /> : <Plus size={11} />}
                    {added[coin.id] ? 'eklendi' : 'Ekle'}
                  </button>
                </div>
              </div>
            );
          })}

          {filtered.length > shown && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <button className="btn btn-secondary btn-inline" onClick={() => setShown(n => n + PAGE_SIZE)}>
                Daha fazla göster ({filtered.length - shown} coin daha)
              </button>
            </div>
          )}

          <p className="hint" style={{ marginTop: 10 }}>
            "Ekle" ile coin, girdiğin TL tutarına karşılık gelen miktarla (tutar ÷ fiyat) canlı fiyata bağlı olarak
            <strong style={{ color: 'var(--text)' }}> Kripto Varlıklar</strong> paneline eklenir.
            Mini grafikler son 7 günün gerçek fiyat hareketidir.
          </p>
        </div>
      )}
    </div>
  );
}
