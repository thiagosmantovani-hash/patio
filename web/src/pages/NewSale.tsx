import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { money, money0, todayISO } from '../format';
import { Field, formData, Icon, Loading, useAction, useLoad } from '../ui';
import { CustomerPicker } from './CustomerPicker';

export function NewSale() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { run, busy } = useAction();
  const vehicles = useLoad(() => api.get<any[]>('/vehicles?status=estoque'));
  const sellers = useLoad(() => api.get<any[]>('/users/options'));
  const [vehicleId, setVehicleId] = useState(params.get('vehicle') ?? '');
  const [customer, setCustomer] = useState<any>(null);
  const [price, setPrice] = useState(0);
  const [down, setDown] = useState(0);
  const [financed, setFinanced] = useState(0);
  const [trade, setTrade] = useState(0);
  const leadId = params.get('lead');

  useEffect(() => {
    const cid = params.get('customer');
    if (cid) api.get(`/customers/${cid}`).then(setCustomer).catch(() => {});
  }, [params]);

  const vehicle = vehicles.data?.find((v) => String(v.id) === vehicleId);
  useEffect(() => {
    if (vehicle) {
      setPrice(vehicle.sale_price);
      setDown(vehicle.sale_price);
      setFinanced(0);
      setTrade(0);
    }
  }, [vehicle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!vehicles.data || !sellers.data) return <Loading />;
  const remaining = Math.round((price - down - financed - trade) * 100) / 100;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = formData(e.currentTarget);
    const body = {
      ...f,
      vehicle_id: vehicleId,
      customer_id: customer?.id,
      lead_id: leadId,
      sale_price: price,
      down_payment: down,
      financed_amount: financed,
      trade_in_value: trade,
      trade_in: trade > 0 ? { brand: f.t_brand, model: f.t_model, version: f.t_version, year_model: f.t_year, km: f.t_km, plate: f.t_plate, color: f.t_color } : undefined,
    };
    const sale = await run(() => api.post('/sales', body), 'Venda registrada!');
    if (sale) nav(`/estoque/${sale.vehicle_id}`);
  };

  const n = (set: (v: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(Number(e.target.value) || 0);

  return (
    <div className="page">
      <Link to="/vendas" className="back"><Icon name="left" size={14} /> Vendas</Link>
      <div className="page-head"><h1>Registrar venda</h1></div>
      <form onSubmit={submit} className="grid g-main">
        <div className="stack">
          <div className="card card-body">
            <div className="form-grid">
              <Field label="Veículo vendido *" className="span4">
                <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
                  <option value="">Selecione…</option>
                  {vehicles.data.map((v) => (
                    <option key={v.id} value={v.id}>{v.brand} {v.model} {v.version} {v.year_model} · {v.plate ?? 's/ placa'} · {money0(v.sale_price)}</option>
                  ))}
                </select>
              </Field>
              <div className="span4"><CustomerPicker value={customer} onChange={setCustomer} label="Comprador *" /></div>
              <Field label="Data da venda" className="span2"><input className="input" type="date" name="sale_date" defaultValue={todayISO()} required /></Field>
              <Field label="Vendedor" className="span2">
                <select className="input" name="seller_id" defaultValue={user?.id}>
                  {sellers.data.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Pagamento</h2></div>
            <div className="card-body form-grid">
              <Field label="Valor da venda (R$) *" className="span2"><input className="input" type="number" step="0.01" min="0" value={price || ''} onChange={n(setPrice)} required /></Field>
              <Field label="Forma de pagamento" className="span2">
                <select className="input" name="payment_method" defaultValue="a_vista">
                  <option value="a_vista">À vista</option>
                  <option value="financiamento">Financiamento</option>
                  <option value="consorcio">Consórcio</option>
                  <option value="misto">Misto</option>
                </select>
              </Field>
              <Field label="Entrada (R$)"><input className="input" type="number" step="0.01" min="0" value={down || ''} onChange={n(setDown)} /></Field>
              <Field label="Financiado (R$)"><input className="input" type="number" step="0.01" min="0" value={financed || ''} onChange={n(setFinanced)} /></Field>
              <Field label="Banco / financeira"><input className="input" name="bank" disabled={!financed} /></Field>
              <Field label="Parcelas"><input className="input" type="number" min="1" name="installments" disabled={!financed} /></Field>
              <Field label="Veículo na troca (R$)" className="span2"><input className="input" type="number" step="0.01" min="0" value={trade || ''} onChange={n(setTrade)} /></Field>
              <Field label="Comissão (R$)" className="span2"><input className="input" type="number" step="0.01" min="0" name="commission" placeholder="Automática pelo % do vendedor" /></Field>
              <div className="span4">
                <button type="button" className="btn sm" onClick={() => setDown(Math.max(0, price - financed - trade))}>Completar com entrada</button>{' '}
                <button type="button" className="btn sm" onClick={() => setFinanced(Math.max(0, price - down - trade))}>Completar com financiamento</button>
              </div>
            </div>
          </div>

          {trade > 0 && (
            <div className="card">
              <div className="card-head"><h2>Veículo recebido na troca</h2><span className="small muted">Entra no estoque “Em preparação”</span></div>
              <div className="card-body form-grid">
                <Field label="Marca *"><input className="input" name="t_brand" required /></Field>
                <Field label="Modelo *"><input className="input" name="t_model" required /></Field>
                <Field label="Versão" className="span2"><input className="input" name="t_version" /></Field>
                <Field label="Ano modelo"><input className="input" type="number" name="t_year" /></Field>
                <Field label="KM"><input className="input" type="number" name="t_km" /></Field>
                <Field label="Placa"><input className="input" name="t_plate" style={{ textTransform: 'uppercase' }} /></Field>
                <Field label="Cor"><input className="input" name="t_color" /></Field>
              </div>
            </div>
          )}

          <div className="card card-body">
            <Field label="Observações"><textarea className="input" name="notes" rows={2} /></Field>
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad" style={{ position: 'sticky', top: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Resumo</h3>
            {vehicle ? (
              <div className="small muted" style={{ marginBottom: 8 }}>{vehicle.brand} {vehicle.model} {vehicle.year_model} · anunciado por {money0(vehicle.sale_price)}</div>
            ) : null}
            <div className="summary-line"><span>Entrada</span><span>{money(down)}</span></div>
            <div className="summary-line"><span>Financiado</span><span>{money(financed)}</span></div>
            <div className="summary-line"><span>Troca</span><span>{money(trade)}</span></div>
            <div className="summary-line total"><span>Total</span><span>{money(price)}</span></div>
            {remaining !== 0 && (
              <div className="error-box">
                {remaining > 0 ? `Faltam ${money(remaining)} para fechar o valor da venda.` : `Pagamento excede a venda em ${money(-remaining)}.`}
              </div>
            )}
            {leadId && <div className="small muted">O lead vinculado será marcado como ganho.</div>}
            <button className="btn primary" style={{ width: '100%', marginTop: 12 }} disabled={busy || remaining !== 0 || !vehicleId || !customer}>
              {busy ? 'Registrando…' : 'Confirmar venda'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
