// Hesap ekranı — giriş, kayıt, şifre sıfırlama, çıkış, hesap silme ve senkron çakışması.
//
// Yalnızca cloudEnabled iken (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY tanımlı) App.tsx
// tarafından render edilir; env tanımsızken bu bileşen ve kenar çubuğundaki hesap düğmesi DOM'a
// hiç girmez. Tüm ağ/senkron mantığı cloud.ts'tedir; burada yalnızca arayüz var.
//
// Metin kuralları (ekip panosu #15–#18, #34–#39):
// - Hesap her yerde "Fagent hesabı" anlamındadır; aracı kurum/bakiye/emir çağrışımı yok.
// - Doğrulanmamış altyapı/güvenlik iddiası (saklama bölgesi, şifreleme, "kimse göremez") yazılmaz.
//   Saklama bölgesi gerçek Supabase projesi kurulurken (plan adım 5) belirlenecek.
// - Bu ekrandaki açıklama KVKK aydınlatma metni DEĞİLDİR; o metin plan adım 7'ye kaldı.
// - Hata mesajları yalnızca cloud.ts'in sabit Türkçe metinleridir (trError); ham Supabase
//   gövdesi DOM'a basılmaz. E-posta yalnızca JSX metni olarak render edilir.
import { useState, type FormEvent } from 'react';
import {
  LogIn, LogOut, UserPlus, KeyRound, Trash2, Cloud, CloudOff, Loader2, Download, AlertTriangle,
} from 'lucide-react';
import {
  useCloud, signIn, signUp, sendPasswordReset, setNewPassword, signOut, prepareSignOut, deleteAccount, resolveConflict,
  quarantineDownload, quarantineDiscard, quarantineUpload,
  type AuthResult, type ConflictKind, type SyncStatus,
} from './cloud';
import { downloadBackup } from './backup';
import { usePortfolio } from './store';

type Mode = 'giris' | 'kayit' | 'sifre';

const STATUS_TEXT: Record<SyncStatus, string> = {
  kapali: 'Senkron kapalı',
  bekliyor: 'Hesapla eşitleniyor…',
  senkron: 'Bulutla senkron',
  kaydediliyor: 'Kaydediliyor…',
  hata: 'Senkron hatası',
  cakisma: 'Kararın bekleniyor',
};

export function syncLabel(status: SyncStatus): string {
  return STATUS_TEXT[status];
}

// Senkronlanan katmanlar — BACKED_UP_KEYS (backup.ts) ile aynı küme. Oraya yeni bir anahtar
// eklenirse bu liste, README ve hesap silme onayı da güncellenmeli.
const SYNCED_LAYERS = [
  'portföyün ve işlem geçmişin',
  'ajan kullanım belleği (hangi konularla ilgilendiğin, tercihlerin, son soruların)',
  'ajana öğrettiğin soru-cevaplar',
  'stopaj oranların',
  'hedef dağılımın',
];

const DELETE_CONFIRM =
  'Fagent hesabın ve hesabındaki tüm veriler kalıcı olarak silinsin mi?\n\n' +
  'Silinecekler: portföy ve işlem geçmişi, ajan kullanım belleği, öğrettiğin soru-cevaplar, ' +
  'stopaj oranları ve hedef dağılım. Bu tarayıcıdaki veriler de temizlenir.\n\nBu işlem geri alınamaz.';

function Notice({ result }: { result: AuthResult | null }) {
  if (!result?.message) return null;
  return (
    <p className={result.ok ? 'auth-note auth-note-ok' : 'auth-note auth-note-err'} role={result.ok ? 'status' : 'alert'}>
      {result.message}
    </p>
  );
}

// Kayıt öncesi kısa açıklama. KVKK aydınlatma metni gibi sunulmaz (plan adım 7).
function HesapAciklama() {
  return (
    <details className="auth-legal">
      <summary>Hesapta hangi veriler tutulur?</summary>
      <p>Hesap oluşturursan e-posta adresin ve şu veriler, hesabını çalıştırmak ve cihazların arasında eşitlemek için işlenir:</p>
      <ul className="auth-list">
        {SYNCED_LAYERS.map(l => <li key={l}>{l}</li>)}
      </ul>
      <p>
        Bu veriler yalnızca senin hesabına bağlı tek bir kayda eşitlenir; erişim kuralları (RLS) diğer
        kullanıcıların bu kaydı okumasını engeller. Kayıt, hizmeti işleten taraf ve altyapı sağlayıcısı
        (Supabase) tarafından teknik olarak saklanır.
      </p>
      <p>
        Eşitlenmeyenler: fiyat önbellekleri ve bu tarayıcıdaki oturum bilgisi.
      </p>
      <p>
        Fagent kişiye özel yatırım tavsiyesi vermez ve senin adına işlem yapmaz. Hesabını ve hesabındaki tüm
        verileri istediğin an Hesabım ekranındaki "Hesabımı sil" seçeneğiyle kalıcı olarak silebilirsin.
      </p>
    </details>
  );
}

