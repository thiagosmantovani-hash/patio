import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, type User } from './auth';
import { Layout } from './Layout';
import { Loading, ToastProvider } from './ui';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Vehicles } from './pages/Vehicles';
import { VehicleDetail } from './pages/VehicleDetail';
import { Appraisals } from './pages/Appraisals';
import { AppraisalDetail } from './pages/AppraisalDetail';
import { Listings } from './pages/Listings';
import { Leads } from './pages/Leads';
import { Customers } from './pages/Customers';
import { CustomerDetail } from './pages/CustomerDetail';
import { Sales } from './pages/Sales';
import { NewSale } from './pages/NewSale';
import { Finance } from './pages/Finance';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { Vitrine, VitrineVehicle } from './pages/Vitrine';
import { Signup } from './pages/Signup';
import { Terms } from './pages/Terms';
import { Platform } from './pages/Platform';
import './styles.css';

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

function Only({ roles, children }: { roles: User['role'][]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? <>{children}</> : <Navigate to="/" replace />;
}

/** Atalho antigo: leva à vitrine da própria loja. */
function MyVitrine() {
  const { company, ready } = useAuth();
  if (!ready) return <Loading />;
  return <Navigate to={company ? `/v/${company.slug}` : '/login'} replace />;
}

function PlatformOnly() {
  const { platform } = useAuth();
  return platform ? <Platform /> : <Navigate to="/" replace />;
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
      <Route
        element={
          <Private>
            <Layout />
          </Private>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="estoque" element={<Vehicles />} />
        <Route path="estoque/:id" element={<VehicleDetail />} />
        <Route path="avaliacoes" element={<Appraisals />} />
        <Route path="avaliacoes/:id" element={<AppraisalDetail />} />
        <Route path="anuncios" element={<Listings />} />
        <Route path="leads" element={<Leads />} />
        <Route path="clientes" element={<Customers />} />
        <Route path="clientes/:id" element={<CustomerDetail />} />
        <Route path="vendas" element={<Sales />} />
        <Route path="vendas/nova" element={<NewSale />} />
        <Route path="financeiro" element={<Only roles={['admin', 'gerente']}><Finance /></Only>} />
        <Route path="relatorios" element={<Only roles={['admin', 'gerente']}><Reports /></Only>} />
        <Route path="usuarios" element={<Only roles={['admin']}><Users /></Only>} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="plataforma" element={<PlatformOnly />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
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
