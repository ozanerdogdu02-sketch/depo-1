import { useState, type FormEvent } from 'react';
import { LogIn, LogOut, UserPlus, KeyRound, Trash2, Cloud, CloudOff, Loader2 } from 'lucide-react';
import {
  useCloud, signIn, signUp, sendPasswordReset, setNewPassword, signOut, deleteAccount,
  type AuthResult, type SyncStatus,
} from './cloud';

type Mode = 'giris' | 'kayit' | 'sifre';

const STATUS_TEXT: Record<SyncStatus, string> = {
  kapali: 'Bulut kapalı',
  bekliyor: 'Bulutla eşitleniyor…',
  senkron: 'Bulutla senkron',
  kaydediliyor: 'Kaydediliyor…',
  hata: 'Senkron hatası',
};

export function syncLabel(status: SyncStatus): string {
  return STATUS_TEXT[status];
}

function Notice({ result }: { result: AuthResult | null }) {
  if (!result?.message) return null;
  return (
    <p className={result.ok ? 'auth-note auth-note-ok' : 'auth-note auth-note-err'} role={result.ok ? 'status' : 'alert'}>
      {result.message}
    </p>
  );
}

function Aydinlatma() {
  return (
    <details className="auth-legal">
      <summary>Aydınlatma metni</summary>
      <p>
        Hesap oluşturduğunda e-posta adresin ve Fagent'a girdiğin portföy verilerin (varlıklar, işlemler,
        kâr/zarar kayıtları) hesabını çalıştırmak ve verilerini cihazlar arasında eşitlemek amacıyla işlenir.
        Veriler Supabase altyapısında, Avrupa Birliği'ndeki (Frankfurt) sunucularda saklanır ve üçüncü
        kişilerle reklam ya da pazarlama amacıyla paylaşılmaz.
      </p>
      <p>
        Fagent kişiye özel yatırım tavsiyesi vermez ve senin adına işlem yapmaz. Hesabını ve buluttaki tüm
        verilerini istediğin an bu sayfadaki "Hesabımı sil" seçeneğiyle kalıcı olarak silebilirsin.
      </p>
    </details>
  );
}

