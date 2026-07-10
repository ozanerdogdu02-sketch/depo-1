import { useState } from 'react';
import { Plus, Brain, RefreshCw, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useApp, MoodEntry } from '../context/AppContext';
import { aiReframe, track } from '../lib/api';

const SCORE_LABELS = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Çok İyi'];
const SCORE_EMOJIS = ['', '😞', '😕', '😐', '🙂', '😊'];

const EMOTION_TAGS = ['Kaygı', 'Umutsuzluk', 'Kıyaslama', 'Öfke', 'Yalnızlık', 'Hayal Kırıklığı', 'Suçluluk', 'Utanç'];

function ScoreBadgeClass(score: number) {
  if (score <= 2) return 'mood-score-low';
  if (score === 3) return 'mood-score-mid';
  return 'mood-score-high';
}

function EntryCard({ entry }: { entry: MoodEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass mood-entry glass-hover">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div className={`mood-score-badge ${ScoreBadgeClass(entry.score)}`}>
          {entry.score}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {entry.emotion.split(', ').map(e => (
                <span key={e} className="topic-badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.25)' }}>
                  {e}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', flexShrink: 0, marginLeft: 8 }}>
              {new Date(entry.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
            </span>
          </div>

          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.65, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>Durum: </span>
            {expanded ? entry.situation : `${entry.situation.slice(0, 100)}${entry.situation.length > 100 ? '…' : ''}`}
          </p>

          {expanded && (
            <>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, marginBottom: 10 }}>
                <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>Otomatik Düşünce: </span>
                {entry.automaticThought}
              </p>
              <div className="reframe-block">
                <div style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={11} />
                  Yeniden Çerçeveleme
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.65 }}>
                  {entry.reframedThought}
                </p>
              </div>
            </>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Daralt' : 'Detayları Göster'}
          </button>
        </div>
      </div>
    </div>
  );
}

const emptyForm = {
  score: 0,
  situation: '',
  automaticThought: '',
  reframedThought: '',
  emotion: [] as string[],
};

export default function MoodJournal() {
  const { moodEntries, addMoodEntry } = useApp();
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDemo, setAiDemo] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);

  const handleAiReframe = async () => {
    if (!form.situation || !form.automaticThought || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { reframedThought, demo } = await aiReframe({
        situation: form.situation,
        automaticThought: form.automaticThought,
        emotions: form.emotion,
        score: form.score || undefined,
      });
      setForm(f => ({ ...f, reframedThought }));
      setAiDemo(demo);
      setAiUsed(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI önerisi alınamadı.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleEmotionToggle = (tag: string) => {
    setForm(f => ({
      ...f,
      emotion: f.emotion.includes(tag) ? f.emotion.filter(e => e !== tag) : [...f.emotion, tag],
    }));
  };

  const handleSubmit = () => {
    if (!form.score || !form.situation || !form.automaticThought) return;
    addMoodEntry({
      date: new Date().toISOString().split('T')[0],
      score: form.score,
      situation: form.situation,
      automaticThought: form.automaticThought,
      reframedThought: form.reframedThought || form.automaticThought,
      emotion: form.emotion.length ? form.emotion.join(', ') : 'Tanımlanmamış',
    });
    // KVKK: yalnızca sayısal özet gönderilir, günlük metni asla gönderilmez.
    track('mood_entry_created', { score: form.score, emotionCount: form.emotion.length, usedAi: aiUsed });
    setForm(emptyForm);
    setAiDemo(false);
    setAiError(null);
    setAiUsed(false);
    setSubmitted(true);
    setShowForm(false);
    setTimeout(() => setSubmitted(false), 2500);
  };

  const avgMood = moodEntries.length
    ? (moodEntries.reduce((s, e) => s + e.score, 0) / moodEntries.length).toFixed(1)
    : '–';

  return (
    <div className="fade-up">
      <div className="page-header">
        <h1 className="page-title">BDT Duygu Günlüğü</h1>
        <p className="page-subtitle">Bilişsel davranışçı terapi destekli duygu ve düşünce kaydı</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        <div className="glass stat-card">
          <div className="stat-label">Toplam Kayıt</div>
          <div className="stat-value">{moodEntries.length}</div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Ort. Ruh Hali</div>
          <div className="stat-value">{avgMood}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/5</span></div>
        </div>
        <div className="glass stat-card">
          <div className="stat-label">Son Kayıt</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            {moodEntries[0] ? new Date(moodEntries[0].date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '–'}
          </div>
        </div>
      </div>

      {/* New Entry Button / Form */}
      {!showForm ? (
        <button
          className="btn-primary"
          onClick={() => setShowForm(true)}
          style={{ marginBottom: 24, width: '100%', justifyContent: 'center', padding: '14px 24px', fontSize: 15 }}
        >
          <Plus size={18} />
          Yeni Günlük Kaydı Ekle
        </button>
      ) : (
        <div className="glass" style={{ padding: '28px 32px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Brain size={17} color="#a5b4fc" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9' }}>Yeni Kayıt</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            </div>
          </div>

          {/* Score */}
          <div style={{ marginBottom: 22 }}>
            <label className="form-label">Ruh Hali Skoru</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="score-grid">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className={`score-btn ${form.score === n ? `score-active-${n}` : ''}`}
                    onClick={() => setForm(f => ({ ...f, score: n }))}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {form.score > 0 && (
                <div style={{ fontSize: 24 }}>{SCORE_EMOJIS[form.score]}</div>
              )}
              {form.score > 0 && (
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                  {SCORE_LABELS[form.score]}
                </span>
              )}
            </div>
          </div>

          {/* Emotions */}
          <div style={{ marginBottom: 22 }}>
            <label className="form-label">Duygular (Çoklu Seçim)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {EMOTION_TAGS.map(tag => (
                <button
                  key={tag}
                  onClick={() => handleEmotionToggle(tag)}
                  style={{
                    padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.18s ease',
                    border: form.emotion.includes(tag) ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(255,255,255,0.1)',
                    background: form.emotion.includes(tag) ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                    color: form.emotion.includes(tag) ? '#fca5a5' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Situation */}
          <div style={{ marginBottom: 18 }}>
            <label className="form-label">Tetikleyici Durum / Olay</label>
            <textarea
              className="glass-textarea"
              placeholder="Bugün ne yaşadın? Duygu durumunu etkileyen olay ya da durum neydi?"
              value={form.situation}
              onChange={e => setForm(f => ({ ...f, situation: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Automatic Thought */}
          <div style={{ marginBottom: 18 }}>
            <label className="form-label">Otomatik Düşünce</label>
            <textarea
              className="glass-textarea"
              placeholder="Bu durumda aklından ilk geçen düşünce ne oldu? Kendin ya da dünya hakkında ne hissettin?"
              value={form.automaticThought}
              onChange={e => setForm(f => ({ ...f, automaticThought: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Reframing */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <RefreshCw size={13} color="#a5b4fc" />
              <label className="form-label" style={{ margin: 0, color: '#a5b4fc' }}>Bilişsel Yeniden Çerçeveleme</label>
              <button
                onClick={handleAiReframe}
                disabled={aiLoading || !form.situation || !form.automaticThought}
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600,
                  cursor: aiLoading || !form.situation || !form.automaticThought ? 'not-allowed' : 'pointer',
                  border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.15)',
                  color: '#a5b4fc', opacity: aiLoading || !form.situation || !form.automaticThought ? 0.5 : 1,
                }}
              >
                <Sparkles size={12} />
                {aiLoading ? 'Öneri hazırlanıyor…' : 'AI ile Öneri Al'}
              </button>
            </div>
            {aiError && (
              <p style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>{aiError}</p>
            )}
            {aiDemo && !aiError && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                Demo modu: sunucuda API anahtarı tanımlı olmadığı için örnek bir öneri gösterildi.
              </p>
            )}
            <textarea
              className="glass-textarea"
              placeholder="Bu düşünceyi daha dengeli, gerçekçi ve yapıcı bir bakış açısıyla nasıl yeniden çerçeveleyebilirsin?"
              value={form.reframedThought}
              onChange={e => setForm(f => ({ ...f, reframedThought: e.target.value }))}
              rows={4}
              style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.06)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-primary" onClick={handleSubmit} disabled={!form.score || !form.situation || !form.automaticThought}>
              Kaydet
            </button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setForm(emptyForm); setAiDemo(false); setAiError(null); setAiUsed(false); }}>
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {submitted && (
        <div style={{ padding: '14px 20px', borderRadius: 14, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', fontSize: 14, fontWeight: 500, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          Günlük kaydın başarıyla eklendi.
        </div>
      )}

      {/* Past Entries */}
      <div>
        <div className="section-header">
          <span className="section-title">Geçmiş Kayıtlar</span>
          <span className="section-badge">{moodEntries.length} Kayıt</span>
        </div>
        {moodEntries.length === 0 && (
          <div className="glass" style={{ padding: '40px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
            <Brain size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p>Henüz kayıt eklenmedi. İlk günlük girişini yap.</p>
          </div>
        )}
        {moodEntries.map(entry => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
