import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { date } from '../format';
import { Badge, Empty, Icon, Loading, useLoad } from '../ui';
import { CustomerModal } from './CustomerPicker';

export function Customers() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { data } = useLoad(() => api.get<any[]>(`/customers${qs({ q })}`), [q]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Clientes</h1>
          <p>Compradores, interessados e proprietários avaliados.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> Novo cliente</button>
      </div>
      <div className="filters">
        <input className="input search" placeholder="Buscar por nome, telefone, e-mail ou documento" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!data ? <Loading /> : !data.length ? (
        <div className="card"><Empty>Nenhum cliente encontrado.</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Cidade</th><th>Relacionamento</th><th>Desde</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="click" onClick={() => nav(`/clientes/${c.id}`)}>
                  <td><strong>{c.name}</strong>{c.document && <div className="small muted">{c.document}</div>}</td>
                  <td className="nowrap">{c.phone ?? '—'}</td>
                  <td>{c.email ?? '—'}</td>
                  <td>{[c.city, c.state].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="row">
                    {c.purchases > 0 && <Badge tone="ok">{c.purchases} compra(s)</Badge>}
                    {c.open_leads > 0 && <Badge tone="info">{c.open_leads} lead(s) aberto(s)</Badge>}
                  </td>
                  <td className="nowrap">{date(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <CustomerModal onClose={() => setCreating(false)} onSaved={(c) => nav(`/clientes/${c.id}`)} />}
    </div>
  );
}
