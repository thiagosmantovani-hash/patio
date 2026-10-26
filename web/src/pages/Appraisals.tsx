import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api';
import { APPRAISAL_STATUS, date, km, money0 } from '../format';
import { Empty, Field, formData, Icon, Loading, Modal, StatusBadge, useAction, useLoad } from '../ui';
import { CustomerPicker } from './CustomerPicker';

export function Appraisals() {
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const { data } = useLoad(() => api.get<any[]>(`/appraisals${qs({ status })}`), [status]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Avaliações</h1>
          <p>Avaliação guiada de veículos na troca ou compra, com checklist, fotos e preço sugerido.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> Nova avaliação</button>
      </div>
      <div className="tabs">
        {[['', 'Todas'], ...Object.entries(APPRAISAL_STATUS).map(([k, s]) => [k, s.label])].map(([k, l]) => (
          <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k!)}>{l}</button>
        ))}
      </div>
      {!data ? <Loading /> : !data.length ? (
        <div className="card"><Empty>Nenhuma avaliação.</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Veículo</th><th>Cliente</th><th>Avaliador</th><th className="num">Referência</th><th className="num">Reparos</th><th className="num">Sugerido</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="click" onClick={() => nav(`/avaliacoes/${a.id}`)}>
                  <td className="nowrap">{date(a.created_at)}</td>
                  <td>
                    <strong>{a.brand} {a.model}</strong>
                    <div className="small muted">{a.version} {a.year_model} · {km(a.km)} · {a.plate ?? 'sem placa'}</div>
                  </td>
                  <td>{a.customer_name ?? '—'}</td>
                  <td>{a.appraiser_name ?? '—'}</td>
                  <td className="num">{money0(a.market_price)}</td>
                  <td className="num">{money0(a.summary.repair_total)}{a.summary.issues ? <div className="small muted">{a.summary.issues} item(ns)</div> : null}</td>
                  <td className="num"><strong>{money0(a.offered_price ?? a.summary.suggested_price)}</strong></td>
                  <td><StatusBadge map={APPRAISAL_STATUS} value={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewAppraisal onClose={() => setCreating(false)} onCreated={(id) => nav(`/avaliacoes/${id}`)} />}
    </div>
  );
}

export function AppraisalHeaderFields({ a }: { a?: any }) {
  const v = a ?? {};
  return (
    <>
      <Field label="Marca *"><input className="input" name="brand" defaultValue={v.brand} required /></Field>
      <Field label="Modelo *"><input className="input" name="model" defaultValue={v.model} required /></Field>
      <Field label="Versão" className="span2"><input className="input" name="version" defaultValue={v.version ?? ''} /></Field>
      <Field label="Ano modelo"><input className="input" type="number" name="year_model" min="1900" max="2100" defaultValue={v.year_model ?? ''} /></Field>
      <Field label="Quilometragem"><input className="input" type="number" name="km" min="0" defaultValue={v.km ?? ''} /></Field>
      <Field label="Placa"><input className="input" name="plate" defaultValue={v.plate ?? ''} style={{ textTransform: 'uppercase' }} /></Field>
      <Field label="Cor"><input className="input" name="color" defaultValue={v.color ?? ''} /></Field>
      <Field label="Valor de referência de mercado (R$)" className="span2">
        <input className="input" type="number" step="0.01" min="0" name="market_price" defaultValue={v.market_price ?? ''} placeholder="Ex.: tabela de referência ou média dos portais" />
      </Field>
      <Field label="Margem desejada (%)"><input className="input" type="number" step="0.1" min="0" name="margin_percent" defaultValue={v.margin_percent ?? ''} placeholder="Padrão da loja" /></Field>
      <Field label="Valor ofertado (R$)"><input className="input" type="number" step="0.01" min="0" name="offered_price" defaultValue={v.offered_price ?? ''} placeholder="Opcional" /></Field>
      <Field label="Observações" className="span4"><textarea className="input" name="notes" rows={2} defaultValue={v.notes ?? ''} /></Field>
    </>
  );
}

function NewAppraisal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { run, busy } = useAction();
  const [customer, setCustomer] = useState<any>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = await run(() => api.post('/appraisals', { ...formData(e.currentTarget), customer_id: customer?.id }), 'Avaliação iniciada.');
    if (r) onCreated(r.id);
  };
  return (
    <Modal title="Nova avaliação" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="span4"><CustomerPicker value={customer} onChange={setCustomer} label="Cliente (proprietário do veículo)" /></div>
          <AppraisalHeaderFields />
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>Iniciar checklist</button>
        </div>
      </form>
    </Modal>
  );
}
