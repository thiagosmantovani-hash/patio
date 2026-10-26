import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { date, money, money0, PAYMENT_METHOD, TX_CATEGORY } from '../format';
import { Badge, Empty, Icon, Loading, Modal, useAction, useLoad } from '../ui';

function monthRange(offset = 0) {
  const d = new Date();
  const from = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const to = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to) };
}

export function Sales() {
  const [range, setRange] = useState(() => monthRange(0));
  const [open, setOpen] = useState<number | null>(null);
  const { data, reload } = useLoad(() => api.get<any[]>(`/sales${qs(range)}`), [range.from, range.to]);
  const valid = data?.filter((s) => s.status === 'concluida') ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Vendas</h1>
          <p>{valid.length} venda(s) · {money0(valid.reduce((s, x) => s + x.sale_price, 0))} no período</p>
        </div>
        <Link className="btn primary" to="/vendas/nova"><Icon name="plus" /> Registrar venda</Link>
      </div>
      <div className="filters">
        <div className="seg">
          <button onClick={() => setRange(monthRange(0))} className={range.from === monthRange(0).from ? 'active' : ''}>Este mês</button>
          <button onClick={() => setRange(monthRange(-1))} className={range.from === monthRange(-1).from ? 'active' : ''}>Mês passado</button>
          <button onClick={() => setRange({ from: '', to: '' })} className={!range.from ? 'active' : ''}>Todas</button>
        </div>
        <input className="input" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="De" />
        <input className="input" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="Até" />
      </div>
      {!data ? <Loading /> : !data.length ? (
        <div className="card"><Empty>Nenhuma venda no período.</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr><th>Data</th><th>Veículo</th><th>Cliente</th><th>Vendedor</th><th>Pagamento</th><th className="num">Valor</th><th /></tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="click" onClick={() => setOpen(s.id)}>
                  <td className="nowrap">{date(s.sale_date)}</td>
                  <td><strong>{s.brand} {s.model}</strong> <span className="small muted">{s.year_model} · {s.plate ?? ''}</span></td>
                  <td>{s.customer_name}</td>
                  <td>{s.seller_name ?? '—'}</td>
                  <td>{PAYMENT_METHOD[s.payment_method]}{s.trade_in_value > 0 && <span className="small muted"> + troca</span>}</td>
                  <td className="num">{money0(s.sale_price)}</td>
                  <td>{s.status === 'cancelada' && <Badge tone="bad">Cancelada</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <SaleModal id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}

function SaleModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const { run } = useAction();
  const { data: s, reload } = useLoad(() => api.get(`/sales/${id}`), [id]);
  if (!s) return <Modal title="Venda" onClose={onClose}><Loading /></Modal>;

  const cancel = async () => {
    const reason = prompt('Motivo do cancelamento:');
    if (reason === null) return;
    if (await run(() => api.post(`/sales/${id}/cancel`, { reason }), 'Venda cancelada; veículo voltou ao estoque.')) {
      reload();
      onChanged();
    }
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(receiptHtml(s));
    w.document.close();
    w.print();
  };

  return (
    <Modal title={`Venda #${s.id}`} onClose={onClose} wide>
      <div className="grid g2">
        <div>
          {s.status === 'cancelada' && <div className="error-box">Venda cancelada. {s.notes}</div>}
          <div className="summary-line"><span>Veículo</span><Link to={`/estoque/${s.vehicle_id}`}>{s.brand} {s.model} {s.version} {s.year_model}</Link></div>
          <div className="summary-line"><span>Placa</span><span>{s.plate ?? '—'}</span></div>
          <div className="summary-line"><span>Cliente</span><Link to={`/clientes/${s.customer_id}`}>{s.customer_name}</Link></div>
          <div className="summary-line"><span>Vendedor</span><span>{s.seller_name ?? '—'}</span></div>
          <div className="summary-line"><span>Data</span><span>{date(s.sale_date)}</span></div>
          <div className="summary-line"><span>Forma de pagamento</span><span>{PAYMENT_METHOD[s.payment_method]}</span></div>
          {s.notes && s.status !== 'cancelada' && <p className="small muted">{s.notes}</p>}
        </div>
        <div>
          <div className="summary-line"><span>Entrada</span><span>{money(s.down_payment)}</span></div>
          <div className="summary-line"><span>Financiado {s.bank ? `(${s.bank}${s.installments ? `, ${s.installments}x` : ''})` : ''}</span><span>{money(s.financed_amount)}</span></div>
          <div className="summary-line">
            <span>Troca {s.trade_in_vehicle_id ? <Link to={`/estoque/${s.trade_in_vehicle_id}`}>({s.trade_in_brand} {s.trade_in_model})</Link> : ''}</span>
            <span>{money(s.trade_in_value)}</span>
          </div>
          <div className="summary-line total"><span>Total</span><span>{money(s.sale_price)}</span></div>
          <div className="summary-line"><span>Comissão</span><span>{money(s.commission)}</span></div>
        </div>
      </div>
      {s.transactions.length > 0 && (
        <>
          <h3 className="mt">Lançamentos gerados</h3>
          <table className="table">
            <tbody>
              {s.transactions.map((t: any) => (
                <tr key={t.id}>
                  <td>{TX_CATEGORY[t.category] ?? t.category}</td>
                  <td>{date(t.due_date)}</td>
                  <td className={`num ${t.type === 'receita' ? 'pos' : 'neg'}`}>{money(t.amount)}</td>
                  <td>{t.paid_at ? <Badge tone="ok">Pago</Badge> : <Badge tone="warn">Em aberto</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="form-actions">
        <button className="btn" onClick={print}>Imprimir recibo</button>
        {s.status === 'concluida' && can('admin', 'gerente') && <button className="btn danger" onClick={cancel}>Cancelar venda</button>}
      </div>
    </Modal>
  );
}

const esc = (v: unknown) => String(v ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

function receiptHtml(s: any) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo de venda #${s.id}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:720px;margin:32px auto;color:#111}h1{font-size:20px}td{padding:6px 0;border-bottom:1px solid #ddd}table{width:100%;border-collapse:collapse}.r{text-align:right}.sig{margin-top:80px;display:flex;gap:40px}.sig div{flex:1;border-top:1px solid #000;text-align:center;padding-top:6px}</style>
</head><body>
<h1>Recibo de venda de veículo nº ${s.id}</h1>
<p>Data: ${esc(date(s.sale_date))}</p>
<table>
<tr><td>Comprador</td><td class="r">${esc(s.customer_name)}</td></tr>
<tr><td>Veículo</td><td class="r">${esc(`${s.brand} ${s.model} ${s.version ?? ''} ${s.year_model ?? ''}`)}</td></tr>
<tr><td>Placa</td><td class="r">${esc(s.plate ?? '—')}</td></tr>
<tr><td>Entrada</td><td class="r">${esc(money(s.down_payment))}</td></tr>
<tr><td>Financiamento</td><td class="r">${esc(money(s.financed_amount))} ${esc(s.bank ?? '')}</td></tr>
<tr><td>Veículo na troca</td><td class="r">${esc(money(s.trade_in_value))} ${esc(s.trade_in_brand ? `${s.trade_in_brand} ${s.trade_in_model}` : '')}</td></tr>
<tr><td><strong>Valor total</strong></td><td class="r"><strong>${esc(money(s.sale_price))}</strong></td></tr>
</table>
<div class="sig"><div>Vendedor</div><div>Comprador</div></div>
</body></html>`;
}
