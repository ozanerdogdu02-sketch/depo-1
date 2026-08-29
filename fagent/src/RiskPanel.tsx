import { useState } from 'react';
import { Loader2, ShieldAlert, ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { usePortfolio, fmtTL, fmtPct, fmtDec } from './store';
import { buildRiskReport, RiskReport } from './priceHistory';
import { volatilityLevel } from './analytics';

// Risksiz faiz için anahtarsız/CORS-açık bir Türkiye kaynağı yok (TCMB dahil). Enflasyon
// varsayımında olduğu gibi bunu da kullanıcıya bırakıyoruz ve "senin varsayımın" diye
// etiketliyoruz — uydurma bir sabit göstermek yanıltıcı olurdu.
const DEFAULT_RISK_FREE_PCT = 45;

const LEVEL_TEXT: Record<ReturnType<typeof volatilityLevel>, { label: string; color: string }> = {
  'dusuk': { label: 'düşük', color: 'var(--accent)' },
  'orta': { label: 'orta', color: 'var(--blue)' },
  'yuksek': { label: 'yüksek', color: 'var(--amber, #fbbf24)' },
  'cok-yuksek': { label: 'çok yüksek', color: 'var(--red)' },
};

// Risk Analizi — GERÇEK tarihsel fiyat serisinden volatilite, maksimum düşüş ve
// çeşitlendirme faydası. Portföyün yalnızca fiyat geçmişi ALINABİLEN kısmını kapsar;
// kapsam oranı ve kapsam dışı varlıklar açıkça yazılır.
export function RiskPanel() {
  const s = usePortfolio();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [riskFree, setRiskFree] = useState(DEFAULT_RISK_FREE_PCT);

  const run = async () => {
    setLoading(true);
    try {
      setReport(await buildRiskReport(s, { days: 90, riskFreePct: riskFree }));
    } finally {
      setLoading(false);
    }
  };

  const hasCoverage = report && report.assets.length > 0;
  const level = hasCoverage ? volatilityLevel(report.portfolioVolPct) : undefined;

  return (
    <div className="card" style={{ borderColor: 'rgba(251,191,36,0.35)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        aria-expanded={open}
      >
        <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
          <ShieldAlert size={14} color="var(--amber, #fbbf24)" /> Risk Analizi
          <span className="badge" style={{ color: 'var(--amber, #fbbf24)', borderColor: 'rgba(251,191,36,0.4)' }}>GERÇEK VERİ</span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div style={{ marginTop: 12 }} data-testid="risk-body">
          <p className="hint" style={{ marginBottom: 12 }}>
            Volatilite ve maksimum düşüş, varlıklarının <strong style={{ color: 'var(--text)' }}>son 90 günlük gerçek fiyat geçmişinden</strong> hesaplanır
            (kripto: CoinGecko, döviz: ECB). Fiyat geçmişi alınamayan varlıklar hesaba katılmaz — kapsam oranı aşağıda yazılıdır.
          </p>

          <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
            <div style={{ flex: 1, maxWidth: 220 }}>
              <label className="field" htmlFor="risk-free">Risksiz faiz varsayımın (%)</label>
              <input
                id="risk-free" className="input" type="number" min="0" max="200" value={riskFree}
                onChange={e => setRiskFree(Math.min(200, Math.max(0, Number(e.target.value))))}
              />
            </div>
            <button className="btn btn-primary btn-inline" onClick={run} disabled={loading || s.holdings.length === 0}>
              {loading ? <Loader2 size={14} className="spin-icon" /> : <Activity size={14} />}
              {loading ? 'Hesaplanıyor…' : 'Hesapla'}
            </button>
          </div>

          {s.holdings.length === 0 && <p className="sub">Önce portföyüne varlık ekle.</p>}

          {report && !hasCoverage && (
            <div className="card" style={{ background: 'transparent', borderColor: 'var(--line)', marginBottom: 0 }}>
              <p className="hint" style={{ margin: 0 }}>
                Hiçbir varlığın için tarihsel fiyat alınamadı, bu yüzden risk metriği <strong style={{ color: 'var(--text)' }}>hesaplayamıyorum</strong>.
                Volatilite ve düşüş hesabı geçmiş fiyat serisi ister; bu yalnızca <strong style={{ color: 'var(--text)' }}>canlı fiyata bağlı kripto ve döviz</strong> varlıkları için mümkün.
                Kripto Piyasası sekmesinden bir coin eklersen ya da bir dövizi canlı fiyata bağlarsan hesaplayabilirim.
              </p>
              {report.uncovered.length > 0 && (
                <ul style={{ margin: '10px 0 0 18px' }}>
                  {report.uncovered.map((u, i) => (
                    <li key={i} className="hint" style={{ margin: 0 }}>{u.name} — {u.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {hasCoverage && level && (
            <>
              {/* Kapsam beyanı — metrikten ÖNCE, çünkü rakamın ne kadarını temsil ettiği kritik */}
              <p className="hint" style={{ marginBottom: 12, color: report.coveragePct < 60 ? 'var(--amber, #fbbf24)' : undefined }}>
                📊 Bu rakamlar portföyünün <strong style={{ color: 'var(--text)' }}>%{fmtDec(report.coveragePct, 0)}</strong>'ini kapsıyor
                ({fmtTL(report.coveredValue)} / {fmtTL(report.totalValue)}).
                {report.uncovered.length > 0 && ` Kapsam dışı: ${report.uncovered.map(u => u.name).join(', ')}.`}
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 14 }}>
                <div>
                  <div className="sub" style={{ marginBottom: 2 }}>Yıllık volatilite</div>
                  <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: LEVEL_TEXT[level].color }}>
                    %{fmtDec(report.portfolioVolPct, 1)}
                  </div>
                  <div className="hint" style={{ margin: 0 }}>{LEVEL_TEXT[level].label}</div>
                </div>
                <div>
                  <div className="sub" style={{ marginBottom: 2 }}>Maksimum düşüş (90g)</div>
                  <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: 'var(--red)' }}>
                    −%{fmtDec(report.portfolioDrawdownPct, 1)}
                  </div>
                  <div className="hint" style={{ margin: 0 }}>zirveden dibe</div>
                </div>
                <div>
                  <div className="sub" style={{ marginBottom: 2 }}>Yıllık getiri (fiyat)</div>
                  <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: report.portfolioAnnualReturnPct >= 0 ? 'var(--accent)' : 'var(--red)' }}>
                    {fmtPct(report.portfolioAnnualReturnPct)}
                  </div>
                  <div className="hint" style={{ margin: 0 }}>90 günden yıllıklandırıldı</div>
                </div>
                {report.sharpe !== undefined && (
                  <div>
                    <div className="sub" style={{ marginBottom: 2 }}>Sharpe oranı</div>
                    <div className="mono" style={{ fontSize: 17, fontWeight: 700 }}>{fmtDec(report.sharpe, 2)}</div>
                    <div className="hint" style={{ margin: 0 }}>%{riskFree} risksiz faize göre</div>
                  </div>
                )}
              </div>

              {/* Karşılaştırmada YUKARIDAKİ başlık rakamı (gerçek portföy endeksinden) kullanılır;
                  kovaryans ayrıştırması yalnızca "çeşitlendirme olmasaydı" senaryosunu verir.
                  İki farklı portföy volatilitesi göstermek kullanıcıyı şaşırtırdı. */}
              {report.decomposition && report.decomposition.weightedAvgVolPct - report.portfolioVolPct > 0.1 && (
                <p className="hint" style={{ marginBottom: 12 }}>
                  <strong style={{ color: 'var(--accent)' }}>Çeşitlendirme faydası:</strong> varlıkların tek tek volatilitelerinin ağırlıklı ortalaması
                  %{fmtDec(report.decomposition.weightedAvgVolPct, 1)} olurdu (hepsi birlikte hareket etseydi); gerçekte portföy volatiliten
                  %{fmtDec(report.portfolioVolPct, 1)}. Aradaki{' '}
                  <strong style={{ color: 'var(--accent)' }}>{fmtDec((report.decomposition.weightedAvgVolPct - report.portfolioVolPct), 1)} puan</strong>,
                  varlıkların birlikte hareket etmemesinden gelen somut kazanç.
                </p>
              )}

              <div style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <div className="sub" style={{ marginBottom: 8 }}>Varlık bazında</div>
                {report.assets.map(a => (
                  <div key={a.name} className="list-row">
                    <span>{a.name} <span className="badge">%{fmtDec((a.weight * 100), 0)}</span></span>
                    <span className="mono sub">
                      vol %{fmtDec(a.volPct, 1)} · düşüş −%{fmtDec(a.drawdownPct, 1)}
                    </span>
                  </div>
                ))}
              </div>

              <p className="hint" style={{ marginTop: 12, color: 'var(--faint)' }}>
                Volatilite geçmiş fiyat hareketinin ölçüsüdür, geleceğin garantisi değildir. Yatırım tavsiyesi değildir.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
