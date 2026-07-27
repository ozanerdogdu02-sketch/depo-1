import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { PieChart, Pie, Cell, Tooltip, AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import {
  Bot, Send, TrendingUp, Trash2, RotateCcw, LayoutDashboard, ArrowLeftRight, BookOpen,
  Search, CalendarDays, BarChart3, PieChart as PieChartIcon, Bitcoin, Pencil, Check, X, Download,
  RefreshCw, Loader2, Wifi, Upload, GraduationCap, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { usePortfolio, actions, totalValue, totalCost, pnlOf, fmtTL, fmtPct, fmtSigned, investmentHistoryOf, todayLocalDate, ASSET_LABELS, AssetType, Holding } from './store';
import { analyzePortfolio, chatReply, buildGreeting, extractMentionedHoldings, AgentMessage, ChartSpec } from './agent';
import { getProfile, recordTurn, resetMemory } from './agentMemory';
import { getTrainedFacts, teach, deleteFact, recordFactUse, resetTraining, TrainedFact } from './agentTraining';
import { exportHoldingsCsv, exportTxnsCsv, parseHoldingsCsv } from './csv';
import { CURRENCIES, COINS, fetchTryRate, fetchCryptoTryPrice, MarketFetchError } from './market';

const PIE_COLORS = ['#2dd4a7', '#38bdf8', '#fbbf24', '#a78bfa', '#f87171', '#f472b6'];

type Tab = 'panel' | 'bugun' | 'hisseler' | 'fonlar' | 'kripto' | 'islemler' | 'projeksiyon' | 'ajan';

// Küçük/büyük harf ve Türkçe karakter (İ/ı) duyarlı olmayan basit alt-metin araması.
function matchesSearch(name: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return true;
  return name.toLocaleLowerCase('tr-TR').includes(q);
}

function Onboarding() {
  return (
    <div className="card center fade" style={{ padding: '34px 28px' }}>
      <div className="welcome-icon">📊</div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Hoş geldin, Yatırımcı</h1>
      <p className="sub" style={{ maxWidth: 420, margin: '0 auto 22px' }}>
        Panelin boş görünüyor. Hızlı başlamak için örnek veriyle dene, sonra kendi rakamlarını gir.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440, margin: '0 auto' }}>
        <button className="btn btn-primary" onClick={actions.startWithSample}>Karma örnek portföy</button>
        <button className="btn btn-secondary" onClick={actions.startWithCryptoSample}>
          <Bitcoin size={15} /> Kripto örnek portföyü (canlı fiyatlı)
        </button>
        <button className="btn btn-secondary" onClick={actions.startEmpty}>Kendi paramı gireceğim</button>
      </div>
      <p className="hint" style={{ marginTop: 20 }}>
        🔓 Bu sürümde anahtar gerekmez — panel, işlemler, projeksiyon ve ajan analizi tamamen anahtarsız çalışır.
        Verilerin yalnızca kendi tarayıcında saklanır.
      </p>
    </div>
  );
}

interface PanelProps {
  assetType?: AssetType;
  title?: string;
  query: string;
}

// Yalnızca döviz/kripto: canlı fiyattan TL değeri hesaplar.
async function fetchLiveTl(type: AssetType, symbol: string, quantity: number): Promise<number> {
  const price = type === 'doviz' ? await fetchTryRate(symbol) : await fetchCryptoTryPrice(symbol);
  return quantity * price;
}

