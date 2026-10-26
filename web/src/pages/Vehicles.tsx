import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { km, money0, VEHICLE_STATUS, vehicleName } from '../format';
import { Badge, CarPlaceholder, Empty, Icon, Loading, StatusBadge, useLoad } from '../ui';
import { VehicleForm } from './VehicleForm';

const TABS = [
  { key: 'estoque', label: 'Em estoque' },
  { key: 'disponivel', label: 'Disponíveis' },
  { key: 'preparacao', label: 'Em preparação' },
  { key: 'reservado', label: 'Reservados' },
  { key: 'vendido', label: 'Vendidos' },
  { key: '', label: 'Todos' },
];

export function Vehicles() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'estoque';
  const [q, setQ] = useState('');
  const [view, setView] = useState<'cards' | 'lista'>('cards');
  const [creating, setCreating] = useState(false);
  const { data, loading, reload } = useLoad(() => api.get<any[]>(`/vehicles${qs({ status, q })}`), [status, q]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Estoque</h1>
          <p>{data ? `${data.length} veículo(s)` : ' '}</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" /> Cadastrar veículo</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={status === t.key ? 'active' : ''} onClick={() => setParams(t.key === 'estoque' ? {} : { status: t.key })}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="filters spread">
        <input className="input search" placeholder="Buscar por marca, modelo, versão ou placa" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>Cards</button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}>Lista</button>
        </div>
      </div>

      {loading && !data ? (
        <Loading />
      ) : !data?.length ? (
        <div className="card"><Empty>Nenhum veículo encontrado.</Empty></div>
      ) : view === 'cards' ? (
        <div className="vgrid">
          {data.map((v) => (
            <div key={v.id} className="card vcard" onClick={() => nav(`/estoque/${v.id}`)}>
              <div className="thumb">
                {v.cover ? <img src={v.cover} alt="" loading="lazy" /> : <CarPlaceholder />}
                <StatusBadge map={VEHICLE_STATUS} value={v.status} />
              </div>
              <div className="body">
                <div className="title">{v.brand} {v.model}</div>
                <div className="small muted">{v.version} · {v.year_fab ?? '—'}/{v.year_model ?? '—'}</div>
                <div className="small muted">{km(v.km)} · {v.plate ?? 'sem placa'}</div>
                <div className="spread">
                  <div className="price">{v.sale_price ? money0(v.sale_price) : <Badge tone="warn">Sem preço</Badge>}</div>
                  {v.status !== 'vendido' && <Badge tone={v.days_in_stock >= 90 ? 'bad' : v.days_in_stock >= 60 ? 'warn' : 'muted'}>{v.days_in_stock}d</Badge>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Veículo</th><th>Placa</th><th>KM</th><th>Situação</th><th className="num">Compra + prep.</th>
                <th className="num">Venda</th><th className="num">Margem</th><th className="num">Dias</th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.id} className="click" onClick={() => nav(`/estoque/${v.id}`)}>
                  <td>
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <div className="vrow-thumb">{v.cover ? <img src={v.cover} alt="" /> : <CarPlaceholder />}</div>
                      <div>
                        <strong>{v.brand} {v.model}</strong>
                        <div className="small muted">{vehicleName({ version: v.version, year_model: v.year_model })}</div>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">{v.plate ?? '—'}</td>
                  <td className="nowrap">{km(v.km)}</td>
                  <td><StatusBadge map={VEHICLE_STATUS} value={v.status} /></td>
                  <td className="num">{money0(v.purchase_price + v.preparation.effective)}</td>
                  <td className="num">{money0(v.sale_price)}</td>
                  <td className={`num ${v.profit.profit >= 0 ? 'pos' : 'neg'}`}>{money0(v.profit.profit)}</td>
                  <td className="num">{v.days_in_stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <VehicleForm
          onClose={() => setCreating(false)}
          onSaved={(v) => {
            setCreating(false);
            reload();
            nav(`/estoque/${v.id}`);
          }}
        />
      )}
    </div>
  );
}
