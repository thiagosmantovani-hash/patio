import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { APPRAISAL_STATUS, date, LEAD_SOURCE, LEAD_STAGE, money0 } from '../format';
import { Badge, Empty, Icon, Loading, StatusBadge, useAction, useLoad } from '../ui';
import { CustomerModal } from './CustomerPicker';

export function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const { run } = useAction();
  const [editing, setEditing] = useState(false);
  const { data: c, error, reload } = useLoad(() => api.get(`/customers/${id}`), [id]);
  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!c) return <Loading />;
  const phone = (c.phone ?? '').replace(/\D/g, '');

  const remove = async () => {
    if (!confirm('Excluir este cliente? Leads vinculados também serão removidos.')) return;
    if (await run(() => api.del(`/customers/${c.id}`), 'Cliente excluído.')) nav('/clientes');
  };

  return (
    <div className="page">
      <Link to="/clientes" className="back"><Icon name="left" size={14} /> Clientes</Link>
      <div className="page-head">
        <div>
          <h1>{c.name}</h1>
          <p>{[c.phone, c.email, c.document].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}</p>
        </div>
        <div className="actions">
          {phone && <a className="btn" href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer"><Icon name="phone" /> WhatsApp</a>}
          <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" /> Editar</button>
          <Link className="btn primary" to={`/vendas/nova?customer=${c.id}`}>Nova venda</Link>
          {can('admin', 'gerente') && !c.sales.length && <button className="btn danger" onClick={remove}><Icon name="trash" /></button>}
        </div>
      </div>
      <div className="grid g-main">
        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Compras</h2></div>
            {c.sales.length ? (
              <table className="table">
                <thead><tr><th>Data</th><th>Veículo</th><th className="num">Valor</th><th /></tr></thead>
                <tbody>
                  {c.sales.map((s: any) => (
                    <tr key={s.id}>
                      <td>{date(s.sale_date)}</td>
                      <td>{s.brand} {s.model} {s.year_model}</td>
                      <td className="num">{money0(s.sale_price)}</td>
                      <td>{s.status === 'cancelada' && <Badge tone="bad">Cancelada</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Nenhuma compra registrada.</Empty>}
          </div>
          <div className="card">
            <div className="card-head"><h2>Leads</h2></div>
            {c.leads.length ? (
              <table className="table">
                <thead><tr><th>Data</th><th>Interesse</th><th>Origem</th><th>Etapa</th></tr></thead>
                <tbody>
                  {c.leads.map((l: any) => (
                    <tr key={l.id} className="click" onClick={() => nav(`/leads?lead=${l.id}`)}>
                      <td>{date(l.created_at)}</td>
                      <td>{l.brand ? `${l.brand} ${l.model}` : '—'}</td>
                      <td>{LEAD_SOURCE[l.source] ?? l.source}</td>
                      <td><StatusBadge map={LEAD_STAGE} value={l.stage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Nenhum lead.</Empty>}
          </div>
          <div className="card">
            <div className="card-head"><h2>Avaliações de veículos</h2></div>
            {c.appraisals.length ? (
              <table className="table">
                <tbody>
                  {c.appraisals.map((a: any) => (
                    <tr key={a.id} className="click" onClick={() => nav(`/avaliacoes/${a.id}`)}>
                      <td>{date(a.created_at)}</td>
                      <td>{a.brand} {a.model} {a.year_model}</td>
                      <td><StatusBadge map={APPRAISAL_STATUS} value={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Nenhuma avaliação.</Empty>}
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 8 }}>Dados cadastrais</h3>
          {[
            ['CPF/CNPJ', c.document], ['Telefone', c.phone], ['E-mail', c.email], ['Nascimento', c.birth_date && date(c.birth_date)],
            ['Endereço', c.address], ['Cidade', [c.city, c.state].filter(Boolean).join(' / ')], ['Cliente desde', date(c.created_at)],
          ].map(([k, v]) => (
            <div className="summary-line" key={k}><span className="muted">{k}</span><span>{v || '—'}</span></div>
          ))}
          {c.notes && <p className="small muted">{c.notes}</p>}
        </div>
      </div>
      {editing && <CustomerModal customer={c} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </div>
  );
}
