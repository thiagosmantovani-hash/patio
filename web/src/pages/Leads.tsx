import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { date, dateTime, LEAD_SOURCE, LEAD_STAGE, money0 } from '../format';
import { Badge, Field, formData, Icon, Loading, Modal, StatusBadge, useAction, useLoad } from '../ui';
import { CustomerPicker } from './CustomerPicker';

const STAGES = ['novo', 'contato', 'visita', 'proposta', 'ganho', 'perdido'];

export function Leads() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [mine, setMine] = useState(user?.role === 'vendedor');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [losing, setLosing] = useState<number | null>(null);
  const { run } = useAction();
  const { data, reload } = useLoad(() => api.get<any[]>(`/leads${qs({ mine: mine ? 1 : undefined, q })}`), [mine, q]);
  const openId = Number(params.get('lead')) || null;

  const move = async (id: number, stage: string) => {
    if (stage === 'perdido') return setLosing(id);
    await run(() => api.patch(`/leads/${id}/stage`, { stage }));
    reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <p>Arraste os cartões entre as etapas do funil. Leads da vitrine entram automaticamente em “Novo”.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> Novo lead</button>
      </div>
      <div className="filters">
        <input className="input search" placeholder="Buscar por cliente ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Somente meus leads</label>
      </div>
      {!data ? <Loading /> : (
        <div className="kanban">
          {STAGES.map((stage) => {
            const list = data.filter((l) => l.stage === stage);
            const total = list.reduce((s, l) => s + (l.value ?? l.vehicle_price ?? 0), 0);
            return (
              <div
                key={stage}
                className={`kcol${over === stage ? ' drop' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
                onDragLeave={() => setOver(null)}
                onDrop={() => { setOver(null); if (dragging != null) move(dragging, stage); setDragging(null); }}
              >
                <div className="kcol-head">
                  <span>{LEAD_STAGE[stage]!.label}</span>
                  <Badge tone={LEAD_STAGE[stage]!.tone}>{list.length}</Badge>
                </div>
                <div className="small muted" style={{ padding: '6px 12px 0' }}>{money0(total)}</div>
                <div className="kcol-body">
                  {list.map((l) => (
                    <div
                      key={l.id}
                      className="kcard"
                      draggable
                      onDragStart={() => setDragging(l.id)}
                      onClick={() => setParams({ lead: String(l.id) })}
                    >
                      <div className="name">{l.customer_name}</div>
                      <div className="meta">{l.vehicle_brand ? `${l.vehicle_brand} ${l.vehicle_model} ${l.vehicle_year ?? ''}` : 'Sem veículo definido'}</div>
                      <div className="meta spread">
                        <span>{LEAD_SOURCE[l.source] ?? l.source}{l.seller_name ? ` · ${l.seller_name.split(' ')[0]}` : ''}</span>
                        {l.next_contact && stage !== 'ganho' && stage !== 'perdido' && (
                          <Badge tone={l.next_contact <= new Date().toISOString().slice(0, 10) ? 'warn' : 'muted'}>{date(l.next_contact).slice(0, 5)}</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {creating && <NewLead onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
      {openId && <LeadModal id={openId} onClose={() => { setParams({}); reload(); }} />}
      {losing && <LostModal id={losing} onClose={() => { setLosing(null); reload(); }} />}
    </div>
  );
}

function LostModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { run, busy } = useAction();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await run(() => api.patch(`/leads/${id}/stage`, { stage: 'perdido', lost_reason: formData(e.currentTarget).lost_reason }), 'Lead marcado como perdido.')) onClose();
  };
  return (
    <Modal title="Motivo da perda" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Motivo">
          <select className="input" name="lost_reason" required defaultValue="">
            <option value="" disabled>Selecione…</option>
            {['Preço', 'Comprou em outra loja', 'Crédito não aprovado', 'Desistiu da compra', 'Avaliação da troca', 'Sem retorno do cliente', 'Outro'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>Confirmar</button>
        </div>
      </form>
    </Modal>
  );
}

function VehicleSelect({ defaultValue }: { defaultValue?: number | null }) {
  const { data } = useLoad(() => api.get<any[]>('/vehicles?status=estoque'));
  return (
    <select className="input" name="vehicle_id" defaultValue={defaultValue ?? ''} key={data ? 'ready' : 'loading'}>
      <option value="">Sem veículo definido</option>
      {data?.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.year_model} — {money0(v.sale_price)}</option>)}
    </select>
  );
}

function SellerSelect({ defaultValue }: { defaultValue?: number | null }) {
  const { user } = useAuth();
  const { data } = useLoad(() => api.get<any[]>('/users/options'));
  return (
    <select className="input" name="seller_id" defaultValue={defaultValue ?? user?.id} key={data ? 'ready' : 'loading'}>
      {data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}

function SourceSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select className="input" name="source" defaultValue={defaultValue ?? 'loja'}>
      {Object.entries(LEAD_SOURCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

function NewLead({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { run, busy } = useAction();
  const [customer, setCustomer] = useState<any>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!customer) return;
    if (await run(() => api.post('/leads', { ...formData(e.currentTarget), customer_id: customer.id }), 'Lead criado.')) onCreated();
  };
  return (
    <Modal title="Novo lead" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="span4"><CustomerPicker value={customer} onChange={setCustomer} /></div>
          <Field label="Veículo de interesse" className="span4"><VehicleSelect /></Field>
          <Field label="Origem" className="span2"><SourceSelect /></Field>
          <Field label="Vendedor responsável" className="span2"><SellerSelect /></Field>
          <Field label="Valor estimado (R$)" className="span2"><input className="input" type="number" step="0.01" min="0" name="value" /></Field>
          <Field label="Próximo contato" className="span2"><input className="input" type="date" name="next_contact" /></Field>
          <Field label="Observações" className="span4"><textarea className="input" name="notes" rows={3} /></Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy || !customer}>Criar lead</button>
        </div>
      </form>
    </Modal>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  nota: 'Anotação', ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', visita: 'Visita', proposta: 'Proposta', etapa: 'Etapa',
};

function LeadModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { run, busy } = useAction();
  const { data: l, reload } = useLoad(() => api.get(`/leads/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [id]);
  if (!l) return <Modal title="Lead" onClose={onClose}><Loading /></Modal>;

  const addActivity = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (await run(() => api.post(`/leads/${id}/activities`, formData(form)), 'Interação registrada.')) {
      form.reset();
      reload();
    }
  };
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await run(() => api.put(`/leads/${id}`, { ...formData(e.currentTarget), stage: l.stage, lost_reason: l.lost_reason }), 'Lead atualizado.')) {
      setEditing(false);
      reload();
    }
  };
  const phone = (l.customer_phone ?? '').replace(/\D/g, '');

  return (
    <Modal title={l.customer_name} onClose={onClose} wide>
      <div className="grid g2">
        <div className="stack">
          <div className="row">
            <StatusBadge map={LEAD_STAGE} value={l.stage} />
            <Badge>{LEAD_SOURCE[l.source] ?? l.source}</Badge>
            {l.lost_reason && <Badge tone="bad">{l.lost_reason}</Badge>}
          </div>
          {editing ? (
            <form onSubmit={save}>
              <div className="form-grid">
                <Field label="Veículo de interesse" className="span4"><VehicleSelect defaultValue={l.vehicle_id} /></Field>
                <Field label="Origem" className="span2"><SourceSelect defaultValue={l.source} /></Field>
                <Field label="Vendedor" className="span2"><SellerSelect defaultValue={l.seller_id} /></Field>
                <Field label="Valor estimado" className="span2"><input className="input" type="number" step="0.01" name="value" defaultValue={l.value ?? ''} /></Field>
                <Field label="Próximo contato" className="span2"><input className="input" type="date" name="next_contact" defaultValue={l.next_contact ?? ''} /></Field>
                <Field label="Observações" className="span4"><textarea className="input" name="notes" rows={3} defaultValue={l.notes ?? ''} /></Field>
              </div>
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="btn primary" disabled={busy}>Salvar</button>
              </div>
            </form>
          ) : (
            <div>
              <div className="summary-line"><span>Telefone</span><span>{l.customer_phone ?? '—'}</span></div>
              <div className="summary-line"><span>E-mail</span><span>{l.customer_email ?? '—'}</span></div>
              <div className="summary-line">
                <span>Veículo</span>
                <span>{l.vehicle_id ? <Link to={`/estoque/${l.vehicle_id}`}>{l.vehicle_brand} {l.vehicle_model} {l.vehicle_year}</Link> : '—'}</span>
              </div>
              <div className="summary-line"><span>Valor</span><span>{money0(l.value ?? l.vehicle_price)}</span></div>
              <div className="summary-line"><span>Vendedor</span><span>{l.seller_name ?? '—'}</span></div>
              <div className="summary-line"><span>Próximo contato</span><span>{date(l.next_contact)}</span></div>
              {l.notes && <p className="small muted">{l.notes}</p>}
              <div className="row mt">
                <button className="btn sm" onClick={() => setEditing(true)}><Icon name="edit" /> Editar</button>
                {phone && <a className="btn sm" href={`https://wa.me/55${phone}`} target="_blank" rel="noreferrer"><Icon name="phone" /> WhatsApp</a>}
                <Link className="btn sm" to={`/clientes/${l.customer_id}`}>Ficha do cliente</Link>
                {l.stage !== 'ganho' && l.stage !== 'perdido' && (
                  <Link className="btn primary sm" to={`/vendas/nova?lead=${l.id}${l.vehicle_id ? `&vehicle=${l.vehicle_id}` : ''}&customer=${l.customer_id}`}>Fechar venda</Link>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="stack">
          <form onSubmit={addActivity} className="card card-pad">
            <div className="form-grid">
              <Field label="Tipo" className="span2">
                <select className="input" name="type" defaultValue="ligacao">
                  {Object.entries(ACTIVITY_LABEL).filter(([k]) => k !== 'etapa').map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </Field>
              <Field label="Próximo contato" className="span2"><input className="input" type="date" name="next_contact" /></Field>
              <Field label="Descrição" className="span4"><textarea className="input" name="description" rows={2} required /></Field>
            </div>
            <div className="form-actions" style={{ marginTop: 10 }}><button className="btn primary sm" disabled={busy}>Registrar interação</button></div>
          </form>
          <ul className="timeline">
            {l.activities.map((a: any) => (
              <li key={a.id}>
                <div className="when">{dateTime(a.created_at)} · {ACTIVITY_LABEL[a.type] ?? a.type}{a.user_name ? ` · ${a.user_name}` : ''}</div>
                <div>{a.description}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
