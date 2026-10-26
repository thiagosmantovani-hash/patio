import { Router } from 'express';
import type { DB } from '../db.ts';
import { requireRole } from '../auth.ts';
import { daysInStock, round2 } from '../domain.ts';
import { today } from '../http.ts';

// Lucro por venda: preço − compra − preparação efetiva (real, ou previsto se não lançado) − comissão.
const SALE_PROFIT = `
  s.sale_price - v.purchase_price - s.commission
  - IFNULL((SELECT SUM(IFNULL(c.actual, c.estimated)) FROM vehicle_costs c WHERE c.vehicle_id = v.id), 0)`;

function monthStart(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function reportRoutes(db: DB) {
  const r = Router();

  r.get('/dashboard', (req, res) => {
    const isSeller = req.user!.role === 'vendedor';
    const from = monthStart();
    const stock = db
      .prepare(
        `SELECT status, COUNT(*) AS count, IFNULL(SUM(sale_price),0) AS value,
           IFNULL(SUM(purchase_price + IFNULL((SELECT SUM(IFNULL(c.actual, c.estimated)) FROM vehicle_costs c WHERE c.vehicle_id = vehicles.id),0)),0) AS cost
         FROM vehicles WHERE status != 'vendido' GROUP BY status`,
      )
      .all() as { status: string; count: number; value: number; cost: number }[];
    const stockDates = db.prepare("SELECT id, brand, model, year_model, sale_price, purchase_date, created_at FROM vehicles WHERE status != 'vendido'").all() as {
      id: number; brand: string; model: string; year_model: number; sale_price: number; purchase_date: string | null; created_at: string;
    }[];
    const ages = stockDates.map((v) => ({ ...v, days: daysInStock(v.purchase_date ?? v.created_at) }));
    const avgDays = ages.length ? Math.round(ages.reduce((s, v) => s + v.days, 0) / ages.length) : 0;

    const month = db
      .prepare(
        `SELECT COUNT(*) AS count, IFNULL(SUM(s.sale_price),0) AS revenue, IFNULL(SUM(${SALE_PROFIT}),0) AS profit
         FROM sales s JOIN vehicles v ON v.id = s.vehicle_id WHERE s.status = 'concluida' AND s.sale_date >= ?`,
      )
      .get(from) as { count: number; revenue: number; profit: number };

    const history = db
      .prepare(
        `SELECT substr(s.sale_date, 1, 7) AS month, COUNT(*) AS count, SUM(s.sale_price) AS revenue, SUM(${SALE_PROFIT}) AS profit
         FROM sales s JOIN vehicles v ON v.id = s.vehicle_id
         WHERE s.status = 'concluida' AND s.sale_date >= date('now', 'start of month', '-5 months')
         GROUP BY month ORDER BY month`,
      )
      .all();

    const leadFilter = isSeller ? 'AND seller_id = ?' : '';
    const leadParams = isSeller ? [req.user!.id] : [];
    const leads = db
      .prepare(`SELECT stage, COUNT(*) AS count FROM leads WHERE stage NOT IN ('ganho','perdido') ${leadFilter} GROUP BY stage`)
      .all(...leadParams);
    const followUps = db
      .prepare(
        `SELECT l.id, l.stage, l.next_contact, c.name AS customer_name, c.phone AS customer_phone, v.brand, v.model
         FROM leads l JOIN customers c ON c.id = l.customer_id LEFT JOIN vehicles v ON v.id = l.vehicle_id
         WHERE l.stage NOT IN ('ganho','perdido') AND l.next_contact IS NOT NULL AND l.next_contact <= ? ${leadFilter.replace('seller_id', 'l.seller_id')}
         ORDER BY l.next_contact LIMIT 10`,
      )
      .all(today(), ...leadParams);

    const finance = isSeller
      ? null
      : db
          .prepare(
            `SELECT
               IFNULL(SUM(CASE WHEN type='receita' THEN amount END),0) AS overdue_receivable,
               IFNULL(SUM(CASE WHEN type='despesa' THEN amount END),0) AS overdue_payable,
               COUNT(*) AS overdue_count
             FROM transactions WHERE paid_at IS NULL AND due_date < ?`,
          )
          .get(today());

    const appraisals = db.prepare("SELECT COUNT(*) AS count FROM appraisals WHERE status IN ('em_andamento','concluida')").get() as { count: number };

    res.json({
      stock: {
        by_status: stock,
        count: stock.reduce((s, x) => s + x.count, 0),
        value: round2(stock.reduce((s, x) => s + x.value, 0)),
        cost: round2(stock.reduce((s, x) => s + x.cost, 0)),
        avg_days: avgDays,
        aging: ages.filter((v) => v.days >= 60).sort((a, b) => b.days - a.days).slice(0, 8),
      },
      month: isSeller ? { count: month.count, revenue: null, profit: null } : { ...month, profit: round2(month.profit) },
      history: isSeller ? [] : history,
      leads,
      follow_ups: followUps,
      finance,
      pending_appraisals: appraisals.count,
    });
  });

  r.get('/', requireRole('admin', 'gerente'), (req, res) => {
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : monthStart();
    const to = typeof req.query.to === 'string' && req.query.to ? req.query.to : today();

    const sales = db
      .prepare(
        `SELECT s.id, s.sale_date, s.sale_price, s.commission, s.payment_method, v.brand, v.model, v.year_model, v.purchase_price,
           IFNULL((SELECT SUM(IFNULL(c.actual, c.estimated)) FROM vehicle_costs c WHERE c.vehicle_id = v.id), 0) AS preparation,
           ${SALE_PROFIT} AS profit, julianday(s.sale_date) - julianday(IFNULL(v.purchase_date, date(v.created_at))) AS days,
           u.name AS seller_name, cu.name AS customer_name
         FROM sales s JOIN vehicles v ON v.id = s.vehicle_id LEFT JOIN users u ON u.id = s.seller_id
         JOIN customers cu ON cu.id = s.customer_id
         WHERE s.status = 'concluida' AND s.sale_date BETWEEN ? AND ? ORDER BY s.sale_date`,
      )
      .all(from, to) as { sale_price: number; profit: number; days: number; seller_name: string | null; payment_method: string; commission: number }[];

    const group = <K extends string>(rows: typeof sales, key: (s: (typeof sales)[number]) => K) => {
      const map = new Map<K, { key: K; count: number; revenue: number; profit: number; commission: number }>();
      for (const s of rows) {
        const k = key(s);
        const g = map.get(k) ?? { key: k, count: 0, revenue: 0, profit: 0, commission: 0 };
        g.count += 1;
        g.revenue = round2(g.revenue + s.sale_price);
        g.profit = round2(g.profit + s.profit);
        g.commission = round2(g.commission + s.commission);
        map.set(k, g);
      }
      return [...map.values()].sort((a, b) => b.revenue - a.revenue);
    };

    const leadSources = db
      .prepare(
        `SELECT source, COUNT(*) AS total, SUM(stage = 'ganho') AS won, SUM(stage = 'perdido') AS lost
         FROM leads WHERE date(created_at) BETWEEN ? AND ? GROUP BY source ORDER BY total DESC`,
      )
      .all(from, to);
    const lostReasons = db
      .prepare(
        `SELECT lost_reason AS reason, COUNT(*) AS count FROM leads
         WHERE stage = 'perdido' AND date(updated_at) BETWEEN ? AND ? GROUP BY lost_reason ORDER BY count DESC`,
      )
      .all(from, to);

    const preparation = db
      .prepare(
        `SELECT category, COUNT(*) AS items, SUM(estimated) AS estimated, SUM(IFNULL(actual,0)) AS actual,
           SUM(CASE WHEN actual IS NOT NULL THEN actual - estimated ELSE 0 END) AS variance
         FROM vehicle_costs WHERE date BETWEEN ? AND ? GROUP BY category ORDER BY estimated DESC`,
      )
      .all(from, to);
    const preparationByVehicle = db
      .prepare(
        `SELECT v.id, v.brand, v.model, v.year_model, v.plate, SUM(c.estimated) AS estimated, SUM(IFNULL(c.actual,0)) AS actual,
           SUM(c.actual IS NULL) AS pending
         FROM vehicle_costs c JOIN vehicles v ON v.id = c.vehicle_id WHERE c.date BETWEEN ? AND ?
         GROUP BY v.id ORDER BY ABS(SUM(IFNULL(c.actual, c.estimated)) - SUM(c.estimated)) DESC LIMIT 20`,
      )
      .all(from, to);

    const channels = db
      .prepare(
        `SELECT l.channel, COUNT(*) AS listings, SUM(l.status = 'publicado') AS active, SUM(l.views) AS views, SUM(l.contacts) AS contacts,
           SUM(v.status = 'vendido') AS sold
         FROM listings l JOIN vehicles v ON v.id = l.vehicle_id GROUP BY l.channel ORDER BY contacts DESC`,
      )
      .all();

    const stockAging = db
      .prepare(
        `SELECT
           SUM(d < 30) AS d0_30, SUM(d >= 30 AND d < 60) AS d30_60, SUM(d >= 60 AND d < 90) AS d60_90, SUM(d >= 90) AS d90
         FROM (SELECT julianday('now') - julianday(IFNULL(purchase_date, created_at)) AS d FROM vehicles WHERE status != 'vendido')`,
      )
      .get();

    const totals = {
      count: sales.length,
      revenue: round2(sales.reduce((s, x) => s + x.sale_price, 0)),
      profit: round2(sales.reduce((s, x) => s + x.profit, 0)),
      avg_ticket: sales.length ? round2(sales.reduce((s, x) => s + x.sale_price, 0) / sales.length) : 0,
      avg_days: sales.length ? Math.round(sales.reduce((s, x) => s + x.days, 0) / sales.length) : 0,
    };

    res.json({
      period: { from, to },
      totals,
      sales,
      by_seller: group(sales, (s) => s.seller_name ?? 'Sem vendedor'),
      by_payment: group(sales, (s) => s.payment_method),
      lead_sources: leadSources,
      lost_reasons: lostReasons,
      preparation,
      preparation_by_vehicle: preparationByVehicle,
      channels,
      stock_aging: stockAging,
    });
  });

  return r;
}
