import { useState } from 'react';
import { Check, Crown, Sparkles, Info } from 'lucide-react';
import { useSubscription, upgradeToPremium, cancelPremium, FREE_DAILY_AI_LIMIT } from '../lib/subscription';
import { track } from '../lib/api';

const FREE_FEATURES = [
  'Finansal eğitim takibi',
  'Spor rutini takibi',
  'Sınırsız BDT günlük kaydı',
  `Günde ${FREE_DAILY_AI_LIMIT} AI yeniden çerçeveleme önerisi`,
];

const PREMIUM_FEATURES = [
  'Ücretsiz plandaki her şey',
  'Sınırsız AI yeniden çerçeveleme önerisi',
  'Değer kanıtı paneli ve gelişim metrikleri',
  'Öncelikli yeni özellik erişimi',
];

export default function Pricing() {
  const { plan } = useSubscription();
  const [confirming, setConfirming] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState(false);

  const handleUpgrade = () => {
    upgradeToPremium();
    setConfirming(false);
    setJustUpgraded(true);
    setTimeout(() => setJustUpgraded(false), 3000);
  };

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">Abonelik</h1>
        <p className="page-subtitle">Sana uyan planı seç — istediğin zaman değiştir</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', marginBottom: 24 }}>
        <Info size={15} color="#93c5fd" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
          Bu bir <strong style={{ color: '#93c5fd' }}>demo abonelik akışıdır</strong> — gerçek ödeme alınmaz,
          kart bilgisi istenmez. Premium'a geçiş tek tıkla ve ücretsizdir.
        </p>
      </div>

      {justUpgraded && (
        <div style={{ padding: '14px 20px', borderRadius: 14, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontSize: 14, fontWeight: 500, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          Premium'a geçtin! AI önerileri artık sınırsız.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, maxWidth: 720 }}>
        {/* Ücretsiz plan */}
        <div className="glass" style={{ padding: '26px 28px', border: plan === 'free' ? '1px solid rgba(99,102,241,0.5)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Ücretsiz</span>
            {plan === 'free' && <span className="topic-badge">Mevcut Plan</span>}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 18 }}>
            ₺0<span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}> / ay</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            {FREE_FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <Check size={15} color="#86efac" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>
          {plan === 'premium' ? (
            <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={cancelPremium}>
              Ücretsiz Plana Dön
            </button>
          ) : (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '10px 0' }}>
              Şu an bu plandasın
            </div>
          )}
        </div>

        {/* Premium plan */}
        <div className="glass" style={{ padding: '26px 28px', border: '1px solid rgba(99,102,241,0.5)', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Crown size={16} color="#fbbf24" /> Premium
            </span>
            {plan === 'premium' && <span className="topic-badge">Mevcut Plan</span>}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 18 }}>
            ₺49<span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.35)' }}> / ay (demo)</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
            {PREMIUM_FEATURES.map(f => (
              <div key={f} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <Check size={15} color="#a5b4fc" style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>
          {plan === 'premium' ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '10px 0' }}>
              Şu an bu plandasın 👑
            </div>
          ) : confirming ? (
            <div>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)', marginBottom: 12, lineHeight: 1.55 }}>
                Demo yükseltme: ödeme alınmayacak, kart bilgisi istenmeyecek. Onaylıyor musun?
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleUpgrade}>
                  <Sparkles size={15} /> Onayla (Demo)
                </button>
                <button className="btn-ghost" onClick={() => setConfirming(false)}>Vazgeç</button>
              </div>
            </div>
          ) : (
            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { setConfirming(true); track('paywall_viewed', { source: 'pricing' }); }}
            >
              <Crown size={15} /> Premium'a Geç
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 24, maxWidth: 720, lineHeight: 1.6 }}>
        Gerçek ödeme entegrasyonu (Stripe veya İyzico) için sunucu tarafı hazır bir genişleme noktası
        bulunur — README'deki "Gerçek Ödemeye Geçiş" bölümüne bak.
      </p>
    </div>
  );
}
