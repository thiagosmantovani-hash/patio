import { Router } from 'express';
import type { DB } from '../db.ts';
import { tx } from '../db.ts';
import { HttpError, idParam, notFound, str } from '../http.ts';
import { readSettings } from './settings.ts';

// Rotas sem login: vitrine da loja, formulário de interesse e feed XML para integração com portais.

const PUBLIC_FIELDS = `id, brand, model, version, year_fab, year_model, color, fuel, transmission, km, doors, sale_price,
  description, features, featured`;

const escapeXml = (s: unknown) =>
  String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function publicRoutes(db: DB) {
  const r = Router();
  const photosOf = db.prepare('SELECT filename FROM vehicle_photos WHERE vehicle_id = ? ORDER BY position, id');
  const shape = (v: Record<string, unknown>) => ({
    ...v,
    features: JSON.parse(String(v.features)),
    photos: (photosOf.all(v.id as number) as { filename: string }[]).map((p) => `/uploads/${p.filename}`),
  });

  r.get('/store', (_req, res) => {
    const s = readSettings(db);
    res.json({ store_name: s.store_name, phone: s.phone, whatsapp: s.whatsapp, email: s.email, address: s.address, city: s.city, about: s.about });
  });

  r.get('/vehicles', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = db
      .prepare(
        `SELECT ${PUBLIC_FIELDS} FROM vehicles WHERE status IN ('disponivel','reservado')
         ${q ? "AND (brand || ' ' || model || ' ' || IFNULL(version,'')) LIKE ?" : ''}
         ORDER BY featured DESC, created_at DESC`,
      )
      .all(...(q ? [`%${q}%`] : [])) as Record<string, unknown>[];
    res.json(rows.map(shape));
  });

  r.get('/vehicles/:id', (req, res) => {
    const v = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM vehicles WHERE id = ? AND status IN ('disponivel','reservado')`).get(idParam(req)) as
      | Record<string, unknown>
      | undefined;
    if (!v) throw notFound('Veículo');
    res.json(shape(v));
  });

  r.post('/vehicles/:id/interest', (req, res) => {
    const vehicleId = idParam(req);
    const v = db.prepare("SELECT id, brand, model FROM vehicles WHERE id = ? AND status IN ('disponivel','reservado')").get(vehicleId) as
      | { id: number; brand: string; model: string }
      | undefined;
    if (!v) throw notFound('Veículo');
    const name = str(req.body, 'name', { required: true, label: 'nome' })!;
    const phone = str(req.body, 'phone');
    const email = str(req.body, 'email');
    if (!phone && !email) throw new HttpError(400, 'Informe telefone ou e-mail para contato.');
    const message = str(req.body, 'message');
    if (name.length > 120 || (message?.length ?? 0) > 2000) throw new HttpError(400, 'Mensagem muito longa.');

    tx(db, () => {
      // Reaproveita o cliente se o telefone ou e-mail já estiver cadastrado.
      const existing = db
        .prepare('SELECT id FROM customers WHERE (? IS NOT NULL AND phone = ?) OR (? IS NOT NULL AND email = ?) LIMIT 1')
        .get(phone, phone, email, email) as { id: number } | undefined;
      const customerId =
        existing?.id ??
        Number(db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)').run(name, phone, email).lastInsertRowid);
      const lead = db
        .prepare("INSERT INTO leads (customer_id, vehicle_id, source, stage, notes) VALUES (?, ?, 'site', 'novo', ?)")
        .run(customerId, v.id, message);
      db.prepare("INSERT INTO lead_activities (lead_id, type, description) VALUES (?, 'etapa', ?)").run(
        lead.lastInsertRowid, `Interesse enviado pela vitrine em ${v.brand} ${v.model}`,
      );
    });
    res.status(201).json({ ok: true });
  });

  /** Feed XML de estoque para portais/agregadores que importam por URL. */
  r.get('/feed.xml', (req, res) => {
    const base = `${req.protocol}://${req.get('host')}`;
    const s = readSettings(db);
    const rows = db.prepare(`SELECT ${PUBLIC_FIELDS}, plate FROM vehicles WHERE status = 'disponivel' ORDER BY id`).all() as Record<string, unknown>[];
    const items = rows
      .map((row) => {
        const v = shape(row);
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
    <opcionais>${(v.features as string[]).map((f) => `<opcional>${escapeXml(f)}</opcional>`).join('')}</opcionais>
    <fotos>${v.photos.map((p) => `<foto>${escapeXml(base + p)}</foto>`).join('')}</fotos>
  </veiculo>`;
      })
      .join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<estoque loja="${escapeXml(s.store_name)}" gerado_em="${new Date().toISOString()}">
${items}
</estoque>
`);
  });

  return r;
}
