import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { date, percent, ROLE } from '../format';
import { Badge, Field, formData, Icon, Loading, Modal, useAction, useLoad } from '../ui';

export function Users() {
  const { data, reload } = useLoad(() => api.get<any[]>('/users'));
  const [editing, setEditing] = useState<any | null>(null);
  const { run, busy } = useAction();

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = formData(e.currentTarget);
    const body = { ...f, active: Boolean(f.active) };
    const ok = await run(() => (editing.id ? api.put(`/users/${editing.id}`, body) : api.post('/users', body)), 'Usuário salvo.');
    if (ok) {
      setEditing(null);
      reload();
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Usuários</h1>
          <p>Vendedores veem estoque, avaliações, leads, clientes e vendas. Gerentes também acessam financeiro e relatórios.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ role: 'vendedor', active: 1 })}><Icon name="plus" /> Novo usuário</button>
      </div>
      {!data ? <Loading /> : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th className="num">Comissão</th><th>Situação</th><th>Desde</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.email}</td>
                  <td>{ROLE[u.role]}</td>
                  <td className="num">{percent(u.commission_rate)}</td>
                  <td>{u.active ? <Badge tone="ok">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
                  <td>{date(u.created_at)}</td>
                  <td className="right"><button className="btn ghost sm" onClick={() => setEditing(u)}><Icon name="edit" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={editing.id ? 'Editar usuário' : 'Novo usuário'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <Field label="Nome *" className="span4"><input className="input" name="name" defaultValue={editing.name ?? ''} required /></Field>
              <Field label="E-mail *" className="span4"><input className="input" type="email" name="email" defaultValue={editing.email ?? ''} required /></Field>
              <Field label="Perfil" className="span2">
                <select className="input" name="role" defaultValue={editing.role}>
                  {Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Comissão sobre a venda (%)" className="span2"><input className="input" type="number" step="0.01" min="0" name="commission_rate" defaultValue={editing.commission_rate ?? 0} /></Field>
              <Field label={editing.id ? 'Nova senha (deixe vazio para manter)' : 'Senha *'} className="span4">
                <input className="input" type="password" name="password" minLength={6} required={!editing.id} autoComplete="new-password" />
              </Field>
              <label className="check span4"><input type="checkbox" name="active" defaultChecked={Boolean(editing.active)} /> Usuário ativo</label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={busy}>Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
