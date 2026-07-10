import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { useApp } from '../context/AppContext';
import { BookOpen, Dumbbell, Brain, TrendingUp, CheckCircle2, Flame, Sparkles, CalendarCheck } from 'lucide-react';
import { fetchMyMetrics, MyMetrics } from '../lib/api';

function DonutRing({ value, total, color, label }: { value: number; total: number; color: string; label: string }) {
  const pct = Math.round((value / total) * 100);
  const data = [{ value }, { value: total - value }];
  return (
    <div className="chart-card glass">
      <div className="chart-title">{label}</div>
      <div className="chart-wrap">
        <PieChart width={200} height={200}>
          <Pie
            data={data}
            cx={100} cy={100}
            innerRadius={64} outerRadius={84}
            startAngle={90} endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="rgba(255,255,255,0.06)" />
          </Pie>
        </PieChart>
        <div className="chart-center-label">
          <span className="chart-pct">{pct}%</span>
          <span className="chart-pct-label">{value}/{total}</span>
        </div>
      </div>
      <div style={{ marginTop: 16, width: '100%' }}>
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (active && payload?.length) {
    return (
      <div className="glass" style={{ padding: '10px 14px', fontSize: 13 }}>
        <span style={{ color: '#a5b4fc', fontWeight: 600 }}>Ruh Hali: </span>
        <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{payload[0].value}/5</span>
      </div>
    );
  }
  return null;
}

function ValueProof() {
  const [metrics, setMetrics] = useState<MyMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyMetrics()
      .then(m => { if (!cancelled) setMetrics(m); })
      .catch(() => {}); // Sunucu kapalıysa panel sessizce gizlenir, uygulama bozulmaz.
    return () => { cancelled = true; };
  }, []);

  if (!metrics) return null;

  const items = [
    { icon: Flame, label: 'Aktif Seri', value: `${metrics.streak} gün` },
    { icon: CalendarCheck, label: 'Aktif Gün', value: String(metrics.activeDays) },
    { icon: Brain, label: 'BDT Kaydı', value: String(metrics.moodEntries) },
    { icon: Sparkles, label: 'AI Desteği', value: String(metrics.aiAssists) },
  ];

  return (
    <div className="glass" style={{ padding: '22px 24px', marginBottom: 28 }}>
      <div className="section-header">
        <span className="section-title">Değer Kanıtı — Bu Uygulama Sana Ne Kazandırdı?</span>
        {metrics.moodTrendDelta !== null && (
          <span className="section-badge" style={{ color: metrics.moodTrendDelta >= 0 ? '#86efac' : '#fca5a5' }}>
            Ruh hali trendi: {metrics.moodTrendDelta >= 0 ? '+' : ''}{metrics.moodTrendDelta}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={15} color="#a5b4fc" />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9' }}>{value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { topics, sports, moodEntries, weeklyGoal } = useApp();

  const completedTopics = topics.filter(t => t.completed).length;
  const completedSports = sports.filter(s => s.completed).length;

  const moodTrend = moodEntries
    .slice(0, 7)
    .reverse()
    .map((e, i) => ({
      day: `G${i + 1}`,
      score: e.score,
      date: e.date,
    }));

  const avgMood = moodEntries.length
    ? (moodEntries.reduce((s, e) => s + e.score, 0) / moodEntries.length).toFixed(1)
    : '–';

  const latestMood = moodEntries[0];

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">Genel Bakış</h1>
        <p className="page-subtitle">Tüm gelişim alanlarındaki ilerlemeniz</p>
      </div>

      <ValueProof />

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="glass stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <BookOpen size={16} color="#a5b4fc" />
            <span className="stat-label" style={{ margin: 0 }}>Finansal Konular</span>
          </div>
          <div className="stat-value">{completedTopics}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/{topics.length}</span></div>
          <div className="stat-sub">konu tamamlandı</div>
        </div>
        <div className="glass stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Dumbbell size={16} color="#93c5fd" />
            <span className="stat-label" style={{ margin: 0 }}>Haftalık Spor</span>
          </div>
          <div className="stat-value">{completedSports}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/{weeklyGoal}</span></div>
          <div className="stat-sub">gün hedef karşılandı</div>
        </div>
        <div className="glass stat-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Brain size={16} color="#86efac" />
            <span className="stat-label" style={{ margin: 0 }}>Ort. Ruh Hali</span>
          </div>
          <div className="stat-value">{avgMood}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/5</span></div>
          <div className="stat-sub">{moodEntries.length} günlük kayıt</div>
        </div>
      </div>

      {/* Progress Donuts */}
      <div className="chart-grid">
        <DonutRing
          value={completedTopics}
          total={topics.length}
          color="#6366f1"
          label="Finansal Yönetim 2 — Eğitim İlerlemesi"
        />
        <DonutRing
          value={completedSports}
          total={weeklyGoal}
          color="#3b82f6"
          label="Haftalık Spor Rutini"
        />
      </div>

      {/* Mood Trend */}
      {moodTrend.length > 0 && (
        <div className="glass" style={{ padding: '24px 28px', marginBottom: 28 }}>
          <div className="section-header">
            <span className="section-title">Ruh Hali Trendi</span>
            <span className="section-badge"><TrendingUp size={12} style={{ display: 'inline', marginRight: 4 }} />Son Kayıtlar</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={moodTrend} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
              <defs>
                <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5} fill="url(#moodGrad)" dot={{ fill: '#6366f1', strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: '#a5b4fc' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Latest Mood Entry */}
      {latestMood && (
        <div className="glass" style={{ padding: '22px 24px' }}>
          <div className="section-header">
            <span className="section-title">Son BDT Kaydı</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{latestMood.date}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className={`mood-score-badge ${latestMood.score <= 2 ? 'mood-score-low' : latestMood.score === 3 ? 'mood-score-mid' : 'mood-score-high'}`}>
              {latestMood.score}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                {latestMood.emotion}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                {latestMood.situation.slice(0, 120)}{latestMood.situation.length > 120 ? '…' : ''}
              </div>
              <div className="reframe-block" style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#a5b4fc', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Yeniden Çerçeveleme
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                  {latestMood.reframedThought.slice(0, 120)}{latestMood.reframedThought.length > 120 ? '…' : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Checklist */}
      <div className="glass" style={{ padding: '22px 24px', marginTop: 20 }}>
        <div className="section-header">
          <span className="section-title">Bugün Tamamlananlar</span>
          <CheckCircle2 size={16} color="rgba(255,255,255,0.3)" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {topics.filter(t => t.completed).slice(0, 3).map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{t.subtitle}</span>
              <span style={{ marginLeft: 'auto' }} className="topic-badge">{t.category}</span>
            </div>
          ))}
          {topics.filter(t => t.completed).length === 0 && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Henüz tamamlanan konu yok.</p>
          )}
        </div>
      </div>
    </div>
  );
}
