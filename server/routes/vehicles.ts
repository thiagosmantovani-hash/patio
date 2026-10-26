import { Router } from 'express';
import type { DB } from '../db.ts';
import { tx } from '../db.ts';
import { requireRole } from '../auth.ts';
import { COST_CATEGORIES, daysInStock, preparationTotals, vehicleProfit, VEHICLE_STATUSES } from '../domain.ts';
import { HttpError, idParam, int, notFound, num, oneOf, str, today } from '../http.ts';
import { imageUploader, removeUpload } from '../uploads.ts';

const LISTING_STATUSES = ['pendente', 'publicado', 'pausado', 'removido'] as const;

export interface VehicleRow {
  id: number;
  plate: string | null;
  brand: string;
  model: string;
  version: string | null;
  year_fab: number | null;
  year_model: number | null;
  status: string;
  purchase_price: number;
  sale_price: number;
  purchase_date: string | null;
  sold_at: string | null;
  created_at: string;
  features: string;
  [k: string]: unknown;
}

function vehicleFields(body: Record<string, unknown>) {
  const features = Array.isArray(body.features) ? body.features.map((f) => String(f).trim()).filter(Boolean) : [];
  const plate = str(body, 'plate');
  return {
    plate: plate ? plate.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
    brand: str(body, 'brand', { required: true, label: 'marca' }),
    model: str(body, 'model', { required: true, label: 'modelo' }),
    version: str(body, 'version'),
    year_fab: int(body, 'year_fab', { min: 1900 }),
    year_model: int(body, 'year_model', { min: 1900 }),
    color: str(body, 'color'),
    fuel: str(body, 'fuel'),
    transmission: str(body, 'transmission'),
    km: int(body, 'km', { min: 0 }) ?? 0,
    doors: int(body, 'doors', { min: 0 }),
    chassis: str(body, 'chassis'),
    renavam: str(body, 'renavam'),
    purchase_price: num(body, 'purchase_price', { min: 0 }) ?? 0,
    sale_price: num(body, 'sale_price', { min: 0 }) ?? 0,
    fipe_price: num(body, 'fipe_price', { min: 0 }),
    purchase_date: str(body, 'purchase_date'),
    supplier: str(body, 'supplier'),
    description: str(body, 'description'),
    features: JSON.stringify(features),
    featured: body.featured ? 1 : 0,
  };
}

export function withComputed(db: DB, v: VehicleRow) {
  const costs = db.prepare('SELECT estimated, actual FROM vehicle_costs WHERE vehicle_id = ?').all(v.id) as { estimated: number; actual: number | null }[];
  const prep = preparationTotals(costs);
  const sale = db.prepare("SELECT sale_price, commission FROM sales WHERE vehicle_id = ? AND status = 'concluida'").get(v.id) as
    | { sale_price: number; commission: number }
    | undefined;
  const photo = db.prepare('SELECT filename FROM vehicle_photos WHERE vehicle_id = ? ORDER BY position, id LIMIT 1').get(v.id) as
    | { filename: string }
    | undefined;
  const profit = vehicleProfit({
    purchase_price: v.purchase_price,
    sale_price: sale?.sale_price ?? v.sale_price,
    preparation: prep.effective,
    commission: sale?.commission ?? 0,
  });
  return {
    ...v,
    features: JSON.parse(v.features) as string[],
    cover: photo ? `/uploads/${photo.filename}` : null,
    preparation: prep,
    days_in_stock: daysInStock(v.purchase_date ?? v.created_at, v.sold_at),
    profit: { ...profit, realized: Boolean(sale) },
  };
}