export function Account({ onSignedIn }: { onSignedIn: () => void }) {
  const cloud = useCloud();
  const [mode, setMode] = useState<Mode>('giris');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);

  const run = async (fn: () => Promise<AuthResult>, after?: (r: AuthResult) => void) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
      after?.(r);
    } finally {
      setBusy(false);
    }
  };

  if (!cloud.ready) {
    return (
      <div className="card center fade">
        <Loader2 size={18} className="spin-icon" /> <span className="sub">Oturum kontrol ediliyor…</span>
      </div>
    );
  }

  // Şifre sıfırlama bağlantısıyla gelindi: yeni şifre iste.
  if (cloud.recovery) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void run(() => setNewPassword(password), r => r.ok && setPassword(''));
    };
    return (
      <div className="card auth-card fade">
        <h2 className="card-title"><KeyRound size={16} /> Yeni şifre belirle</h2>
        <form onSubmit={submit} className="auth-form">
          <input
            className="input" type="password" autoComplete="new-password" placeholder="Yeni şifre (en az 6 karakter)"
            value={password} onChange={e => setPassword(e.target.value)} aria-label="Yeni şifre"
          />
          <button className="btn btn-primary" disabled={busy || password.length < 6}>
            {busy ? <Loader2 size={15} className="spin-icon" /> : 'Şifreyi güncelle'}
          </button>
        </form>
        <Notice result={result} />
      </div>
    );
  }

  // Giriş yapılmış.
  if (cloud.email) {
    const remove = () => {
      if (!confirm('Hesabın ve buluttaki tüm portföy verilerin kalıcı olarak silinsin mi? Bu işlem geri alınamaz.')) return;
      void run(deleteAccount);
    };
    return (
      <div className="card auth-card fade">
        <h2 className="card-title">Hesabım</h2>
        <p className="auth-email">{cloud.email}</p>
        <p className={cloud.status === 'hata' ? 'auth-sync auth-sync-err' : 'auth-sync'}>
          {cloud.status === 'hata' ? <CloudOff size={14} /> : <Cloud size={14} />}
          {cloud.error ?? syncLabel(cloud.status)}
        </p>
        <p className="hint">
          Portföyün bu hesaba bağlı. Başka bir cihazdan aynı e-postayla giriş yaptığında verilerin orada da görünür.
        </p>
        <div className="auth-actions">
          <button className="btn btn-secondary btn-inline" onClick={() => void signOut()} disabled={busy}>
            <LogOut size={14} /> Çıkış yap
          </button>
          <button className="btn btn-danger btn-inline" onClick={remove} disabled={busy}>
            <Trash2 size={14} /> Hesabımı sil
          </button>
        </div>
        <Notice result={result} />
      </div>
    );
  }

  // Giriş yapılmamış: giriş / kayıt / şifremi unuttum.
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'giris') {
      void run(() => signIn(email.trim(), password), r => r.ok && onSignedIn());
    } else if (mode === 'kayit') {
      void run(() => signUp(email.trim(), password), r => {
        if (r.ok && !r.message) onSignedIn();
      });
    } else {
      void run(() => sendPasswordReset(email.trim()));
    }
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    !busy && emailOk && (mode === 'sifre' || password.length >= 6) && (mode !== 'kayit' || consent);

  const switchMode = (next: Mode) => {
    setMode(next);
    setResult(null);
  };

  return (
    <div className="card auth-card fade">
      <div className="auth-tabs" role="tablist">
        <button
          role="tab" aria-selected={mode === 'giris'}
          className={mode === 'giris' ? 'auth-tab auth-tab-active' : 'auth-tab'} onClick={() => switchMode('giris')}
        >
          <LogIn size={14} /> Giriş yap
        </button>
        <button
          role="tab" aria-selected={mode === 'kayit'}
          className={mode === 'kayit' ? 'auth-tab auth-tab-active' : 'auth-tab'} onClick={() => switchMode('kayit')}
        >
          <UserPlus size={14} /> Hesap oluştur
        </button>
      </div>

      <p className="sub" style={{ margin: '14px 0' }}>
        {mode === 'giris' && 'Portföyüne her cihazdan erişmek için giriş yap.'}
        {mode === 'kayit' && 'Ücretsiz hesap oluştur; bu tarayıcıdaki portföyün hesabına taşınır.'}
        {mode === 'sifre' && 'E-posta adresini gir, şifre sıfırlama bağlantısı gönderelim.'}
      </p>

      <form onSubmit={submit} className="auth-form">
        <input
          className="input" type="email" autoComplete="email" placeholder="E-posta"
          value={email} onChange={e => setEmail(e.target.value)} aria-label="E-posta"
        />
        {mode !== 'sifre' && (
          <input
            className="input" type="password" placeholder="Şifre (en az 6 karakter)"
            autoComplete={mode === 'kayit' ? 'new-password' : 'current-password'}
            value={password} onChange={e => setPassword(e.target.value)} aria-label="Şifre"
          />
        )}
        {mode === 'kayit' && (
          <>
            <label className="auth-consent">
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>Aydınlatma metnini okudum; e-postamın ve portföy verilerimin hesabım için işlenmesini kabul ediyorum.</span>
            </label>
            <Aydinlatma />
          </>
        )}
        <button className="btn btn-primary" disabled={!canSubmit}>
          {busy ? <Loader2 size={15} className="spin-icon" /> : mode === 'giris' ? 'Giriş yap' : mode === 'kayit' ? 'Hesap oluştur' : 'Bağlantı gönder'}
        </button>
      </form>

      <Notice result={result} />

      <div className="auth-links">
        {mode === 'giris' && (
          <button className="link-btn" onClick={() => switchMode('sifre')}>Şifremi unuttum</button>
        )}
        {mode === 'sifre' && (
          <button className="link-btn" onClick={() => switchMode('giris')}>Girişe dön</button>
        )}
      </div>
      <p className="hint" style={{ marginTop: 14 }}>
        Hesap zorunlu değil. Hesapsız kullanımda verilerin yalnızca bu tarayıcıda saklanır.
      </p>
    </div>
  );
}
