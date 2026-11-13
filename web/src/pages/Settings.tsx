import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Field, formData, Loading, useAction, useLoad } from '../ui';

export function Settings() {
  const { can, company, refresh } = useAuth();
  const { data, reload } = useLoad(() => api.get('/settings'));
  const { run, busy } = useAction();
  const [channels, setChannels] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState('');
  useEffect(() => {
    if (data) setChannels(data.channels);
  }, [data]);
  const editable = can('admin', 'gerente');

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await run(() => api.put('/settings', { ...formData(e.currentTarget), channels }), 'Configurações salvas.')) {
      reload();
      refresh();
    }
  };
  const changePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = formData(form);
    if (f.password !== f.confirm) {
      await run(() => Promise.reject(new Error('A confirmação não confere com a nova senha.')));
      return;
    }
    if (await run(() => api.post('/users/me/password', f), 'Senha alterada.')) form.reset();
  };

  if (!data) return <Loading />;
  return (
    <div className="page">
      <div className="page-head"><h1>Configurações</h1></div>
      <div className="grid g-main">
        <form className="card" onSubmit={save}>
          <div className="card-head"><h2>Dados da loja</h2></div>
          <fieldset disabled={!editable} style={{ border: 0, margin: 0, padding: 0 }}>
            <div className="card-body form-grid">
              <Field label="Nome da loja" className="span2"><input className="input" name="store_name" defaultValue={data.store_name} /></Field>
              <Field label="CNPJ" className="span2"><input className="input" name="document" defaultValue={data.document} /></Field>
              <Field label="Telefone"><input className="input" name="phone" defaultValue={data.phone} /></Field>
              <Field label="WhatsApp"><input className="input" name="whatsapp" defaultValue={data.whatsapp} /></Field>
              <Field label="E-mail" className="span2"><input className="input" type="email" name="email" defaultValue={data.email} /></Field>
              <Field label="Endereço" className="span2"><input className="input" name="address" defaultValue={data.address} /></Field>
              <Field label="Cidade / UF" className="span2"><input className="input" name="city" defaultValue={data.city} /></Field>
              <Field label="Texto de apresentação (vitrine)" className="span4"><textarea className="input" name="about" rows={3} defaultValue={data.about} /></Field>
              <Field label="Margem padrão nas avaliações (%)" className="span2"><input className="input" type="number" step="0.1" min="0" max="100" name="default_margin" defaultValue={data.default_margin} /></Field>
              <div className="span4">
                <div className="field" style={{ marginBottom: 6 }}>Canais de anúncio</div>
                <div className="chips">
                  {channels.map((c) => (
                    <span className="chip" key={c}>
                      {c}
                      {editable && <button type="button" aria-label={`Remover ${c}`} onClick={() => setChannels((cs) => cs.filter((x) => x !== c))}>×</button>}
                    </span>
                  ))}
                </div>
                {editable && (
                  <div className="row mt">
                    <input className="input" style={{ maxWidth: 260 }} placeholder="Novo canal" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} />
                    <button type="button" className="btn sm" onClick={() => { if (newChannel.trim()) { setChannels((cs) => [...new Set([...cs, newChannel.trim()])]); setNewChannel(''); } }}>Adicionar</button>
                  </div>
                )}
              </div>
            </div>
            {editable && <div className="card-body" style={{ paddingTop: 0 }}><div className="form-actions" style={{ marginTop: 0 }}><button className="btn primary" disabled={busy}>Salvar</button></div></div>}
          </fieldset>
        </form>

        <div className="stack">
          <form className="card" onSubmit={changePassword}>
            <div className="card-head"><h2>Minha senha</h2></div>
            <div className="card-body stack">
              <Field label="Senha atual"><input className="input" type="password" name="current" required autoComplete="current-password" /></Field>
              <Field label="Nova senha"><input className="input" type="password" name="password" minLength={6} required autoComplete="new-password" /></Field>
              <Field label="Confirmar nova senha"><input className="input" type="password" name="confirm" minLength={6} required autoComplete="new-password" /></Field>
              <button className="btn primary" disabled={busy}>Alterar senha</button>
            </div>
          </form>
          <div className="card card-pad small">
            <h3>Integrações</h3>
            <p className="muted">
              Feed XML do estoque para portais e agregadores: <a href={`/api/public/${company?.slug}/feed.xml`} target="_blank" rel="noreferrer">{location.origin}/api/public/{company?.slug}/feed.xml</a>
            </p>
            <p className="muted">
              Vitrine pública da loja: <a href={`/v/${company?.slug}`} target="_blank" rel="noreferrer">{location.origin}/v/{company?.slug}</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
