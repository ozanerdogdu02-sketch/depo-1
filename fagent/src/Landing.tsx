// Tanıtım sayfası — `/` adresinde, uygulamaya girmemiş ziyaretçi için.
//
// Önceden ziyaretçi doğrudan karşılama kartına düşüyordu ve ilk cümle "Panelin boş görünüyor"
// diyordu: yani bunun NE olduğunu zaten bildiğini varsayıyordu. Link birine atıldığında karşı
// taraf "bu ne?" diye soruyordu. Bu sayfa o boşluğu kapatır.
//
// İçerik docs/tanitim-konusmasi.md ve sunumdan alındı — yeniden yazılmadı, aynı sayı seti
// (₺143.700 · +%2,6 · −%22,69) korunuyor ki her yerde tek anlatı olsun.
import { ShieldCheck, Sparkles, Calculator, ArrowRight, Lock } from 'lucide-react';
import { navigate, DEFAULT_APP_PATH } from './router';

const FEATURES = [
  {
    icon: Calculator,
    title: 'Vergi ve enflasyon sonrası',
    body: 'Brüt kazanç → stopaj → net kazanç → enflasyon → reel getiri. Zincirin tamamını sayıyla kurar.',
  },
  {
    icon: Sparkles,
    title: 'Sen sormadan hesaplar',
    body: 'Panel açılır açılmaz nakit erimesi, yoğunlaşma ve hedeften sapma uyarılarını kendisi çıkarır.',
  },
  {
    icon: ShieldCheck,
    title: 'Gerçek risk matematiği',
    body: 'XIRR, kovaryans tabanlı portföy volatilitesi, korelasyon ve çeşitlendirme faydası.',
  },
];

const LIMITS = [
  'Yatırım tavsiyesi vermez — ne olduğunu söyler, ne yapılacağını değil.',
  'Uydurma fiyat göstermez. Doğrulanmış kaynağı olmayan veriyi varmış gibi sunmaz.',
  'Hesap istemez, sunucusu yoktur. Verin tarayıcından çıkmaz.',
];

export default function Landing() {
  const enter = () => navigate(DEFAULT_APP_PATH);

  return (
    <div className="landing">
      <header className="landing-hero">
        <div className="landing-brand">F A G E N T</div>
        <h1 className="landing-title">
          Gösteren çok,<br />hesaplayan yok.
        </h1>
        <p className="landing-sub">
          Yatırım uygulamaların sana ne kazandığını gösteriyor. Hiçbiri vergiden ve
          enflasyondan sonra <strong>elinde ne kaldığını</strong> söylemiyor. FAGENT bunu hesaplar.
        </p>
        <button className="btn btn-primary landing-cta" onClick={enter}>
          Örnek portföyle dene <ArrowRight size={16} />
        </button>
        <p className="hint landing-hint">
          <Lock size={12} /> Kayıt yok, hesap yok. Verilerin yalnızca bu tarayıcıda saklanır.
        </p>
      </header>

      {/* Somut örnek — sunumun 3. slaydındaki sayı seti. Soyut iddiayı tek portföyde gösterir. */}
      <section className="landing-example card">
        <div className="sub" style={{ marginBottom: 14 }}>Örnek: ₺143.700'lük bir portföy</div>
        <div className="landing-figures">
          <div>
            <div className="landing-fig landing-fig-up">+%2,6</div>
            <div className="hint">Ekranda gördüğün kâr</div>
          </div>
          <div className="landing-arrow" aria-hidden="true">→</div>
          <div>
            <div className="landing-fig landing-fig-down">−%22,69</div>
            <div className="hint">Vergi ve enflasyondan sonra gerçek getirin</div>
          </div>
        </div>
        <p className="sub landing-example-note">
          Aradaki fark 25 puan. Kullanıcı kazandığını sanırken alım gücü kaybediyor —
          ve bunu hiçbir ekranda göremiyor.
        </p>
      </section>

      <section className="landing-features">
        {FEATURES.map(f => (
          <div key={f.title} className="card landing-feature">
            <div className="landing-feature-icon"><f.icon size={18} /></div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.title}</div>
            <div className="sub" style={{ fontSize: 13.5 }}>{f.body}</div>
          </div>
        ))}
      </section>

      {/* Sınırlar sayfada AÇIKÇA duruyor: ürünün iddiası dürüstlük, o yüzden ne yapmadığı
          da satış sayfasında görünmeli — küçük punto bir feragatnamede değil. */}
      <section className="card landing-limits">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Ne yapmadığı da önemli</div>
        <ul className="landing-limit-list">
          {LIMITS.map(l => <li key={l}>{l}</li>)}
        </ul>
      </section>

      <footer className="landing-footer">
        <button className="btn btn-primary landing-cta" onClick={enter}>
          Panele gir <ArrowRight size={16} />
        </button>
        <p className="hint" style={{ marginTop: 14 }}>
          Yatırım tavsiyesi değildir. Hesaplamalar senin girdiğin verilere dayanır.
        </p>
      </footer>
    </div>
  );
}
