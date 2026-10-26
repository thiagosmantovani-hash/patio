import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { APPRAISAL_STATUS, date, km, money, money0 } from '../format';
import { Badge, Field, formData, Icon, Loading, Modal, StatusBadge, useAction, useLoad } from '../ui';
import { AppraisalHeaderFields } from './Appraisals';

const CONDITIONS = [
  ['ok', 'OK'],
  ['atencao', 'Atenção'],
  ['ruim', 'Ruim'],
  ['na', 'N/A'],
] as const;

export function AppraisalDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const { data: a, error, reload } = useLoad(() => api.get(`/appraisals/${id}`), [id]);
  const [items, setItems] = useState<any[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (a) {
      setItems(a.items);
      setDirty(false);
    }
  }, [a]);

  const sections = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const it of items) map.set(it.section, [...(map.get(it.section) ?? []), it]);
    return [...map.entries()];
  }, [items]);

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!a) return <Loading />;
  const locked = a.status === 'convertida';

  const repairTotal = items.reduce((s, i) => s + (Number(i.repair_cost) || 0), 0);
  const margin = a.market_price * (a.margin_percent / 100);
  const suggested = Math.max(0, a.market_price - margin - repairTotal);

  const update = (itemId: number, patch: Record<string, unknown>) => {
    setItems((cur) => cur.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
    setDirty(true);
  };
  const saveItems = async () => {
    if (await run(() => api.put(`/appraisals/${a.id}/items`, { items }), 'Checklist salvo.')) reload();
  };
  const setStatus = async (status: string) => {
    if (dirty) await saveItems();
    if (await run(() => api.patch(`/appraisals/${a.id}/status`, { status }), 'Situação atualizada.')) reload();
  };
  const saveHeader = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (await run(() => api.put(`/appraisals/${a.id}`, { ...formData(e.currentTarget), customer_id: a.customer_id }), 'Dados atualizados.')) {
      setEditing(false);
      reload();
    }
  };
  const remove = async () => {
    if (!confirm('Excluir esta avaliação?')) return;
    if (await run(() => api.del(`/appraisals/${a.id}`), 'Avaliação excluída.')) nav('/avaliacoes');
  };

  return (
    <div className="page">
      <Link to="/avaliacoes" className="back"><Icon name="left" size={14} /> Avaliações</Link>
      <div className="page-head">
        <div>
          <div className="row">
            <h1>Avaliação #{a.id} — {a.brand} {a.model}</h1>
            <StatusBadge map={APPRAISAL_STATUS} value={a.status} />
          </div>
          <p>
            {a.version} {a.year_model} · {km(a.km)} · {a.plate ?? 'sem placa'} · {a.customer_name ?? 'sem cliente'} · por {a.appraiser_name ?? '—'} em {date(a.created_at)}
          </p>
        </div>
        <div className="actions">
          {!locked && (
            <>
              <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" /> Dados</button>
              {a.status === 'em_andamento' && <button className="btn" onClick={() => setStatus('concluida')}>Concluir avaliação</button>}
              {a.status === 'concluida' && (
                <>
                  <button className="btn" onClick={() => setStatus('recusada')}>Cliente recusou</button>
                  <button className="btn" onClick={() => setStatus('aprovada')}>Cliente aceitou</button>
                </>
              )}
              {a.status === 'recusada' && <button className="btn" onClick={() => setStatus('em_andamento')}>Reabrir</button>}
              {a.status !== 'recusada' && <button className="btn primary" onClick={() => setConverting(true)}>Enviar para estoque</button>}
              <button className="btn danger" onClick={remove}><Icon name="trash" /></button>
            </>
          )}
          {locked && a.vehicle_id && <Link className="btn primary" to={`/estoque/${a.vehicle_id}`}>Ver no estoque</Link>}
        </div>
      </div>

      <div className="grid g-main">
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Checklist de inspeção</h2>
                <div className="small muted">Percorra o veículo seção por seção. Marque a condição e estime o custo de reparo.</div>
              </div>
              {!locked && <button className="btn primary sm" disabled={!dirty || busy} onClick={saveItems}>{dirty ? 'Salvar checklist' : 'Salvo'}</button>}
            </div>
            <div className="card-body">
              {sections.map(([section, list]) => {
                const issues = list.filter((i) => i.condition === 'atencao' || i.condition === 'ruim').length;
                const cost = list.reduce((s, i) => s + (Number(i.repair_cost) || 0), 0);
                const isOpen = open === section || open === null;
                return (
                  <div className="check-section" key={section}>
                    <header onClick={() => setOpen(open === section ? '' : section)}>
                      <span>{section}</span>
                      <span className="row">
                        {issues > 0 ? <Badge tone="warn">{issues} apontamento(s)</Badge> : <Badge tone="ok">Sem apontamentos</Badge>}
                        {cost > 0 && <span className="small">{money0(cost)}</span>}
                      </span>
                    </header>
                    {isOpen && list.map((it) => (
                      <div className="check-item" key={it.id}>
                        <span>{it.item}</span>
                        <div className="cond" role="group" aria-label={`Condição de ${it.item}`}>
                          {CONDITIONS.map(([k, label]) => (
                            <button
                              key={k}
                              type="button"
                              disabled={locked}
                              className={`${it.condition === k ? 'on ' : ''}${k}`}
                              onClick={() => update(it.id, { condition: k, repair_cost: k === 'ok' || k === 'na' ? 0 : it.repair_cost })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="50"
                          placeholder="Reparo R$"
                          disabled={locked || it.condition === 'ok' || it.condition === 'na'}
                          value={it.repair_cost || ''}
                          onChange={(e) => update(it.id, { repair_cost: Number(e.target.value) || 0 })}
                          aria-label={`Custo de reparo de ${it.item}`}
                        />
                        <input
                          className="input"
                          placeholder="Observação"
                          disabled={locked}
                          value={it.notes ?? ''}
                          onChange={(e) => update(it.id, { notes: e.target.value })}
                          aria-label={`Observação de ${it.item}`}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <AppraisalPhotos a={a} reload={reload} sections={sections.map(([s]) => s)} locked={locked} />
        </div>

        <div className="stack">
          <div className="card card-pad" style={{ position: 'sticky', top: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Precificação</h3>
            <div className="summary-line"><span>Referência de mercado</span><span>{money(a.market_price)}</span></div>
            <div className="summary-line"><span>Margem desejada ({a.margin_percent}%)</span><span className="neg">− {money(margin)}</span></div>
            <div className="summary-line"><span>Reparos previstos</span><span className="neg">− {money(repairTotal)}</span></div>
            <div className="summary-line total"><span>Preço sugerido</span><span>{money(suggested)}</span></div>
            {a.offered_price != null && <div className="summary-line"><span>Valor ofertado</span><strong>{money(a.offered_price)}</strong></div>}
            {!a.market_price && <div className="error-box mt">Informe o valor de referência de mercado em “Dados” para calcular o preço sugerido.</div>}
            {a.notes && <p className="small muted mt">{a.notes}</p>}
          </div>
        </div>
      </div>

      {editing && (
        <Modal title="Dados da avaliação" onClose={() => setEditing(false)} wide>
          <form onSubmit={saveHeader}>
            <div className="form-grid"><AppraisalHeaderFields a={a} /></div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setEditing(false)}>Cancelar</button>
              <button className="btn primary" disabled={busy}>Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {converting && (
        <Modal title="Enviar para o estoque" onClose={() => setConverting(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (dirty) await saveItems();
              const r = await run(() => api.post(`/appraisals/${a.id}/convert`, formData(e.currentTarget)), 'Veículo adicionado ao estoque.');
              if (r) nav(`/estoque/${r.vehicle_id}`);
            }}
          >
            <p className="muted" style={{ marginTop: 0 }}>
              O veículo entra no estoque “Em preparação”. Os reparos apontados viram custos previstos de preparação e as fotos são copiadas.
            </p>
            <Field label="Valor pago na compra/troca (R$)">
              <input className="input" type="number" step="0.01" min="0" name="purchase_price" defaultValue={a.offered_price ?? suggested} required />
            </Field>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setConverting(false)}>Cancelar</button>
              <button className="btn primary" disabled={busy}>Confirmar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function AppraisalPhotos({ a, reload, sections, locked }: { a: any; reload: () => void; sections: string[]; locked: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState(sections[0] ?? 'Geral');
  const { run, busy } = useAction();
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    fd.append('section', section);
    [...files].forEach((f) => fd.append('photos', f));
    await run(() => api.post(`/appraisals/${a.id}/photos`, fd), 'Fotos enviadas.');
    reload();
  };
  const remove = async (pid: number) => {
    if (!confirm('Remover esta foto?')) return;
    await run(() => api.del(`/appraisals/${a.id}/photos/${pid}`));
    reload();
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Fotos da avaliação</h2>
        {!locked && (
          <div className="row">
            <select className="input" style={{ width: 'auto' }} value={section} onChange={(e) => setSection(e.target.value)} aria-label="Seção da foto">
              {sections.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="btn sm" disabled={busy} onClick={() => input.current?.click()}><Icon name="camera" /> {busy ? 'Enviando…' : 'Adicionar fotos'}</button>
            {/* capture="environment" abre a câmera traseira direto no celular */}
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </div>
        )}
      </div>
      <div className="card-body">
        {a.photos.length ? (
          <div className="photos">
            {a.photos.map((p: any) => (
              <div className="photo" key={p.id}>
                <img src={`/uploads/${p.filename}`} alt={p.section} loading="lazy" />
                <span className="cover-tag"><Badge tone="muted">{p.section}</Badge></span>
                {!locked && <div className="tools"><button title="Remover" onClick={() => remove(p.id)}>×</button></div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="muted small">Fotografe frente, laterais, traseira, interior, painel (km) e avarias encontradas.</div>
        )}
      </div>
    </div>
  );
}
