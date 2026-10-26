import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { COST_CATEGORY, date, km, LEAD_SOURCE, LEAD_STAGE, money, money0, percent, PAYMENT_METHOD, todayISO, VEHICLE_STATUS } from '../format';
import { Badge, CarPlaceholder, Empty, Field, formData, Icon, Loading, Modal, StatusBadge, useAction, useLoad } from '../ui';
import { VehicleForm } from './VehicleForm';

export function VehicleDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const { run } = useAction();
  const [tab, setTab] = useState('geral');
  const [editing, setEditing] = useState(false);
  const { data: v, error, reload } = useLoad(() => api.get(`/vehicles/${id}`), [id]);

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!v) return <Loading />;
  const manager = can('admin', 'gerente');

  const setStatus = (status: string) => run(() => api.patch(`/vehicles/${v.id}/status`, { status }), 'Situação atualizada.').then(reload);
  const remove = async () => {
    if (!confirm('Excluir este veículo e todas as fotos, custos e anúncios?')) return;
    if (await run(() => api.del(`/vehicles/${v.id}`), 'Veículo excluído.')) nav('/estoque');
  };

  return (
    <div className="page">
      <Link to="/estoque" className="back"><Icon name="left" size={14} /> Estoque</Link>
      <div className="page-head">
        <div>
          <div className="row">
            <h1>{v.brand} {v.model} {v.version}</h1>
            <StatusBadge map={VEHICLE_STATUS} value={v.status} />
          </div>
          <p>{v.year_fab ?? '—'}/{v.year_model ?? '—'} · {km(v.km)} · {v.plate ?? 'sem placa'} · {v.days_in_stock} dias {v.status === 'vendido' ? 'até a venda' : 'em estoque'}</p>
        </div>
        <div className="actions">
          {v.status !== 'vendido' && (
            <>
              <select className="input" style={{ width: 'auto' }} value={v.status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
                <option value="preparacao">Em preparação</option>
                <option value="disponivel">Disponível</option>
                <option value="reservado">Reservado</option>
              </select>
              <Link className="btn primary" to={`/vendas/nova?vehicle=${v.id}`}>Vender</Link>
            </>
          )}
          <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" /> Editar</button>
          {manager && v.status !== 'vendido' && <button className="btn danger" onClick={remove}><Icon name="trash" /></button>}
        </div>
      </div>

      <div className="tabs">
        {[['geral', 'Visão geral'], ['fotos', `Fotos (${v.photos.length})`], ['custos', `Preparação (${v.costs.length})`], ['anuncios', 'Anúncios'], ['historico', 'Histórico']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k!)}>{label}</button>
        ))}
      </div>

      {tab === 'geral' && <Overview v={v} manager={manager} />}
      {tab === 'fotos' && <Photos v={v} reload={reload} />}
      {tab === 'custos' && <Costs v={v} reload={reload} />}
      {tab === 'anuncios' && <VehicleListings v={v} reload={reload} />}
      {tab === 'historico' && <History v={v} />}

      {editing && <VehicleForm vehicle={v} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </div>
  );
}

