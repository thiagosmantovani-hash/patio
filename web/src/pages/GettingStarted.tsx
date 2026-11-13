import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Icon, useLoad } from '../ui';

// Primeiros passos de uma loja recém-cadastrada. Some quando tudo está feito ou quando a pessoa fecha.

const KEY = 'patio-primeiros-passos';

export function GettingStarted() {
  const { company, can } = useAuth();
  const key = `${KEY}-${company?.id}`;
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  const [opened, setOpened] = useState(() => {
    try { return localStorage.getItem(key + '-vitrine') === '1'; } catch { return false; }
  });
  const { data } = useLoad(async () => {
    const [settings, vehicles, users] = await Promise.all([api.get('/settings'), api.get<any[]>('/vehicles'), api.get<any[]>('/users/options')]);
    return { settings, vehicles: vehicles.length, users: users.length };
  });
  if (hidden || !data || !can('admin', 'gerente')) return null;

  const steps = [
    { done: Boolean(data.settings.address && data.settings.whatsapp), title: 'Complete os dados da loja', text: 'Endereço, WhatsApp e texto de apresentação aparecem na vitrine e nos documentos.', to: '/configuracoes', cta: 'Abrir configurações' },
    { done: data.vehicles > 0, title: 'Cadastre seu primeiro veículo', text: 'Com fotos, preço de compra e de venda. Ou comece por uma avaliação.', to: '/estoque', cta: 'Ir para o estoque' },
    { done: data.users > 1, title: 'Convide sua equipe', text: 'Cada vendedor com o próprio acesso. Vendedor não vê custos nem financeiro.', to: '/usuarios', cta: 'Adicionar usuários', admin: true },
    { done: opened, title: 'Divulgue sua vitrine', text: 'Um site com os carros disponíveis e formulário de interesse, que vira lead no funil.', href: `/v/${company?.slug}`, cta: 'Abrir vitrine' },
  ].filter((s) => !s.admin || can('admin'));
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const close = () => {
    try { localStorage.setItem(key, '1'); } catch { /* sem armazenamento */ }
    setHidden(true);
  };
  const markVitrine = () => {
    try { localStorage.setItem(key + '-vitrine', '1'); } catch { /* sem armazenamento */ }
    setOpened(true);
  };

  return (
    <section className="card onboarding">
      <div className="spread">
        <div>
          <h2>Primeiros passos</h2>
          <p className="muted small">{done} de {steps.length} concluídos. Faça no seu ritmo: o sistema já funciona sem isso.</p>
        </div>
        <button className="btn sm" onClick={close}>Ocultar</button>
      </div>
      <div className="ob-bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="ob-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={s.done ? 'done' : ''}>
            <span className="ob-n">{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <p className="small muted">{s.text}</p>
              {!s.done && (s.to ? <Link className="btn sm" to={s.to}>{s.cta}</Link> : <a className="btn sm" href={s.href} target="_blank" rel="noreferrer" onClick={markVitrine}>{s.cta}</a>)}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