// Bulutta farklı bir kayıt var ve bu tarayıcıda da (hesaba ait olduğu bilinmeyen ya da eşitlemeden
// sonra değişmiş) veri var: cloud.ts hiçbir şeyi otomatik uygulamaz, upsert de yapmaz. Karar burada.
function ConflictCard({ email }: { email: string }) {
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  const applyRemote = () => {
    setBusy(true);
    void resolveConflict('remote').finally(() => setBusy(false));
  };
  const keepLocal = () => {
    if (!confirm('Hesabındaki kayıt, bu tarayıcıdaki veriyle DEĞİŞTİRİLSİN mi? Hesabındaki eski kayıt geri getirilemez.')) return;
    setBusy(true);
    void resolveConflict('local').finally(() => setBusy(false));
  };

  return (
    <div className="card auth-card auth-conflict fade" role="region" aria-label="Senkron çakışması">
      <h2 className="card-title auth-title"><AlertTriangle size={14} /> Hesabında kayıt bulundu</h2>
      <p className="auth-email">{email}</p>
      <p className="hint" style={{ marginTop: 8 }}>
        Hesabındaki kayıt, bu tarayıcıdaki verinin yerine geçecek. Bu tarayıcıdaki veriyi saklamak
        istersen önce yedeğini indir; yedek dosyasını daha sonra Panel'deki "Veri Yedeği" kartından
        geri yükleyebilirsin. Sen karar verene kadar hiçbir şey eşitlenmez.
      </p>
      {cloud.quarantine.some(q => q.reason === 'surum-cakismasi') && (
        <p className="hint" style={{ marginTop: 8 }} role="status">
          Hesabındaki kayıt, başka bir cihazda değişmiş. Bu tarayıcıdaki değişiklikler hesabına yazılmadı;
          ayrıca bu cihazda en çok 7 gün saklanır. Hesabındaki veriyi yüklersen bu kopya silinmez.
        </p>
      )}
      {cloud.conflictCopyFailed && (
        <p className="auth-note auth-note-err" style={{ marginTop: 8 }} role="alert">
          Hesabındaki kayıt, başka bir cihazda değişmiş. Bu tarayıcıdaki değişiklikler cihazda ayrıca SAKLANAMADI
          (yer yok). Hesabındaki veriyi yüklemeden önce "Önce yedeğini indir"i kullan; yüklersen bu değişiklikler kaybolur.
        </p>
      )}
      <div className="auth-actions">
        <button
          className="btn btn-secondary btn-inline"
          onClick={() => { downloadBackup(); setBackedUp(true); }}
          disabled={busy}
        >
          <Download size={14} /> Önce yedeğini indir
        </button>
        <button className="btn btn-primary btn-inline" onClick={applyRemote} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin-icon" /> : <Cloud size={14} />} Hesabımdaki veriyi yükle
        </button>
        <SignOutControl disabled={busy} />
      </div>
      {backedUp && <p className="auth-note auth-note-ok" role="status">Yedek indirildi.</p>}
      <p className="hint" style={{ marginTop: 14 }}>
        Çıkış yaparsan hiçbir şey eşitlenmez.{' '}
        <button className="link-btn" onClick={keepLocal} disabled={busy}>
          Bunun yerine bu tarayıcıdaki veriyi hesabıma yükle
        </button>
      </p>
    </div>
  );
}

