import { Check, Dumbbell, Flame, Timer, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';

const DAY_NAMES = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const SPORT_ICONS: Record<string, string> = {
  'Kuvvet Antrenmanı': '🏋️',
  'Kardiyo': '🏃',
  'HIIT': '⚡',
  'Esneklik & Yoga': '🧘',
  'Dinlenme': '💤',
};

export default function Education() {
  const { topics, toggleTopic, sports, toggleSport, weeklyGoal } = useApp();

  const completedTopics = topics.filter(t => t.completed).length;
  const completedSports = sports.filter(s => s.completed).length;

  const categories = [...new Set(topics.map(t => t.category))];

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">Eğitim & Aktivite</h1>
        <p className="page-subtitle">Finansal konular ve haftalık spor rutinini takip et</p>
      </div>

      {/* Financial Topics */}
      <div className="glass" style={{ padding: '24px 28px', marginBottom: 24 }}>
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={15} color="#a5b4fc" />
            </div>
            <span className="section-title">Finansal Yönetim 2</span>
          </div>
          <span className="section-badge">{completedTopics}/{topics.length} Tamamlandı</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>İlerleme</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>
              {Math.round((completedTopics / topics.length) * 100)}%
            </span>
          </div>
          <div className="progress-bar-wrap">
            <div className="progress-bar-fill" style={{ width: `${(completedTopics / topics.length) * 100}%` }} />
          </div>
        </div>

        {categories.map(cat => (
          <div key={cat} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              {cat}
            </div>
            <div className="topic-grid">
              {topics.filter(t => t.category === cat).map(topic => (
                <div
                  key={topic.id}
                  className="glass glass-hover topic-card"
                  onClick={() => toggleTopic(topic.id)}
                  style={{ opacity: topic.completed ? 1 : 0.75 }}
                >
                  <div className={`topic-check ${topic.completed ? 'topic-check-done' : ''}`}>
                    {topic.completed && <Check size={13} color="white" strokeWidth={3} />}
                  </div>
                  <div>
                    <div className="topic-badge">{topic.title}</div>
                    <div className="topic-title">{topic.subtitle}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sport Tracker */}
      <div className="glass" style={{ padding: '24px 28px' }}>
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Dumbbell size={15} color="#93c5fd" />
            </div>
            <span className="section-title">Haftalık Spor Rutini</span>
          </div>
          <span className="section-badge">Hedef: {weeklyGoal} Gün/Hafta</span>
        </div>

        {/* Weekly Goal Progress */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <div className="glass" style={{ padding: '14px 18px', flex: 1, minWidth: 140 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={16} color="#f97316" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Bu Hafta</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginTop: 6 }}>
              {completedSports}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}>/{weeklyGoal}</span>
            </div>
          </div>
          <div className="glass" style={{ padding: '14px 18px', flex: 1, minWidth: 140 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Timer size={16} color="#93c5fd" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Toplam Süre</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginTop: 6 }}>
              {sports.filter(s => s.completed).reduce((acc, s) => acc + s.duration, 0)}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.3)' }}> dk</span>
            </div>
          </div>
        </div>

        {/* Day Cards */}
        <div className="sport-grid">
          {sports.map((session, i) => {
            const dayName = DAY_NAMES[new Date(session.date).getDay() === 0 ? 6 : new Date(session.date).getDay() - 1];
            const icon = SPORT_ICONS[session.type] || '🏃';
            return (
              <div
                key={session.id}
                className={`sport-day ${session.completed ? 'sport-day-done' : ''}`}
                onClick={() => toggleSport(session.id)}
                title={`${session.type}${session.duration ? ` — ${session.duration} dk` : ''}`}
              >
                <span className={`sport-day-name ${session.completed ? 'sport-day-name-done' : ''}`}>{dayName}</span>
                <span style={{ fontSize: 20 }}>{session.type === 'Dinlenme' && !session.completed ? '○' : session.completed ? icon : '○'}</span>
                {session.completed && (
                  <span className="sport-day-label">{session.duration > 0 ? `${session.duration}dk` : '—'}</span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Haftalık hedef doluluk oranı</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#93c5fd' }}>
              {Math.min(100, Math.round((completedSports / weeklyGoal) * 100))}%
            </span>
          </div>
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.min(100, (completedSports / weeklyGoal) * 100)}%`,
                background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