function Overview({ v, manager }: { v: any; manager: boolean }) {
  const cover = v.photos[0];
  return (
    <div className="grid g-main">
      <div className="stack">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="thumb" style={{ aspectRatio: '16 / 8' }}>
            {cover ? <img src={`/uploads/${cover.filename}`} alt="" /> : <CarPlaceholder />}
          </div>
          <div className="card-body">
            <div className="specs">
              {[
                ['Marca', v.brand], ['Modelo', v.model], ['Versão', v.version], ['Ano', `${v.year_fab ?? '—'}/${v.year_model ?? '—'}`],
                ['Quilometragem', km(v.km)], ['Cor', v.color], ['Combustível', v.fuel], ['Câmbio', v.transmission], ['Portas', v.doors],
                ['Placa', v.plate], ['Chassi', v.chassis], ['Renavam', v.renavam], ['Entrada', date(v.purchase_date)], ['Origem', v.supplier],
              ].map(([k, val]) => (
                <div key={k as string}><span>{k}</span><strong>{val ?? '—'}</strong></div>
              ))}
            </div>
            {v.description && <p className="mt">{v.description}</p>}
            {v.features.length > 0 && (
              <div className="chips mt">{v.features.map((f: string) => <span className="chip" key={f}>{f}</span>)}</div>
            )}
          </div>
        </div>
      </div>
      <div className="stack">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 8 }}>Resultado {v.profit.realized ? 'da venda' : 'previsto'}</h3>
          {manager ? (
            <>
              <div className="summary-line"><span>Valor de compra</span><span>{money(v.purchase_price)}</span></div>
              <div className="summary-line"><span>Preparação {v.preparation.actual ? '' : '(prevista)'}</span><span>{money(v.preparation.effective)}</span></div>
              {v.sale && <div className="summary-line"><span>Comissão</span><span>{money(v.sale.commission)}</span></div>}
              <div className="summary-line"><span>Custo total</span><strong>{money(v.profit.total_cost)}</strong></div>
              <div className="summary-line"><span>{v.sale ? 'Vendido por' : 'Preço anunciado'}</span><strong>{money(v.sale?.sale_price ?? v.sale_price)}</strong></div>
              <div className={`summary-line total ${v.profit.profit >= 0 ? 'pos' : 'neg'}`}>
                <span>Lucro</span><span>{money(v.profit.profit)}</span>
              </div>
              <div className="small muted right">Margem {percent(v.profit.margin_percent)}</div>
            </>
          ) : (
            <div className="summary-line total"><span>Preço</span><span>{money(v.sale_price)}</span></div>
          )}
          {v.fipe_price ? (
            <div className="small muted mt">
              Referência de mercado: {money0(v.fipe_price)} ({v.sale_price ? percent(((v.sale_price - v.fipe_price) / v.fipe_price) * 100) : '—'} vs. preço)
            </div>
          ) : null}
        </div>
        {v.sale && (
          <div className="card card-pad">
            <h3>Venda</h3>
            <div className="summary-line"><span>Cliente</span><Link to={`/clientes/${v.sale.customer_id}`}>{v.sale.customer_name}</Link></div>
            <div className="summary-line"><span>Data</span><span>{date(v.sale.sale_date)}</span></div>
            <div className="summary-line"><span>Vendedor</span><span>{v.sale.seller_name ?? '—'}</span></div>
            <div className="summary-line"><span>Pagamento</span><span>{PAYMENT_METHOD[v.sale.payment_method]}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Photos({ v, reload }: { v: any; reload: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { run, busy } = useAction();
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append('photos', f));
    await run(() => api.post(`/vehicles/${v.id}/photos`, fd), 'Fotos enviadas.');
    reload();
  };
  const move = async (index: number, delta: number) => {
    const ids = v.photos.map((p: any) => p.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await run(() => api.put(`/vehicles/${v.id}/photos/order`, { ids }));
    reload();
  };
  const remove = async (pid: number) => {
    if (!confirm('Remover esta foto?')) return;
    await run(() => api.del(`/vehicles/${v.id}/photos/${pid}`), 'Foto removida.');
    reload();
  };
  return (
    <div className="card card-pad">
      <div
        className="dropzone"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
      >
        <Icon name="camera" size={22} />
        <div>{busy ? 'Enviando…' : 'Clique ou arraste fotos aqui (JPG, PNG ou WebP, até 8 MB cada)'}</div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>
      {v.photos.length ? (
        <div className="photos mt">
          {v.photos.map((p: any, i: number) => (
            <div className="photo" key={p.id}>
              <img src={`/uploads/${p.filename}`} alt="" loading="lazy" />
              {i === 0 && <span className="cover-tag"><Badge tone="ok">Capa</Badge></span>}
              <div className="tools">
                <button title="Mover para a esquerda" onClick={() => move(i, -1)}>‹</button>
                <button title="Mover para a direita" onClick={() => move(i, 1)}>›</button>
                <button title="Remover" onClick={() => remove(p.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Nenhuma foto. A primeira foto é usada como capa nos anúncios e na vitrine.</Empty>
      )}
    </div>
  );
}

function Costs({ v, reload }: { v: any; reload: () => void }) {
  const [editing, setEditing] = useState<any | null>(null);
  const { run, busy } = useAction();
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = formData(e.currentTarget);
    const ok = await run(
      () => (editing?.id ? api.put(`/vehicles/${v.id}/costs/${editing.id}`, body) : api.post(`/vehicles/${v.id}/costs`, body)),
      'Custo salvo.',
    );
    if (ok) { setEditing(null); reload(); }
  };
  const remove = async (cid: number) => {
    if (!confirm('Remover este custo?')) return;
    await run(() => api.del(`/vehicles/${v.id}/costs/${cid}`));
    reload();
  };
  const p = v.preparation;
  return (
    <div className="stack">
      <div className="grid g4">
        <div className="card kpi"><div className="label">Previsto</div><div className="value">{money0(p.estimated)}</div></div>
        <div className="card kpi"><div className="label">Realizado</div><div className="value">{money0(p.actual)}</div></div>
        <div className="card kpi"><div className="label">Diferença (real − previsto)</div><div className={`value ${p.variance > 0 ? 'neg' : 'pos'}`}>{money0(p.variance)}</div></div>
        <div className="card kpi"><div className="label">Custo efetivo</div><div className="value">{money0(p.effective)}</div><div className="hint">Real ou, se não lançado, previsto</div></div>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Custos de preparação</h2>
          <button className="btn primary sm" onClick={() => setEditing({})}><Icon name="plus" /> Lançar custo</button>
        </div>
        {v.costs.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th className="num">Previsto</th><th className="num">Real</th><th className="num">Diferença</th><th /></tr></thead>
              <tbody>
                {v.costs.map((c: any) => (
                  <tr key={c.id}>
                    <td className="nowrap">{date(c.date)}</td>
                    <td>{c.description}</td>
                    <td>{COST_CATEGORY[c.category]}</td>
                    <td className="num">{money(c.estimated)}</td>
                    <td className="num">{c.actual == null ? <Badge tone="warn">Pendente</Badge> : money(c.actual)}</td>
                    <td className={`num ${c.actual != null && c.actual > c.estimated ? 'neg' : ''}`}>{c.actual == null ? '—' : money(c.actual - c.estimated)}</td>
                    <td className="right nowrap">
                      <button className="btn ghost sm" onClick={() => setEditing(c)}><Icon name="edit" /></button>
                      <button className="btn ghost sm danger" onClick={() => remove(c.id)}><Icon name="trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhum custo lançado.</Empty>
        )}
      </div>
      {editing && (
        <Modal title={editing.id ? 'Editar custo' : 'Lançar custo'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <Field label="Descrição *" className="span4"><input className="input" name="description" defaultValue={editing.description ?? ''} required autoFocus /></Field>
              <Field label="Categoria" className="span2">
                <select className="input" name="category" defaultValue={editing.category ?? 'mecanica'}>
                  {Object.entries(COST_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </Field>
              <Field label="Data" className="span2"><input className="input" type="date" name="date" defaultValue={editing.date ?? todayISO()} /></Field>
              <Field label="Valor previsto (R$)" className="span2"><input className="input" type="number" step="0.01" min="0" name="estimated" defaultValue={editing.estimated ?? ''} /></Field>
              <Field label="Valor real (R$)" className="span2"><input className="input" type="number" step="0.01" min="0" name="actual" defaultValue={editing.actual ?? ''} placeholder="Deixe vazio se ainda não pago" /></Field>
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

const LISTING_STATUS: Record<string, { label: string; tone: string }> = {
  pendente: { label: 'Pendente', tone: 'warn' },
  publicado: { label: 'Publicado', tone: 'ok' },
  pausado: { label: 'Pausado', tone: 'muted' },
  removido: { label: 'Removido', tone: 'muted' },
};

function VehicleListings({ v, reload }: { v: any; reload: () => void }) {
  const { data: settings } = useLoad(() => api.get('/settings'));
  const { run, busy } = useAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  if (!settings) return <Loading />;
  const byChannel = new Map<string, any>(v.listings.map((l: any) => [l.channel, l]));
  const channels: string[] = [...new Set([...settings.channels, ...v.listings.map((l: any) => l.channel)])];

  const publish = async () => {
    await run(() => api.post(`/vehicles/${v.id}/listings/bulk`, { channels: selected, status: 'publicado' }), `Publicado em ${selected.length} canal(is).`);
    setSelected([]);
    reload();
  };
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const ok = await run(() => api.put(`/vehicles/${v.id}/listings/${encodeURIComponent(editing.channel)}`, formData(e.currentTarget)), 'Anúncio atualizado.');
    if (ok) { setEditing(null); reload(); }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Anúncios por canal</h2>
          <div className="small muted">Selecione os canais e publique de uma vez. Acompanhe visualizações e contatos de cada portal.</div>
        </div>
        {v.status !== 'vendido' && (
          <button className="btn primary sm" disabled={!selected.length || busy} onClick={publish}>
            Publicar em {selected.length || ''} selecionado(s)
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th style={{ width: 30 }} /><th>Canal</th><th>Situação</th><th>Publicado em</th><th className="num">Visualizações</th><th className="num">Contatos</th><th>Link</th><th /></tr></thead>
          <tbody>
            {channels.map((c) => {
              const l = byChannel.get(c);
              return (
                <tr key={c}>
                  <td>
                    {v.status !== 'vendido' && (
                      <input type="checkbox" checked={selected.includes(c)} onChange={() => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} aria-label={`Selecionar ${c}`} />
                    )}
                  </td>
                  <td><strong>{c}</strong></td>
                  <td>{l ? <StatusBadge map={LISTING_STATUS} value={l.status} /> : <span className="muted small">Não anunciado</span>}</td>
                  <td className="nowrap">{l?.published_at ? date(l.published_at) : '—'}</td>
                  <td className="num">{l?.views ?? '—'}</td>
                  <td className="num">{l?.contacts ?? '—'}</td>
                  <td>{l?.external_url ? <a href={l.external_url} target="_blank" rel="noreferrer"><Icon name="external" size={14} /></a> : '—'}</td>
                  <td className="right"><button className="btn ghost sm" onClick={() => setEditing(l ?? { channel: c, status: 'pendente' })}><Icon name="edit" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card-body small muted">
        A vitrine própria e o feed XML (<a href="/api/public/feed.xml" target="_blank" rel="noreferrer">/api/public/feed.xml</a>) são atualizados automaticamente
        com os veículos disponíveis. Para portais que importam estoque por URL, cadastre esse endereço no painel do portal.
      </div>
      {editing && (
        <Modal title={`Anúncio — ${editing.channel}`} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-grid">
              <Field label="Situação" className="span2">
                <select className="input" name="status" defaultValue={editing.status}>
                  {Object.entries(LISTING_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Preço no anúncio (R$)" className="span2"><input className="input" type="number" step="0.01" name="price" defaultValue={editing.price ?? v.sale_price} /></Field>
              <Field label="Link do anúncio" className="span4"><input className="input" type="url" name="external_url" defaultValue={editing.external_url ?? ''} placeholder="https://" /></Field>
              <Field label="Visualizações" className="span2"><input className="input" type="number" min="0" name="views" defaultValue={editing.views ?? 0} /></Field>
              <Field label="Contatos recebidos" className="span2"><input className="input" type="number" min="0" name="contacts" defaultValue={editing.contacts ?? 0} /></Field>
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function History({ v }: { v: any }) {
  return (
    <div className="card">
      <div className="card-head"><h2>Leads interessados</h2></div>
      {v.leads.length ? (
        <table className="table">
          <thead><tr><th>Cliente</th><th>Origem</th><th>Etapa</th><th>Data</th></tr></thead>
          <tbody>
            {v.leads.map((l: any) => (
              <tr key={l.id}>
                <td><Link to={`/leads?lead=${l.id}`}>{l.customer_name}</Link></td>
                <td>{LEAD_SOURCE[l.source] ?? l.source}</td>
                <td><StatusBadge map={LEAD_STAGE} value={l.stage} /></td>
                <td>{date(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>Nenhum lead vinculado a este veículo.</Empty>
      )}
    </div>
  );
}
