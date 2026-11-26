import { Router } from 'express';
import type { DB } from '../db.ts';
import { HttpError, str } from '../http.ts';
import { storeCollection, storeGet, storeInbox } from '../store.ts';

// Rotas sem login: vitrine da loja, formulário de interesse e feed XML para portais.
// Os dados vêm do sistema da loja: veículos em estoque marcados para o "Site da loja".

const escapeXml = (s: unknown) =>
  String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

interface Veh {
  id: number;
  status?: string;
  marca?: string;
  modelo?: string;
  versao?: string;
  anoFab?: number;
  anoMod?: number;
  cor?: string;
  combustivel?: string;
  cambio?: string;
  km?: number;
  portas?: number;
  venda?: number;
  promo?: number;
  descricao?: string;
  opcionais?: string[];
  pubs?: Record<string, boolean>;
  site?: { prioridade?: string; desc?: string };
  placa?: string;
  chassi?: string;
  tipo?: string;
  carroceria?: string;
  zeroKm?: boolean;
  entrada?: string;
  galeria?: { img?: string }[];
  bloqueado?: unknown;
}

const preco = (v: Veh) => (Number(v.promo) > 0 ? Number(v.promo) : Number(v.venda) || 0);
const noSite = (v: Veh) => v.status === 'estoque' && v.pubs?.site !== false && !v.bloqueado && preco(v) > 0;
/** Carro marcado para um canal (portal) e pronto para anunciar. */
const noCanal = (canal: string) => (v: Veh) => v.status === 'estoque' && v.pubs?.[canal] === true && !v.bloqueado && preco(v) > 0;
const CANAL_RE = /^[a-z0-9]{2,20}$/;

/** Guarda quando cada portal leu o feed (aparece no sistema como "lido pela última vez"). */
export function logFeedRead(db: DB, canal: string, ua: string, itens: number) {
  const k = `feedlog:${canal}`;
  const prev = db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined;
  let n = 0;
  try {
    n = Number(JSON.parse(prev?.value ?? '{}').n) || 0;
  } catch {}
  const v = JSON.stringify({ at: new Date().toISOString(), ua: ua.slice(0, 120), itens, n: n + 1 });
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
}

// Valores aceitos pelo catálogo automotivo da Meta (Facebook e Instagram).
const metaFuel = (f: unknown) => {
  const s = String(f ?? '').toLowerCase();
  if (/flex/.test(s)) return 'FLEX';
  if (/diesel/.test(s)) return 'DIESEL';
  if (/el[eé]tric/.test(s)) return 'ELECTRIC';
  if (/h[ií]brid/.test(s)) return 'HYBRID';
  if (/gasolina/.test(s)) return 'GASOLINE';
  return 'OTHER';
};
const metaBody = (c: unknown, tipo: unknown) => {
  const s = String(c ?? '').toLowerCase();
  if (/caminh/.test(String(tipo ?? '').toLowerCase())) return 'TRUCK';
  if (/hatch/.test(s)) return 'HATCHBACK';
  if (/sed/.test(s)) return 'SEDAN';
  if (/suv|utilit/.test(s)) return 'SUV';
  if (/picape|pick|caminhonete/.test(s)) return 'PICKUP';
  if (/perua|wagon|sw/.test(s)) return 'WAGON';
  if (/minivan|monovolume/.test(s)) return 'MINIVAN';
  if (/cup[eê]|coupe/.test(s)) return 'COUPE';
  if (/convers|cabrio/.test(s)) return 'CONVERTIBLE';
  if (/van|furg/.test(s)) return 'VAN';
  return 'OTHER';
};

