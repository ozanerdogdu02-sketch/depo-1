import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Plus, CheckCircle2 } from 'lucide-react';
import { usePortfolio, actions, fmtTL, fmtPct, AssetType } from './store';
import { CryptoMarketCoin, CryptoMarketError, fetchTopCoins, formatMarketCap } from './cryptoMarket';

const KRIPTO: AssetType = 'kripto';

// Kripto Piyasası — CoinGecko genel API'sinden en büyük coinlerin canlı fiyatı, 24s değişimi ve
// piyasa değeri. Kullanıcı bir coini inline TL tutarı girerek hızlıca portföye ekleyebilir.
// Anahtarsız; ağ hatasında sahte veri değil, Türkçe hata + "Tekrar dene" gösterilir.
export function CryptoMarket() {
  const s = usePortfolio();
  const [coins, setCoins] = useState<CryptoMarketCoin[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTopCoins(20);
      setCoins(data);
    } catch (err) {
      setError(err instanceof CryptoMarketError ? err.message : 'Piyasa verisi alınamadı.');
      setCoins(null);
    } finally {
      setLoading(false);
    }
  };

  // İlk açılışta otomatik çek.
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    if (!coins) return [];
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return coins;
    return coins.filter(c => c.name.toLocaleLowerCase('tr-TR').includes(q) || c.symbol.toLocaleLowerCase('tr-TR').includes(q));
  }, [coins, search]);

  const addCoin = (coin: CryptoMarketCoin) => {
    const tutar = Number(amounts[coin.id]);
    if (!Number.isFinite(tutar) || tutar <= 0 || coin.priceTry <= 0) return;
    // Miktar = tutar / fiyat → varlık canlı fiyata bağlı olarak eklenir (symbol = CoinGecko id).
    actions.addHolding(coin.name, KRIPTO, Math.round(tutar), tutar / coin.priceTry, coin.id);
    setAmounts(a => ({ ...a, [coin.id]: '' }));
    setAdded(a => ({ ...a, [coin.id]: true }));
    setTimeout(() => setAdded(a => ({ ...a, [coin.id]: false })), 2500);
  };

  // Zaten portföyde olan coinler (canlı-bağlı varlıklarda symbol = CoinGecko id).
  const owned = useMemo(() => new Set(s.holdings.map(h => h.symbol).filter(Boolean)), [s.holdings]);

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Kripto Piyasası</span>
          <button className="mini-btn" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={11} className="spin-icon" /> : <RefreshCw size={11} />}
            {loading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
        <p className="sub">
          {coins ? `${coins.length} coin · ` : ''}CoinGecko genel API üzerinden en büyük coinler (anahtarsız, birkaç dakika gecikmeli olabilir).
        </p>

        {coins && coins.length > 0 && (
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
            <input
              id="cm-search" className="input" placeholder="Coin ara (ör. Bitcoin, ETH)…"
              style={{ paddingLeft: 32 }} value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
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
          <button className="btn btn-primary btn-inline" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={13} className="spin-icon" /> : <RefreshCw size={13} />} Tekrar dene
          </button>
        </div>
      )}

      {coins && !error && (
        <div className="card">
          {visible.length === 0 && <p className="sub">Aramanla eşleşen coin yok.</p>}
          {visible.map(coin => {
            const up = coin.change24hPct >= 0;
            return (
              <div key={coin.id} className="list-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div style={{ minWidth: 150 }}>
                  <span style={{ fontWeight: 600 }}>{coin.name}</span>
                  <span className="badge" style={{ marginLeft: 8, textTransform: 'uppercase' }}>{coin.symbol}</span>
                  {owned.has(coin.id) && (
                    <span className="badge badge-green" style={{ marginLeft: 6 }}>PORTFÖYDE</span>
                  )}
                  <div className="sub" style={{ marginTop: 2 }}>Piyasa değeri: {formatMarketCap(coin.marketCapTry)}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 120 }}>
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
                  <button
                    className="mini-btn cm-add" onClick={() => addCoin(coin)}
                    disabled={!(Number(amounts[coin.id]) > 0)}
                  >
                    {added[coin.id] ? <CheckCircle2 size={11} color="var(--accent)" /> : <Plus size={11} />}
                    {added[coin.id] ? 'eklendi' : 'Ekle'}
                  </button>
                </div>
              </div>
            );
          })}
          <p className="hint" style={{ marginTop: 10 }}>
            "Ekle" ile coin, girdiğin TL tutarına karşılık gelen miktarla (tutar ÷ fiyat) canlı fiyata bağlı olarak
            <strong style={{ color: 'var(--text)' }}> Kripto Varlıklar</strong> paneline eklenir.
          </p>
        </div>
      )}
    </div>
  );
}
