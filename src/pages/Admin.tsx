import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, Users, Repeat, Activity } from 'lucide-react';
import { fetchAdminMetrics, AdminMetrics } from '../lib/api';

const FEATURE_LABELS: Record<string, string> = {
  page_view: 'Sayfa Görüntüleme',
  mood_entry_created: 'BDT Kaydı',
  ai_reframe_used: 'AI Yeniden Çerçeveleme',
  topic_toggled: 'Konu İşaretleme',
  sport_toggled: 'Spor İşaretleme',
  plan_changed: 'Plan Değişikliği',
  paywall_viewed: 'Paywall Görüntüleme',
};

export default function Admin() {
  const [adminKey, setAdminKey] = useState('');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!adminKey || loading) return;
    setLoading(true);
    setError(null);
    try {
      setMetrics(await fetchAdminMetrics(adminKey));
    } catch (err) {
      setMetrics(null);
      setError(err instanceof Error ? err.message : 'Metrikler alınamadı.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">Admin Paneli</h1>
        <p className="page-subtitle">Ürün kullanım metrikleri — kişisel veri içermez</p>
      </div>

      {!metrics && (
        <div className="glass" style={{ padding: '28px 32px', maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <ShieldCheck size={18} color="#a5b4fc" />
            <span style={{ fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}>Admin Girişi</span>
          </div>
          <input
            type="password"
            className="glass-textarea"
            style={{ width: '100%', marginBottom: 14, padding: '10px 14px' }}
            placeholder="Admin anahtarı (.env → ADMIN_KEY)"
            value={adminKey}
            onChange={e => setAdminKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') load(); }}
          />
          <button className="btn-primary" onClick={load} disabled={!adminKey || loading}>
            {loading ? 'Yükleniyor…' : 'Metrikleri Getir'}
          </button>
          {error && <p style={{ fontSize: 13, color: '#fca5a5', marginTop: 12 }}>{error}</p>}
        </div>
      )}

      {metrics && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            <div className="glass stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Users size={15} color="#a5b4fc" />
                <span className="stat-label" style={{ margin: 0 }}>Toplam Kullanıcı</span>
              </div>
              <div className="stat-value">{metrics.totalUsers}</div>
            </div>
            <div className="glass stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Activity size={15} color="#93c5fd" />
                <span className="stat-label" style={{ margin: 0 }}>Son 7 Gün Aktif</span>
              </div>
              <div className="stat-value">{metrics.activeLast7}</div>
            </div>
            <div className="glass stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Repeat size={15} color="#86efac" />
                <span className="stat-label" style={{ margin: 0 }}>Geri Dönüş Oranı</span>
              </div>
              <div className="stat-value">
                {metrics.retentionRate !== null ? `%${Math.round(metrics.retentionRate * 100)}` : '–'}
              </div>
              <div className="stat-sub">{metrics.returningUsers} geri dönen kullanıcı</div>
            </div>
            <div className="glass stat-card">
              <div className="stat-label">En Çok Kullanılan</div>
              <div className="stat-value" style={{ fontSize: 16 }}>
                {metrics.topFeature ? FEATURE_LABELS[metrics.topFeature] ?? metrics.topFeature : '–'}
              </div>
              <div className="stat-sub">{metrics.totalEvents} toplam olay</div>
            </div>
          </div>

          <div className="glass" style={{ padding: '24px 28px', marginBottom: 24 }}>
            <div className="section-header">
              <span className="section-title">Günlük Olay Hacmi (Son 14 Gün)</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={metrics.eventsPerDay} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#1e1b34', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="glass" style={{ padding: '24px 28px' }}>
            <div className="section-header">
              <span className="section-title">Özellik Kullanımı</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {metrics.featureUsage.map(f => {
                const max = metrics.featureUsage[0]?.count || 1;
                return (
                  <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', width: 180, flexShrink: 0 }}>
                      {FEATURE_LABELS[f.name] ?? f.name}
                    </span>
                    <div className="progress-bar-wrap" style={{ flex: 1 }}>
                      <div className="progress-bar-fill" style={{ width: `${Math.round((f.count / max) * 100)}%` }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', width: 40, textAlign: 'right' }}>{f.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
