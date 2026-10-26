import { Router } from 'express';
import type { DB } from '../db.ts';
import { requireRole } from '../auth.ts';
import { idParam, int, notFound, num, oneOf, str, today } from '../http.ts';

const TYPES = ['receita', 'despesa'] as const;
export const TRANSACTION_CATEGORIES = [
  'venda_veiculo', 'financiamento', 'compra_veiculo', 'preparacao', 'comissao', 'aluguel', 'salarios', 'marketing',
  'impostos', 'documentacao', 'servicos', 'outros',
];

export function financeRoutes(db: DB) {
  const r = Router();
  r.use(requireRole('admin', 'gerente'));

  r.get('/', (req, res) => {
    const where: string[] = [];
    const params: string[] = [];
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (from) { where.push('t.due_date >= ?'); params.push(from); }
    if (to) { where.push('t.due_date <= ?'); params.push(to); }
    if (req.query.type === 'receita' || req.query.type === 'despesa') { where.push('t.type = ?'); params.push(req.query.type); }
    if (req.query.status === 'pago') where.push('t.paid_at IS NOT NULL');
    if (req.query.status === 'aberto') where.push('t.paid_at IS NULL');
    if (req.query.status === 'vencido') { where.push('t.paid_at IS NULL AND t.due_date < ?'); params.push(today()); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT t.*, v.brand AS vehicle_brand, v.model AS vehicle_model FROM transactions t
         LEFT JOIN vehicles v ON v.id = t.vehicle_id ${clause} ORDER BY t.due_date DESC, t.id DESC`,
      )
      .all(...params);
    const totals = db
      .prepare(
        `SELECT
           IFNULL(SUM(CASE WHEN type='receita' AND paid_at IS NOT NULL THEN amount END),0) AS received,
           IFNULL(SUM(CASE WHEN type='despesa' AND paid_at IS NOT NULL THEN amount END),0) AS paid,
           IFNULL(SUM(CASE WHEN type='receita' AND paid_at IS NULL THEN amount END),0) AS to_receive,
           IFNULL(SUM(CASE WHEN type='despesa' AND paid_at IS NULL THEN amount END),0) AS to_pay
         FROM transactions t ${clause}`,
      )
      .get(...params);
    res.json({ rows, totals, categories: TRANSACTION_CATEGORIES });
  });

  const fields = (body: Record<string, unknown>) => [
    oneOf(body, 'type', TYPES),
    str(body, 'category') ?? 'outros',
    str(body, 'description', { required: true, label: 'descrição' }),
    num(body, 'amount', { required: true, label: 'valor', min: 0.01 }),
    str(body, 'due_date') ?? today(),
    str(body, 'paid_at'),
    int(body, 'vehicle_id'),
  ];

  r.post('/', (req, res) => {
    const info = db
      .prepare('INSERT INTO transactions (type, category, description, amount, due_date, paid_at, vehicle_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(...fields(req.body));
    res.status(201).json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid));
  });

  r.put('/:id', (req, res) => {
    const id = idParam(req);
    const info = db
      .prepare('UPDATE transactions SET type = ?, category = ?, description = ?, amount = ?, due_date = ?, paid_at = ?, vehicle_id = ? WHERE id = ?')
      .run(...fields(req.body), id);
    if (!info.changes) throw notFound('Lançamento');
    res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id));
  });

  r.patch('/:id/pay', (req, res) => {
    const id = idParam(req);
    const paid = req.body.paid !== false;
    const info = db.prepare('UPDATE transactions SET paid_at = ? WHERE id = ?').run(paid ? str(req.body, 'paid_at') ?? today() : null, id);
    if (!info.changes) throw notFound('Lançamento');
    res.json(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id));
  });

  r.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM transactions WHERE id = ? AND sale_id IS NULL').run(idParam(req));
    res.json({ ok: true });
  });

  return r;
}