function formatFetchedAt(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Panel({ assetType, title, query }: PanelProps) {
  const s = usePortfolio();
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>(assetType ?? 'hisse');
  const [amount, setAmount] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Yeni varlık formunda "canlı fiyata bağla" (opsiyonel, yalnızca döviz/kripto)
  const [liveSymbol, setLiveSymbol] = useState(type === 'kripto' ? COINS[0].id : CURRENCIES[0].code);
  const [liveQuantity, setLiveQuantity] = useState('');
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [linkedQuantity, setLinkedQuantity] = useState<number | null>(null); // Hesapla'ya basılınca dolar

  // Mevcut varlık satırlarında "fiyatı güncelle" akışı
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<{ id: string; message: string } | null>(null);

  // CSV içe aktarma
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Sınıfa göre filtrelenmiş (aramadan etkilenmeyen) gerçek toplam — arama sadece listeyi daraltır.
  const classHoldings = useMemo(
    () => s.holdings.filter(h => !assetType || h.type === assetType),
    [s.holdings, assetType],
  );
  const visibleHoldings = useMemo(
    () => classHoldings.filter(h => matchesSearch(h.name, query)),
    [classHoldings, query],
  );
  const total = classHoldings.reduce((sum, h) => sum + h.amount, 0);
  const cost = classHoldings.reduce((sum, h) => sum + h.costBasis, 0);
  const { abs: pnlAbs, pct: pnlPct } = pnlOf(total, cost);

  const pieData = useMemo(() => {
    const byType = new Map<AssetType, number>();
    for (const h of classHoldings) byType.set(h.type, (byType.get(h.type) ?? 0) + h.amount);
    return [...byType.entries()].map(([t, v]) => ({ name: ASSET_LABELS[t], value: v }));
  }, [classHoldings]);

  // Net yatırım tutarı geçmişi — YALNIZCA kendi işlem kayıtlarından türetilir, piyasa
  // fiyatı içermez. "Ne kadar para yatırdın" grafiğidir, "portföyün ne kadar değerdeydi" değil.
  const investmentHistory = useMemo(() => investmentHistoryOf(s), [s]);

  const addHolding = () => {
    const n = Number(amount);
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    if (actions.holdingNameExists(name)) {
      setNameError('Bu isimde bir varlık zaten var — farklı bir ad seç.');
      return;
    }
    const canLink = (type === 'doviz' || type === 'kripto') && linkedQuantity !== null;
    actions.addHolding(name, type, Math.round(n), canLink ? linkedQuantity : undefined, canLink ? liveSymbol : undefined);
    setName(''); setAmount(''); setLinkedQuantity(null); setLiveQuantity(''); setLiveError(null); setNameError(null);
  };

  const changeType = (t: AssetType) => {
    setType(t);
    setLiveSymbol(t === 'kripto' ? COINS[0].id : CURRENCIES[0].code);
    setLiveQuantity(''); setLinkedQuantity(null); setLiveError(null);
  };

  const calculateLive = async () => {
    const q = Number(liveQuantity);
    if (!Number.isFinite(q) || q <= 0) return;
    setLiveBusy(true);
    setLiveError(null);
    try {
      const tl = await fetchLiveTl(type, liveSymbol, q);
      setAmount(String(Math.round(tl)));
      setLinkedQuantity(q);
    } catch (err) {
      setLiveError(err instanceof MarketFetchError ? err.message : 'Fiyat hesaplanamadı.');
      setLinkedQuantity(null);
    } finally {
      setLiveBusy(false);
    }
  };

  const refreshPrice = async (h: Holding) => {
    if (!h.symbol || h.quantity === undefined) return;
    setRefreshingId(h.id);
    setRefreshError(null);
    try {
      const tl = await fetchLiveTl(h.type, h.symbol, h.quantity);
      actions.applyLivePrice(h.id, Math.round(tl));
    } catch (err) {
      setRefreshError({ id: h.id, message: err instanceof MarketFetchError ? err.message : 'Fiyat güncellenemedi.' });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // aynı dosya tekrar seçilebilsin diye sıfırla
    if (!file) return;
    try {
      const text = await file.text();
      const { rows, skipped } = parseHoldingsCsv(text);
      if (rows.length === 0) {
        setImportMsg({ text: 'Dosyada içe aktarılabilir geçerli satır bulunamadı.', ok: false });
        return;
      }
      const { imported, duplicates } = actions.importHoldings(rows);
      const parts: string[] = [`${imported} varlık eklendi`];
      if (duplicates > 0) parts.push(`${duplicates} satır isim çakışması nedeniyle atlandı`);
      if (skipped > 0) parts.push(`${skipped} satır eksik/geçersiz veri nedeniyle atlandı`);
      setImportMsg({ text: `${parts.join(', ')}.`, ok: imported > 0 });
    } catch {
      setImportMsg({ text: 'Dosya okunamadı — geçerli bir CSV olduğundan emin ol.', ok: false });
    }
    setTimeout(() => setImportMsg(null), 6000);
  };

  const startEdit = (h: Holding) => {
    setEditingId(h.id);
    setEditValue(String(h.amount));
  };
  const saveEdit = () => {
    const n = Number(editValue);
    if (editingId && Number.isFinite(n) && n >= 0) actions.updateHoldingValue(editingId, Math.round(n));
    setEditingId(null);
  };
  const cancelEdit = () => setEditingId(null);

  const emptyLabel = assetType ? ASSET_LABELS[assetType].toLocaleLowerCase('tr-TR') : 'varlık';

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title">{title ?? 'Toplam Portföy'}</div>
        <div className="big-number mono">{fmtTL(total)}</div>
        <div className="sub">{classHoldings.length} varlık · veriler tarayıcında saklanır</div>
        {classHoldings.length > 0 && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div>
              <div className="sub" style={{ marginBottom: 2 }}>Toplam Maliyet</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmtTL(cost)}</div>
            </div>
            <div>
              <div className="sub" style={{ marginBottom: 2 }}>Kâr / Zarar</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: pnlAbs >= 0 ? 'var(--accent)' : 'var(--red)' }}>
                {fmtSigned(pnlAbs)} ({fmtPct(pnlPct)})
              </div>
            </div>
          </div>
        )}
      </div>

      {!assetType && investmentHistory.length >= 2 && (
        <div className="card">
          <div className="card-title">Net Yatırım Tutarı Geçmişi</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={investmentHistory} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="investGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="tarih" tick={{ fill: 'rgba(214,228,238,0.4)', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={d => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} />
              <YAxis tick={{ fill: 'rgba(214,228,238,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}K`} width={40} />
              <Tooltip
                labelFormatter={d => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                formatter={v => [fmtTL(Number(v)), 'Net yatırım']}
                contentStyle={{ background: '#16212c', border: '1px solid rgba(148,180,200,0.2)', borderRadius: 10, fontSize: 13 }}
              />
              <Area type="monotone" dataKey="tutar" stroke="#38bdf8" strokeWidth={2.5} fill="url(#investGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          <p className="hint" style={{ marginTop: 8 }}>
            Bu grafik yatırdığın net tutarı gösterir, piyasa performansını değil (fiyat verisi çekilmez).
            Güncel değerin {fmtTL(total)} — aradaki fark ({fmtSigned(pnlAbs)}) kâr/zararını yansıtır.
          </p>
        </div>
      )}

      {!assetType && (
        <div className="card">
          <div className="card-title">Sınıf Dağılımı</div>
          {pieData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <PieChart width={180} height={180}>
                <Pie data={pieData} cx={85} cy={85} innerRadius={52} outerRadius={78} dataKey="value" strokeWidth={0}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtTL(Number(v))} contentStyle={{ background: '#16212c', border: '1px solid rgba(148,180,200,0.2)', borderRadius: 10, fontSize: 13 }} />
              </PieChart>
              <div style={{ flex: 1, minWidth: 200 }}>
                {pieData.map((d, i) => (
                  <div key={d.name} className="list-row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {d.name}
                    </span>
                    <span className="mono sub">{fmtTL(d.value)} · %{total ? Math.round((d.value / total) * 100) : 0}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="sub">Henüz varlık eklenmedi — buraya bir varlık ekleyince dağılım grafiği burada görünecek.</p>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Varlıklar</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <input
              ref={importInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile}
              style={{ display: 'none' }} aria-label="CSV dosyası seç"
            />
            <button className="mini-btn" onClick={() => importInputRef.current?.click()}>
              <Upload size={11} /> İçe Aktar
            </button>
            {classHoldings.length > 0 && (
              <button className="mini-btn" onClick={() => exportHoldingsCsv(classHoldings)}>
                <Download size={11} /> CSV
              </button>
            )}
          </span>
        </div>
        {importMsg && (
          <p className="hint" style={{ marginBottom: 10, color: importMsg.ok ? 'var(--accent)' : 'var(--red)' }}>
            {importMsg.ok ? '✓' : '✗'} {importMsg.text}
          </p>
        )}
        {classHoldings.length === 0 && <p className="sub">Henüz {emptyLabel} eklenmedi — aşağıdan ekle.</p>}
        {classHoldings.length > 0 && visibleHoldings.length === 0 && (
          <p className="sub">Aramanla eşleşen varlık yok.</p>
        )}
        {/* Metin, listede canlı fiyata bağlı varlık olup olmamasına göre değişir — kripto/döviz
            portföyünde "otomatik veri çekilmez" demek yanlış olurdu (çekiliyor). */}
        {classHoldings.length > 0 && (
          <p className="hint" style={{ marginBottom: 10 }}>
            {classHoldings.some(h => h.symbol)
              ? 'CANLI etiketli varlıklarda 🔄 ikonuyla güncel piyasa fiyatını çekebilirsin; diğerlerini kalem ikonuyla kendin güncellersin.'
              : 'Güncel değeri kalem ikonuyla kendin güncellersin — otomatik piyasa verisi çekilmez.'}
          </p>
        )}
        {visibleHoldings.map(h => {
          const { abs, pct } = pnlOf(h.amount, h.costBasis);
          const isEditing = editingId === h.id;
          return (
            <div key={h.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <div>
                  {h.name} <span className="badge" style={{ marginLeft: 6 }}>{ASSET_LABELS[h.type]}</span>
                  {h.symbol && (
                    <span className="badge badge-live" title="Canlı fiyata bağlı" style={{ marginLeft: 6 }}>
                      <Wifi size={9} /> CANLI
                    </span>
                  )}
                </div>
                <div className="sub" style={{ marginTop: 4, fontSize: 12 }}>
                  Maliyet: {fmtTL(h.costBasis)} ·{' '}
                  <span style={{ color: abs >= 0 ? 'var(--accent)' : 'var(--red)' }}>{fmtSigned(abs)} ({fmtPct(pct)})</span>
                </div>
                {h.symbol && h.lastFetchedAt && (
                  <div className="hint" style={{ marginTop: 2 }}>
                    Son fiyat: {formatFetchedAt(h.lastFetchedAt)}
                    {h.type === 'doviz' ? ' · ECB günlük referans kuru' : ' · CoinGecko, birkaç dk gecikmeli olabilir'}
                  </div>
                )}
                {refreshError?.id === h.id && (
                  <div className="hint" style={{ marginTop: 2, color: 'var(--red)' }}>{refreshError.message}</div>
                )}
              </div>
              {isEditing ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <input
                    className="input" type="number" min="0" autoFocus
                    style={{ width: 110, padding: '6px 10px', fontSize: 13 }}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                    aria-label={`${h.name} güncel değerini gir`}
                  />
                  <button aria-label="kaydet" onClick={saveEdit}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 4 }}>
                    <Check size={16} />
                  </button>
                  <button aria-label="vazgeç" onClick={cancelEdit}
                    style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 4 }}>
                    <X size={16} />
                  </button>
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span className="mono">{fmtTL(h.amount)}</span>
                  {h.symbol && h.quantity !== undefined && (
                    <button
                      aria-label={`${h.name} fiyatını canlı kaynaktan güncelle`} title="Canlı fiyatı çek"
                      onClick={() => refreshPrice(h)} disabled={refreshingId === h.id}
                      style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: refreshingId === h.id ? 'not-allowed' : 'pointer', padding: 4 }}>
                      {refreshingId === h.id ? <Loader2 size={14} className="spin-icon" /> : <RefreshCw size={14} />}
                    </button>
                  )}
                  <button aria-label={`${h.name} güncel değerini güncelle`} title="Güncel değeri elle güncelle" onClick={() => startEdit(h)}
                    style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 4 }}>
                    <Pencil size={14} />
                  </button>
                  <button aria-label={`${h.name} varlığını sil`} onClick={() => actions.removeHolding(h.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={15} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div>
            <label className="field" htmlFor="h-name">Varlık adı</label>
            <input
              id="h-name" className="input" placeholder="ör. BIST 30 Fonu" value={name}
              onChange={e => { setName(e.target.value); setNameError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') addHolding(); }}
            />
            {nameError && <p className="hint" style={{ marginTop: 4, color: 'var(--red)' }}>{nameError}</p>}
          </div>
          <div>
            <label className="field" htmlFor="h-type">Tür</label>
            <select id="h-type" className="select" value={type} onChange={e => changeType(e.target.value as AssetType)}>
              {Object.entries(ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {(type === 'doviz' || type === 'kripto') && (
          <div className="live-link-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Wifi size={12} color="var(--blue)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>Canlı Fiyata Bağla (opsiyonel)</span>
            </div>
            <div className="grid-2">
              <div>
                <label className="field" htmlFor="h-live-symbol">{type === 'doviz' ? 'Para Birimi' : 'Kripto Para'}</label>
                <select
                  id="h-live-symbol" className="select" value={liveSymbol}
                  onChange={e => { setLiveSymbol(e.target.value); setLinkedQuantity(null); }}
                >
                  {(type === 'doviz' ? CURRENCIES.map(c => ({ id: c.code, label: c.label })) : COINS).map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field" htmlFor="h-live-qty">Miktar (birim)</label>
                <input
                  id="h-live-qty" className="input" type="number" min="0" step="any" placeholder={type === 'doviz' ? '500' : '0.01'}
                  value={liveQuantity}
                  onChange={e => { setLiveQuantity(e.target.value); setLinkedQuantity(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') calculateLive(); }}
                />
              </div>
            </div>
            <button
              type="button" className="mini-btn" style={{ marginTop: 10 }}
              onClick={calculateLive} disabled={liveBusy || !(Number(liveQuantity) > 0)}
            >
              {liveBusy ? <Loader2 size={11} className="spin-icon" /> : <RefreshCw size={11} />}
              {liveBusy ? 'Hesaplanıyor…' : 'Hesapla ve Doldur'}
            </button>
            {liveError && <p className="hint" style={{ marginTop: 8, color: 'var(--red)' }}>{liveError}</p>}
            {linkedQuantity !== null && !liveError && (
              <p className="hint" style={{ marginTop: 8, color: 'var(--accent)' }}>
                ✓ Tutar dolduruldu — "Ekle"ye basınca bu varlık canlı fiyata bağlanır.
              </p>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="field" htmlFor="h-amount">Tutar (TL)</label>
            <input
              id="h-amount" className="input" type="number" min="1" placeholder="10000" value={amount}
              onChange={e => { setAmount(e.target.value); setLinkedQuantity(null); }}
              onKeyDown={e => { if (e.key === 'Enter') addHolding(); }}
            />
          </div>
          <button className="btn btn-primary btn-inline" onClick={addHolding} disabled={!name.trim() || !(Number(amount) > 0)}>Ekle</button>
        </div>
      </div>
    </div>
  );
}

function Bugun() {
  const s = usePortfolio();
  const todayStr = todayLocalDate();
  const todaysTxns = useMemo(() => s.txns.filter(t => t.date === todayStr), [s.txns, todayStr]);
  const buyTotal = todaysTxns.filter(t => t.kind === 'alis').reduce((sum, t) => sum + t.amount, 0);
  const sellTotal = todaysTxns.filter(t => t.kind === 'satis').reduce((sum, t) => sum + t.amount, 0);
  const value = totalValue(s);
  const cost = totalCost(s);
  const { abs: pnlAbs, pct: pnlPct } = pnlOf(value, cost);

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title">
          Bugün — {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div className="big-number mono">{fmtTL(value)}</div>
        <div className="sub">güncel toplam portföy değeri</div>
        {s.holdings.length > 0 && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <div>
              <div className="sub" style={{ marginBottom: 2 }}>Toplam Maliyet</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmtTL(cost)}</div>
            </div>
            <div>
              <div className="sub" style={{ marginBottom: 2 }}>Kâr / Zarar</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: pnlAbs >= 0 ? 'var(--accent)' : 'var(--red)' }}>
                {fmtSigned(pnlAbs)} ({fmtPct(pnlPct)})
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Bugünkü Alışlar</div>
          <div className="big-number mono" style={{ fontSize: 24, color: 'var(--accent)' }}>{fmtTL(buyTotal)}</div>
        </div>
        <div className="card">
          <div className="card-title">Bugünkü Satışlar</div>
          <div className="big-number mono" style={{ fontSize: 24, color: 'var(--red)' }}>{fmtTL(sellTotal)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Bugünkü İşlemler</div>
        {todaysTxns.length === 0 && <p className="sub">Bugün henüz işlem yapılmadı.</p>}
        {todaysTxns.map(t => (
          <div key={t.id} className="list-row">
            <span>
              <span className={`badge ${t.kind === 'alis' ? 'badge-green' : 'badge-red'}`}>{t.kind === 'alis' ? 'ALIŞ' : 'SATIŞ'}</span>
              <span style={{ marginLeft: 10 }}>{t.holdingName}</span>
            </span>
            <span className="mono sub">{t.kind === 'alis' ? '+' : '−'}{fmtTL(t.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Islemler({ query }: { query: string }) {
  const s = usePortfolio();
  const [holdingId, setHoldingId] = useState('');
  const [kind, setKind] = useState<'alis' | 'satis'>('alis');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);

  const selectedId = holdingId || s.holdings[0]?.id || '';
  const selectedHolding = s.holdings.find(h => h.id === selectedId);
  const visibleTxns = useMemo(() => s.txns.filter(t => matchesSearch(t.holdingName, query)), [s.txns, query]);

  const add = () => {
    const n = Number(amount);
    if (!selectedHolding || !Number.isFinite(n) || n <= 0) return;
    if (kind === 'satis' && n > selectedHolding.amount) {
      setAmountError(`Bakiyeyi aşamaz — ${selectedHolding.name} için güncel değer ${fmtTL(selectedHolding.amount)}.`);
      return;
    }
    actions.addTxn(selectedHolding.id, kind, Math.round(n));
    setAmount('');
    setAmountError(null);
  };

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={13} /> Nasıl İşlem Eklerim?
        </div>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 18, fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          <li>Aşağıdan bir varlık seç — yoksa önce <strong style={{ color: 'var(--text)' }}>Panel</strong> sekmesinden varlık ekle.</li>
          <li>Alış ya da Satış seç.</li>
          <li>Tutarı gir ve Kaydet'e bas — varlığın bakiyesi otomatik güncellenir.</li>
        </ol>
      </div>

      <div className="card">
        <div className="card-title">Yeni İşlem</div>
        {s.holdings.length === 0 ? (
          <p className="sub">İşlem eklemek için önce Panel sekmesinden varlık oluştur.</p>
        ) : (
          <>
            <div className="grid-2">
              <div>
                <label className="field" htmlFor="t-holding">Varlık</label>
                <select
                  id="t-holding" className="select" value={selectedId}
                  onChange={e => { setHoldingId(e.target.value); setAmountError(null); }}
                >
                  {s.holdings.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field" htmlFor="t-kind">İşlem türü</label>
                <select
                  id="t-kind" className="select" value={kind}
                  onChange={e => { setKind(e.target.value as 'alis' | 'satis'); setAmountError(null); }}
                >
                  <option value="alis">Alış</option>
                  <option value="satis">Satış</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="field" htmlFor="t-amount">Tutar (TL)</label>
                <input
                  id="t-amount" className="input" type="number" min="1"
                  max={kind === 'satis' ? selectedHolding?.amount : undefined}
                  placeholder="5000" value={amount}
                  onChange={e => { setAmount(e.target.value); setAmountError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') add(); }}
                />
              </div>
              <button className="btn btn-primary btn-inline" onClick={add} disabled={!(Number(amount) > 0)}>Kaydet</button>
            </div>
            {amountError && <p className="hint" style={{ marginTop: 8, color: 'var(--red)' }}>{amountError}</p>}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>İşlem Geçmişi</span>
          {s.txns.length > 0 && (
            <button className="mini-btn" onClick={() => exportTxnsCsv(s.txns)}>
              <Download size={11} /> CSV
            </button>
          )}
        </div>
        {s.txns.length === 0 && <p className="sub">Henüz işlem yok.</p>}
        {s.txns.length > 0 && visibleTxns.length === 0 && <p className="sub">Aramanla eşleşen işlem yok.</p>}
        {visibleTxns.map(t => (
          <div key={t.id} className="list-row">
            <span>
              <span className={`badge ${t.kind === 'alis' ? 'badge-green' : 'badge-red'}`}>{t.kind === 'alis' ? 'ALIŞ' : 'SATIŞ'}</span>
              <span style={{ marginLeft: 10 }}>{t.holdingName}</span>
            </span>
            <span className="mono sub">
              {t.kind === 'alis' ? '+' : '−'}{fmtTL(t.amount)} · {new Date(t.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Projeksiyon() {
  const s = usePortfolio();
  const [monthly, setMonthly] = useState(5000);
  const [annualPct, setAnnualPct] = useState(30);
  const [years, setYears] = useState(10);

  const data = useMemo(() => {
    const start = totalValue(s);
    const monthlyRate = Math.pow(1 + annualPct / 100, 1 / 12) - 1;
    const points: { yil: string; deger: number }[] = [];
    let value = start;
    for (let m = 0; m <= years * 12; m++) {
      if (m > 0) value = value * (1 + monthlyRate) + monthly;
      if (m % 12 === 0) points.push({ yil: `${m / 12}. yıl`, deger: Math.round(value) });
    }
    return points;
  }, [s, monthly, annualPct, years]);

  const final = data[data.length - 1]?.deger ?? 0;
  const invested = totalValue(s) + monthly * 12 * years;

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title">Varsayımlar</div>
        <div className="grid-2">
          <div>
            <label className="field" htmlFor="p-monthly">Aylık katkı (TL)</label>
            <input id="p-monthly" className="input" type="number" min="0" value={monthly} onChange={e => setMonthly(Math.max(0, Number(e.target.value)))} />
          </div>
          <div>
            <label className="field" htmlFor="p-rate">Beklenen yıllık getiri (%)</label>
            <input id="p-rate" className="input" type="number" min="0" max="200" value={annualPct} onChange={e => setAnnualPct(Math.min(200, Math.max(0, Number(e.target.value))))} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="field" htmlFor="p-years">Süre: {years} yıl</label>
          <input id="p-years" type="range" min="1" max="30" value={years} onChange={e => setYears(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
        </div>
      </div>

      <div className="card">
        <div className="card-title">{years} Yıl Sonunda</div>
        <div className="big-number mono" style={{ color: 'var(--accent)' }}>{fmtTL(final)}</div>
        <div className="sub">
          Yatırılan toplam: {fmtTL(invested)} · Getiri: {fmtTL(Math.max(0, final - invested))}
        </div>
        <div style={{ marginTop: 18 }}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2dd4a7" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#2dd4a7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="yil" tick={{ fill: 'rgba(214,228,238,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(214,228,238,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}K`} width={44} />
              <Tooltip formatter={v => fmtTL(Number(v))} contentStyle={{ background: '#16212c', border: '1px solid rgba(148,180,200,0.2)', borderRadius: 10, fontSize: 13 }} />
              <Area type="monotone" dataKey="deger" stroke="#2dd4a7" strokeWidth={2.5} fill="url(#projGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Sabit getiri varsayımıyla bileşik hesap — gerçek piyasa getirisi dalgalanır; bu bir projeksiyon aracıdır, taahhüt değildir.
        </p>
      </div>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = { background: '#16212c', border: '1px solid rgba(148,180,200,0.2)', borderRadius: 10, fontSize: 13 };
const CHART_AXIS_TICK = { fill: 'rgba(214,228,238,0.4)', fontSize: 11 };

// Ajan'ın sohbet içinde ürettiği grafikleri (pasta/alan/çubuk) çizer — Panel/Projeksiyon'daki
// aynı Recharts kurulumunu, tek bir ChartSpec'ten türeterek tekrar kullanır.
function AgentChartView({ chart }: { chart: ChartSpec }) {
  return (
    <div style={{ width: 260, marginTop: 8 }}>
      <div className="sub" style={{ marginBottom: 6, fontSize: 12, fontWeight: 600 }}>{chart.title}</div>
      {chart.kind === 'pie' && (
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie data={chart.data} dataKey={chart.dataKey} nameKey={chart.nameKey} cx="50%" cy="50%" innerRadius={40} outerRadius={65} strokeWidth={0}>
              {chart.data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={v => fmtTL(Number(v))} contentStyle={CHART_TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      )}
      {chart.kind === 'area' && (
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chart.data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="agentAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey={chart.nameKey} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false}
              tickFormatter={d => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}K`} width={36} />
            <Tooltip formatter={v => fmtTL(Number(v))} contentStyle={CHART_TOOLTIP_STYLE} />
            <Area type="monotone" dataKey={chart.dataKey} stroke="#38bdf8" strokeWidth={2} fill="url(#agentAreaGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
      {chart.kind === 'bar' && (
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={chart.data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <XAxis dataKey={chart.nameKey} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} hide={chart.data.length > 4} />
            <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}K`} width={36} />
            <Tooltip formatter={v => fmtTL(Number(v))} contentStyle={CHART_TOOLTIP_STYLE} />
            <Bar dataKey={chart.dataKey} radius={[4, 4, 0, 0]}>
              {chart.data.map((d, i) => <Cell key={i} fill={Number(d[chart.dataKey]) >= 0 ? '#2dd4a7' : '#f87171'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TeachPanel({ facts, onTeach, onDelete, open, onToggleOpen, q, a, onQChange, onAChange }: {
  facts: TrainedFact[];
  onTeach: (q: string, a: string) => void;
  onDelete: (id: string) => void;
  open: boolean;
  onToggleOpen: () => void;
  q: string;
  a: string;
  onQChange: (v: string) => void;
  onAChange: (v: string) => void;
}) {
  const submit = () => {
    if (!q.trim() || !a.trim()) return;
    onTeach(q, a);
  };

  return (
    <div className="card">
      <button
        onClick={onToggleOpen}
        style={{
          background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        }}
        aria-expanded={open}
      >
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
          <GraduationCap size={14} /> Ajanı Eğit {facts.length > 0 && <span className="badge">{facts.length}</span>}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginBottom: 10 }}>
            Bir soru-cevap öğret — bundan sonra benzer bir soru sorduğunda ajan önce bunu kullanır (built-in
            cevaplardan önce gelir). Bu bir yapay zeka eğitimi değil: kelime örtüşmesine göre eşleşen, senin
            yazdığın sabit bir cevap kartıdır. Yalnızca tarayıcında saklanır.
          </p>
          <div>
            <label className="field" htmlFor="teach-q">Soru</label>
            <input id="teach-q" className="input" placeholder='ör. "temettü nedir"' value={q} onChange={e => onQChange(e.target.value)} />
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="field" htmlFor="teach-a">Cevap</label>
            <textarea
              id="teach-a" className="input" rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Ajanın bu soruya vereceği cevabı yaz…" value={a} onChange={e => onAChange(e.target.value)}
            />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary btn-inline" onClick={submit} disabled={!q.trim() || !a.trim()}>
              <GraduationCap size={15} /> Öğret
            </button>
          </div>
          {facts.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div className="sub" style={{ marginBottom: 8 }}>Öğretilmiş bilgiler</div>
              {facts.map(f => (
                <div key={f.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{f.question}</div>
                    <div className="sub" style={{ marginTop: 2, fontSize: 12.5 }}>{f.answer}</div>
                    <div className="hint" style={{ marginTop: 2 }}>{f.timesUsed} kez kullanıldı</div>
                  </div>
                  <button aria-label={`"${f.question}" öğretisini sil`} onClick={() => onDelete(f.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Bir agent mesajından geriye doğru en yakın kullanıcı mesajını bulur — 👎 ile Eğit paneli
// açıldığında "Soru" alanını otomatik doldurmak için.
function findPrecedingUserText(messages: AgentMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].text;
  }
  return '';
}

function Ajan() {
  const s = usePortfolio();
  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    { role: 'agent', text: buildGreeting(getProfile()) },
  ]);
  const [input, setInput] = useState('');
  const [facts, setFacts] = useState<TrainedFact[]>(() => getTrainedFacts());
  const [teachOpen, setTeachOpen] = useState(false);
  const [teachQ, setTeachQ] = useState('');
  const [teachA, setTeachA] = useState('');

  const runAnalysis = () => {
    recordTurn('analiz', []);
    setMessages(m => [
      ...m,
      { role: 'user', text: 'Portföyümü analiz et' },
      ...analyzePortfolio(s).map(text => ({ role: 'agent' as const, text, intentId: 'analiz', ratable: true })),
    ]);
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: AgentMessage = { role: 'user', text };
    const reply = chatReply(s, text, messages, getProfile(), facts);
    recordTurn(reply.intentId, extractMentionedHoldings(s, text));
    if (reply.trainedFactId) {
      recordFactUse(reply.trainedFactId);
      setFacts(getTrainedFacts());
    }
    setMessages(m => [...m, userMsg, {
      role: 'agent', text: reply.text, chart: reply.chart, intentId: reply.intentId,
      trainedFactId: reply.trainedFactId, isFallback: reply.isFallback, ratable: !reply.pendingAction,
      pendingAction: reply.pendingAction,
    }]);
    setInput('');
  };

  // Ajan bir alım/satım komutu ÖNERDİĞİNDE (pendingAction) burada onaylanana kadar hiçbir
  // gerçek veri değişmez — actions.addTxn yalnızca kullanıcı "Onayla"ya bastığında çağrılır.
  // Bakiye aşımı kontrolü İşlemler sekmesindekiyle birebir aynı (bkz. Islemler bileşeni).
  const resolveAction = (index: number, confirmed: boolean) => {
    const msg = messages[index];
    if (!msg.pendingAction || msg.actionResolved) return;
    const { kind, holdingId, holdingName, amount } = msg.pendingAction;

    if (!confirmed) {
      setMessages(m => [
        ...m.map((mm, i) => i === index ? { ...mm, actionResolved: 'cancelled' as const } : mm),
        { role: 'agent', text: 'Tamam, işlemi iptal ettim.' },
      ]);
      return;
    }

    const holding = s.holdings.find(h => h.id === holdingId);
    if (!holding) {
      setMessages(m => [
        ...m.map((mm, i) => i === index ? { ...mm, actionResolved: 'cancelled' as const } : mm),
        { role: 'agent', text: `${holdingName} artık portföyünde yok — işlemi uygulayamadım.` },
      ]);
      return;
    }
    if (kind === 'satis' && amount > holding.amount) {
      setMessages(m => [
        ...m.map((mm, i) => i === index ? { ...mm, actionResolved: 'cancelled' as const } : mm),
        { role: 'agent', text: `Bakiyeyi aşamaz — ${holdingName} için güncel değer ${fmtTL(holding.amount)}. İşlemi uygulamadım.` },
      ]);
      return;
    }

    actions.addTxn(holdingId, kind, amount);
    const newAmount = kind === 'alis' ? holding.amount + amount : Math.max(0, holding.amount - amount);
    setMessages(m => [
      ...m.map((mm, i) => i === index ? { ...mm, actionResolved: 'confirmed' as const } : mm),
      { role: 'agent', text: `Yaptım — ${holdingName} için ${fmtTL(amount)} ${kind === 'alis' ? 'alış' : 'satış'} işlendi. Güncel değer: ${fmtTL(newAmount)}.` },
    ]);
  };

  const handleTeach = (q: string, a: string) => {
    setFacts(teach(q, a));
    setTeachQ(''); setTeachA('');
  };
  const handleDeleteFact = (id: string) => setFacts(deleteFact(id));

  // 👍: zaten öğretilmiş bir bilgiyse yapacak bir şey yok. Built-in bir kuraldan geldiyse
  // (öğretilmiş DEĞİL, fallback DEĞİL) bu cevabı olduğu gibi öğretilmiş bilgiye "terfi ettirir" —
  // aynı soru bir daha sorulduğunda artık kesin/hızlı yoldan (findBestMatch) gelir.
  // 👎: hangi kaynaktan geldiğine bakılmaksızın "Ajanı Eğit" panelini, ilgili soruyla
  // (ve öğretilmiş bir cevapsa mevcut metinle) önceden doldurulmuş halde açar — kullanıcı
  // düzeltmeyi doğrudan yazar, bu da chatReply'nin bir sonraki turda kullanacağı gerçek veriyi üretir.
  const rate = (index: number, rating: 'up' | 'down') => {
    const msg = messages[index];
    if (msg.role !== 'agent' || !msg.ratable || msg.rated) return;
    setMessages(m => m.map((mm, i) => i === index ? { ...mm, rated: rating } : mm));

    if (rating === 'up') {
      if (!msg.trainedFactId && !msg.isFallback) {
        const question = findPrecedingUserText(messages, index);
        if (question) setFacts(teach(question, msg.text));
      }
      return;
    }

    const question = findPrecedingUserText(messages, index);
    setTeachQ(question);
    setTeachA(msg.trainedFactId ? msg.text : '');
    setTeachOpen(true);
  };

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={14} /> Demo Ajan — Anahtarsız
        </div>
        <div className="chat-box">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'agent' ? 'msg-agent' : 'msg-user'}`}>
              {m.text}
              {m.chart && <AgentChartView chart={m.chart} />}
              {m.role === 'agent' && m.pendingAction && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="btn btn-primary btn-inline" style={{ padding: '4px 10px', fontSize: 12.5 }}
                    disabled={!!m.actionResolved} onClick={() => resolveAction(i, true)}
                  >
                    {m.actionResolved === 'confirmed' ? 'Onaylandı ✓' : 'Onayla'}
                  </button>
                  <button
                    className="btn btn-secondary btn-inline" style={{ padding: '4px 10px', fontSize: 12.5 }}
                    disabled={!!m.actionResolved} onClick={() => resolveAction(i, false)}
                  >
                    {m.actionResolved === 'cancelled' ? 'Vazgeçildi' : 'Vazgeç'}
                  </button>
                </div>
              )}
              {m.role === 'agent' && m.ratable && (
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  <button
                    aria-label="Bu cevabı beğendim" title="Beğendim" disabled={!!m.rated}
                    onClick={() => rate(i, 'up')}
                    style={{
                      background: 'none', border: 'none', cursor: m.rated ? 'default' : 'pointer', padding: 3,
                      color: m.rated === 'up' ? 'var(--accent)' : 'var(--faint)', opacity: m.rated && m.rated !== 'up' ? 0.35 : 1,
                    }}>
                    <ThumbsUp size={13} />
                  </button>
                  <button
                    aria-label="Bu cevabı beğenmedim, düzeltmek istiyorum" title="Beğenmedim — düzelt" disabled={!!m.rated}
                    onClick={() => rate(i, 'down')}
                    style={{
                      background: 'none', border: 'none', cursor: m.rated ? 'default' : 'pointer', padding: 3,
                      color: m.rated === 'down' ? 'var(--red)' : 'var(--faint)', opacity: m.rated && m.rated !== 'down' ? 0.35 : 1,
                    }}>
                    <ThumbsDown size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary btn-inline" onClick={runAnalysis}>
            <TrendingUp size={15} /> Analiz Et
          </button>
        </div>
        <div className="row">
          <input
            className="input"
            placeholder='Soru sor: "dağılım", "risk", "THYAO nasıl gidiyor", "grafik çiz"…'
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            aria-label="Ajana soru sor"
          />
          <button className="btn btn-blue btn-inline" onClick={send} disabled={!input.trim()} aria-label="Gönder">
            <Send size={15} />
          </button>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Bu ajan yerel kurallarla çalışır; API anahtarı istemez ve verin tarayıcından çıkmaz. Yanıtları yatırım tavsiyesi değildir.
        </p>
      </div>

      <TeachPanel
        facts={facts} onTeach={handleTeach} onDelete={handleDeleteFact}
        open={teachOpen} onToggleOpen={() => setTeachOpen(o => !o)}
        q={teachQ} a={teachA} onQChange={setTeachQ} onAChange={setTeachA}
      />
    </div>
  );
}

function SideLink({ active, onClick, icon: Icon, label, badge }: {
  active: boolean;
  onClick: () => void;
  icon: typeof Bot;
  label: string;
  badge?: string;
}) {
  return (
    <button className={`side-link ${active ? 'side-link-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <Icon size={15} />
      {label}
      {badge && <span className="side-badge">{badge}</span>}
    </button>
  );
}

export default function App() {
  const s = usePortfolio();
  const [tab, setTab] = useState<Tab>('panel');
  const [query, setQuery] = useState('');

  const resetAll = () => {
    if (confirm('Tüm veriler silinsin ve başa dönülsün mü?')) {
      actions.reset();
      resetMemory();
      resetTraining();
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="brand">FAGENT</span>
          <span className="side-role">yatırımcı</span>
        </div>

        <div className="status-pill">
          <span className="status-dot" />
          ANAHTARSIZ MOD
        </div>

        {s.onboarded && (
          <>
            <div className="side-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Ara…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                aria-label="Varlık ve işlemlerde ara"
              />
            </div>

            <nav className="side-nav" aria-label="Bölümler">
              <SideLink active={tab === 'panel'} onClick={() => setTab('panel')} icon={LayoutDashboard} label="PANEL" />
              <SideLink active={tab === 'bugun'} onClick={() => setTab('bugun')} icon={CalendarDays} label="BUGÜN" />
              <SideLink active={tab === 'hisseler'} onClick={() => setTab('hisseler')} icon={BarChart3} label="HİSSELER" />
              <SideLink active={tab === 'fonlar'} onClick={() => setTab('fonlar')} icon={PieChartIcon} label="FONLAR" />
              <SideLink active={tab === 'kripto'} onClick={() => setTab('kripto')} icon={Bitcoin} label="KRİPTO VARLIKLAR" />
              <SideLink active={tab === 'islemler'} onClick={() => setTab('islemler')} icon={ArrowLeftRight} label="İŞLEMLER" />
              <SideLink active={tab === 'projeksiyon'} onClick={() => setTab('projeksiyon')} icon={TrendingUp} label="PROJEKSİYON" />
              <div className="side-divider" />
              <SideLink active={tab === 'ajan'} onClick={() => setTab('ajan')} icon={Bot} label="AJAN" badge="YENİ" />
            </nav>
            <button className="side-reset" onClick={resetAll} title="Verileri sıfırla">
              <RotateCcw size={13} /> SIFIRLA
            </button>
          </>
        )}
      </aside>

      <main className="main">
        <div className="main-inner">
          {!s.onboarded ? (
            <Onboarding />
          ) : (
            <>
              {tab === 'panel' && <Panel query={query} />}
              {tab === 'bugun' && <Bugun />}
              {tab === 'hisseler' && <Panel assetType="hisse" title="Toplam Hisse" query={query} />}
              {tab === 'fonlar' && <Panel assetType="fon" title="Toplam Fon" query={query} />}
              {tab === 'kripto' && <Panel assetType="kripto" title="Toplam Kripto Varlık" query={query} />}
              {tab === 'islemler' && <Islemler query={query} />}
              {tab === 'projeksiyon' && <Projeksiyon />}
              {tab === 'ajan' && <Ajan />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
