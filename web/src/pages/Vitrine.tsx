import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api';
import { km, money0 } from '../format';
import { Badge, CarPlaceholder, Empty, Field, formData, Icon, Loading, useLoad } from '../ui';

// Vitrine pública: não exige login e só recebe campos públicos da API.

function StoreHeader({ store, slug }: { store: any; slug: string }) {
  const wa = (store?.whatsapp ?? '').replace(/\D/g, '');
  return (
    <div className="store-top">
      <div className="inner spread">
        <Link to={`/v/${slug}`} className="row" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 18 }}>
          <Icon name="car" size={22} /> {store?.store_name ?? ''}
        </Link>
        <div className="row small">
          {store?.phone && <span className="muted">{store.phone}</span>}
          {wa && <a className="btn primary sm" href={`https://wa.me/55${wa}`} target="_blank" rel="noreferrer"><Icon name="phone" /> WhatsApp</a>}
        </div>
      </div>
    </div>
  );
}

export function Vitrine() {
  const { slug = '' } = useParams();
  const [q, setQ] = useState('');
  const store = useLoad(() => api.get(`/public/${slug}/store`), [slug]);
  const { data, error } = useLoad(() => api.get<any[]>(`/public/${slug}/vehicles${qs({ q })}`), [slug, q]);
  if (store.error || error) return <div className="store-wrap"><Empty>Loja não encontrada. Confira o endereço.</Empty></div>;
  return (
    <div style={{ minHeight: '100%' }}>
      <StoreHeader store={store.data} slug={slug} />
      <div className="store-hero">
        <div className="inner">
          <h1>Encontre seu próximo carro</h1>
          <p style={{ maxWidth: 640 }}>{store.data?.about}</p>
          <input className="input" style={{ maxWidth: 480, marginTop: 12 }} placeholder="Buscar marca ou modelo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="store-wrap">
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
                    <div className="price">{money0(v.sale_price)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
        <footer className="small muted" style={{ padding: '32px 0', textAlign: 'center' }}>
          {store.data?.store_name} · {store.data?.address} {store.data?.city} · {store.data?.email}
          <div style={{ marginTop: 6 }}>Vitrine feita com o Pátio</div>
        </footer>
      </div>
    </div>
  );
}

export function VitrineVehicle() {
  const { slug = '', id } = useParams();
  const store = useLoad(() => api.get(`/public/${slug}/store`), [slug]);
  const { data: v, error } = useLoad(() => api.get(`/public/${slug}/vehicles/${id}`), [slug, id]);
  const [photo, setPhoto] = useState(0);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    <div style={{ minHeight: '100%' }}>
      <StoreHeader store={store.data} slug={slug} />
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
                <div style={{ fontSize: 28, fontWeight: 750, margin: '12px 0' }}>{money0(v.sale_price)}</div>
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
