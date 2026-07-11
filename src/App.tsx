import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Bot, Send, TrendingUp, Trash2, RotateCcw } from 'lucide-react';
import { usePortfolio, actions, totalValue, fmtTL, ASSET_LABELS, AssetType } from './store';
import { analyzePortfolio, chatReply, AgentMessage } from './agent';

const PIE_COLORS = ['#2dd4a7', '#38bdf8', '#fbbf24', '#a78bfa', '#f87171', '#f472b6'];

type Tab = 'panel' | 'islemler' | 'projeksiyon' | 'ajan';

function Onboarding() {
  return (
    <div className="card center fade" style={{ padding: '34px 28px' }}>
      <div className="welcome-icon">📊</div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Hoş geldin, Yatırımcı</h1>
      <p className="sub" style={{ maxWidth: 420, margin: '0 auto 22px' }}>
        Panelin boş görünüyor. Hızlı başlamak için örnek veriyle dene, sonra kendi rakamlarını gir.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 440, margin: '0 auto' }}>
        <button className="btn btn-primary" onClick={actions.startWithSample}>Örnek veriyle başla</button>
        <button className="btn btn-secondary" onClick={actions.startEmpty}>Kendi paramı gireceğim</button>
      </div>
      <p className="hint" style={{ marginTop: 20 }}>
        🔓 Bu sürümde anahtar gerekmez — panel, işlemler, projeksiyon ve ajan analizi tamamen anahtarsız çalışır.
        Verilerin yalnızca kendi tarayıcında saklanır.
      </p>
    </div>
  );
}

function Panel() {
  const s = usePortfolio();
  const total = totalValue(s);
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('hisse');
  const [amount, setAmount] = useState('');

  const pieData = useMemo(() => {
    const byType = new Map<AssetType, number>();
    for (const h of s.holdings) byType.set(h.type, (byType.get(h.type) ?? 0) + h.amount);
    return [...byType.entries()].map(([t, v]) => ({ name: ASSET_LABELS[t], value: v }));
  }, [s.holdings]);

  const addHolding = () => {
    const n = Number(amount);
    if (!name.trim() || !Number.isFinite(n) || n <= 0) return;
    actions.addHolding(name, type, Math.round(n));
    setName(''); setAmount('');
  };

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title">Toplam Portföy</div>
        <div className="big-number mono">{fmtTL(total)}</div>
        <div className="sub">{s.holdings.length} varlık · veriler tarayıcında saklanır</div>
      </div>

      {pieData.length > 0 && (
        <div className="card">
          <div className="card-title">Sınıf Dağılımı</div>
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
        </div>
      )}

      <div className="card">
        <div className="card-title">Varlıklar</div>
        {s.holdings.length === 0 && <p className="sub">Henüz varlık yok — aşağıdan ekle.</p>}
        {s.holdings.map(h => (
          <div key={h.id} className="list-row">
            <span>
              {h.name} <span className="badge" style={{ marginLeft: 6 }}>{ASSET_LABELS[h.type]}</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mono">{fmtTL(h.amount)}</span>
              <button aria-label={`${h.name} varlığını sil`} onClick={() => actions.removeHolding(h.id)}
                style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 4 }}>
                <Trash2 size={15} />
              </button>
            </span>
          </div>
        ))}
        <div className="grid-2" style={{ marginTop: 16 }}>
          <div>
            <label className="field" htmlFor="h-name">Varlık adı</label>
            <input id="h-name" className="input" placeholder="ör. BIST 30 Fonu" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="field" htmlFor="h-type">Tür</label>
            <select id="h-type" className="select" value={type} onChange={e => setType(e.target.value as AssetType)}>
              {Object.entries(ASSET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label className="field" htmlFor="h-amount">Tutar (TL)</label>
            <input id="h-amount" className="input" type="number" min="1" placeholder="10000" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-inline" onClick={addHolding} disabled={!name.trim() || !(Number(amount) > 0)}>Ekle</button>
        </div>
      </div>
    </div>
  );
}

