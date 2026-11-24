import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api';
import { km, money0 } from '../format';
import { Badge, CarPlaceholder, Empty, Field, formData, Icon, Loading, Modal, useLoad } from '../ui';

// Vitrine pública: não exige login e só recebe campos públicos da API.
// O conteúdo (horário, menu, banners, marcas, blocos, depoimentos, lojas, rodapé) vem do Editor de site do sistema.

interface Site {
  hours: string;
  menu: string[];
  brands: string[];
  sell: { on: boolean; title: string; text: string; button: string };
  finance: { on: boolean; title: string; text: string; button: string };
  socials: Record<string, string>;
  map: boolean;
  units: { name: string; address: string; phone: string; hours: string }[];
  seals: string[];
  legal_name: string;
  cnpj: string;
  color: string;
  dark: boolean;
  seo: { title: string; description: string };
  banners: { title: string; subtitle: string }[];
  testimonials: { name: string; text: string }[];
}
interface Store { store_name: string; phone: string; whatsapp: string; email: string; address: string; city: string; about: string; site: Site | null }

type Kind = 'compra' | 'financiamento' | 'sac';

function useSeo(store: Store | null | undefined) {
  useEffect(() => {
    if (!store) return;
    document.title = store.site?.seo.title || store.store_name || 'Vitrine';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', store.site?.seo.description || store.about || '');
  }, [store]);
}

function StoreHeader({ store, slug, onForm }: { store?: Store | null; slug: string; onForm: (k: Kind) => void }) {
  const wa = (store?.whatsapp ?? '').replace(/\D/g, '');
  const s = store?.site;
  const menuAction = (item: string) => {
    const t = item.toLowerCase();
    if (t.includes('vend')) return () => onForm('compra');
    if (t.includes('financ')) return () => onForm('financiamento');
    if (t.includes('contato') || t.includes('sac')) return () => onForm('sac');
    if (t.includes('sobre')) return () => document.getElementById('sobre')?.scrollIntoView({ behavior: 'smooth' });
    return () => document.getElementById('estoque')?.scrollIntoView({ behavior: 'smooth' });
  };
  return (
    <>
      {s?.hours && <div className="vt-bar">Horário de atendimento: {s.hours}</div>}
      <div className={`store-top${s?.dark ? ' vt-dark' : ''}`}>
        <div className="inner spread">
          <Link to={`/v/${slug}`} className="row vt-logo">
            {!s && <Icon name="car" size={22} />} {store?.store_name ?? ''}
          </Link>
          {s && s.menu.length > 0 && (
            <nav className="vt-menu">
              {s.menu.map((m) => <button key={m} type="button" onClick={menuAction(m)}>{m}</button>)}
            </nav>
          )}
          <div className="row small">
            {store?.phone && <span className="vt-phone">{store.phone}</span>}
            {wa && <a className="btn primary sm" href={`https://wa.me/55${wa}`} target="_blank" rel="noreferrer"><Icon name="phone" /> WhatsApp</a>}
          </div>
        </div>
      </div>
    </>
  );
}

const KIND_INFO: Record<Kind, { title: string; intro: string }> = {
  compra: { title: 'Venda seu carro', intro: 'Conte sobre o seu carro e receba nossa proposta.' },
  financiamento: { title: 'Simule seu financiamento', intro: 'Informe os dados e um consultor envia as condições.' },
  sac: { title: 'Fale com a loja', intro: 'Dúvidas, sugestões ou reclamações.' },
};

