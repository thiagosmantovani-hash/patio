import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { money0 } from '../format';
import { CarPlaceholder, Empty, Icon, Loading, useAction, useLoad } from '../ui';

/** Matriz veículo × canal: mostra onde cada carro disponível está anunciado e publica em lote. */
export function Listings() {
  const nav = useNavigate();
  const { run, busy } = useAction();
  const [selected, setSelected] = useState<number[]>([]);
  const settings = useLoad(() => api.get('/settings'));
  const vehicles = useLoad(async () => {
    const list = await api.get<any[]>('/vehicles?status=estoque');
    return Promise.all(list.map((v) => api.get(`/vehicles/${v.id}`)));
  });

  if (!settings.data || !vehicles.data) return <Loading />;
  const channels: string[] = settings.data.channels;
  const list = vehicles.data;
  const totals = channels.map((c) => {
    const ls = list.flatMap((v: any) => v.listings.filter((l: any) => l.channel === c && l.status === 'publicado'));
    return { channel: c, active: ls.length, views: ls.reduce((s: number, l: any) => s + l.views, 0), contacts: ls.reduce((s: number, l: any) => s + l.contacts, 0) };
  });

  const publishAll = async (channel: string) => {
    const ids = selected.length ? selected : list.filter((v: any) => v.status === 'disponivel').map((v: any) => v.id);
    if (!ids.length) return;
    await run(async () => {
      for (const id of ids) await api.post(`/vehicles/${id}/listings/bulk`, { channels: [channel], status: 'publicado' });
    }, `${ids.length} veículo(s) publicados em ${channel}.`);
    vehicles.reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Anúncios</h1>
          <p>Cadastre uma vez e acompanhe a publicação de todo o estoque em cada canal.</p>
        </div>
        <div className="actions">
          <a className="btn" href="/api/public/feed.xml" target="_blank" rel="noreferrer"><Icon name="download" /> Feed XML do estoque</a>
          <a className="btn" href="/vitrine" target="_blank" rel="noreferrer"><Icon name="store" /> Abrir vitrine</a>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        {totals.slice(0, 6).map((t) => (
          <div className="card kpi" key={t.channel}>
            <div className="spread"><div className="label">{t.channel}</div><button className="btn sm" disabled={busy} onClick={() => publishAll(t.channel)}>Publicar {selected.length ? 'selecionados' : 'disponíveis'}</button></div>
            <div className="value">{t.active} <span className="small muted">anúncios ativos</span></div>
            <div className="hint">{t.views} visualizações · {t.contacts} contatos</div>
          </div>
        ))}
      </div>

      {!list.length ? (
        <div className="card"><Empty>Nenhum veículo em estoque.</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>
                  <input type="checkbox" aria-label="Selecionar todos" checked={selected.length === list.length} onChange={(e) => setSelected(e.target.checked ? list.map((v: any) => v.id) : [])} />
                </th>
                <th>Veículo</th>
                <th className="num">Preço</th>
                {channels.map((c) => <th key={c} style={{ textAlign: 'center' }}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map((v: any) => {
                const by = new Map(v.listings.map((l: any) => [l.channel, l]));
                return (
                  <tr key={v.id}>
                    <td><input type="checkbox" checked={selected.includes(v.id)} onChange={() => setSelected((s) => (s.includes(v.id) ? s.filter((x) => x !== v.id) : [...s, v.id]))} aria-label="Selecionar" /></td>
                    <td className="click" style={{ cursor: 'pointer' }} onClick={() => nav(`/estoque/${v.id}`)}>
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <div className="vrow-thumb">{v.cover ? <img src={v.cover} alt="" /> : <CarPlaceholder />}</div>
                        <div>
                          <strong>{v.brand} {v.model}</strong>
                          <div className="small muted">{v.year_model} · {v.status === 'preparacao' ? 'em preparação' : v.status}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{money0(v.sale_price)}</td>
                    {channels.map((c) => {
                      const l: any = by.get(c);
                      return (
                        <td key={c} style={{ textAlign: 'center' }} title={l ? `${l.views} visualizações · ${l.contacts} contatos` : 'Não anunciado'}>
                          {l?.status === 'publicado' ? <span className="pos"><Icon name="check" size={18} /></span> : l?.status === 'pendente' ? <span className="badge warn">pend.</span> : <span className="muted">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted mt">
        Os canais exibidos são definidos em Configurações. A publicação direta em portais de terceiros depende de credenciais de integração de cada portal;
        enquanto isso, use o feed XML ou registre aqui o link e os números de cada anúncio.
      </p>
    </div>
  );
}
