import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.ts';
import { hashPassword } from '../server/auth.ts';
import type { DB } from '../server/db.ts';
import { Tenants } from '../server/tenants.ts';

let server: Server;
let db: DB;
let tenants: Tenants;
let base = '';
let dir = '';
let slug = '';

async function call(method: string, path: string, body?: unknown, cookie = '') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

async function login(email: string, password: string) {
  const r = await call('POST', '/api/auth/login', { email, password });
  assert.equal(r.status, 200);
  return r.cookie;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'patio-test-'));
  tenants = new Tenants(dir);
  server = createApp(tenants, { uploadDir: join(dir, 'uploads'), appHtml: join(import.meta.dirname, '..', 'prototipo', 'index.html'), platformAdmins: ['dono@patio.app'], limits: { signupPerHour: 100, loginPer15Min: 100 } }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const s = await call('POST', '/api/auth/signup', { company_name: 'Loja Teste', name: 'Admin', email: 'admin@t.com', password: 'segredo1', accept_terms: true });
  assert.equal(s.status, 201, s.body.error);
  slug = s.body.company.slug;
  const t = tenants.get(s.body.company.id)!;
  db = t.db;
  db.prepare("INSERT INTO users (name, email, password_hash, role, commission_rate) VALUES ('Vendedor', 'vend@t.com', ?, 'vendedor', 2)").run(hashPassword('segredo2'));
  tenants.claim('vend@t.com', t.company.id);
});

