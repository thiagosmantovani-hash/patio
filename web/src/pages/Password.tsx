import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Field } from '../ui';
import { AuthSide } from './Login';

const MIN = 8;

/** Esqueci minha senha: pede o e-mail e envia o link (a resposta não revela se o e-mail existe). */
export function ForgotPassword() {
  const [state, setState] = useState<'form' | 'busy' | 'sent'>('form');
  const [mail, setMail] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setState('busy');
    setError(null);
    try {
      const r = await api.post<{ mail: boolean }>('/auth/forgot', { email });
      setMail(r.mail);
      setState('sent');
    } catch (err) {
      setError((err as Error).message);
      setState('form');
    }
  }

  return (
    <div className="auth">
      <AuthSide />
      <div className="auth-form">
        {state === 'sent' ? (
          <div className="form-col" role="status">
            <h1>Confira seu e-mail</h1>
            {mail ? (
              <p>Se este e-mail tiver uma conta no Pátio, enviamos um link para criar uma nova senha. O link vale por 1 hora. Veja também a caixa de spam.</p>
            ) : (
              <p>O envio de e-mails ainda não está ligado neste sistema. Peça ao administrador da sua loja para gerar uma nova senha em Configurações › Usuários.</p>
            )}
            <Link className="btn" to="/login">Voltar para o login</Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div>
              <h1>Esqueci minha senha</h1>
              <p className="muted">Informe o e-mail que você usa para entrar.</p>
            </div>
            {error && <div className="error-box" role="alert">{error}</div>}
            <Field label="E-mail">
              <input className="input" name="email" type="email" autoComplete="username" required autoFocus />
            </Field>
            <button className="btn primary" disabled={state === 'busy'}>
              {state === 'busy' ? 'Enviando…' : 'Enviar link'}
            </button>
            <p className="small muted" style={{ textAlign: 'center' }}>
              <Link to="/login">Voltar para o login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

/** Link do e-mail (redefinição ou convite): cria a senha e já entra no sistema. */
export function ResetPassword() {
  const [params] = useSearchParams();
  const t = params.get('t') ?? '';
  const [info, setInfo] = useState<{ kind: string; name: string; email: string; store: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ kind: string; name: string; email: string; store: string }>(`/auth/token?t=${encodeURIComponent(t)}`)
      .then(setInfo)
      .catch(() => setInvalid(true));
  }, [t]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p1 = String(f.get('password') ?? '');
    if (p1.length < MIN) return setError(`A senha deve ter pelo menos ${MIN} caracteres.`);
    if (p1 !== String(f.get('password2') ?? '')) return setError('As senhas não conferem.');
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset', { t, password: p1 });
      window.location.href = '/app';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const convite = info?.kind === 'invite';
  return (
    <div className="auth">
      <AuthSide />
      <div className="auth-form">
        {invalid ? (
          <div className="form-col" role="alert">
            <h1>Link expirado</h1>
            <p>Este link expirou ou já foi usado. Peça um novo link ou fale com o administrador da sua loja.</p>
            <Link className="btn primary" to="/esqueci-senha">Pedir novo link</Link>
            <Link className="btn" to="/login">Voltar para o login</Link>
          </div>
        ) : !info ? (
          <p className="muted" role="status">Conferindo o link…</p>
        ) : (
          <form onSubmit={submit}>
            <div>
              <h1>{convite ? 'Crie sua senha' : 'Nova senha'}</h1>
              <p className="muted">
                {convite ? `Bem-vindo à ${info.store}, ${info.name.split(' ')[0]}. ` : ''}Acesso: <b>{info.email}</b>
              </p>
            </div>
            {error && <div className="error-box" role="alert">{error}</div>}
            <Field label={`Senha (mínimo ${MIN} caracteres)`}>
              <input className="input" name="password" type="password" autoComplete="new-password" minLength={MIN} required autoFocus />
            </Field>
            <Field label="Repita a senha">
              <input className="input" name="password2" type="password" autoComplete="new-password" minLength={MIN} required />
            </Field>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Salvando…' : convite ? 'Criar senha e entrar' : 'Salvar e entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
