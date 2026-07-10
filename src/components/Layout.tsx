import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Brain, Sparkles, TrendingUp } from 'lucide-react';
import { track } from '../lib/api';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/education', icon: BookOpen, label: 'Eğitim & Aktivite' },
  { to: '/mood', icon: Brain, label: 'BDT Günlüğü' },
];

function Sidebar() {
  const location = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Sparkles size={20} />
        </div>
        <div>
          <div className="logo-title">Aura</div>
          <div className="logo-sub">Finance</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={`nav-item ${location.pathname === to ? 'nav-item-active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="streak-card">
          <TrendingUp size={16} className="text-blue-300" />
          <div>
            <div className="streak-num">12 Gün</div>
            <div className="streak-label">Aktif Seri</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();

  useEffect(() => {
    track('page_view', { page: pathname });
  }, [pathname]);

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