// Hesapla henüz eşitlenmemiş (sahibi belirsiz) veri bu tarayıcıda duruyor ve hesapta kayıt yok:
// cloud.ts hiçbir şeyi otomatik yüklemez. Girişten önce hesapsız kullanılan veri, ortak bir
// cihazda başka birinin verisi olabilir; kullanıcı açıkça seçmeden hesabına (ve buluta) çıkmaz.
function UploadConfirmCard({ email, onResolved }: { email: string; onResolved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  const upload = () => {
    setBusy(true);
    void resolveConflict('local').finally(() => { setBusy(false); onResolved(); });
  };
  const discard = () => {
    if (!confirm('Bu tarayıcıdaki veri silinsin mi? Hesabına hiçbir şey yüklenmez ve bu tarayıcıdaki veri geri getirilemez. ' +
      'Önce yedeğini indirmek istersen İptal\'e basıp "Önce yedeğini indir"i kullan.')) return;
    setBusy(true);
    void resolveConflict('discard').finally(() => { setBusy(false); onResolved(); });
  };

  return (
    <div className="card auth-card auth-conflict fade" role="region" aria-label="Yükleme onayı">
      <h2 className="card-title auth-title"><AlertTriangle size={14} /> Bu tarayıcıdaki veri hesabına yüklensin mi?</h2>
      <p className="auth-email">{email}</p>
      <p className="hint" style={{ marginTop: 8 }}>
        Hesabında henüz kayıt yok. Bu tarayıcıda ise bu hesapla eşitlenmemiş veri var (portföy, işlem geçmişi,
        ajan belleği, öğrettiğin soru-cevaplar, stopaj oranları ya da hedef dağılım). Bu verinin kime ait olduğu
        bilinmiyor: giriş yapmadan sen kullandıysan senindir; bu cihazı başkası da kullandıysa onun verisi olabilir.
        Sen karar verene kadar hiçbir şey hesabına gönderilmez.
      </p>
      <div className="auth-actions">
        <button
          className="btn btn-secondary btn-inline"
          onClick={() => { downloadBackup(); setBackedUp(true); }}
          disabled={busy}
        >
          <Download size={14} /> Önce yedeğini indir
        </button>
        <button className="btn btn-primary btn-inline" onClick={upload} disabled={busy}>
          {busy ? <Loader2 size={14} className="spin-icon" /> : <Cloud size={14} />} Bu tarayıcıdaki veriyi hesabıma yükle
        </button>
        <button className="btn btn-secondary btn-inline" onClick={discard} disabled={busy}>
          <Trash2 size={14} /> Bu tarayıcıdaki veriyi sil
        </button>
        <SignOutControl disabled={busy} />
      </div>
      {backedUp && <p className="auth-note auth-note-ok" role="status">Yedek indirildi.</p>}
      <p className="hint" style={{ marginTop: 14 }}>
        Çıkış yaparsan bu tarayıcıdaki veri olduğu gibi kalır ve hiçbir şey hesabına gönderilmez.
      </p>
    </div>
  );
}

// "Çıkış yap": hesaba gitmemiş değişiklik varsa çıkıştan ÖNCE sorar. Bu cihazda saklamak varsayılan ve güvenli
// seçenektir; kopya için yer yoksa çıkış yapılmaz ve kullanıcı bilgilendirilir (veri sessizce silinmez).
function SignOutControl({ disabled }: { disabled: boolean }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (choice: 'sakla' | 'sil') => {
    setBusy(true);
    void signOut(choice).then(r => { if (!r.ok) setMsg(r.message); }).finally(() => setBusy(false));
  };
  const start = () => {
    setBusy(true);
    setMsg(null);
    void prepareSignOut()
      .then(r => { if (r.unsynced) setAsk(true); else return signOut().then(() => undefined); })
      .finally(() => setBusy(false));
  };
  if (!ask) {
    return (
      <>
        <button className="btn btn-secondary btn-inline" onClick={start} disabled={disabled || busy}>
          {busy ? <Loader2 size={14} className="spin-icon" /> : <LogOut size={14} />} Çıkış yap
        </button>
        {msg && <p className="auth-note auth-note-err" role="alert">{msg}</p>}
      </>
    );
  }
  return (
    <div role="group" aria-label="Çıkışta hesaba gitmemiş değişiklikler">
      <p className="hint" style={{ marginTop: 8 }}>
        Hesabına henüz gitmemiş değişiklikler var. Çıkışta bu tarayıcıdaki veri temizlenir. İstersen değişiklikler bu
        cihazda en çok 7 gün ayrı bir kopya olarak saklanır; aynı hesapla girince ne yapılacağı sorulur.
      </p>
      <div className="auth-actions">
        <button className="btn btn-primary btn-inline" onClick={() => run('sakla')} disabled={busy}>
          <LogOut size={14} /> 7 gün bu cihazda sakla ve çık
        </button>
        <button className="btn btn-secondary btn-inline" onClick={() => downloadBackup()} disabled={busy}>
          <Download size={14} /> İndir
        </button>
        <button
          className="btn btn-secondary btn-inline"
          onClick={() => { if (confirm('Hesaba gitmemiş değişiklikler silinsin ve çıkış yapılsın mı? Geri getirilemez.')) run('sil'); }}
          disabled={busy}
        >
          <Trash2 size={14} /> Sil ve çık
        </button>
        <button className="btn btn-secondary btn-inline" onClick={() => { setAsk(false); setMsg(null); }} disabled={busy}>Vazgeç</button>
      </div>
      {msg && <p className="auth-note auth-note-err" role="alert">{msg}</p>}
    </div>
  );
}

// Hesaba gitmemiş yerel kopya(lar) bu cihazda (en çok 7 gün) saklanıyor. Her kopya için üç seçenek de
// açıkça kullanıcıdadır; karar verilene kadar hiçbir şey hesaba yazılmaz ve silinmez.
function QuarantineCard({ items }: { items: { savedAt: number; reason: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<AuthResult | null>(null);
  const whyOf = (reason: string) => reason === 'surum-cakismasi'
    ? 'Başka bir cihazda hesabın değiştiği için bu tarayıcıdaki değişiklikler hesaba yazılmadı.'
    : reason === 'cikis'
      ? 'Çıkış yaptığında bu değişiklikler hesaba gönderilememişti.'
      : 'Oturum kapandığında bu değişiklikler hesaba gönderilememişti.';

  const upload = (id: number) => {
    if (!confirm('Bu kopya hesabına yüklensin mi? Hesabındaki mevcut kayıt bu kopyayla DEĞİŞTİRİLİR ve geri getirilemez.')) return;
    setBusy(true);
    void quarantineUpload(id).then(setNote).finally(() => setBusy(false));
  };
  const discard = (id: number) => {
    if (!confirm('Bu cihazdaki kurtarılmamış kopya silinsin mi? Geri getirilemez.')) return;
    quarantineDiscard(id);
  };

  return (
    <div className="card auth-card auth-conflict fade" role="region" aria-label="Kurtarılmamış yerel kopya">
      <h2 className="card-title auth-title"><AlertTriangle size={14} /> Kurtarılmamış yerel kopya</h2>
      <p className="hint" style={{ marginTop: 8 }}>
        Hesabına gitmemiş değişiklikler bu cihazda ayrıca saklandı ve her biri kaydedildiği günden en çok 7 gün sonra
        silinir. Sen seçene kadar hesabına yazılmaz ve silinmez. Başka bir hesapla girersen, "SIFIRLA" yaparsan ya da
        hesabını silersen de silinir.
      </p>
      {items.map(it => (
        <div key={it.savedAt} className="auth-quarantine-item">
          <p className="hint" style={{ marginTop: 8 }}>
            {new Date(it.savedAt).toLocaleString('tr-TR')} · {whyOf(it.reason)}
          </p>
          <div className="auth-actions">
            <button className="btn btn-secondary btn-inline" onClick={() => quarantineDownload(it.savedAt)} disabled={busy}>
              <Download size={14} /> İndir
            </button>
            <button className="btn btn-secondary btn-inline" onClick={() => upload(it.savedAt)} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin-icon" /> : <Cloud size={14} />} Hesabıma yükle
            </button>
            <button className="btn btn-secondary btn-inline" onClick={() => discard(it.savedAt)} disabled={busy}>
              <Trash2 size={14} /> Sil
            </button>
          </div>
        </div>
      ))}
      <Notice result={note} />
    </div>
  );
}

export function Account({ onSignedIn, onSkip }: { onSignedIn: () => void; onSkip?: () => void }) {
  const cloud = useCloud();
  const s = usePortfolio();
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
      <div className="card auth-card center fade" role="status">
        <Loader2 size={18} className="spin-icon" /> <span className="sub">Oturum kontrol ediliyor…</span>
      </div>
    );
  }

  // Şifre sıfırlama bağlantısıyla gelindi: yeni şifre iste.
  if (cloud.recovery) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (password.length < 6) return;
      void run(() => setNewPassword(password), r => { if (r.ok) setPassword(''); });
    };
    return (
      <div className="card auth-card fade">
        <h2 className="card-title auth-title"><KeyRound size={14} /> Yeni şifre belirle</h2>
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

  // Giriş yapılmış — çakışma varsa önce karar.
  if (cloud.email) {
    if (cloud.status === 'cakisma') {
      const kind: ConflictKind = cloud.conflictKind ?? 'bulut-kaydi-var';
      return kind === 'bulut-bos'
        ? <UploadConfirmCard email={cloud.email} onResolved={onSignedIn} />
        : <ConflictCard email={cloud.email} />;
    }

    // Onay adımı olmadan RPC çağrılmaz.
    const remove = () => {
      if (!confirm(DELETE_CONFIRM)) return;
      void run(deleteAccount);
    };
    const syncErr = cloud.status === 'hata';
    return (<>
      {cloud.quarantine.length > 0 && <QuarantineCard items={cloud.quarantine} />}
      <div className="card auth-card fade">
        <h2 className="card-title auth-title">Hesabım</h2>
        <p className="auth-email">{cloud.email}</p>
        <p className={syncErr ? 'auth-sync auth-sync-err' : 'auth-sync'} role="status">
          {syncErr ? <CloudOff size={14} /> : <Cloud size={14} />}
          {cloud.error ?? syncLabel(cloud.status)}
        </p>
        <ul className="auth-facts">
          <li>
            Bu tarayıcıdaki verilerin (portföy ve işlem geçmişi, ajan kullanım belleği, öğrettiğin soru-cevaplar,
            stopaj oranları, hedef dağılım) Fagent hesabına eşitlenir. Başka bir cihazdan aynı e-postayla giriş
            yaptığında orada da görünür.
          </li>
          <li>
            "SIFIRLA" yalnızca bu tarayıcıdaki veriyi siler; hesabındaki kopya kalır. Yeniden kurulumda hesaptaki
            kayıtla yeni verinden hangisinin kalacağı sana sorulur; sen seçmeden hesabındaki kayıt değişmez.
            Hesabındaki veriyi silmenin yolu "Hesabımı sil"dir.
          </li>
          <li>
            Çıkış yaptığında bu tarayıcıdaki veriler temizlenir; hesabındaki kopya durur. Hesaba henüz gitmemiş
            değişiklik varsa çıkıştan önce sorulur: bu cihazda en çok 7 gün ayrı bir kopya olarak saklanır (aynı
            hesapla girişte ne yapılacağı sorulur), indirilir ya da silinir. Cihazda kopya için yer yoksa çıkıştan
            önce bildirilir. Oturum kendiliğinden kapanırsa kopya sormadan saklanmaya çalışılır.
          </li>
        </ul>
        <div className="auth-actions">
          <SignOutControl disabled={busy} />
          <button className="btn btn-danger btn-inline" onClick={remove} disabled={busy}>
            <Trash2 size={14} /> Hesabımı sil
          </button>
        </div>
        <Notice result={result} />
      </div>
    </>);
  }

  // Giriş yapılmamış: giriş / kayıt / şifremi unuttum.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit =
    !busy && emailOk && (mode === 'sifre' || password.length >= 6) && (mode !== 'kayit' || consent);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return; // rıza kutusu ve alan kontrolleri handler'da da uygulanır
    if (mode === 'giris') {
      void run(() => signIn(email.trim(), password), r => { if (r.ok) onSignedIn(); });
    } else if (mode === 'kayit') {
      if (!consent) return;
      void run(() => signUp(email.trim(), password), r => {
        if (r.ok && !r.message) onSignedIn();
      });
    } else {
      void run(() => sendPasswordReset(email.trim()));
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setResult(null);
  };

  return (
    <div className="card auth-card fade">
      <div className="auth-tabs" role="tablist" aria-label="Fagent hesabı">
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
        {mode === 'giris' && 'Fagent hesabınla giriş yaptığında verilerine diğer cihazlarından da erişebilirsin. Bu tarayıcıda hesapla eşitlenmemiş veri varsa, hesabına yüklenmeden önce sana sorulur.'}
        {mode === 'kayit' && 'Hesap oluşturup giriş yaptığında, bu tarayıcıdaki verinin hesabına yüklenip yüklenmeyeceği sana sorulur; sen onaylamadan hiçbir şey gönderilmez.'}
        {mode === 'sifre' && 'E-posta adresini gir; hesabın varsa şifre sıfırlama bağlantısı gönderilir.'}
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
              <span>
                Aşağıdaki açıklamayı okudum; e-postamın ve sayılan verilerimin Fagent hesabım için işlenmesini
                kabul ediyorum.
              </span>
            </label>
            <HesapAciklama />
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
        {onSkip && (
          <button className="link-btn" onClick={onSkip}>Hesapsız devam et</button>
        )}
      </div>

      {mode !== 'sifre' && s.onboarded && (
        <p className="hint auth-backup-hint">
          Bu tarayıcıdaki veri, onayın olmadan hesabına yüklenmez; hesabında kayıt varsa onayından sonra bu tarayıcıdaki verinin yerine geçer.{' '}
          <button className="link-btn" onClick={() => downloadBackup()}>
            <Download size={12} /> Önce bu tarayıcıdaki verinin yedeğini indir
          </button>
        </p>
      )}

      <p className="hint" style={{ marginTop: 14 }}>
        Hesap zorunlu değil. Hesapsız kullanımda verilerin yalnızca bu tarayıcıda saklanır.
      </p>
    </div>
  );
}
