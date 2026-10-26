import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appraisalSummary, daysInStock, preparationTotals, validateSalePayment, vehicleProfit } from '../server/domain.ts';

test('preço sugerido desconta margem e reparos', () => {
  const s = appraisalSummary({ market_price: 50000, margin_percent: 15, items: [{ repair_cost: 800 }, { repair_cost: 1200 }] });
  assert.deepEqual(s, { repair_total: 2000, margin_value: 7500, suggested_price: 40500 });
});

test('preço sugerido nunca fica negativo', () => {
  assert.equal(appraisalSummary({ market_price: 1000, margin_percent: 50, items: [{ repair_cost: 5000 }] }).suggested_price, 0);
});

test('preparação usa o real quando lançado e o previsto quando não', () => {
  const t = preparationTotals([
    { estimated: 1000, actual: 1200 },
    { estimated: 500, actual: null },
  ]);
  assert.deepEqual(t, { estimated: 1500, actual: 1200, effective: 1700, variance: -300 });
});

test('lucro e margem do veículo', () => {
  const p = vehicleProfit({ purchase_price: 80000, sale_price: 100000, preparation: 3000, commission: 1000 });
  assert.deepEqual(p, { total_cost: 84000, profit: 16000, margin_percent: 16 });
});

test('dias em estoque', () => {
  assert.equal(daysInStock('2026-01-01', '2026-01-31'), 30);
  assert.equal(daysInStock('2026-01-10', null, new Date(2026, 0, 15)), 5);
  assert.equal(daysInStock(null), 0);
});

test('pagamento da venda precisa fechar com o valor total', () => {
  assert.equal(validateSalePayment({ sale_price: 100, down_payment: 30, financed_amount: 50, trade_in_value: 20 }), null);
  assert.match(validateSalePayment({ sale_price: 100, down_payment: 30, financed_amount: 50, trade_in_value: 0 })!, /deve ser igual/);
  assert.match(validateSalePayment({ sale_price: 0, down_payment: 0, financed_amount: 0, trade_in_value: 0 })!, /Informe/);
});