function ContactModal({ slug, kind, onClose, vehicle }: { slug: string; kind: Kind; onClose: () => void; vehicle?: string }) {
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api.post(`/public/${slug}/contact`, { ...formData(e.currentTarget), kind });
      setSent(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={KIND_INFO[kind].title} onClose={onClose}>
      {sent ? (
        <div className="badge ok" style={{ padding: 12, borderRadius: 8, whiteSpace: 'normal' }}>Recebemos seu pedido! Um consultor vai falar com você em breve.</div>
      ) : (
        <form onSubmit={submit} className="stack" style={{ gap: 10 }}>
          <p className="muted">{KIND_INFO[kind].intro}</p>
          {err && <div className="error-box">{err}</div>}
          <Field label="Nome"><input className="input" name="name" required maxLength={120} /></Field>
          <div className="grid g2" style={{ gap: 10 }}>
            <Field label="Telefone / WhatsApp"><input className="input" name="phone" maxLength={40} /></Field>
            <Field label="E-mail"><input className="input" type="email" name="email" maxLength={120} /></Field>
          </div>
          {kind === 'compra' && (
            <div className="grid g2" style={{ gap: 10 }}>
              <Field label="Marca"><input className="input" name="brand" maxLength={60} /></Field>
              <Field label="Modelo"><input className="input" name="model" maxLength={80} /></Field>
              <Field label="Ano"><input className="input" name="year" maxLength={9} /></Field>
              <Field label="Quilometragem"><input className="input" name="km" maxLength={12} /></Field>
            </div>
          )}
          {kind === 'financiamento' && (
            <>
              <div className="grid g2" style={{ gap: 10 }}>
                <Field label="Valor de entrada"><input className="input" name="down_payment" maxLength={20} /></Field>
                <Field label="Parcelas"><select className="input" name="installments" defaultValue="48">{['24', '36', '48', '60'].map((p) => <option key={p} value={`${p}x`}>{p}x</option>)}</select></Field>
              </div>
              <Field label="Veículo de interesse"><input className="input" name="vehicle" maxLength={120} defaultValue={vehicle} /></Field>
            </>
          )}
          <Field label={kind === 'sac' ? 'Mensagem' : 'Observações'}><textarea className="input" name="message" rows={3} maxLength={2000} required={kind === 'sac'} /></Field>
          <button className="btn primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar'}</button>
        </form>
      )}
    </Modal>
  );
}

