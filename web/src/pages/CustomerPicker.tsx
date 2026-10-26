import { useEffect, useState, type FormEvent } from 'react';
import { api, qs } from '../api';
import { Field, formData, Modal, useAction } from '../ui';

/** Busca um cliente existente ou cadastra um novo rapidamente. */
export function CustomerPicker({ value, onChange, label = 'Cliente' }: { value: any; onChange: (c: any) => void; label?: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => api.get<any[]>(`/customers${qs({ q })}`).then((r) => setResults(r.slice(0, 8))).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (value) {
    return (
      <div className="field">
        {label}
        <div className="row card" style={{ padding: '8px 12px', justifyContent: 'space-between' }}>
          <div>
            <strong>{value.name}</strong> <span className="small muted">{[value.phone, value.email].filter(Boolean).join(' · ')}</span>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => onChange(null)}>Trocar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="field" style={{ position: 'relative' }}>
      {label}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          className="input"
          placeholder="Buscar por nome, telefone, e-mail ou documento"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <button type="button" className="btn" onClick={() => setCreating(true)}>Novo cliente</button>
      </div>
      {open && results.length > 0 && (
        <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, maxHeight: 260, overflowY: 'auto' }}>
          {results.map((c) => (
            <div key={c.id} className="spread" style={{ padding: '8px 12px', cursor: 'pointer' }} onMouseDown={() => onChange(c)}>
              <strong>{c.name}</strong>
              <span className="small muted">{c.phone ?? c.email}</span>
            </div>
          ))}
        </div>
      )}
      {creating && <CustomerModal onClose={() => setCreating(false)} onSaved={(c) => { setCreating(false); onChange(c); }} initialName={q} />}
    </div>
  );
}

export function CustomerModal({ customer, onClose, onSaved, initialName }: { customer?: any; onClose: () => void; onSaved: (c: any) => void; initialName?: string }) {
  const { run, busy } = useAction();
  const c = customer ?? { name: initialName };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const body = formData(e.currentTarget);
    const saved = await run(() => (customer ? api.put(`/customers/${customer.id}`, body) : api.post('/customers', body)), 'Cliente salvo.');
    if (saved) onSaved(saved);
  };
  return (
    <Modal title={customer ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Nome *" className="span4"><input className="input" name="name" defaultValue={c.name ?? ''} required autoFocus /></Field>
          <Field label="CPF / CNPJ" className="span2"><input className="input" name="document" defaultValue={c.document ?? ''} /></Field>
          <Field label="Nascimento" className="span2"><input className="input" type="date" name="birth_date" defaultValue={c.birth_date ?? ''} /></Field>
          <Field label="Telefone / WhatsApp" className="span2"><input className="input" name="phone" defaultValue={c.phone ?? ''} /></Field>
          <Field label="E-mail" className="span2"><input className="input" type="email" name="email" defaultValue={c.email ?? ''} /></Field>
          <Field label="Endereço" className="span4"><input className="input" name="address" defaultValue={c.address ?? ''} /></Field>
          <Field label="Cidade" className="span3"><input className="input" name="city" defaultValue={c.city ?? ''} /></Field>
          <Field label="UF"><input className="input" name="state" maxLength={2} defaultValue={c.state ?? ''} style={{ textTransform: 'uppercase' }} /></Field>
          <Field label="Observações" className="span4"><textarea className="input" name="notes" rows={2} defaultValue={c.notes ?? ''} /></Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
