import { Router } from 'express';
import type { DB } from '../db.ts';
import { tx } from '../db.ts';
import { requireRole } from '../auth.ts';
import { PAYMENT_METHODS, round2, validateSalePayment } from '../domain.ts';
import { HttpError, idParam, int, notFound, num, oneOf, str, today } from '../http.ts';
import { insertCustomer } from './customers.ts';

const SALE_SELECT = `
  SELECT s.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS seller_name,
    v.brand, v.model, v.version, v.year_model, v.plate, v.purchase_price,
    tv.brand AS trade_in_brand, tv.model AS trade_in_model
  FROM sales s
  JOIN customers c ON c.id = s.customer_id
  JOIN vehicles v ON v.id = s.vehicle_id
  LEFT JOIN users u ON u.id = s.seller_id
  LEFT JOIN vehicles tv ON tv.id = s.trade_in_vehicle_id`;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function saleRoutes(db: DB) {
  const r = Router();
  const getSale = (id: number) => {
    const s = db.prepare(`${SALE_SELECT} WHERE s.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!s) throw notFound('Venda');
    return s;
  };

  r.get('/', (req, res) => {
    const where: string[] = [];
    const params: string[] = [];
    if (typeof req.query.from === 'string' && req.query.from) {
      where.push('s.sale_date >= ?');
      params.push(req.query.from);
    }
    if (typeof req.query.to === 'string' && req.query.to) {
      where.push('s.sale_date <= ?');
      params.push(req.query.to);
    }
    res.json(db.prepare(`${SALE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.sale_date DESC, s.id DESC`).all(...params));
  });

  r.get('/:id', (req, res) => {
    const sale = getSale(idParam(req));
    res.json({ ...sale, transactions: db.prepare('SELECT * FROM transactions WHERE sale_id = ? ORDER BY due_date').all(sale.id as number) });
  });

  r.post('/', (req, res) => {
    const body = req.body;
    const vehicleId = int(body, 'vehicle_id', { required: true, label: 'veículo' })!;
    const sale_price = num(body, 'sale_price', { required: true, label: 'valor da venda', min: 0 })!;
    const down_payment = num(body, 'down_payment', { min: 0 }) ?? 0;
    const financed_amount = num(body, 'financed_amount', { min: 0 }) ?? 0;
    const trade_in_value = num(body, 'trade_in_value', { min: 0 }) ?? 0;
    const paymentError = validateSalePayment({ sale_price, down_payment, financed_amount, trade_in_value });
    if (paymentError) throw new HttpError(400, paymentError);
    const sale_date = str(body, 'sale_date') ?? today();
    const sellerId = int(body, 'seller_id') ?? req.user!.id;

    const saleId = tx(db, () => {
      const vehicle = db.prepare('SELECT id, brand, model, status FROM vehicles WHERE id = ?').get(vehicleId) as
        | { id: number; brand: string; model: string; status: string }
        | undefined;
      if (!vehicle) throw notFound('Veículo');
      if (vehicle.status === 'vendido') throw new HttpError(400, 'Este veículo já foi vendido.');

      let customerId = int(body, 'customer_id');
      if (!customerId) {
        if (!body.customer) throw new HttpError(400, 'Selecione ou cadastre o cliente comprador.');
        customerId = insertCustomer(db, body.customer);
      }

      let tradeInVehicleId: number | null = null;
      if (trade_in_value > 0) {
        const t = body.trade_in ?? {};
        const brand = str(t, 'brand', { required: true, label: 'marca do veículo na troca' });
        const model = str(t, 'model', { required: true, label: 'modelo do veículo na troca' });
        const plate = str(t, 'plate');
        const year = int(t, 'year_model', { min: 1900 });
        const info = db
          .prepare(
            `INSERT INTO vehicles (plate, brand, model, version, year_fab, year_model, km, color, purchase_price, purchase_date, supplier, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparacao')`,
          )
          .run(
            plate ? plate.toUpperCase().replace(/[^A-Z0-9]/g, '') : null, brand, model, str(t, 'version'), year, year,
            int(t, 'km', { min: 0 }) ?? 0, str(t, 'color'), trade_in_value, sale_date, 'Troca na venda',
          );
        tradeInVehicleId = Number(info.lastInsertRowid);
      }

      const seller = db.prepare('SELECT commission_rate FROM users WHERE id = ?').get(sellerId) as { commission_rate: number } | undefined;
      const commission = num(body, 'commission', { min: 0 }) ?? round2(sale_price * ((seller?.commission_rate ?? 0) / 100));

      const info = db
        .prepare(
          `INSERT INTO sales (vehicle_id, customer_id, seller_id, lead_id, sale_date, sale_price, down_payment, financed_amount, bank,
            installments, trade_in_value, trade_in_vehicle_id, payment_method, commission, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          vehicle.id, customerId, sellerId, int(body, 'lead_id'), sale_date, sale_price, down_payment, financed_amount,
          str(body, 'bank'), int(body, 'installments', { min: 0 }), trade_in_value, tradeInVehicleId,
          oneOf(body, 'payment_method', PAYMENT_METHODS, financed_amount > 0 ? 'financiamento' : 'a_vista'), commission, str(body, 'notes'),
        );
      const id = Number(info.lastInsertRowid);
      const label = `${vehicle.brand} ${vehicle.model}`;

      db.prepare("UPDATE vehicles SET status = 'vendido', sold_at = ?, updated_at = datetime('now') WHERE id = ?").run(sale_date, vehicle.id);
      db.prepare("UPDATE listings SET status = 'removido', updated_at = datetime('now') WHERE vehicle_id = ? AND status != 'removido'").run(vehicle.id);

      const insTx = db.prepare(
        'INSERT INTO transactions (type, category, description, amount, due_date, paid_at, vehicle_id, sale_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );
      if (down_payment > 0) insTx.run('receita', 'venda_veiculo', `Entrada — ${label}`, down_payment, sale_date, sale_date, vehicle.id, id);
      if (financed_amount > 0) {
        insTx.run('receita', 'financiamento', `Repasse ${str(body, 'bank') ?? 'financeira'} — ${label}`, financed_amount, addDays(sale_date, 30), null, vehicle.id, id);
      }
      if (commission > 0) insTx.run('despesa', 'comissao', `Comissão — ${label}`, commission, addDays(sale_date, 30), null, vehicle.id, id);

      const leadId = int(body, 'lead_id');
      if (leadId) {
        db.prepare("UPDATE leads SET stage = 'ganho', updated_at = datetime('now') WHERE id = ?").run(leadId);
        db.prepare("INSERT INTO lead_activities (lead_id, user_id, type, description) VALUES (?, ?, 'etapa', ?)").run(leadId, req.user!.id, `Venda #${id} concluída`);
      }
      return id;
    });
    res.status(201).json(getSale(saleId));
  });

  r.post('/:id/cancel', requireRole('admin', 'gerente'), (req, res) => {
    const sale = getSale(idParam(req));
    if (sale.status === 'cancelada') throw new HttpError(400, 'Venda já cancelada.');
    tx(db, () => {
      db.prepare("UPDATE sales SET status = 'cancelada', notes = TRIM(IFNULL(notes,'') || ' ' || ?) WHERE id = ?").run(
        `[Cancelada: ${str(req.body, 'reason') ?? 'sem motivo informado'}]`, sale.id as number,
      );
      db.prepare("UPDATE vehicles SET status = 'disponivel', sold_at = NULL, updated_at = datetime('now') WHERE id = ?").run(sale.vehicle_id as number);
      db.prepare('DELETE FROM transactions WHERE sale_id = ?').run(sale.id as number);
    });
    res.json(getSale(sale.id as number));
  });

  return r;
}
