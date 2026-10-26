import { useState } from 'react';
import { api, qs } from '../api';
import { COST_CATEGORY, date, LEAD_SOURCE, money, money0, PAYMENT_METHOD, percent, todayISO } from '../format';
import { Empty, Icon, Loading, useLoad } from '../ui';

const startOfYear = () => `${new Date().getFullYear()}-01-01`;

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\n');
}

function download(name: string, content: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function HBars({ rows, value, label, format = money0 }: { rows: any[]; value: (r: any) => number; label: (r: any) => string; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(value));
  return (
    <>
      {rows.map((r, i) => (
        <div className="hbar" key={i}>
          <span>{label(r)}</span>
          <div className="track"><div className="fill" style={{ width: `${(value(r) / max) * 100}%` }} /></div>
          <span className="right">{format(value(r))}</span>
        </div>
      ))}
    </>
  );
}

export function Reports() {
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(todayISO());
  const { data } = useLoad(() => api.get(`/reports${qs({ from, to })}`), [from, to]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Desempenho de vendas, funil, preparação e canais de anúncio.</p>
        </div>
        <div className="actions">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" />
        </div>
      </div>
      {!data ? <Loading /> : (
        <div className="stack">
          <div className="grid g4">
            <div className="card kpi"><div className="label">Vendas</div><div className="value">{data.totals.count}</div><div className="hint">Ticket médio {money0(data.totals.avg_ticket)}</div></div>
            <div className="card kpi"><div className="label">Faturamento</div><div className="value">{money0(data.totals.revenue)}</div></div>
            <div className="card kpi">
              <div className="label">Lucro bruto</div>
              <div className={`value ${data.totals.profit >= 0 ? 'pos' : 'neg'}`}>{money0(data.totals.profit)}</div>
              <div className="hint">Margem {percent(data.totals.revenue ? (data.totals.profit / data.totals.revenue) * 100 : 0)}</div>
            </div>
            <div className="card kpi"><div className="label">Tempo médio até a venda</div><div className="value">{data.totals.avg_days} dias</div></div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Vendas no período</h2>
              <button className="btn sm" onClick={() => download(`vendas_${from}_${to}.csv`, toCsv(data.sales.map((s: any) => ({
                data: s.sale_date, veiculo: `${s.brand} ${s.model} ${s.year_model}`, cliente: s.customer_name, vendedor: s.seller_name, pagamento: PAYMENT_METHOD[s.payment_method],
                venda: s.sale_price, compra: s.purchase_price, preparacao: s.preparation, comissao: s.commission, lucro: s.profit, dias_estoque: Math.round(s.days),
              }))))}><Icon name="download" /> Exportar CSV</button>
            </div>
            {data.sales.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Data</th><th>Veículo</th><th>Vendedor</th><th className="num">Venda</th><th className="num">Compra</th><th className="num">Preparação</th><th className="num">Comissão</th><th className="num">Lucro</th><th className="num">Dias</th></tr></thead>
                  <tbody>
                    {data.sales.map((s: any) => (
                      <tr key={s.id}>
                        <td className="nowrap">{date(s.sale_date)}</td>
                        <td>{s.brand} {s.model} {s.year_model}</td>
                        <td>{s.seller_name ?? '—'}</td>
                        <td className="num">{money0(s.sale_price)}</td>
                        <td className="num">{money0(s.purchase_price)}</td>
                        <td className="num">{money0(s.preparation)}</td>
                        <td className="num">{money0(s.commission)}</td>
                        <td className={`num ${s.profit >= 0 ? 'pos' : 'neg'}`}>{money0(s.profit)}</td>
                        <td className="num">{Math.round(s.days)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty>Nenhuma venda no período.</Empty>}
          </div>

          <div className="grid g2">
            <div className="card">
              <div className="card-head"><h2>Por vendedor</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Vendedor</th><th className="num">Vendas</th><th className="num">Faturamento</th><th className="num">Lucro</th><th className="num">Comissão</th></tr></thead>
                  <tbody>
                    {data.by_seller.map((g: any) => (
                      <tr key={g.key}><td>{g.key}</td><td className="num">{g.count}</td><td className="num">{money0(g.revenue)}</td><td className="num">{money0(g.profit)}</td><td className="num">{money0(g.commission)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.by_seller.length && <Empty>Sem dados.</Empty>}
            </div>
            <div className="card">
              <div className="card-head"><h2>Por forma de pagamento</h2></div>
              <div className="card-body">
                {data.by_payment.length ? <HBars rows={data.by_payment} value={(r) => r.revenue} label={(r) => `${PAYMENT_METHOD[r.key] ?? r.key} (${r.count})`} /> : <Empty>Sem dados.</Empty>}
              </div>
            </div>
          </div>

          <div className="grid g2">
            <div className="card">
              <div className="card-head"><h2>Origem dos leads e conversão</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Origem</th><th className="num">Leads</th><th className="num">Ganhos</th><th className="num">Perdidos</th><th className="num">Conversão</th></tr></thead>
                  <tbody>
                    {data.lead_sources.map((s: any) => (
                      <tr key={s.source}>
                        <td>{LEAD_SOURCE[s.source] ?? s.source}</td><td className="num">{s.total}</td><td className="num">{s.won}</td><td className="num">{s.lost}</td>
                        <td className="num">{percent(s.total ? (s.won / s.total) * 100 : 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.lead_sources.length && <Empty>Nenhum lead no período.</Empty>}
            </div>
            <div className="card">
              <div className="card-head"><h2>Motivos de perda</h2></div>
              <div className="card-body">
                {data.lost_reasons.length ? <HBars rows={data.lost_reasons} value={(r) => r.count} label={(r) => r.reason ?? '—'} format={String} /> : <Empty>Nenhum lead perdido.</Empty>}
              </div>
            </div>
          </div>

          <div className="grid g2">
            <div className="card">
              <div className="card-head"><h2>Preparação: previsto × realizado</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Categoria</th><th className="num">Itens</th><th className="num">Previsto</th><th className="num">Realizado</th><th className="num">Desvio</th></tr></thead>
                  <tbody>
                    {data.preparation.map((p: any) => (
                      <tr key={p.category}>
                        <td>{COST_CATEGORY[p.category] ?? p.category}</td><td className="num">{p.items}</td><td className="num">{money0(p.estimated)}</td><td className="num">{money0(p.actual)}</td>
                        <td className={`num ${p.variance > 0 ? 'neg' : 'pos'}`}>{money0(p.variance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.preparation.length && <Empty>Nenhum custo no período.</Empty>}
            </div>
            <div className="card">
              <div className="card-head"><h2>Maiores desvios por veículo</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Veículo</th><th className="num">Previsto</th><th className="num">Realizado</th><th className="num">Pendentes</th></tr></thead>
                  <tbody>
                    {data.preparation_by_vehicle.map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.brand} {p.model} {p.year_model}</td><td className="num">{money0(p.estimated)}</td>
                        <td className={`num ${p.actual > p.estimated ? 'neg' : ''}`}>{money0(p.actual)}</td><td className="num">{p.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid g2">
            <div className="card">
              <div className="card-head"><h2>Desempenho por canal de anúncio</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Canal</th><th className="num">Ativos</th><th className="num">Visualizações</th><th className="num">Contatos</th><th className="num">Contatos/anúncio</th><th className="num">Vendidos</th></tr></thead>
                  <tbody>
                    {data.channels.map((c: any) => (
                      <tr key={c.channel}>
                        <td>{c.channel}</td><td className="num">{c.active}</td><td className="num">{c.views}</td><td className="num">{c.contacts}</td>
                        <td className="num">{c.listings ? (c.contacts / c.listings).toFixed(1).replace('.', ',') : '—'}</td><td className="num">{c.sold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.channels.length && <Empty>Nenhum anúncio registrado.</Empty>}
            </div>
            <div className="card">
              <div className="card-head"><h2>Idade do estoque atual</h2></div>
              <div className="card-body">
                <HBars
                  rows={[
                    { l: 'Até 30 dias', v: data.stock_aging.d0_30 ?? 0 },
                    { l: '30 a 60 dias', v: data.stock_aging.d30_60 ?? 0 },
                    { l: '60 a 90 dias', v: data.stock_aging.d60_90 ?? 0 },
                    { l: 'Mais de 90 dias', v: data.stock_aging.d90 ?? 0 },
                  ]}
                  value={(r) => r.v}
                  label={(r) => r.l}
                  format={(n) => `${n} veíc.`}
                />
                <p className="small muted">Veículos parados há muito tempo consomem capital: revise preço e anúncios.</p>
              </div>
            </div>
          </div>
          <p className="small muted">Lucro = venda − compra − preparação (real ou, se não lançada, prevista) − comissão. Valores em reais.</p>
        </div>
      )}
    </div>
  );
}