after(() => {
  server.close();
  tenants.close();
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

  // Lead vindo do site
  assert.equal((await call('POST', '/api/leads', { customer: { name: 'Ana', phone: '11999990000' }, vehicle_id: vid, source: 'site' }, admin)).status, 201);
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

test('cadastro de empresa: dados isolados, e-mail único, vitrine própria e painel da plataforma', async () => {
  // e-mail já usado em outra empresa
  assert.equal((await call('POST', '/api/auth/signup', { company_name: 'Outra', name: 'X', email: 'ADMIN@t.com', password: 'segredo99', accept_terms: true })).status, 409);
  // sem aceite dos termos / senha curta
  assert.equal((await call('POST', '/api/auth/signup', { company_name: 'Outra', name: 'X', email: 'x@b.com', password: 'segredo99' })).status, 400);
  assert.equal((await call('POST', '/api/auth/signup', { company_name: 'Outra', name: 'X', email: 'x@b.com', password: '123', accept_terms: true })).status, 400);

  const a = await login('admin@t.com', 'segredo1');
  await call('POST', '/api/vehicles', { brand: 'Fiat', model: 'Uno', status: 'disponivel', sale_price: 30000 }, a);
  const nA = (await call('GET', '/api/vehicles', undefined, a)).body.length;
  assert.ok(nA > 0);

  const b = await call('POST', '/api/auth/signup', { company_name: 'Loja Teste', name: 'Bia', email: 'bia@b.com', password: 'segredo99', accept_terms: true, city: 'Umuarama - PR' });
  assert.equal(b.status, 201);
  assert.notEqual(b.body.company.slug, slug, 'mesmo nome gera endereço diferente');
  assert.equal((await call('GET', '/api/vehicles', undefined, b.cookie)).body.length, 0, 'empresa nova não vê o estoque da outra');
  assert.equal((await call('GET', '/api/settings', undefined, b.cookie)).body.city, 'Umuarama - PR');
  assert.equal((await call('GET', `/api/public/${b.body.company.slug}/vehicles`)).body.length, 0);
  assert.equal((await call('GET', '/api/public/nao-existe/vehicles')).status, 404);

  // usuário criado na empresa B não pode reusar e-mail da A; login da B funciona
  assert.equal((await call('POST', '/api/users', { name: 'V', email: 'vend@t.com', password: 'abcdef', role: 'vendedor' }, b.cookie)).status, 409);
  assert.equal((await call('POST', '/api/users', { name: 'Caio', email: 'caio@b.com', password: 'abcdef', role: 'vendedor' }, b.cookie)).status, 201);
  const caio = await login('caio@b.com', 'abcdef');
  assert.equal((await call('GET', '/api/auth/me', undefined, caio)).body.company.slug, b.body.company.slug);

  // sessão adulterada (token da B com o número da empresa A) não entra
  const forged = b.cookie.replace(/=(\d+)\./, `=${tenants.companyForEmail('admin@t.com')}.`);
  assert.equal((await call('GET', '/api/vehicles', undefined, forged)).status, 401);

  // painel da plataforma: só para o e-mail autorizado
  assert.equal((await call('GET', '/api/platform/companies', undefined, a)).status, 403);
  const dono = await call('POST', '/api/auth/signup', { company_name: 'Pátio HQ', name: 'Dono', email: 'dono@patio.app', password: 'segredo99', accept_terms: true });
  const list = await call('GET', '/api/platform/companies', undefined, dono.cookie);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 3);

  // empresa suspensa perde o acesso
  assert.equal((await call('PUT', `/api/platform/companies/${b.body.company.id}/status`, { status: 'suspensa' }, dono.cookie)).status, 200);
  assert.equal((await call('GET', '/api/vehicles', undefined, b.cookie)).status, 403);
  assert.equal((await call('POST', '/api/auth/login', { email: 'bia@b.com', password: 'segredo99' })).status, 403);
});

test('sistema completo: gravação por itens, mudanças, números, fotos, vitrine e caixa de entrada', async () => {
  const a = await login('admin@t.com', 'segredo1');
  const veh = { id: 10050, marca: 'Jeep', modelo: 'Renegade', versao: 'Longitude', anoFab: 2022, anoMod: 2022, km: 41000, status: 'estoque', venda: 109900, promo: 0, compra: 95000, pubs: { site: true }, galeria: [{ id: 'g1', img: '/uploads/x.jpg' }, { id: 'g2', k: 1 }] };
  const cfg = { loja: { nome: 'Loja Teste Ltda', fantasia: 'Loja Teste', tel: '(44) 3000-0000', cidade: 'Umuarama-PR' } };
  const s1 = await call('POST', '/api/store/save', { put: [['m:veh:10050', JSON.stringify(veh)], ['v:cfg', JSON.stringify(cfg)]], del: [] }, a);
  assert.equal(s1.status, 200);
  assert.equal((await call('POST', '/api/store/save', { put: [['../etc', '{}']] }, a)).status, 400, 'chave inválida');
  assert.equal((await call('POST', '/api/store/save', { put: [['m:veh:1', '{quebrado']] }, a)).status, 400, 'JSON inválido');

  const all = await call('GET', '/api/store', undefined, a);
  assert.equal(all.body.items.length, 2);
  const ch = await call('GET', `/api/store/changes?since=${s1.body.rev - 1}`, undefined, a);
  assert.deepEqual(ch.body.items.map((x: string[]) => x[0]), ['v:cfg']);

  // números de registro nunca se repetem e começam acima dos catálogos
  const i1 = (await call('POST', '/api/store/ids', { n: 10 }, a)).body;
  const i2 = (await call('POST', '/api/store/ids', { n: 10 }, a)).body;
  assert.ok(i1.from > 10000 && i2.from === i1.to + 1);

  // vitrine pública só com campos públicos e fotos reais
  const pub = await call('GET', `/api/public/${slug}/vehicles`);
  assert.equal(pub.body.length, 1);
  assert.equal(pub.body[0].sale_price, 109900);
  assert.equal(pub.body[0].compra, undefined, 'preço de compra não pode vazar');
  assert.deepEqual(pub.body[0].photos, ['/uploads/x.jpg']);
  assert.equal((await call('GET', `/api/public/${slug}/store`)).body.store_name, 'Loja Teste');
  assert.equal((await call('POST', `/api/public/${slug}/vehicles/10050/interest`, { name: 'Ana' })).status, 400);
  assert.equal((await call('POST', `/api/public/${slug}/vehicles/10050/interest`, { name: 'Ana', phone: '11999990000' })).status, 201);
  const inbox = (await call('GET', '/api/store', undefined, a)).body.items.filter((x: string[]) => x[0].startsWith('m:inbox:'));
  assert.equal(inbox.length, 1);
  assert.equal((await call('POST', '/api/store/inbox/claim', { k: inbox[0][0] }, a)).body.ok, true);
  assert.equal((await call('POST', '/api/store/inbox/claim', { k: inbox[0][0] }, a)).body.ok, false, 'só um navegador converte');

  // carro vendido sai da vitrine; apagar vira "tombstone" nas mudanças
  const s2 = await call('POST', '/api/store/save', { put: [['m:veh:10050', JSON.stringify({ ...veh, status: 'vendido' })]], del: ['v:cfg'] }, a);
  assert.equal((await call('GET', `/api/public/${slug}/vehicles`)).body.length, 0);
  const ch2 = await call('GET', `/api/store/changes?since=${s2.body.rev - 1}`, undefined, a);
  assert.deepEqual(ch2.body.items, [['v:cfg', null]]);

  // foto enviada como data URL vira arquivo servido em /uploads
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await call('POST', '/api/store/files', { data: png }, a);
  assert.equal(up.status, 201);
  assert.equal((await fetch(base + up.body.url)).status, 200);
  assert.equal((await call('POST', '/api/store/files', { data: 'data:text/html;base64,PGgxPg==' }, a)).status, 400);

  // outra empresa não enxerga estes itens
  const o = await call('POST', '/api/auth/signup', { company_name: 'Isolada', name: 'Iz', email: 'iz@o.com', password: 'segredo99', accept_terms: true });
  assert.equal((await call('GET', '/api/store', undefined, o.cookie)).body.items.length, 0);

  // sistema completo exige login; com login chega com os dados embutidos
  const anon = await fetch(base + '/app', { redirect: 'manual' });
  assert.equal(anon.status, 302);
  const page = await fetch(base + '/app', { headers: { cookie: a } });
  const html = await page.text();
  assert.ok(html.includes('window.PATIO_BOOT='), 'página com os dados da loja');
  assert.ok(!html.includes('"password_hash"'), 'nenhum hash de senha na página');
});