function Islemler() {
  const s = usePortfolio();
  const [holdingName, setHoldingName] = useState('');
  const [kind, setKind] = useState<'alis' | 'satis'>('alis');
  const [amount, setAmount] = useState('');

  const selected = holdingName || s.holdings[0]?.name || '';

  const add = () => {
    const n = Number(amount);
    if (!selected || !Number.isFinite(n) || n <= 0) return;
    actions.addTxn(selected, kind, Math.round(n));
    setAmount('');
  };

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title">Yeni İşlem</div>
        {s.holdings.length === 0 ? (
          <p className="sub">İşlem eklemek için önce Panel sekmesinden varlık oluştur.</p>
        ) : (
          <>
            <div className="grid-2">
              <div>
                <label className="field" htmlFor="t-holding">Varlık</label>
                <select id="t-holding" className="select" value={selected} onChange={e => setHoldingName(e.target.value)}>
                  {s.holdings.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label className="field" htmlFor="t-kind">İşlem türü</label>
                <select id="t-kind" className="select" value={kind} onChange={e => setKind(e.target.value as 'alis' | 'satis')}>
                  <option value="alis">Alış</option>
                  <option value="satis">Satış</option>
                </select>
              </div>
            </div>
            <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="field" htmlFor="t-amount">Tutar (TL)</label>
                <input id="t-amount" className="input" type="number" min="1" placeholder="5000" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-inline" onClick={add} disabled={!(Number(amount) > 0)}>Kaydet</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="card-title">İşlem Geçmişi</div>
        {s.txns.length === 0 && <p className="sub">Henüz işlem yok.</p>}
        {s.txns.map(t => (
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

function Ajan() {
  const s = usePortfolio();
  const [messages, setMessages] = useState<AgentMessage[]>([
    { role: 'agent', text: 'Merhaba! Ben FAGENT demo ajanı — anahtar gerektirmeden çalışırım. "Analiz Et" butonuna bas ya da portföyün hakkında soru sor.' },
  ]);
  const [input, setInput] = useState('');

  const runAnalysis = () => {
    setMessages(m => [...m, { role: 'user', text: 'Portföyümü analiz et' }, ...analyzePortfolio(s).map(text => ({ role: 'agent' as const, text }))]);
  };

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages(m => [...m, { role: 'user', text }, { role: 'agent', text: chatReply(s, text) }]);
    setInput('');
  };

  return (
    <div className="fade">
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={14} /> Demo Ajan — Anahtarsız
        </div>
        <div className="chat-box">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'agent' ? 'msg-agent' : 'msg-user'}`}>{m.text}</div>
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
            placeholder='Soru sor: "dağılım", "risk", "enflasyon"…'
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
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'panel', label: 'PANEL' },
  { id: 'islemler', label: 'İŞLEMLER' },
  { id: 'projeksiyon', label: 'PROJEKSİYON' },
  { id: 'ajan', label: 'AJAN' },
];

export default function App() {
  const s = usePortfolio();
  const [tab, setTab] = useState<Tab>('panel');

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">FAGENT</span>
        <span className="topbar-right">yatırımcı</span>
      </header>

      <div className="status-pill">
        <span className="status-dot" />
        ANAHTARSIZ MOD — HER ŞEY AÇIK
      </div>

      {!s.onboarded ? (
        <Onboarding />
      ) : (
        <>
          <nav className="tabs" aria-label="Bölümler">
            {TABS.map(t => (
              <button key={t.id} className={`tab ${tab === t.id ? 'tab-active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
            <button
              className="tab"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => { if (confirm('Tüm veriler silinsin ve başa dönülsün mü?')) actions.reset(); }}
              title="Verileri sıfırla"
            >
              <RotateCcw size={12} /> SIFIRLA
            </button>
          </nav>
          {tab === 'panel' && <Panel />}
          {tab === 'islemler' && <Islemler />}
          {tab === 'projeksiyon' && <Projeksiyon />}
          {tab === 'ajan' && <Ajan />}
        </>
      )}
    </div>
  );
}