export function publicRoutes(db: DB) {
  const r = Router();
  const cfg = () => storeGet<any>(db, 'v:cfg') ?? {};
  const site = () => storeGet<any[]>(db, 's:site:dest') ?? [];
  const shape = (v: Veh, dest: unknown[]) => ({
    id: v.id,
    brand: v.marca ?? '',
    model: v.modelo ?? '',
    version: v.versao ?? '',
    year_fab: v.anoFab ?? null,
    year_model: v.anoMod ?? null,
    color: v.cor ?? null,
    fuel: v.combustivel ?? null,
    transmission: v.cambio ?? null,
    km: v.km ?? null,
    doors: v.portas ?? null,
    sale_price: preco(v),
    description: v.site?.desc || v.descricao || '',
    features: Array.isArray(v.opcionais) ? v.opcionais : [],
    featured: dest.includes(v.id) || v.site?.prioridade === 'alta' ? 1 : 0,
    photos: (v.galeria ?? []).map((g) => g?.img).filter((u): u is string => typeof u === 'string' && u.startsWith('/uploads/')),
  });
  const vitrine = () => storeCollection<Veh>(db, 'veh').filter(noSite);

  r.get('/store', (_req, res) => {
    const L = cfg().loja ?? {};
    const ed = storeGet<Record<string, any>>(db, 's:site:ed') ?? {};
    const banners = (storeGet<any[]>(db, 's:site:banners') ?? []).filter((b) => b && b.ativo).map((b) => ({ title: String(b.titulo ?? ''), subtitle: String(b.sub ?? '') }));
    const testimonials = (storeGet<any[]>(db, 's:site:depo') ?? []).filter((d) => d && d.texto).map((d) => ({ name: String(d.nome ?? ''), text: String(d.texto ?? '') }));
    const txt = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.slice(0, 80)) : []);
    const block = (b: any) => ({ on: b?.on !== false, title: txt(b?.titulo, 120), text: txt(b?.texto, 400), button: txt(b?.botao, 60) });
    const color = /^#[0-9a-fA-F]{6}$/.test(ed.tema?.cor ?? '') ? ed.tema.cor : '#e8891a';
    // O site só muda para o público depois de "Publicar"; antes disso valem os dados da loja.
    const pub = Boolean(ed.publicado);
    res.json({
      store_name: (pub && txt(ed.logo, 80)) || L.fantasia || L.nome || '',
      phone: (pub && list(ed.telefones)[0]) || L.tel || '',
      whatsapp: (pub && txt(ed.whatsapp, 40)) || L.whatsapp || L.tel || '',
      email: L.email || '',
      address: L.endereco || '',
      city: L.cidade || '',
      about: (pub && txt(ed.sobre, 4000)) || L.sobre || '',
      site: pub
        ? {
            hours: txt(ed.horario, 160),
            menu: list(ed.menu),
            brands: list(ed.marcas),
            sell: block(ed.venda),
            finance: block(ed.financie),
            socials: Object.fromEntries(['instagram', 'facebook', 'youtube', 'tiktok'].map((k) => [k, /^https:\/\//.test(ed.redes?.[k] ?? '') ? txt(ed.redes[k], 200) : ''])),
            map: ed.mapa !== false,
            units: (Array.isArray(ed.unidades) ? ed.unidades : []).slice(0, 10).map((u: any) => ({ name: txt(u?.nome, 120), address: txt(u?.endereco, 200), phone: txt(u?.tel, 40), hours: txt(u?.horario, 160) })),
            seals: list(ed.selos),
            legal_name: txt(ed.razao, 160),
            cnpj: txt(ed.cnpj, 30),
            color,
            dark: ed.tema?.fundo !== 'claro',
            seo: { title: txt(ed.seo?.titulo, 70), description: txt(ed.seo?.descricao, 200) },
            banners,
            testimonials,
          }
        : null,
    });
  });

  /** Formulários do site: Venda seu carro (compra), Financie (financiamento) e SAC. Viram atendimento no CRM. */
  r.post('/contact', (req, res) => {
    const kind = str(req.body, 'kind', { required: true, label: 'tipo' })!;
    if (!['compra', 'financiamento', 'sac'].includes(kind)) throw new HttpError(400, 'Tipo de contato inválido.');
    const name = str(req.body, 'name', { required: true, label: 'nome' })!;
    const phone = str(req.body, 'phone');
    const email = str(req.body, 'email');
    if (!phone && !email) throw new HttpError(400, 'Informe telefone ou e-mail para contato.');
    const fields: [string, string][] = [
      ['brand', 'Marca'], ['model', 'Modelo'], ['year', 'Ano'], ['km', 'KM'], ['down_payment', 'Entrada'], ['installments', 'Parcelas'], ['vehicle', 'Veículo de interesse'],
    ];
    const extras = fields.map(([k, l]) => [l, str(req.body, k)] as const).filter(([, v]) => v).map(([l, v]) => `${l}: ${v}`);
    const message = str(req.body, 'message');
    const all = [name, phone, email, message, ...extras].join('');
    if (name.length > 120 || (phone?.length ?? 0) > 40 || (email?.length ?? 0) > 120 || (message?.length ?? 0) > 2000 || all.length > 3000) throw new HttpError(400, 'Dados muito longos.');
    storeInbox(db, { nome: name, tel: phone, email, msg: [message, ...extras].filter(Boolean).join(' · '), form: kind });
    res.status(201).json({ ok: true });
  });

  r.get('/vehicles', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const dest = site();
    const rows = vitrine()
      .filter((v) => !q || `${v.marca} ${v.modelo} ${v.versao ?? ''}`.toLowerCase().includes(q))
      .map((v) => shape(v, dest))
      .sort((a, b) => b.featured - a.featured || b.id - a.id);
    res.json(rows);
  });

  r.get('/vehicles/:id', (req, res) => {
    const v = storeGet<Veh>(db, `m:veh:${Number(req.params.id) || 0}`);
    if (!v || !noSite(v)) throw new HttpError(404, 'Veículo não encontrado.');
    res.json(shape(v, site()));
  });

  r.post('/vehicles/:id/interest', (req, res) => {
    const v = storeGet<Veh>(db, `m:veh:${Number(req.params.id) || 0}`);
    if (!v || !noSite(v)) throw new HttpError(404, 'Veículo não encontrado.');
    const name = str(req.body, 'name', { required: true, label: 'nome' })!;
    const phone = str(req.body, 'phone');
    const email = str(req.body, 'email');
    if (!phone && !email) throw new HttpError(400, 'Informe telefone ou e-mail para contato.');
    const message = str(req.body, 'message');
    if (name.length > 120 || (message?.length ?? 0) > 2000 || (phone?.length ?? 0) > 40 || (email?.length ?? 0) > 120) throw new HttpError(400, 'Dados muito longos.');
    storeInbox(db, { nome: name, tel: phone, email, msg: message, vid: v.id, form: 'interesse' });
    res.status(201).json({ ok: true });
  });

  /** Feed XML de estoque para portais/agregadores que importam por URL.
   *  /feed.xml: carros do site da loja. /feed/<portal>.xml: só os carros marcados para aquele portal. */
  const feed = (req: any, res: any, canal: string) => {
    const base = `${req.protocol}://${req.get('host')}`;
    const L = cfg().loja ?? {};
    const dest = site();
    const lista = canal === 'site' ? vitrine() : storeCollection<Veh>(db, 'veh').filter(noCanal(canal));
    logFeedRead(db, canal, String(req.get('user-agent') ?? ''), lista.length);
    const items = lista
      .map((row) => {
        const v = shape(row, dest);
        return `  <veiculo>
    <id>${v.id}</id>
    <marca>${escapeXml(v.brand)}</marca>
    <modelo>${escapeXml(v.model)}</modelo>
    <versao>${escapeXml(v.version)}</versao>
    <ano_fabricacao>${escapeXml(v.year_fab)}</ano_fabricacao>
    <ano_modelo>${escapeXml(v.year_model)}</ano_modelo>
    <cor>${escapeXml(v.color)}</cor>
    <combustivel>${escapeXml(v.fuel)}</combustivel>
    <cambio>${escapeXml(v.transmission)}</cambio>
    <km>${escapeXml(v.km)}</km>
    <portas>${escapeXml(v.doors)}</portas>
    <preco>${Number(v.sale_price).toFixed(2)}</preco>
    <descricao>${escapeXml(v.description)}</descricao>
    <opcionais>${v.features.map((f) => `<opcional>${escapeXml(f)}</opcional>`).join('')}</opcionais>
    <fotos>${v.photos.map((p) => `<foto>${escapeXml(base + p)}</foto>`).join('')}</fotos>
  </veiculo>`;
      })
      .join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<estoque loja="${escapeXml(L.fantasia || L.nome || '')}" gerado_em="${new Date().toISOString()}">
${items}
</estoque>
`);
  };
  r.get('/feed.xml', (req, res) => feed(req, res, 'site'));
  r.get('/feed/:canal.xml', (req, res) => {
    const canal = String(req.params.canal);
    if (!CANAL_RE.test(canal)) throw new HttpError(404, 'Feed não encontrado.');
    feed(req, res, canal);
  });

  /** Catálogo de veículos para a Meta (anúncios de estoque no Facebook e no Instagram).
   *  Formato XML de "Automotive Inventory Ads"; entram os carros marcados para "Facebook e Instagram". */
  r.get('/meta.xml', (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    const slug = String(req.baseUrl.split('/').pop() ?? '');
    const L = cfg().loja ?? {};
    const [cidade, uf] = String(L.cidade ?? '').split(/\s*[-/]\s*(?=[A-Za-z]{2}$)/);
    const lista = storeCollection<Veh>(db, 'veh').filter(noCanal('facebook'));
    logFeedRead(db, 'facebook', String(req.get('user-agent') ?? ''), lista.length);
    const x = escapeXml;
    const items = lista
      .map((v) => {
        const fotos = (v.galeria ?? []).map((g) => g?.img).filter((u): u is string => typeof u === 'string' && u.startsWith('/uploads/'));
        const titulo = `${v.marca ?? ''} ${v.modelo ?? ''} ${v.versao ?? ''} ${v.anoMod ?? ''}`.replace(/\s+/g, ' ').trim();
        const promo = Number(v.promo) > 0 && Number(v.promo) < Number(v.venda);
        return `  <listing>
    <vehicle_id>${v.id}</vehicle_id>
    <title>${x(titulo)}</title>
    <description>${x((v.site?.desc || v.descricao || titulo).slice(0, 5000))}</description>
    <url>${x(`${base}/v/${slug}/${v.id}`)}</url>
    <make>${x(v.marca)}</make>
    <model>${x(v.modelo)}</model>
    <year>${x(v.anoMod)}</year>
    <mileage><unit>KM</unit><value>${Number(v.km) || 0}</value></mileage>
${fotos.slice(0, 20).map((p) => `    <image><url>${x(base + p)}</url></image>`).join('\n')}
    <transmission>${/aut|cvt/i.test(String(v.cambio ?? '')) ? 'AUTOMATIC' : 'MANUAL'}</transmission>
    <fuel_type>${metaFuel(v.combustivel)}</fuel_type>
    <body_style>${metaBody(v.carroceria, v.tipo)}</body_style>
    <drivetrain>OTHER</drivetrain>
    <condition>${v.zeroKm ? 'EXCELLENT' : 'GOOD'}</condition>
    <state_of_vehicle>${v.zeroKm ? 'NEW' : 'USED'}</state_of_vehicle>
    <price>${Number(v.venda) || preco(v)} BRL</price>
${promo ? `    <sale_price>${Number(v.promo)} BRL</sale_price>\n` : ''}    <exterior_color>${x(v.cor)}</exterior_color>
${v.chassi ? `    <vin>${x(v.chassi)}</vin>\n` : ''}${v.placa ? `    <vehicle_registration_plate>${x(v.placa)}</vehicle_registration_plate>\n` : ''}    <availability>AVAILABLE</availability>
${v.entrada ? `    <date_first_on_lot>${x(v.entrada)}</date_first_on_lot>\n` : ''}    <address format="simple">
      <component name="addr1">${x(L.endereco)}</component>
      <component name="city">${x((cidade ?? '').trim())}</component>
      <component name="region">${x((uf ?? '').trim())}</component>
      <component name="postal_code">${x(L.cep ?? '')}</component>
      <component name="country">BR</component>
    </address>
  </listing>`;
      })
      .join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<listings>
  <title>${x(L.fantasia || L.nome || 'Estoque')}</title>
${items}
</listings>
`);
  });

  return r;
}
