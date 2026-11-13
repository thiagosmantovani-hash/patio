import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Field } from '../ui';

export function Login() {
  const { user, login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(String(f.get('email')), String(f.get('password')));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <AuthSide />
      <div className="auth-form">
        <form onSubmit={submit}>
          <div>
            <h1>Entrar</h1>
            <p className="muted">Acesse com seu e-mail e senha.</p>
          </div>
          {error && <div className="error-box">{error}</div>}
          <Field label="E-mail">
            <input className="input" name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Senha">
            <input className="input" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
          <p className="small muted" style={{ textAlign: 'center' }}>
            Ainda não usa o Pátio? <Link to="/cadastro">Cadastre sua loja grátis</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export function AuthSide() {
  return (
    <div className="auth-side">
        <div className="logo" style={{ padding: 0 }}>
          <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#14b8a6" />
            <path d="M7 20l2.2-6.2A2 2 0 0 1 11.1 12h9.8a2 2 0 0 1 1.9 1.8L25 20v4h-3v-2H10v2H7z" fill="#fff" />
          </svg>
          <div>Pátio</div>
        </div>
        <div>
          <h2>Do pátio ao financeiro, toda a revenda em um só lugar.</h2>
          <ul>
            <li>Estoque com custos de preparação e lucro por veículo</li>
            <li>Avaliação guiada com checklist e preço sugerido</li>
            <li>Funil de leads, vendas com troca e financiamento</li>
            <li>Anúncios por canal, vitrine online e feed XML</li>
            <li>Contas a pagar e receber, relatórios gerenciais</li>
          </ul>
        </div>
        <div className="small">© {new Date().getFullYear()} Pátio</div>
      </div>
  );
}
