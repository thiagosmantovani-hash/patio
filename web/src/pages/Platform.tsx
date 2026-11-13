import { api } from '../api';
import { date, dateTime } from '../format';
import { Badge, Empty, Loading, useLoad, useToast } from '../ui';

// Painel do dono do Pátio: empresas cadastradas e o quanto cada uma está usando.

export function Platform() {
  const { data, error, reload } = useLoad(() => api.get<any[]>('/platform/companies'));
  const toast = useToast();
  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!data) return <Loading />;

  const toggle = async (c: any) => {
    const status = c.status === 'ativa' ? 'suspensa' : 'ativa';
    if (status === 'suspensa' && !window.confirm(`Suspender o acesso de ${c.name}? Os dados ficam guardados.`)) return;
    await api.put(`/platform/companies/${c.id}/status`, { status });
    toast(status === 'ativa' ? 'Acesso reativado' : 'Acesso suspenso');
    reload();
  };

  const ativas7 = data.filter((c) => c.last_seen_at && Date.now() - new Date(c.last_seen_at).getTime() < 7 * 86_400_000).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Plataforma</h1>
          <p>Empresas cadastradas no Pátio e o uso de cada uma.</p>
        </div>
      </div>
      <div className="grid g4">
        <div className="card kpi"><div className="label">Empresas</div><div className="value">{data.length}</div></div>
        <div className="card kpi"><div className="label">Usaram nos últimos 7 dias</div><div className="value">{ativas7}</div></div>
        <div className="card kpi"><div className="label">Veículos em estoque (total)</div><div className="value">{data.reduce((s, c) => s + c.vehicles, 0)}</div></div>
        <div className="card kpi"><div className="label">Vendas registradas (total)</div><div className="value">{data.reduce((s, c) => s + c.sales, 0)}</div></div>
      </div>
      <div className="card mt">
        {!data.length ? <Empty>Nenhuma empresa cadastrada ainda.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Empresa</th><th>Administrador</th><th>Cadastro</th><th>Último uso</th><th className="num">Usuários</th><th className="num">Estoque</th><th className="num">Avaliações</th><th className="num">Leads</th><th className="num">Vendas</th><th>Situação</th><th /></tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong><div className="small muted">{c.city ?? ''} · <a href={`/v/${c.slug}`} target="_blank" rel="noreferrer">/v/{c.slug}</a></div></td>
                    <td>{c.admin_name}<div className="small muted">{c.admin_email}</div>{c.phone && <div className="small muted">{c.phone}</div>}</td>
                    <td>{date(c.created_at)}<div className="small muted">teste até {date(c.trial_ends_at)}</div></td>
                    <td>{c.last_seen_at ? dateTime(c.last_seen_at) : <span className="muted">nunca</span>}</td>
                    <td className="num">{c.users}</td><td className="num">{c.vehicles}</td><td className="num">{c.appraisals}</td><td className="num">{c.leads}</td><td className="num">{c.sales}</td>
                    <td>{c.status === 'ativa' ? <Badge tone="ok">Ativa</Badge> : <Badge tone="bad">Suspensa</Badge>}</td>
                    <td><button className="btn sm" onClick={() => toggle(c)}>{c.status === 'ativa' ? 'Suspender' : 'Reativar'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