export function vehicleRoutes(db: DB, uploadDir: string) {
  const r = Router();
  const upload = imageUploader(uploadDir);
  const getVehicle = (id: number) => {
    const v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id) as VehicleRow | undefined;
    if (!v) throw notFound('Veículo');
    return v;
  };

  r.get('/', (req, res) => {
    const where: string[] = [];
    const params: (string | number)[] = [];
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      where.push("(brand || ' ' || model || ' ' || IFNULL(version,'') || ' ' || IFNULL(plate,'')) LIKE ?");
      params.push(`%${q}%`);
    }
    const status = req.query.status;
    if (typeof status === 'string' && status) {
      if (status === 'estoque') where.push("status != 'vendido'");
      else {
        where.push('status = ?');
        params.push(status);
      }
    }
    const sql = `SELECT * FROM vehicles ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC`;
    const rows = db.prepare(sql).all(...params) as VehicleRow[];
    res.json(rows.map((v) => withComputed(db, v)));
  });

  r.get('/:id', (req, res) => {
    const v = getVehicle(idParam(req));
    res.json({
      ...withComputed(db, v),
      photos: db.prepare('SELECT id, filename, position FROM vehicle_photos WHERE vehicle_id = ? ORDER BY position, id').all(v.id),
      costs: db.prepare('SELECT * FROM vehicle_costs WHERE vehicle_id = ? ORDER BY date, id').all(v.id),
      listings: db.prepare('SELECT * FROM listings WHERE vehicle_id = ? ORDER BY channel').all(v.id),
      sale: db
        .prepare(
          `SELECT s.*, c.name AS customer_name, u.name AS seller_name FROM sales s
           JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.seller_id
           WHERE s.vehicle_id = ? AND s.status = 'concluida'`,
        )
        .get(v.id) ?? null,
      leads: db
        .prepare(
          `SELECT l.id, l.stage, l.source, l.created_at, c.name AS customer_name FROM leads l
           JOIN customers c ON c.id = l.customer_id WHERE l.vehicle_id = ? ORDER BY l.created_at DESC`,
        )
        .all(v.id),
    });
  });

  r.post('/', (req, res) => {
    const f = vehicleFields(req.body);
    const status = oneOf(req.body, 'status', VEHICLE_STATUSES, 'preparacao');
    if (status === 'vendido') throw new HttpError(400, 'Para marcar como vendido, registre uma venda.');
    const info = db
      .prepare(
        `INSERT INTO vehicles (plate, brand, model, version, year_fab, year_model, color, fuel, transmission, km, doors,
          chassis, renavam, purchase_price, sale_price, fipe_price, purchase_date, supplier, description, features, featured, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(...Object.values({ ...f, purchase_date: f.purchase_date ?? today() }), status);
    res.status(201).json(withComputed(db, getVehicle(Number(info.lastInsertRowid))));
  });

  r.put('/:id', (req, res) => {
    const v = getVehicle(idParam(req));
    const f = vehicleFields(req.body);
    db.prepare(
      `UPDATE vehicles SET plate = ?, brand = ?, model = ?, version = ?, year_fab = ?, year_model = ?, color = ?, fuel = ?,
        transmission = ?, km = ?, doors = ?, chassis = ?, renavam = ?, purchase_price = ?, sale_price = ?, fipe_price = ?,
        purchase_date = ?, supplier = ?, description = ?, features = ?, featured = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(...Object.values(f), v.id);
    res.json(withComputed(db, getVehicle(v.id)));
  });

  r.patch('/:id/status', (req, res) => {
    const v = getVehicle(idParam(req));
    const status = oneOf(req.body, 'status', VEHICLE_STATUSES);
    if (status === 'vendido' || v.status === 'vendido') {
      throw new HttpError(400, 'A situação "vendido" é controlada pelo módulo de vendas.');
    }
    db.prepare("UPDATE vehicles SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, v.id);
    res.json(withComputed(db, getVehicle(v.id)));
  });

  r.delete('/:id', requireRole('admin', 'gerente'), (req, res) => {
    const v = getVehicle(idParam(req));
    const hasSale = db.prepare('SELECT 1 FROM sales WHERE vehicle_id = ? OR trade_in_vehicle_id = ?').get(v.id, v.id);
    if (hasSale) throw new HttpError(400, 'Veículo possui vendas registradas e não pode ser excluído.');
    const photos = db.prepare('SELECT filename FROM vehicle_photos WHERE vehicle_id = ?').all(v.id) as { filename: string }[];
    db.prepare('DELETE FROM vehicles WHERE id = ?').run(v.id);
    photos.forEach((p) => removeUpload(uploadDir, p.filename));
    res.json({ ok: true });
  });

  // Fotos
  r.post('/:id/photos', upload.array('photos', 20), (req, res) => {
    const v = getVehicle(idParam(req));
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new HttpError(400, 'Nenhuma foto enviada.');
    const { maxPos } = db.prepare('SELECT IFNULL(MAX(position), -1) AS maxPos FROM vehicle_photos WHERE vehicle_id = ?').get(v.id) as { maxPos: number };
    const ins = db.prepare('INSERT INTO vehicle_photos (vehicle_id, filename, position) VALUES (?, ?, ?)');
    tx(db, () => files.forEach((f, i) => ins.run(v.id, f.filename, maxPos + 1 + i)));
    res.status(201).json(db.prepare('SELECT id, filename, position FROM vehicle_photos WHERE vehicle_id = ? ORDER BY position, id').all(v.id));
  });

  r.put('/:id/photos/order', (req, res) => {
    const v = getVehicle(idParam(req));
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
    const upd = db.prepare('UPDATE vehicle_photos SET position = ? WHERE id = ? AND vehicle_id = ?');
    tx(db, () => ids.forEach((pid: number, i: number) => upd.run(i, pid, v.id)));
    res.json(db.prepare('SELECT id, filename, position FROM vehicle_photos WHERE vehicle_id = ? ORDER BY position, id').all(v.id));
  });

  r.delete('/:id/photos/:photoId', (req, res) => {
    const v = getVehicle(idParam(req));
    const photo = db.prepare('SELECT * FROM vehicle_photos WHERE id = ? AND vehicle_id = ?').get(idParam(req, 'photoId'), v.id) as
      | { id: number; filename: string }
      | undefined;
    if (!photo) throw notFound('Foto');
    db.prepare('DELETE FROM vehicle_photos WHERE id = ?').run(photo.id);
    removeUpload(uploadDir, photo.filename);
    res.json({ ok: true });
  });

  // Custos de preparação
  const costFields = (body: Record<string, unknown>) => [
    str(body, 'description', { required: true, label: 'descrição' }),
    oneOf(body, 'category', COST_CATEGORIES, 'outros'),
    num(body, 'estimated', { min: 0 }) ?? 0,
    num(body, 'actual', { min: 0 }),
    str(body, 'date') ?? today(),
  ];

  r.post('/:id/costs', (req, res) => {
    const v = getVehicle(idParam(req));
    const info = db
      .prepare('INSERT INTO vehicle_costs (description, category, estimated, actual, date, vehicle_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(...costFields(req.body), v.id);
    res.status(201).json(db.prepare('SELECT * FROM vehicle_costs WHERE id = ?').get(info.lastInsertRowid));
  });

  r.put('/:id/costs/:costId', (req, res) => {
    const v = getVehicle(idParam(req));
    const info = db
      .prepare('UPDATE vehicle_costs SET description = ?, category = ?, estimated = ?, actual = ?, date = ? WHERE id = ? AND vehicle_id = ?')
      .run(...costFields(req.body), idParam(req, 'costId'), v.id);
    if (!info.changes) throw notFound('Custo');
    res.json(db.prepare('SELECT * FROM vehicle_costs WHERE id = ?').get(idParam(req, 'costId')));
  });

  r.delete('/:id/costs/:costId', (req, res) => {
    const v = getVehicle(idParam(req));
    db.prepare('DELETE FROM vehicle_costs WHERE id = ? AND vehicle_id = ?').run(idParam(req, 'costId'), v.id);
    res.json({ ok: true });
  });

  // Anúncios por canal
  r.put('/:id/listings/:channel', (req, res) => {
    const v = getVehicle(idParam(req));
    const channel = String(req.params.channel).trim();
    if (!channel) throw new HttpError(400, 'Canal inválido.');
    const status = oneOf(req.body, 'status', LISTING_STATUSES, 'pendente');
    db.prepare(
      `INSERT INTO listings (vehicle_id, channel, status, external_url, price, views, contacts, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'publicado' THEN datetime('now') END)
       ON CONFLICT (vehicle_id, channel) DO UPDATE SET
         status = excluded.status, external_url = excluded.external_url, price = excluded.price,
         views = excluded.views, contacts = excluded.contacts,
         published_at = CASE WHEN excluded.status = 'publicado' THEN IFNULL(listings.published_at, datetime('now')) ELSE listings.published_at END,
         updated_at = datetime('now')`,
    ).run(
      v.id,
      channel,
      status,
      str(req.body, 'external_url'),
      num(req.body, 'price', { min: 0 }),
      int(req.body, 'views', { min: 0 }) ?? 0,
      int(req.body, 'contacts', { min: 0 }) ?? 0,
      status,
    );
    res.json(db.prepare('SELECT * FROM listings WHERE vehicle_id = ? AND channel = ?').get(v.id, channel));
  });

  /** Publica (marca como pendente/publicado) o veículo em vários canais de uma vez. */
  r.post('/:id/listings/bulk', (req, res) => {
    const v = getVehicle(idParam(req));
    if (v.status === 'vendido') throw new HttpError(400, 'Veículo vendido não pode ser anunciado.');
    const channels: string[] = Array.isArray(req.body.channels) ? req.body.channels.map(String) : [];
    const status = oneOf(req.body, 'status', LISTING_STATUSES, 'publicado');
    const up = db.prepare(
      `INSERT INTO listings (vehicle_id, channel, status, published_at) VALUES (?, ?, ?, CASE WHEN ? = 'publicado' THEN datetime('now') END)
       ON CONFLICT (vehicle_id, channel) DO UPDATE SET status = excluded.status,
         published_at = CASE WHEN excluded.status = 'publicado' THEN IFNULL(listings.published_at, datetime('now')) ELSE listings.published_at END,
         updated_at = datetime('now')`,
    );
    tx(db, () => channels.forEach((c) => up.run(v.id, c, status, status)));
    res.json(db.prepare('SELECT * FROM listings WHERE vehicle_id = ? ORDER BY channel').all(v.id));
  });

  return r;
}
