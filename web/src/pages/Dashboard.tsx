import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { date, LEAD_STAGE, money0, monthLabel, VEHICLE_STATUS } from '../format';
import { Badge, Empty, Loading, StatusBadge, useLoad } from '../ui';
import { GettingStarted } from './GettingStarted';

export function Dashboard() {
  const { user, can } = useAuth();
  const nav = useNavigate();
  const { data, error } = useLoad(() => api.get('/reports/dashboard'));
  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!data) return <Loading />;
  const manager = can('admin', 'gerente');
  const maxRevenue = Math.max(1, ...data.history.map((h: any) => h.revenue));
  const leadTotal = data.leads.reduce((s: number, l: any) => s + l.count, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Olá, {user!.name.split(' ')[0]}</h1>
          <p>Resumo da operação em {new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })}.</p>
        </div>
        <div className="actions">
          <Link className="btn" to="/avaliacoes">Nova avaliação</Link>
          <Link className="btn primary" to="/vendas/nova">Registrar venda</Link>
        </div>
      </div>

      <GettingStarted />

      <div className="grid g4">
        <div className="card kpi">
          <div className="label">Veículos em estoque</div>
          <div className="value">{data.stock.count}</div>
          <div className="hint">Giro médio: {data.stock.avg_days} dias</div>
        </div>
        <div className="card kpi">
          <div className="label">Valor de venda do estoque</div>
          <div className="value">{money0(data.stock.value)}</div>
          {manager && <div className="hint">Custo investido: {money0(data.stock.cost)}</div>}
        </div>
        <div className="card kpi">
          <div className="label">Vendas no mês</div>
          <div className="value">{data.month.count}</div>
          {manager && <div className="hint">Faturamento: {money0(data.month.revenue)}</div>}
        </div>
        {manager ? (
          <div className="card kpi">
            <div className="label">Lucro bruto no mês</div>
            <div className={`value ${data.month.profit >= 0 ? 'pos' : 'neg'}`}>{money0(data.month.profit)}</div>
            <div className="hint">Após preparação e comissões</div>
          </div>
        ) : (
          <div className="card kpi">
            <div className="label">Meus leads em aberto</div>
            <div className="value">{leadTotal}</div>
          </div>
        )}
      </div>

      <div className="grid g-main mt">
        <div className="stack">
          {manager && (
            <div className="card">
              <div className="card-head">
                <h2>Vendas dos últimos 6 meses</h2>
                <div className="legend">
                  <span><i style={{ background: 'color-mix(in srgb, var(--brand) 35%, var(--surface))' }} />Faturamento</span>
                  <span><i style={{ background: 'var(--brand)' }} />Lucro</span>
                </div>
              </div>
              <div className="card-body">
                {data.history.length ? (
                  <div className="bars">
                    {data.history.map((h: any) => (
                      <div className="bar-col" key={h.month} title={`${h.count} vendas · ${money0(h.revenue)} · lucro ${money0(h.profit)}`}>
                        <div className="small muted">{h.count}</div>
                        <div className="bar-stack">
                          <div className="bar alt" style={{ height: `${((h.revenue - Math.max(0, h.profit)) / maxRevenue) * 100}%` }} />
                          <div className="bar" style={{ height: `${(Math.max(0, h.profit) / maxRevenue) * 100}%`, borderRadius: 0 }} />
                        </div>
                        <div className="bar-label">{monthLabel(h.month)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>Nenhuma venda nos últimos meses.</Empty>
                )}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Estoque parado há 60 dias ou mais</h2>
              <Link to="/estoque" className="small">Ver estoque</Link>
            </div>
            {data.stock.aging.length ? (
              <table className="table">
                <tbody>
                  {data.stock.aging.map((v: any) => (
                    <tr key={v.id} className="click" onClick={() => nav(`/estoque/${v.id}`)}>
                      <td>{v.brand} {v.model} {v.year_model}</td>
                      <td className="num">{v.sale_price ? money0(v.sale_price) : <Badge tone="warn">Sem preço</Badge>}</td>
                      <td className="num"><Badge tone={v.days >= 90 ? 'bad' : 'warn'}>{v.days} dias</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>Nenhum veículo parado há mais de 60 dias. Ótimo giro!</Empty>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h2>Estoque por situação</h2></div>
            <div className="card-body">
              {data.stock.by_status.length ? data.stock.by_status.map((s: any) => (
                <div className="summary-line" key={s.status}>
                  <StatusBadge map={VEHICLE_STATUS} value={s.status} />
                  <span><strong>{s.count}</strong> <span className="muted small">· {money0(s.value)}</span></span>
                </div>
              )) : <Empty>Estoque vazio.</Empty>}
              {data.pending_appraisals > 0 && (
                <div className="summary-line">
                  <Link to="/avaliacoes">Avaliações pendentes</Link>
                  <strong>{data.pending_appraisals}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Funil de leads</h2>
              <Link to="/leads" className="small">Abrir funil</Link>
            </div>
            <div className="card-body">
              {['novo', 'contato', 'visita', 'proposta'].map((stage) => {
                const n = data.leads.find((l: any) => l.stage === stage)?.count ?? 0;
                return (
                  <div className="hbar" key={stage}>
                    <span>{LEAD_STAGE[stage]!.label}</span>
                    <div className="track"><div className="fill" style={{ width: `${leadTotal ? (n / leadTotal) * 100 : 0}%` }} /></div>
                    <span className="right"><strong>{n}</strong></span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Retornos para hoje</h2></div>
            {data.follow_ups.length ? (
              <table className="table">
                <tbody>
                  {data.follow_ups.map((l: any) => (
                    <tr key={l.id} className="click" onClick={() => nav(`/leads?lead=${l.id}`)}>
                      <td>
                        <div><strong>{l.customer_name}</strong></div>
                        <div className="small muted">{l.brand ? `${l.brand} ${l.model}` : 'Sem veículo'} · {l.customer_phone}</div>
                      </td>
                      <td className="num small">{date(l.next_contact)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>Nenhum retorno agendado.</Empty>
            )}
          </div>

          {data.finance && data.finance.overdue_count > 0 && (
            <div className="card card-pad">
              <h3>Contas vencidas</h3>
              <div className="summary-line"><span>A receber</span><strong className="pos">{money0(data.finance.overdue_receivable)}</strong></div>
              <div className="summary-line"><span>A pagar</span><strong className="neg">{money0(data.finance.overdue_payable)}</strong></div>
              <Link to="/financeiro?status=vencido" className="small">Ver lançamentos vencidos</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