function Footer({ store }: { store?: Store | null }) {
  const s = store?.site;
  const socials = s ? Object.entries(s.socials).filter(([, u]) => u) : [];
  return (
    <footer className={`vt-foot${s && !s.dark ? ' light' : ''}`}>
      <div className="store-wrap stack" style={{ gap: 18 }}>
        {s && s.units.length > 0 && (
          <div>
            <h3 style={{ marginBottom: 10 }}>Lojas / Unidades</h3>
            <div className="vt-units">
              {s.units.map((u, i) => (
                <div key={i}>
                  <strong>{u.name}</strong>
                  {u.address && <div>{u.address}{s.map && <> · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u.address)}`} target="_blank" rel="noreferrer">Ver no mapa</a></>}</div>}
                  {u.phone && <div>{u.phone}</div>}
                  {u.hours && <div className="muted">{u.hours}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        {socials.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
            {socials.map(([k, u]) => <a key={k} href={u} target="_blank" rel="noreferrer" style={{ textTransform: 'capitalize' }}>{k}</a>)}
          </div>
        )}
        {s && s.seals.length > 0 && <div className="small">{s.seals.join(' · ')}</div>}
        <div className="small muted">
          {s?.legal_name ? `${s.legal_name}${s.cnpj ? ' · CNPJ ' + s.cnpj : ''}` : `${store?.store_name ?? ''} · ${store?.address ?? ''} ${store?.city ?? ''}`}
          {store?.email ? ` · ${store.email}` : ''}
          <div style={{ marginTop: 6 }}>Vitrine feita com o Pátio</div>
        </div>
      </div>
    </footer>
  );
}

const accentOf = (store?: Store | null) => ({ '--vt': store?.site?.color ?? 'var(--primary)' }) as CSSProperties;

export function Vitrine() {
  const { slug = '' } = useParams();
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Kind | null>(null);
  const [ban, setBan] = useState(0);
  const store = useLoad(() => api.get<Store>(`/public/${slug}/store`), [slug]);
  const { data, error } = useLoad(() => api.get<any[]>(`/public/${slug}/vehicles${qs({ q })}`), [slug, q]);
  useSeo(store.data);
  const s = store.data?.site;
  const banners = s?.banners ?? [];
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setBan((b) => (b + 1) % banners.length), 6000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (store.error || error) return <div className="store-wrap"><Empty>Loja não encontrada. Confira o endereço.</Empty></div>;
  const b = banners.length ? banners[ban % banners.length] : null;
  return (
    <div style={{ minHeight: '100%', ...accentOf(store.data) }}>
      <StoreHeader store={store.data} slug={slug} onForm={setForm} />
      <div className="store-hero">
        <div className="inner">
          <h1>{b?.title || 'Encontre seu próximo carro'}</h1>
          <p style={{ maxWidth: 640 }}>{b ? b.subtitle : store.data?.about}</p>
          {banners.length > 1 && (
            <div className="vt-dots">{banners.map((_, i) => <button key={i} type="button" className={i === ban % banners.length ? 'on' : ''} onClick={() => setBan(i)} aria-label={`Banner ${i + 1}`} />)}</div>
          )}
        </div>
      </div>
      <div className="store-wrap" id="estoque">
        <h2 style={{ margin: '8px 0 10px' }}>Qual veículo você está buscando?</h2>
        <input className="input" style={{ maxWidth: 520 }} placeholder="Marca ou modelo" value={q} onChange={(e) => setQ(e.target.value)} />
        {s && s.brands.length > 0 && (
          <div className="vt-brands">
            {s.brands.map((m) => <button key={m} type="button" className={q.toLowerCase() === m.toLowerCase() ? 'on' : ''} onClick={() => setQ(q.toLowerCase() === m.toLowerCase() ? '' : m)}>{m}</button>)}
          </div>
        )}
        {!data ? <Loading /> : !data.length ? <Empty>Nenhum veículo disponível no momento.</Empty> : (
          <>
            <p className="muted">{data.length} veículo(s) disponível(is)</p>
            <div className="vgrid">
              {data.map((v) => (
                <Link key={v.id} to={`/v/${slug}/${v.id}`} className="card vcard" style={{ color: 'inherit', textDecoration: 'none' }}>
                  <div className="thumb">
                    {v.photos[0] ? <img src={v.photos[0]} alt={`${v.brand} ${v.model}`} loading="lazy" /> : <CarPlaceholder />}
                    {v.featured ? <Badge tone="ok">Destaque</Badge> : null}
                  </div>
                  <div className="body">
                    <div className="title">{v.brand} {v.model}</div>
                    <div className="small muted">{v.version}</div>
                    <div className="small muted">{v.year_fab}/{v.year_model} · {km(v.km)} · {v.transmission}</div>
                    <div className="price vt-price">{money0(v.sale_price)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        {s && (s.sell.on || s.finance.on) && (
          <div className="vt-blocks">
            {s.sell.on && <div><h3>{s.sell.title}</h3><p className="muted">{s.sell.text}</p><button type="button" className="btn vt-btn" onClick={() => setForm('compra')}>{s.sell.button || 'Avalie agora'}</button></div>}
            {s.finance.on && <div><h3>{s.finance.title}</h3><p className="muted">{s.finance.text}</p><button type="button" className="btn vt-btn" onClick={() => setForm('financiamento')}>{s.finance.button || 'Simular'}</button></div>}
          </div>
        )}

        {s && s.testimonials.length > 0 && (
          <div className="mt">
            <h2 style={{ marginBottom: 12 }}>O que dizem nossos clientes</h2>
            <div className="vt-depo">{s.testimonials.map((d, i) => <div key={i} className="card card-pad">“{d.text}”<strong className="small">{d.name}</strong></div>)}</div>
          </div>
        )}

        {store.data?.about && s && (
          <div className="mt" id="sobre">
            <h2 style={{ marginBottom: 8 }}>Sobre a {store.data.store_name}</h2>
            <p style={{ whiteSpace: 'pre-line', maxWidth: 760 }}>{store.data.about}</p>
          </div>
        )}
        <p className="small mt"><button type="button" className="vt-link" onClick={() => setForm('sac')}>Fale com a loja (SAC)</button></p>
      </div>
      <Footer store={store.data} />
      {form && <ContactModal slug={slug} kind={form} onClose={() => setForm(null)} />}
    </div>
  );
}

export function VitrineVehicle() {
  const { slug = '', id } = useParams();
  const store = useLoad(() => api.get<Store>(`/public/${slug}/store`), [slug]);
  const { data: v, error } = useLoad(() => api.get(`/public/${slug}/vehicles/${id}`), [slug, id]);
  const [photo, setPhoto] = useState(0);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<Kind | null>(null);
  useSeo(store.data);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    try {
      await api.post(`/public/${slug}/vehicles/${id}/interest`, formData(e.currentTarget));
      setSent(true);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  return (
    <div style={{ minHeight: '100%', ...accentOf(store.data) }}>
      <StoreHeader store={store.data} slug={slug} onForm={setForm} />
      <div className="store-wrap">
        <Link to={`/v/${slug}`} className="back"><Icon name="left" size={14} /> Todos os veículos</Link>
        {error ? <Empty>Veículo não encontrado ou já vendido.</Empty> : !v ? <Loading /> : (
          <div className="grid g-main">
            <div className="stack">
              <div>
                <div className="gallery-main">{v.photos[photo] ? <img src={v.photos[photo]} alt={`${v.brand} ${v.model}`} /> : <CarPlaceholder />}</div>
                {v.photos.length > 1 && (
                  <div className="gallery-thumbs">
                    {v.photos.map((p: string, i: number) => (
                      <button key={p} className={i === photo ? 'on' : ''} onClick={() => setPhoto(i)} aria-label={`Foto ${i + 1}`}><img src={p} alt="" /></button>
                    ))}
                  </div>
                )}
              </div>
              <div className="card card-body">
                <h2 style={{ marginBottom: 12 }}>Ficha técnica</h2>
                <div className="specs">
                  {[['Ano', `${v.year_fab ?? '—'}/${v.year_model ?? '—'}`], ['Quilometragem', km(v.km)], ['Câmbio', v.transmission], ['Combustível', v.fuel], ['Cor', v.color], ['Portas', v.doors]].map(([k, val]) => (
                    <div key={k}><span>{k}</span><strong>{val ?? '—'}</strong></div>
                  ))}
                </div>
                {v.description && <p className="mt">{v.description}</p>}
                {v.features.length > 0 && (
                  <>
                    <h3 className="mt" style={{ marginBottom: 8 }}>Opcionais</h3>
                    <div className="chips">{v.features.map((f: string) => <span className="chip" key={f}>{f}</span>)}</div>
                  </>
                )}
              </div>
            </div>
            <div className="stack">
              <div className="card card-pad">
                <h1>{v.brand} {v.model}</h1>
                <div className="muted">{v.version}</div>
                <div className="vt-price" style={{ fontSize: 28, fontWeight: 750, margin: '12px 0' }}>{money0(v.sale_price)}</div>
                {sent ? (
                  <div className="badge ok" style={{ padding: 12, borderRadius: 8, whiteSpace: 'normal' }}>Recebemos seu contato! Um consultor vai falar com você em breve.</div>
                ) : (
                  <form onSubmit={submit} className="stack" style={{ gap: 10 }}>
                    <h3>Tenho interesse</h3>
                    {formError && <div className="error-box">{formError}</div>}
                    <Field label="Nome"><input className="input" name="name" required maxLength={120} /></Field>
                    <Field label="Telefone / WhatsApp"><input className="input" name="phone" /></Field>
                    <Field label="E-mail"><input className="input" type="email" name="email" /></Field>
                    <Field label="Mensagem"><textarea className="input" name="message" rows={3} defaultValue={`Olá! Tenho interesse no ${v.brand} ${v.model} ${v.year_model}.`} maxLength={2000} /></Field>
                    <button className="btn primary">Enviar</button>
                  </form>
                )}
                {store.data?.site?.finance.on && (
                  <button type="button" className="btn vt-btn mt" style={{ width: '100%' }} onClick={() => setForm('financiamento')}>Simular financiamento</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer store={store.data} />
      {form && <ContactModal slug={slug} kind={form} onClose={() => setForm(null)} vehicle={v ? `${v.brand} ${v.model} ${v.year_model ?? ''}`.trim() : undefined} />}
    </div>
  );
}
