import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { todayISO } from '../format';
import { Field, formData, Modal, useAction } from '../ui';

const FUELS = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Híbrido', 'Elétrico', 'GNV'];
const TRANSMISSIONS = ['Manual', 'Automático', 'CVT', 'Automatizado'];
const COMMON_FEATURES = [
  'Ar-condicionado', 'Direção elétrica', 'Direção hidráulica', 'Vidros elétricos', 'Travas elétricas', 'Alarme', 'Airbag',
  'Freios ABS', 'Central multimídia', 'Câmera de ré', 'Sensor de estacionamento', 'Piloto automático', 'Bancos de couro',
  'Rodas de liga leve', 'Teto solar', 'Faróis de LED', 'Chave presencial', 'Carregador por indução',
];

export function VehicleForm({ vehicle, onClose, onSaved }: { vehicle?: any; onClose: () => void; onSaved: (v: any) => void }) {
  const { run, busy } = useAction();
  const [features, setFeatures] = useState<string[]>(vehicle?.features ?? []);
  const [custom, setCustom] = useState('');
  const toggle = (f: string) => setFeatures((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = { ...formData(e.currentTarget), features, featured: (e.currentTarget.elements.namedItem('featured') as HTMLInputElement).checked };
    const saved = await run(
      () => (vehicle ? api.put(`/vehicles/${vehicle.id}`, body) : api.post('/vehicles', body)),
      vehicle ? 'Veículo atualizado.' : 'Veículo cadastrado.',
    );
    if (saved) onSaved(saved);
  }

  const v = vehicle ?? {};
  return (
    <Modal title={vehicle ? 'Editar veículo' : 'Cadastrar veículo'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Marca *"><input className="input" name="brand" defaultValue={v.brand} required /></Field>
          <Field label="Modelo *"><input className="input" name="model" defaultValue={v.model} required /></Field>
          <Field label="Versão" className="span2"><input className="input" name="version" defaultValue={v.version ?? ''} /></Field>
          <Field label="Ano fabricação"><input className="input" name="year_fab" type="number" min="1900" max="2100" defaultValue={v.year_fab ?? ''} /></Field>
          <Field label="Ano modelo"><input className="input" name="year_model" type="number" min="1900" max="2100" defaultValue={v.year_model ?? ''} /></Field>
          <Field label="Placa"><input className="input" name="plate" defaultValue={v.plate ?? ''} maxLength={8} style={{ textTransform: 'uppercase' }} /></Field>
          <Field label="Quilometragem"><input className="input" name="km" type="number" min="0" defaultValue={v.km ?? ''} /></Field>
          <Field label="Cor"><input className="input" name="color" defaultValue={v.color ?? ''} /></Field>
          <Field label="Combustível">
            <select className="input" name="fuel" defaultValue={v.fuel ?? 'Flex'}>{FUELS.map((f) => <option key={f}>{f}</option>)}</select>
          </Field>
          <Field label="Câmbio">
            <select className="input" name="transmission" defaultValue={v.transmission ?? 'Manual'}>{TRANSMISSIONS.map((f) => <option key={f}>{f}</option>)}</select>
          </Field>
          <Field label="Portas"><input className="input" name="doors" type="number" min="0" max="6" defaultValue={v.doors ?? 4} /></Field>
          <Field label="Chassi"><input className="input" name="chassis" defaultValue={v.chassis ?? ''} /></Field>
          <Field label="Renavam"><input className="input" name="renavam" defaultValue={v.renavam ?? ''} /></Field>
          <Field label="Data de entrada"><input className="input" name="purchase_date" type="date" defaultValue={v.purchase_date ?? todayISO()} /></Field>
          <Field label="Origem / fornecedor"><input className="input" name="supplier" defaultValue={v.supplier ?? ''} placeholder="Particular, leilão, troca…" /></Field>
          <Field label="Valor de compra (R$)"><input className="input" name="purchase_price" type="number" step="0.01" min="0" defaultValue={v.purchase_price ?? ''} /></Field>
          <Field label="Preço de venda (R$)"><input className="input" name="sale_price" type="number" step="0.01" min="0" defaultValue={v.sale_price ?? ''} /></Field>
          <Field label="Tabela de referência (R$)"><input className="input" name="fipe_price" type="number" step="0.01" min="0" defaultValue={v.fipe_price ?? ''} /></Field>
          <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
            <input type="checkbox" name="featured" defaultChecked={Boolean(v.featured)} /> Destaque na vitrine
          </label>
          <Field label="Descrição do anúncio" className="span4">
            <textarea className="input" name="description" defaultValue={v.description ?? ''} rows={3} />
          </Field>
          <div className="span4">
            <div className="field" style={{ marginBottom: 8 }}>Opcionais</div>
            <div className="chips">
              {[...new Set([...COMMON_FEATURES, ...features])].map((f) => (
                <label key={f} className="chip check" style={{ cursor: 'pointer', background: features.includes(f) ? 'var(--brand-soft)' : undefined }}>
                  <input type="checkbox" checked={features.includes(f)} onChange={() => toggle(f)} style={{ display: 'none' }} />
                  {features.includes(f) ? '✓ ' : ''}{f}
                </label>
              ))}
            </div>
            <div className="row mt">
              <input className="input" style={{ maxWidth: 260 }} placeholder="Outro opcional" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button type="button" className="btn sm" onClick={() => { if (custom.trim()) { toggle(custom.trim()); setCustom(''); } }}>Adicionar</button>
            </div>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
