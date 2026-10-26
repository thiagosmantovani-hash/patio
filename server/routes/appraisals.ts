import { Router } from 'express';
import type { DB } from '../db.ts';
import { tx } from '../db.ts';
import { APPRAISAL_CHECKLIST, appraisalSummary } from '../domain.ts';
import { HttpError, idParam, int, notFound, num, oneOf, str, today } from '../http.ts';
import { imageUploader, removeUpload } from '../uploads.ts';
import { readSettings } from './settings.ts';

const STATUSES = ['em_andamento', 'concluida', 'aprovada', 'recusada', 'convertida'] as const;
const CONDITIONS = ['ok', 'atencao', 'ruim', 'na'] as const;

interface AppraisalRow {
  id: number;
  brand: string;
  model: string;
  version: string | null;
  plate: string | null;
  year_model: number | null;
  km: number | null;
  color: string | null;
  market_price: number;
  margin_percent: number;
  offered_price: number | null;
  status: string;
  vehicle_id: number | null;
  [k: string]: unknown;
}

export function appraisalRoutes(db: DB, uploadDir: string) {
  const r = Router();
  const upload = imageUploader(uploadDir);

  const getAppraisal = (id: number) => {
    const a = db.prepare('SELECT * FROM appraisals WHERE id = ?').get(id) as AppraisalRow | undefined;
    if (!a) throw notFound('Avaliação');
    return a;
  };
  const itemsOf = (id: number) =>
    db.prepare('SELECT * FROM appraisal_items WHERE appraisal_id = ? ORDER BY id').all(id) as { repair_cost: number; condition: string }[];
  const summarize = (a: AppraisalRow) => {
    const items = itemsOf(a.id);
    return {
      ...appraisalSummary({ market_price: a.market_price, margin_percent: a.margin_percent, items }),
      issues: items.filter((i) => i.condition === 'atencao' || i.condition === 'ruim').length,
    };
  };

  r.get('/checklist', (_req, res) => res.json(APPRAISAL_CHECKLIST));

  r.get('/', (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
    const rows = db
      .prepare(
        `SELECT a.*, c.name AS customer_name, u.name AS appraiser_name FROM appraisals a
         LEFT JOIN customers c ON c.id = a.customer_id LEFT JOIN users u ON u.id = a.appraiser_id
         ${status ? 'WHERE a.status = ?' : ''} ORDER BY a.created_at DESC, a.id DESC`,
      )
      .all(...(status ? [status] : [])) as AppraisalRow[];
    res.json(rows.map((a) => ({ ...a, summary: summarize(a) })));
  });

  r.get('/:id', (req, res) => {
    const id = idParam(req);
    const a = db
      .prepare(
        `SELECT a.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS appraiser_name FROM appraisals a
         LEFT JOIN customers c ON c.id = a.customer_id LEFT JOIN users u ON u.id = a.appraiser_id WHERE a.id = ?`,
      )
      .get(id) as AppraisalRow | undefined;
    if (!a) throw notFound('Avaliação');
    res.json({
      ...a,
      items: itemsOf(id),
      photos: db.prepare('SELECT id, section, filename FROM appraisal_photos WHERE appraisal_id = ? ORDER BY id').all(id),
      summary: summarize(a),
    });
  });

  const headerFields = (body: Record<string, unknown>, defaultMargin: number) => {
    const plate = str(body, 'plate');
    return [
      int(body, 'customer_id'),
      plate ? plate.toUpperCase().replace(/[^A-Z0-9]/g, '') : null,
      str(body, 'brand', { required: true, label: 'marca' }),
      str(body, 'model', { required: true, label: 'modelo' }),
      str(body, 'version'),
      int(body, 'year_model', { min: 1900 }),
      int(body, 'km', { min: 0 }),
      str(body, 'color'),
      num(body, 'market_price', { min: 0 }) ?? 0,
      num(body, 'margin_percent', { min: 0 }) ?? defaultMargin,
      num(body, 'offered_price', { min: 0 }),
      str(body, 'notes'),
    ];
  };

  r.post('/', (req, res) => {
    const { default_margin } = readSettings(db);
    const id = tx(db, () => {
      const info = db
        .prepare(
          `INSERT INTO appraisals (customer_id, plate, brand, model, version, year_model, km, color, market_price,
            margin_percent, offered_price, notes, appraiser_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(...headerFields(req.body, default_margin), req.user!.id);
      const appraisalId = Number(info.lastInsertRowid);
      const ins = db.prepare('INSERT INTO appraisal_items (appraisal_id, section, item) VALUES (?, ?, ?)');
      for (const [section, items] of Object.entries(APPRAISAL_CHECKLIST)) items.forEach((item) => ins.run(appraisalId, section, item));
      return appraisalId;
    });
    res.status(201).json({ id });
  });

  r.put('/:id', (req, res) => {
    const a = getAppraisal(idParam(req));
    if (a.status === 'convertida') throw new HttpError(400, 'Avaliação já convertida em veículo do estoque.');
    db.prepare(
      `UPDATE appraisals SET customer_id = ?, plate = ?, brand = ?, model = ?, version = ?, year_model = ?, km = ?, color = ?,
        market_price = ?, margin_percent = ?, offered_price = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(...headerFields(req.body, a.margin_percent), a.id);
    res.json({ ok: true });
  });

  r.put('/:id/items', (req, res) => {
    const a = getAppraisal(idParam(req));
    if (a.status === 'convertida') throw new HttpError(400, 'Avaliação já convertida em veículo do estoque.');
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const upd = db.prepare('UPDATE appraisal_items SET condition = ?, repair_cost = ?, notes = ? WHERE id = ? AND appraisal_id = ?');
    tx(db, () => {
      for (const it of items) {
        upd.run(oneOf(it, 'condition', CONDITIONS, 'ok'), num(it, 'repair_cost', { min: 0 }) ?? 0, str(it, 'notes'), Number(it.id), a.id);
      }
      db.prepare("UPDATE appraisals SET updated_at = datetime('now') WHERE id = ?").run(a.id);
    });
    res.json({ items: itemsOf(a.id), summary: summarize(a) });
  });

  r.patch('/:id/status', (req, res) => {
    const a = getAppraisal(idParam(req));
    const status = oneOf(req.body, 'status', STATUSES);
    if (status === 'convertida' || a.status === 'convertida') throw new HttpError(400, 'Use "Enviar para estoque" para converter a avaliação.');
    db.prepare("UPDATE appraisals SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, a.id);
    res.json({ ok: true });
  });

  /** Converte a avaliação em veículo do estoque, levando os reparos como custos previstos. */
  r.post('/:id/convert', (req, res) => {
    const a = getAppraisal(idParam(req));
    if (a.status === 'convertida') throw new HttpError(400, 'Avaliação já convertida.');
    if (a.status === 'recusada') throw new HttpError(400, 'Avaliação recusada não pode ir para o estoque.');
    const summary = summarize(a);
    const purchase = num(req.body, 'purchase_price', { min: 0 }) ?? a.offered_price ?? summary.suggested_price;
    const vehicleId = tx(db, () => {
      const info = db
        .prepare(
          `INSERT INTO vehicles (plate, brand, model, version, year_model, year_fab, km, color, purchase_price, sale_price,
            fipe_price, purchase_date, supplier, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparacao')`,
        )
        .run(
          a.plate, a.brand, a.model, a.version, a.year_model, a.year_model, a.km ?? 0, a.color, purchase,
          a.market_price, a.market_price || null, today(), `Avaliação #${a.id}`,
        );
      const vid = Number(info.lastInsertRowid);
      const items = db
        .prepare("SELECT section, item, repair_cost, notes FROM appraisal_items WHERE appraisal_id = ? AND repair_cost > 0")
        .all(a.id) as { section: string; item: string; repair_cost: number; notes: string | null }[];
      const ins = db.prepare("INSERT INTO vehicle_costs (vehicle_id, description, category, estimated, date) VALUES (?, ?, ?, ?, ?)");
      for (const it of items) ins.run(vid, `${it.item}${it.notes ? ` — ${it.notes}` : ''}`, categoryFor(it.section), it.repair_cost, today());
      const photos = db.prepare('SELECT filename FROM appraisal_photos WHERE appraisal_id = ? ORDER BY id').all(a.id) as { filename: string }[];
      const insPhoto = db.prepare('INSERT INTO vehicle_photos (vehicle_id, filename, position) VALUES (?, ?, ?)');
      photos.forEach((p, i) => insPhoto.run(vid, p.filename, i));
      db.prepare("UPDATE appraisals SET status = 'convertida', vehicle_id = ?, offered_price = ?, updated_at = datetime('now') WHERE id = ?").run(vid, purchase, a.id);
      return vid;
    });
    res.status(201).json({ vehicle_id: vehicleId });
  });

  r.post('/:id/photos', upload.array('photos', 20), (req, res) => {
    const a = getAppraisal(idParam(req));
    const section = str(req.body, 'section') ?? 'Geral';
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new HttpError(400, 'Nenhuma foto enviada.');
    const ins = db.prepare('INSERT INTO appraisal_photos (appraisal_id, section, filename) VALUES (?, ?, ?)');
    tx(db, () => files.forEach((f) => ins.run(a.id, section, f.filename)));
    res.status(201).json(db.prepare('SELECT id, section, filename FROM appraisal_photos WHERE appraisal_id = ? ORDER BY id').all(a.id));
  });

  r.delete('/:id/photos/:photoId', (req, res) => {
    const a = getAppraisal(idParam(req));
    const photo = db.prepare('SELECT * FROM appraisal_photos WHERE id = ? AND appraisal_id = ?').get(idParam(req, 'photoId'), a.id) as
      | { id: number; filename: string }
      | undefined;
    if (!photo) throw notFound('Foto');
    db.prepare('DELETE FROM appraisal_photos WHERE id = ?').run(photo.id);
    // O arquivo pode ter sido levado para o veículo na conversão; só apaga se ninguém mais o usa.
    const inUse = db.prepare('SELECT 1 FROM vehicle_photos WHERE filename = ?').get(photo.filename);
    if (!inUse) removeUpload(uploadDir, photo.filename);
    res.json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    const a = getAppraisal(idParam(req));
    if (a.status === 'convertida') throw new HttpError(400, 'Avaliação convertida não pode ser excluída.');
    const photos = db.prepare('SELECT filename FROM appraisal_photos WHERE appraisal_id = ?').all(a.id) as { filename: string }[];
    db.prepare('DELETE FROM appraisals WHERE id = ?').run(a.id);
    photos.forEach((p) => removeUpload(uploadDir, p.filename));
    res.json({ ok: true });
  });

  return r;
}

function categoryFor(section: string): string {
  if (section === 'Motor e mecânica') return 'mecanica';
  if (section === 'Rodas e pneus') return 'pneus';
  if (section === 'Interior') return 'estetica';
  if (section === 'Documentação') return 'documentacao';
  return 'funilaria';
}
