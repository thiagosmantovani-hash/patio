import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { date, money, todayISO, TX_CATEGORY } from '../format';
import { Badge, Empty, Field, formData, Icon, Loading, Modal, useAction, useLoad } from '../ui';

export function Finance() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'aberto';
  const type = params.get('type') ?? '';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const { run, busy } = useAction();
  const { data, reload } = useLoad(() => api.get(`/finance${qs({ status, type, from, to })}`), [status, type, from, to]);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next);
  };

  const pay = async (t: any) => {
    await run(() => api.patch(`/finance/${t.id}/pay`, { paid: !t.paid_at }), t.paid_at ? 'Pagamento estornado.' : 'Baixa registrada.');
    reload();
  };
  const remove = async (t: any) => {
    if (!confirm('Excluir este lançamento?')) return;
    await run(() => api.del(`/finance/${t.id}`));
    reload();
  };
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = formData(e.currentTarget);
    const body = { ...f, paid_at: f.paid ? f.paid_at || todayISO() : null };
    const ok = await run(() => (editing.id ? api.put(`/finance/${editing.id}`, body) : api.post('/finance', body)), 'Lançamento salvo.');
    if (ok) {
      setEditing(null);
      reload();
    }
  };
  const today = todayISO();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Financeiro</h1>
          <p>Contas a pagar e a receber. Vendas geram automaticamente entrada, repasse de financiamento e comissão.</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setEditing({ type: 'despesa' })}><Icon name="plus" /> Despesa</button>
          <button className="btn primary" onClick={() => setEditing({ type: 'receita' })}><Icon name="plus" /> Receita</button>
        </div>
      </div>

      {data && (
        <div className="grid g4" style={{ marginBottom: 16 }}>
          <div className="card kpi"><div className="label">Recebido</div><div className="value pos">{money(data.totals.received)}</div></div>
          <div className="card kpi"><div className="label">Pago</div><div className="value neg">{money(data.totals.paid)}</div></div>
          <div className="card kpi"><div className="label">A receber</div><div className="value">{money(data.totals.to_receive)}</div></div>
          <div className="card kpi"><div className="label">A pagar</div><div className="value">{money(data.totals.to_pay)}</div></div>
        </div>
      )}

      <div className="filters">
        <div className="seg">
          {[['aberto', 'Em aberto'], ['vencido', 'Vencidos'], ['pago', 'Pagos'], ['', 'Todos']].map(([k, l]) => (
            <button key={k} className={status === k ? 'active' : ''} onClick={() => set('status', k!)}>{l}</button>
          ))}
        </div>
        <div className="seg">
          {[['', 'Tudo'], ['receita', 'Receitas'], ['despesa', 'Despesas']].map(([k, l]) => (
            <button key={k} className={type === k ? 'active' : ''} onClick={() => set('type', k!)}>{l}</button>
          ))}
        </div>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Vencimento a partir de" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Vencimento até" />
      </div>

      {!data ? <Loading /> : !data.rows.length ? (
        <div className="card"><Empty>Nenhum lançamento.</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Vencimento</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th className="num">Valor</th><th /></tr>
            </thead>
            <tbody>
              {data.rows.map((t: any) => (
                <tr key={t.id}>
                  <td className="nowrap">{date(t.due_date)}</td>
                  <td>
                    {t.description}
                    {t.sale_id && <div className="small muted">Gerado pela venda #{t.sale_id}</div>}
                  </td>
                  <td>{TX_CATEGORY[t.category] ?? t.category}</td>
                  <td>
                    {t.paid_at ? <Badge tone="ok">Pago em {date(t.paid_at)}</Badge> : t.due_date < today ? <Badge tone="bad">Vencido</Badge> : <Badge tone="warn">Em aberto</Badge>}
                  </td>
                  <td className={`num ${t.type === 'receita' ? 'pos' : 'neg'}`}>{t.type === 'despesa' ? '− ' : ''}{money(t.amount)}</td>
                  <td className="right nowrap">
                    <button className="btn sm" disabled={busy} onClick={() => pay(t)}>{t.paid_at ? 'Estornar' : 'Dar baixa'}</button>
                    {!t.sale_id && (
                      <>
                        <button className="btn ghost sm" onClick={() => setEditing(t)}><Icon name="edit" /></button>
                        <button className="btn ghost sm danger" onClick={() => remove(t)}><Icon name="trash" /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && data && (
        <Modal title={`${editing.id ? 'Editar' : 'Nova'} ${editing.type === 'receita' ? 'receita' : 'despesa'}`} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <input type="hidden" name="type" value={editing.type} />
            <div className="form-grid">
              <Field label="Descrição *" className="span4"><input className="input" name="description" defaultValue={editing.description ?? ''} required autoFocus /></Field>
              <Field label="Categoria" className="span2">
                <select className="input" name="category" defaultValue={editing.category ?? 'outros'}>
                  {data.categories.map((c: string) => <option key={c} value={c}>{TX_CATEGORY[c] ?? c}</option>)}
                </select>
              </Field>
              <Field label="Valor (R$) *" className="span2"><input className="input" type="number" step="0.01" min="0.01" name="amount" defaultValue={editing.amount ?? ''} required /></Field>
              <Field label="Vencimento" className="span2"><input className="input" type="date" name="due_date" defaultValue={editing.due_date ?? todayISO()} required /></Field>
              <Field label="Data do pagamento" className="span2"><input className="input" type="date" name="paid_at" defaultValue={editing.paid_at ?? ''} /></Field>
              <label className="check span4"><input type="checkbox" name="paid" defaultChecked={Boolean(editing.paid_at)} /> Já foi pago</label>
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
