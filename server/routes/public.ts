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
  galeria?: { img?: string }[];
  bloqueado?: unknown;
}

const preco = (v: Veh) => (Number(v.promo) > 0 ? Number(v.promo) : Number(v.venda) || 0);
const noSite = (v: Veh) => v.status === 'estoque' && v.pubs?.site !== false && !v.bloqueado && preco(v) > 0;

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

  /** Feed XML de estoque para portais/agregadores que importam por URL. */
  r.get('/feed.xml', (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    const L = cfg().loja ?? {};
    const dest = site();
    const items = vitrine()
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
  });

  return r;
}
