import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { ROLE } from './format';
import { Icon } from './ui';

type Item = { to: string; label: string; icon: string; roles?: ('admin' | 'gerente' | 'vendedor')[] };

const SECTIONS: { title?: string; items: Item[] }[] = [
  { items: [{ to: '/', label: 'Painel', icon: 'dashboard' }] },
  {
    title: 'Operação',
    items: [
      { to: '/estoque', label: 'Estoque', icon: 'car' },
      { to: '/avaliacoes', label: 'Avaliações', icon: 'clipboard' },
      { to: '/anuncios', label: 'Anúncios', icon: 'megaphone' },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { to: '/leads', label: 'Leads', icon: 'funnel' },
      { to: '/clientes', label: 'Clientes', icon: 'users' },
      { to: '/vendas', label: 'Vendas', icon: 'cart' },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { to: '/financeiro', label: 'Financeiro', icon: 'wallet', roles: ['admin', 'gerente'] },
      { to: '/relatorios', label: 'Relatórios', icon: 'chart', roles: ['admin', 'gerente'] },
      { to: '/usuarios', label: 'Usuários', icon: 'user', roles: ['admin'] },
      { to: '/configuracoes', label: 'Configurações', icon: 'settings' },
    ],
  },
];

function useTheme() {
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('patio-theme') ?? 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('patio-theme', theme);
    } catch {
      /* armazenamento indisponível */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))] as const;
}

export function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="logo">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#14b8a6" />
            <path d="M7 20l2.2-6.2A2 2 0 0 1 11.1 12h9.8a2 2 0 0 1 1.9 1.8L25 20v4h-3v-2H10v2H7z" fill="#fff" />
          </svg>
          <div>
            Pátio<small>Gestão de revendas</small>
          </div>
        </div>
        <nav className="nav">
          {SECTIONS.map((s, i) => {
            const items = s.items.filter((it) => !it.roles || can(...it.roles));
            if (!items.length) return null;
            return (
              <div key={i}>
                {s.title && <div className="nav-section">{s.title}</div>}
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === '/'}>
                    <Icon name={it.icon} /> {it.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
          <div className="nav-section">Loja</div>
          <a href="/vitrine" target="_blank" rel="noreferrer">
            <Icon name="store" /> Vitrine pública
          </a>
        </nav>
        <div className="sidebar-footer">
          <div className="who">{user?.name}</div>
          <div className="small">{user && ROLE[user.role]}</div>
          <div className="row" style={{ marginTop: 10, gap: 14 }}>
            <button onClick={toggleTheme} title="Alternar tema">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <button onClick={logout} className="row" style={{ gap: 6 }}>
              <Icon name="logout" size={16} /> Sair
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
          <strong>Pátio</strong>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
