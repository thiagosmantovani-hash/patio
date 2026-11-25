import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Field } from '../ui';
import { AuthSide, GoApp } from './Login';

export function Signup() {
  const { user, signup } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <GoApp />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '').trim();
    if (get('password') !== get('password2')) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signup({
        company_name: get('company_name'),
        document: get('document'),
        city: get('city'),
        phone: get('phone'),
        name: get('name'),
        email: get('email'),
        password: get('password'),
        accept_terms: f.get('accept_terms') === 'on',
      });
      window.location.href = '/app';
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
        <form onSubmit={submit} className="signup-form">
          <div>
            <h1>Cadastre sua loja</h1>
            <p className="muted">Leva 1 minuto. Você entra direto no sistema, com 30 dias para testar sem custo.</p>
          </div>
          {error && <div className="error-box" role="alert">{error}</div>}
          <fieldset>
            <legend>Loja</legend>
            <Field label="Nome da loja">
              <input className="input" name="company_name" required maxLength={80} autoFocus placeholder="Ex.: Mantovani Veículos" />
            </Field>
            <div className="grid g2">
              <Field label="CNPJ (opcional)"><input className="input" name="document" inputMode="numeric" placeholder="00.000.000/0000-00" /></Field>
              <Field label="Cidade"><input className="input" name="city" placeholder="Umuarama - PR" /></Field>
            </div>
            <Field label="Telefone / WhatsApp"><input className="input" name="phone" inputMode="tel" placeholder="(44) 99999-0000" /></Field>
          </fieldset>
          <fieldset>
            <legend>Seu acesso (administrador)</legend>
            <Field label="Seu nome"><input className="input" name="name" required maxLength={80} autoComplete="name" /></Field>
            <Field label="E-mail"><input className="input" name="email" type="email" required autoComplete="username" /></Field>
            <div className="grid g2">
              <Field label="Senha (mínimo 8 caracteres)"><input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
              <Field label="Repita a senha"><input className="input" name="password2" type="password" minLength={8} required autoComplete="new-password" /></Field>
            </div>
          </fieldset>
          <label className="check-line">
            <input type="checkbox" name="accept_terms" required />
            <span>Li e aceito os <Link to="/termos" target="_blank">termos de uso e a política de privacidade</Link>.</span>
          </label>
          <button className="btn primary" disabled={busy}>{busy ? 'Criando sua conta…' : 'Criar conta e entrar'}</button>
          <p className="small muted" style={{ textAlign: 'center' }}>
            Já tem conta? <Link to="/login">Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
