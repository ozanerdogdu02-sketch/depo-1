import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Download, RotateCcw } from 'lucide-react';
import { downloadBackup } from './backup';
import { exportHoldingsCsv } from './csv';
import type { Holding, PortfolioState } from './store';

// Beklenmedik bir render hatasında tüm uygulamanın BEYAZ EKRANA düşmesini engeller.
//
// Kritik tasarım kararı: bu ekrandaki kurtarma düğmeleri React durumundan DEĞİL, doğrudan
// localStorage'dan okur. Çökme anında React ağacı zaten güvenilmez — ama veri diskte sağlam
// durur. Kullanıcının o anda ihtiyacı olan tek şey verisini dışarı alabilmektir.
//
// İkinci karar: hiçbir şey SİLİNMEZ ve otomatik onarım DENENMEZ. Çöken durumu "düzeltmeye"
// çalışan bir kod, kurtarılabilir veriyi kurtarılamaz hale getirebilir. Ekran yalnızca
// dışa aktarmayı ve yenilemeyi önerir; temizleme kararı kullanıcınındır.

interface Props { children: ReactNode }
interface State { error: Error | null }

// Çökme anında portföyü ham okur — store.ts'in React'e bağlı yollarına güvenmeden.
function readHoldingsRaw(): Holding[] {
  try {
    const raw = localStorage.getItem('fagent.portfolio.v1');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<PortfolioState>;
    return Array.isArray(parsed.holdings) ? parsed.holdings : [];
  } catch { return []; }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sunucu yok — hiçbir yere rapor gönderilmez (KVKK/gizlilik ilkesi). Yalnızca konsola.
    console.error('FAGENT render hatası:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const holdings = readHoldingsRaw();

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 620, width: '100%', borderColor: 'rgba(248,113,113,0.4)' }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color="var(--red)" /> Bir şeyler ters gitti
          </div>

          <p style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 12 }}>
            Arayüzde beklenmedik bir hata oluştu ve ekran çizilemedi.{' '}
            <strong style={{ color: 'var(--accent)' }}>Verilerin silinmedi</strong> — portföyün,
            işlem geçmişin ve ayarların tarayıcında olduğu gibi duruyor.
          </p>

          <p className="hint" style={{ marginBottom: 16 }}>
            Devam etmeden önce bir yedek al. Hatanın sebebini bilmediğimiz için en güvenli sıra bu:
            önce veriyi dışarı çıkar, sonra sayfayı yenile.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => downloadBackup()}>
              <Download size={15} /> Tam yedek indir (JSON)
            </button>
            {holdings.length > 0 && (
              <button className="btn btn-secondary" onClick={() => exportHoldingsCsv(holdings)}>
                <Download size={15} /> Varlıkları CSV indir ({holdings.length})
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => window.location.reload()}>
              <RotateCcw size={15} /> Sayfayı yenile
            </button>
          </div>

          <p className="hint" style={{ color: 'var(--red)', marginBottom: 14 }}>
            Sol menüdeki SIFIRLA'ya basma — o düğme verilerini kalıcı olarak siler ve bu hatayı çözmez.
          </p>

          <details style={{ fontSize: 12.5 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--faint)' }}>Teknik ayrıntı</summary>
            <pre
              className="mono"
              style={{
                marginTop: 8, padding: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 8,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--faint)', fontSize: 12,
              }}
            >
              {error.name}: {error.message}
            </pre>
            <p className="hint" style={{ marginTop: 8 }}>
              Bu bilgi hiçbir yere gönderilmedi — FAGENT'ın sunucusu yok, hata raporu toplamaz.
            </p>
          </details>
        </div>
      </div>
    );
  }
}
