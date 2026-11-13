import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Loading, ToastProvider } from './ui';
import { GoApp, Login } from './pages/Login';
import { Vitrine, VitrineVehicle } from './pages/Vitrine';
import { Signup } from './pages/Signup';
import { Terms } from './pages/Terms';
import { Platform } from './pages/Platform';
import './styles.css';

// O sistema da loja (todos os módulos) é servido em /app. O React cuida do que fica em volta:
// entrada, cadastro, termos, vitrine pública e o painel da plataforma.

try {
  document.documentElement.dataset.theme = localStorage.getItem('patio-theme') ?? 'light';
} catch {
  /* armazenamento indisponível */
}

function Private({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Atalho antigo: leva à vitrine da própria loja. */
function MyVitrine() {
  const { company, ready } = useAuth();
  if (!ready) return <Loading />;
  return <Navigate to={company ? `/v/${company.slug}` : '/login'} replace />;
}

function PlatformPage() {
  const { platform, logout } = useAuth();
  if (!platform) return <GoApp />;
  return (
    <div className="platform-shell">
      <header className="platform-top">
        <strong>Pátio · Plataforma</strong>
        <span className="row">
          <a className="btn sm" href="/app">Voltar ao sistema</a>
          <button className="btn sm" onClick={() => logout().then(() => (window.location.href = '/login'))}>Sair</button>
        </span>
      </header>
      <Platform />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Signup />} />
      <Route path="/termos" element={<Terms />} />
      <Route path="/v/:slug" element={<Vitrine />} />
      <Route path="/v/:slug/:id" element={<VitrineVehicle />} />
      <Route path="/vitrine" element={<MyVitrine />} />
      <Route path="/plataforma" element={<Private><PlatformPage /></Private>} />
      <Route path="*" element={<Private><GoApp /></Private>} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
