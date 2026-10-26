import { Router } from 'express';
import type { DB } from '../db.ts';
import { requireRole } from '../auth.ts';
import { HttpError, idParam, notFound, str } from '../http.ts';

export function customerFields(body: Record<string, unknown>) {
  return [
    str(body, 'name', { required: true, label: 'nome' }),
    str(body, 'document'),
    str(body, 'phone'),
    str(body, 'email'),
    str(body, 'birth_date'),
    str(body, 'address'),
    str(body, 'city'),
    str(body, 'state'),
    str(body, 'notes'),
  ];
}

export function insertCustomer(db: DB, body: Record<string, unknown>): number {
  const info = db
    .prepare('INSERT INTO customers (name, document, phone, email, birth_date, address, city, state, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(...customerFields(body));
  return Number(info.lastInsertRowid);
}

export function customerRoutes(db: DB) {
  const r = Router();

  r.get('/', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = db
      .prepare(
        `SELECT c.*,
           (SELECT COUNT(*) FROM sales s WHERE s.customer_id = c.id AND s.status = 'concluida') AS purchases,
           (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.id AND l.stage NOT IN ('ganho','perdido')) AS open_leads
         FROM customers c
         ${q ? "WHERE c.name LIKE ? OR IFNULL(c.phone,'') LIKE ? OR IFNULL(c.email,'') LIKE ? OR IFNULL(c.document,'') LIKE ?" : ''}
         ORDER BY c.name LIMIT 500`,
      )
      .all(...(q ? Array(4).fill(`%${q}%`) : []));
    res.json(rows);
  });

  r.get('/:id', (req, res) => {
    const id = idParam(req);
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!c) throw notFound('Cliente');
    res.json({
      ...c,
      sales: db
        .prepare(
          `SELECT s.id, s.sale_date, s.sale_price, s.status, v.brand, v.model, v.year_model FROM sales s
           JOIN vehicles v ON v.id = s.vehicle_id WHERE s.customer_id = ? ORDER BY s.sale_date DESC`,
        )
        .all(id),
      leads: db
        .prepare(
          `SELECT l.id, l.stage, l.source, l.created_at, v.brand, v.model FROM leads l
           LEFT JOIN vehicles v ON v.id = l.vehicle_id WHERE l.customer_id = ? ORDER BY l.created_at DESC`,
        )
        .all(id),
      appraisals: db
        .prepare('SELECT id, brand, model, year_model, status, created_at FROM appraisals WHERE customer_id = ? ORDER BY created_at DESC')
        .all(id),
    });
  });

  r.post('/', (req, res) => {
    const id = insertCustomer(db, req.body);
    res.status(201).json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
  });

  r.put('/:id', (req, res) => {
    const id = idParam(req);
    const info = db
      .prepare('UPDATE customers SET name = ?, document = ?, phone = ?, email = ?, birth_date = ?, address = ?, city = ?, state = ?, notes = ? WHERE id = ?')
      .run(...customerFields(req.body), id);
    if (!info.changes) throw notFound('Cliente');
    res.json(db.prepare('SELECT * FROM customers WHERE id = ?').get(id));
  });

  r.delete('/:id', requireRole('admin', 'gerente'), (req, res) => {
    const id = idParam(req);
    if (db.prepare('SELECT 1 FROM sales WHERE customer_id = ?').get(id)) {
      throw new HttpError(400, 'Cliente possui vendas registradas e não pode ser excluído.');
    }
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  return r;
}
