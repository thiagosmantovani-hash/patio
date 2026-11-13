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
    res.json({ store_name: L.fantasia || L.nome || '', phone: L.tel || '', whatsapp: L.whatsapp || L.tel || '', email: L.email || '', address: L.endereco || '', city: L.cidade || '', about: L.sobre || '' });
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
    storeInbox(db, { nome: name, tel: phone, email, msg: message, vid: v.id });
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
