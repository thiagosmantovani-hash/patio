import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { hashPassword } from '../server/auth.ts';
import { openDatabase, type DB } from '../server/db.ts';

let server: Server;
let db: DB;
let base = '';
let dir = '';

async function call(method: string, path: string, body?: unknown, cookie = '') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

async function login(email: string, password: string) {
  const r = await call('POST', '/api/auth/login', { email, password });
  assert.equal(r.status, 200);
  return r.cookie;
}

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'patio-test-'));
  db = openDatabase(':memory:');
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', 'admin@t.com', ?, 'admin')").run(hashPassword('segredo1'));
  db.prepare("INSERT INTO users (name, email, password_hash, role, commission_rate) VALUES ('Vendedor', 'vend@t.com', ?, 'vendedor', 2)").run(hashPassword('segredo2'));
  server = createApp(db, { uploadDir: join(dir, 'uploads') }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

test('rotas internas exigem login e credenciais erradas são recusadas', async () => {
  assert.equal((await call('GET', '/api/vehicles')).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'admin@t.com', password: 'errada' })).status, 401);
});

test('vendedor não acessa financeiro nem usuários', async () => {
  const cookie = await login('vend@t.com', 'segredo2');
  assert.equal((await call('GET', '/api/finance', undefined, cookie)).status, 403);
  assert.equal((await call('GET', '/api/users', undefined, cookie)).status, 403);
});

test('fluxo completo: avaliação → estoque → anúncio → lead pela vitrine → venda com troca → cancelamento', async () => {
  const admin = await login('admin@t.com', 'segredo1');
  const sellerId = (db.prepare("SELECT id FROM users WHERE email = 'vend@t.com'").get() as { id: number }).id;

  // Avaliação com reparos
  const ap = await call('POST', '/api/appraisals', { brand: 'Fiat', model: 'Argo', year_model: 2021, km: 40000, market_price: 60000, margin_percent: 10 }, admin);
  assert.equal(ap.status, 201);
  const detail = (await call('GET', `/api/appraisals/${ap.body.id}`, undefined, admin)).body;
  const first = detail.items[0];
  const upd = await call('PUT', `/api/appraisals/${ap.body.id}/items`, { items: [{ ...first, condition: 'ruim', repair_cost: 1500 }] }, admin);
  assert.equal(upd.body.summary.suggested_price, 60000 - 6000 - 1500);

  // Converte em veículo; reparo vira custo previsto
  const conv = await call('POST', `/api/appraisals/${ap.body.id}/convert`, {}, admin);
  assert.equal(conv.status, 201);
  const vid = conv.body.vehicle_id;
  let v = (await call('GET', `/api/vehicles/${vid}`, undefined, admin)).body;
  assert.equal(v.status, 'preparacao');
  assert.equal(v.purchase_price, 52500);
  assert.equal(v.preparation.estimated, 1500);
  assert.equal((await call('POST', `/api/appraisals/${ap.body.id}/convert`, {}, admin)).status, 400);

  // Lança custo real, define preço e disponibiliza
  await call('PUT', `/api/vehicles/${vid}/costs/${v.costs[0].id}`, { ...v.costs[0], actual: 1800 }, admin);
  await call('PUT', `/api/vehicles/${vid}`, { ...v, sale_price: 64900 }, admin);
  await call('PATCH', `/api/vehicles/${vid}/status`, { status: 'disponivel' }, admin);
  await call('POST', `/api/vehicles/${vid}/listings/bulk`, { channels: ['OLX', 'Site próprio'] }, admin);

  // Vitrine pública mostra o carro e gera lead
  const pub = await call('GET', '/api/public/vehicles');
  assert.equal(pub.body.length, 1);
  assert.equal(pub.body[0].purchase_price, undefined, 'preço de compra não pode vazar na vitrine');
  assert.equal((await call('POST', `/api/public/vehicles/${vid}/interest`, { name: 'Ana' })).status, 400);
  assert.equal((await call('POST', `/api/public/vehicles/${vid}/interest`, { name: 'Ana', phone: '11999990000' })).status, 201);
  const leads = (await call('GET', '/api/leads', undefined, admin)).body;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source, 'site');

  // Venda que não fecha é recusada
  const bad = await call('POST', '/api/sales', { vehicle_id: vid, customer_id: leads[0].customer_id, sale_price: 64000, down_payment: 1000 }, admin);
  assert.equal(bad.status, 400);

  // Venda com entrada + financiamento + troca
  const sale = await call('POST', '/api/sales', {
    vehicle_id: vid, customer_id: leads[0].customer_id, lead_id: leads[0].id, seller_id: sellerId, sale_date: '2026-03-10',
    sale_price: 64000, down_payment: 10000, financed_amount: 34000, trade_in_value: 20000, bank: 'Banco X',
    trade_in: { brand: 'VW', model: 'Gol', year_model: 2015 },
  }, admin);
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  assert.equal(sale.body.commission, 1280);
  v = (await call('GET', `/api/vehicles/${vid}`, undefined, admin)).body;
  assert.equal(v.status, 'vendido');
  assert.equal(v.profit.profit, 64000 - 52500 - 1800 - 1280);
  assert.ok(v.listings.every((l: { status: string }) => l.status === 'removido'));
  assert.equal((await call('GET', `/api/leads/${leads[0].id}`, undefined, admin)).body.stage, 'ganho');
  assert.equal((await call('GET', '/api/public/vehicles')).body.length, 0);

  const fin = (await call('GET', '/api/finance', undefined, admin)).body;
  assert.equal(fin.totals.received, 10000);
  assert.equal(fin.totals.to_receive, 34000);
  assert.equal(fin.totals.to_pay, 1280);

  const trade = (await call('GET', '/api/vehicles?status=preparacao', undefined, admin)).body;
  assert.equal(trade.length, 1);
  assert.equal(trade[0].purchase_price, 20000);

  // Não vende duas vezes
  assert.equal((await call('POST', '/api/sales', { vehicle_id: vid, customer_id: leads[0].customer_id, sale_price: 1, down_payment: 1 }, admin)).status, 400);

  // Cancelamento devolve o carro ao estoque e remove lançamentos
  const cancel = await call('POST', `/api/sales/${sale.body.id}/cancel`, { reason: 'Desistência' }, admin);
  assert.equal(cancel.body.status, 'cancelada');
  assert.equal((await call('GET', `/api/vehicles/${vid}`, undefined, admin)).body.status, 'disponivel');
  assert.equal((await call('GET', '/api/finance', undefined, admin)).body.rows.length, 0);
});

test('lead perdido exige motivo', async () => {
  const admin = await login('admin@t.com', 'segredo1');
  const lead = await call('POST', '/api/leads', { customer: { name: 'Teste', phone: '1' } }, admin);
  assert.equal(lead.status, 201);
  assert.equal((await call('PATCH', `/api/leads/${lead.body.id}/stage`, { stage: 'perdido' }, admin)).status, 400);
  const ok = await call('PATCH', `/api/leads/${lead.body.id}/stage`, { stage: 'perdido', lost_reason: 'Preço' }, admin);
  assert.equal(ok.body.stage, 'perdido');
});
