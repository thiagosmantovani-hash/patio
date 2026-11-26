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
  assert.equal((await call('POST', '/api/users', { name: 'V', email: 'vend@t.com', password: 'abcdef12', role: 'vendedor' }, b.cookie)).status, 409);
  assert.equal((await call('POST', '/api/users', { name: 'Caio', email: 'caio@b.com', password: 'abcdef12', role: 'vendedor' }, b.cookie)).status, 201);
  const caio = await login('caio@b.com', 'abcdef12');
  assert.equal((await call('GET', '/api/auth/me', undefined, caio)).body.company.slug, b.body.company.slug);

  // exclusão de usuário: some o login e a sessão; o e-mail fica livre; ninguém exclui a si mesmo
  const listaB = (await call('GET', '/api/users', undefined, b.cookie)).body as { id: number; email: string }[];
  const caioId = listaB.find((u) => u.email === 'caio@b.com')!.id;
  const meB = listaB.find((u) => u.email !== 'caio@b.com')!.id;
  assert.equal((await call('DELETE', `/api/users/${meB}`, undefined, b.cookie)).status, 400);
  assert.equal((await call('DELETE', `/api/users/${caioId}`, undefined, caio)).status, 403, 'vendedor não exclui');
  assert.equal((await call('DELETE', `/api/users/${caioId}`, undefined, b.cookie)).status, 200);
  assert.equal((await call('GET', '/api/auth/me', undefined, caio)).status, 401, 'sessão do excluído cai');
  assert.equal((await call('POST', '/api/auth/login', { email: 'caio@b.com', password: 'abcdef' })).status, 401);
  assert.equal(tenants.companyForEmail('caio@b.com'), null, 'e-mail liberado');
  assert.equal((await call('DELETE', `/api/users/${caioId}`, undefined, b.cookie)).status, 404);

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
  assert.equal(JSON.parse(inbox[0][1]).form, 'interesse');

  // editor de site: só vale para o público depois de publicar; scripts não saem na API pública
  const ed = { logo: 'Loja Nova', horario: 'Seg a sáb', menu: ['Estoque', 'Venda seu carro'], marcas: ['VW', ''], venda: { on: true, titulo: 'Venda', texto: 't', botao: 'Avalie' }, financie: { on: false }, tema: { cor: '#123456' }, redes: { instagram: 'https://instagram.com/x', facebook: 'javascript:alert(1)' }, scripts: { head: '<script>x</script>' }, unidades: [{ nome: 'Matriz', endereco: 'Rua A' }] };
  await call('POST', '/api/store/save', { put: [['s:site:ed', JSON.stringify(ed)], ['s:site:banners', JSON.stringify([{ titulo: 'B1', sub: 's', ativo: true }, { titulo: 'B2', ativo: false }])]], del: [] }, a);
  assert.equal((await call('GET', `/api/public/${slug}/store`)).body.site, null, 'rascunho não aparece');
  await call('POST', '/api/store/save', { put: [['s:site:ed', JSON.stringify({ ...ed, publicado: '24/11/2026' })]], del: [] }, a);
  const st = (await call('GET', `/api/public/${slug}/store`)).body;
  assert.equal(st.store_name, 'Loja Nova');
  assert.equal(st.site.color, '#123456');
  assert.deepEqual(st.site.brands, ['VW']);
  assert.equal(st.site.finance.on, false);
  assert.equal(st.site.banners.length, 1);
  assert.equal(st.site.socials.facebook, '', 'só links https');
  assert.equal(JSON.stringify(st).includes('<script>'), false, 'scripts não vão para a vitrine');

  // formulários do site viram itens da caixa de entrada com o tipo
  assert.equal((await call('POST', `/api/public/${slug}/contact`, { kind: 'x', name: 'Bia', phone: '1' })).status, 400);
  assert.equal((await call('POST', `/api/public/${slug}/contact`, { kind: 'compra', name: 'Bia' })).status, 400);
  assert.equal((await call('POST', `/api/public/${slug}/contact`, { kind: 'compra', name: 'Bia', phone: '44999', brand: 'Fiat', model: 'Uno', year: '2015' })).status, 201);
  const inbox2 = (await call('GET', '/api/store', undefined, a)).body.items.filter((x: string[]) => x[0].startsWith('m:inbox:')).map((x: string[]) => JSON.parse(x[1]));
  assert.equal(inbox2.length, 1);
  assert.equal(inbox2[0].form, 'compra');
  assert.match(inbox2[0].msg, /Marca: Fiat · Modelo: Uno · Ano: 2015/);

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

test('segurança: cabeçalhos, perfis protegidos na configuração e senha redefinida derruba sessões', async () => {
  const h = await fetch(base + '/api/health');
  assert.match(h.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(h.headers.get('content-security-policy') ?? '', /object-src 'none'/);

  const admin = await login('admin@t.com', 'segredo1');
  const vend = await login('vend@t.com', 'segredo2');
  const cfg = { loja: { fantasia: 'Loja' }, perfis: { vendedor: { nome: 'Vendedor', mods: ['veiculos'] } }, usuarios: { '1': { id: 1, email: 'vend@t.com', perfil: 'vendedor', status: 'ativo', nome: 'Vend' } } };
  assert.equal((await call('POST', '/api/store/save', { put: [['v:cfg', JSON.stringify(cfg)]] }, admin)).status, 200);

  // vendedor tenta se promover e criar outro usuário pela gravação geral
  const hack = structuredClone(cfg) as any;
  hack.perfis.vendedor.mods.push('configuracoes', 'financeiro');
  hack.usuarios['1'].perfil = 'revenda';
  hack.usuarios['1'].nome = 'Vendedor Novo Nome';
  hack.usuarios['99'] = { id: 99, email: 'x@x.com', perfil: 'revenda', status: 'ativo' };
  hack.loja.fantasia = 'Loja Atualizada';
  assert.equal((await call('POST', '/api/store/save', { put: [['v:cfg', JSON.stringify(hack)]] }, vend)).status, 200);
  const saved = (await call('GET', '/api/store', undefined, admin)).body.items.find((i: any) => i[0] === 'v:cfg');
  const got = JSON.parse(saved[1]);
  assert.deepEqual(got.perfis.vendedor.mods, ['veiculos']);
  assert.equal(got.usuarios['1'].perfil, 'vendedor');
  assert.equal(got.usuarios['1'].nome, 'Vendedor Novo Nome');
  assert.equal(got.usuarios['99'], undefined);
  assert.equal(got.loja.fantasia, 'Loja Atualizada');
  assert.equal((await call('POST', '/api/store/save', { del: ['v:cfg'] }, vend)).status, 403);

  // senha curta é recusada; senha redefinida pelo admin encerra a sessão do vendedor
  const vid = (db.prepare("SELECT id FROM users WHERE email = 'vend@t.com'").get() as { id: number }).id;
  const put = (password: string) => call('PUT', `/api/users/${vid}`, { name: 'Vendedor', email: 'vend@t.com', role: 'vendedor', commission_rate: 2, active: true, password }, admin);
  assert.equal((await put('curta')).status, 400);
  assert.equal((await put('segredo22')).status, 200);
  assert.equal((await call('GET', '/api/store', undefined, vend)).status, 401);
});

test('e-mails: esqueci a senha, convite, confirmação e plataforma só com e-mail confirmado', async () => {
  const sent: { to: string; text: string }[] = [];
  const mailer = { enabled: true, send: async (m: { to: string; text: string }) => (sent.push(m), true) };
  const dir2 = mkdtempSync(join(tmpdir(), 'patio-mail-'));
  const t2 = new Tenants(dir2);
  const s2 = createApp(t2, { uploadDir: join(dir2, 'uploads'), platformAdmins: ['dono@mail.com'], mailer, appUrl: 'https://app.exemplo.com', limits: { signupPerHour: 100, loginPer15Min: 100 } }).listen(0);
  const b2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
  const req = async (method: string, path: string, body?: unknown, cookie = '') => {
    const r = await fetch(b2 + path, { method, redirect: 'manual', headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const ct = r.headers.get('content-type') ?? '';
    return { status: r.status, body: ct.includes('json') ? ((await r.json()) as any) : null, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '', location: r.headers.get('location') ?? '' };
  };
  const link = (m: { text: string }) => decodeURIComponent(/t=([^&\s]+)/.exec(m.text)![1]!);
  try {
    // cadastro envia confirmação; plataforma só depois de confirmar
    const s = await req('POST', '/api/auth/signup', { company_name: 'Loja Mail', name: 'Dono', email: 'dono@mail.com', password: 'segredo123', accept_terms: true });
    assert.equal(s.status, 201);
    assert.equal(s.body.verify_sent, true);
    assert.equal(s.body.platform, false, 'sem confirmar não entra na plataforma');
    assert.match(sent[0]!.text, /https:\/\/app\.exemplo\.com\/api\/auth\/verify\?t=/);
    assert.equal((await req('GET', '/api/platform/companies', undefined, s.cookie)).status, 403);
    const v = await req('GET', '/api/auth/verify?t=' + encodeURIComponent(link(sent[0]!)));
    assert.equal(v.status, 302);
    assert.match(v.location, /confirmado=1/);
    assert.match((await req('GET', '/api/auth/verify?t=' + encodeURIComponent(link(sent[0]!)))).location, /link=invalido/, 'link usado não vale de novo');
    assert.equal((await req('GET', '/api/auth/me', undefined, s.cookie)).body.platform, true);

    // convite: admin cria usuário e envia link; a pessoa cria a senha e já entra
    const u = await req('POST', '/api/users', { name: 'Vera Vendas', email: 'vera@mail.com', password: 'provisoria1', role: 'vendedor' }, s.cookie);
    assert.equal(u.status, 201);
    assert.equal((await req('POST', `/api/users/${u.body.id}/invite`, {}, s.cookie)).body.sent, true);
    const inv = sent.at(-1)!;
    assert.equal(inv.to, 'vera@mail.com');
    assert.match(inv.text, /redefinir-senha\?t=.*&convite=1/);
    const tk = await req('GET', '/api/auth/token?t=' + encodeURIComponent(link(inv)));
    assert.equal(tk.body.kind, 'invite');
    assert.equal(tk.body.email, 'vera@mail.com');
    assert.equal((await req('POST', '/api/auth/reset', { t: link(inv), password: 'curta' })).status, 400);
    const rs = await req('POST', '/api/auth/reset', { t: link(inv), password: 'minhasenha1' });
    assert.equal(rs.status, 200);
    assert.equal((await req('GET', '/api/auth/me', undefined, rs.cookie)).body.user.email, 'vera@mail.com');
    assert.equal((await req('POST', '/api/auth/reset', { t: link(inv), password: 'outrasenha1' })).status, 400, 'convite usado não vale de novo');

    // esqueci a senha: mesma resposta para e-mail que não existe; link troca a senha e derruba sessões antigas
    const n0 = sent.length;
    assert.equal((await req('POST', '/api/auth/forgot', { email: 'ninguem@mail.com' })).status, 200);
    assert.equal(sent.length, n0, 'não envia para e-mail inexistente');
    const old = (await req('POST', '/api/auth/login', { email: 'vera@mail.com', password: 'minhasenha1' })).cookie;
    assert.equal((await req('POST', '/api/auth/forgot', { email: 'VERA@mail.com' })).body.ok, true);
    const fr = sent.at(-1)!;
    assert.equal(fr.to, 'vera@mail.com');
    assert.equal((await req('POST', '/api/auth/reset', { t: link(fr), password: 'novasenha22' })).status, 200);
    assert.equal((await req('GET', '/api/auth/me', undefined, old)).status, 401, 'sessão antiga cai');
    assert.equal((await req('POST', '/api/auth/login', { email: 'vera@mail.com', password: 'minhasenha1' })).status, 401);
    assert.equal((await req('POST', '/api/auth/login', { email: 'vera@mail.com', password: 'novasenha22' })).status, 200);
    assert.equal((await req('GET', '/api/auth/token?t=1.' + 'x'.repeat(40))).status, 400);
    // vendedor não envia convite
    const vc = (await req('POST', '/api/auth/login', { email: 'vera@mail.com', password: 'novasenha22' })).cookie;
    assert.equal((await req('POST', `/api/users/${u.body.id}/invite`, {}, vc)).status, 403);
  } finally {
    s2.close();
    t2.close();
    rmSync(dir2, { recursive: true, force: true });
  }
});

test('FIPE pelo servidor (API v2): lista, código FIPE, histórico, cache e erros', async () => {
  const { fipeRoutes, parseValor, parseMes } = await import('../server/routes/fipe.ts');
  assert.equal(parseValor('R$ 85.608,00'), 85608);
  assert.equal(parseMes('março de 2026'), '2026-03');
  assert.equal(parseMes('novembro de 2026 '), '2026-11');
  const calls: string[] = [];
  const preco = { brand: 'Fiat', codeFipe: '001267-0', fuel: 'Gasolina', fuelAcronym: 'G', model: 'Uno', modelYear: 2020, price: 'R$ 50.100,00', referenceMonth: 'novembro de 2026', vehicleType: 1, priceHistory: [{ month: 'outubro de 2026', price: 'R$ 50.900,00', reference: '330' }, { month: 'setembro de 2026', price: 'R$ 51.200,00', reference: '329' }] };
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    assert.equal(init?.redirect, 'error');
    if (url === 'http://fipe/cars/brands') return new Response(JSON.stringify([{ code: '21', name: 'Fiat' }, { code: '../x', name: 'ruim' }]), { status: 200 });
    if (url.endsWith('/cars/brands/21/models/9/years/2020-1')) return new Response(JSON.stringify(preco), { status: 200 });
    if (url === 'http://fipe/cars/001267-0/years') return new Response(JSON.stringify([{ code: '2020-1', name: '2020 Gasolina' }]), { status: 200 });
    if (url === 'http://fipe/cars/001267-0/years/2020-1') return new Response(JSON.stringify(preco), { status: 200 });
    if (url === 'http://fipe/motorcycles/brands') return new Response('{}', { status: 429 });
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  const dir3 = mkdtempSync(join(tmpdir(), 'patio-fipe-'));
  const t3 = new Tenants(dir3);
  const s3 = createApp(t3, { uploadDir: join(dir3, 'uploads'), fipe: fipeRoutes({ fetchImpl: fake, baseUrl: 'http://fipe' }), limits: { signupPerHour: 100, loginPer15Min: 100 } }).listen(0);
  const b3 = `http://127.0.0.1:${(s3.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(b3 + '/api/fipe/carros/marcas')).status, 401, 'exige login');
    const su = await fetch(b3 + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ company_name: 'F', name: 'F', email: 'f@f.com', password: 'segredo123', accept_terms: true }) });
    const ck = su.headers.get('set-cookie')!.split(';')[0]!;
    const get = (p: string) => fetch(b3 + '/api/fipe' + p, { headers: { cookie: ck } });
    assert.deepEqual(await (await get('/carros/marcas')).json(), [{ codigo: '21', nome: 'Fiat' }], 'converte {code,name} e descarta código estranho');
    await get('/carros/marcas');
    assert.equal(calls.filter((c) => c === 'http://fipe/cars/brands').length, 1, 'segunda consulta vem do cache');
    const p = (await (await get('/carros/marcas/21/modelos/9/anos/2020-1')).json()) as any;
    assert.equal(p.valor, 50100);
    assert.equal(p.codigo, '001267-0');
    assert.equal(p.ref, '2026-11');
    assert.deepEqual(p.historico, [{ m: '2026-09', val: 51200 }, { m: '2026-10', val: 50900 }]);
    assert.deepEqual(await (await get('/carros/codigo/001267-0/anos')).json(), [{ codigo: '2020-1', nome: '2020 Gasolina' }]);
    assert.equal(((await (await get('/carros/codigo/001267-0/anos/2020-1')).json()) as any).valor, 50100);
    assert.equal((await get('/carros/codigo/12345/anos')).status, 400, 'código FIPE fora do formato');
    assert.equal((await get('/motos/marcas')).status, 502, 'limite diário vira mensagem amigável');
    assert.match(((await (await get('/motos/marcas')).json()) as any).error, /Limite diário/);
    assert.equal((await get('/carros/marcas/21/modelos')).status, 502);
    assert.equal((await get('/barcos/marcas')).status, 400);
    assert.equal((await get('/carros/marcas/..%2F../modelos')).status, 400, 'código com caracteres estranhos é recusado');
  } finally {
    s3.close();
    t3.close();
    rmSync(dir3, { recursive: true, force: true });
  }
});

test('gravações simultâneas do mesmo registro são juntadas e backup copia fotos', async () => {
  const { merge3 } = await import('../server/store.ts');
  const base = JSON.stringify({ id: 1, venda: 100, cor: 'Branco', km: 10 });
  const cur = JSON.stringify({ id: 1, venda: 150, cor: 'Branco', km: 10 }); // outra pessoa mudou o preço
  const inc = JSON.stringify({ id: 1, venda: 100, cor: 'Azul', km: 10 }); // esta pessoa mudou a cor
  assert.deepEqual(JSON.parse(merge3(base, cur, inc)), { id: 1, venda: 150, cor: 'Azul', km: 10 });
  const lb = JSON.stringify([{ id: 1, v: 1 }, { id: 2, v: 2 }]);
  const lc = JSON.stringify([{ id: 1, v: 1 }, { id: 2, v: 20 }, { id: 3, v: 3 }]);
  const li = JSON.stringify([{ id: 2, v: 2 }, { id: 4, v: 4 }]); // removeu o 1 e criou o 4
  assert.deepEqual(JSON.parse(merge3(lb, lc, li)), [{ id: 2, v: 20 }, { id: 3, v: 3 }, { id: 4, v: 4 }]);

  const admin = await login('admin@t.com', 'segredo1');
  const k = 'm:veh:777';
  await call('POST', '/api/store/save', { put: [[k, base]] }, admin);
  await call('POST', '/api/store/save', { put: [[k, cur, base]] }, admin);
  const r = await call('POST', '/api/store/save', { put: [[k, inc, base]] }, admin);
  assert.deepEqual(r.body.merged.map((x: any) => [x[0], JSON.parse(x[1]).venda, JSON.parse(x[1]).cor]), [[k, 150, 'Azul']]);

  const { backupAll } = await import('../server/backup.ts');
  const up = join(dir, 'up-test');
  const { mkdirSync, writeFileSync, readdirSync } = await import('node:fs');
  mkdirSync(up, { recursive: true });
  writeFileSync(join(up, '1-abc.jpg'), 'x');
  const b = backupAll(tenants, join(dir, 'bk'), 3, up);
  assert.equal(b.photos, 1);
  assert.ok(readdirSync(join(dir, 'bk', 'fotos')).includes('1-abc.jpg'));
  assert.equal(backupAll(tenants, join(dir, 'bk'), 3, up).photos, 0, 'foto já copiada não é copiada de novo');
});

test('canais de anúncio: feed por portal, catálogo da Meta e registro de leitura', async () => {
  const a = await login('admin@t.com', 'segredo1');
  const base1 = { marca: 'Fiat', modelo: 'Pulse', versao: 'Drive 1.3', anoFab: 2023, anoMod: 2024, km: 18000, cambio: 'Automático', combustivel: 'Flex', carroceria: 'SUV', cor: 'Prata', placa: 'ABC1D23', status: 'estoque', venda: 99900, compra: 80000, galeria: [{ id: 'g1', img: '/uploads/p.jpg' }] };
  const put = [
    ['m:veh:20001', JSON.stringify({ ...base1, id: 20001, pubs: { site: true, napista: true, facebook: true } })],
    ['m:veh:20002', JSON.stringify({ ...base1, id: 20002, modelo: 'Argo', pubs: { site: true, chavesnamao: true } })],
    ['m:veh:20003', JSON.stringify({ ...base1, id: 20003, modelo: 'Toro', status: 'vendido', pubs: { napista: true, facebook: true } })],
    ['v:cfg', JSON.stringify({ loja: { fantasia: 'Loja Teste', cidade: 'Umuarama-PR', cep: '87500-000', endereco: 'Av. Brasil, 100' } })],
  ];
  assert.equal((await call('POST', '/api/store/save', { put, del: [] }, a)).status, 200);

  const get = async (p: string, ua = 'teste') => { const r = await fetch(base + `/api/public/${slug}${p}`, { headers: { 'user-agent': ua } }); return { status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text() }; };
  const np = await get('/feed/napista.xml', 'NaPistaBot/1.0');
  assert.equal(np.status, 200);
  assert.match(np.type, /xml/);
  assert.ok(np.text.includes('Pulse') && !np.text.includes('Argo') && !np.text.includes('Toro'), 'só os marcados no canal e em estoque');
  assert.ok(!np.text.includes('80000'), 'preço de compra não vaza');
  const cm = await get('/feed/chavesnamao.xml');
  assert.ok(cm.text.includes('Argo') && !cm.text.includes('Pulse'));
  assert.equal((await get('/feed/..%2Fx.xml')).status, 404);
  assert.equal((await get('/feed/A_B.xml')).status, 404);

  const meta = await get('/meta.xml');
  assert.equal(meta.status, 200);
  for (const tag of ['<vehicle_id>20001</vehicle_id>', '<make>Fiat</make>', '<price>99900 BRL</price>', '<state_of_vehicle>USED</state_of_vehicle>', '<transmission>AUTOMATIC</transmission>', '<fuel_type>FLEX</fuel_type>', '<body_style>SUV</body_style>', '<component name="city">Umuarama</component>', '<component name="region">PR</component>', '<component name="country">BR</component>', `/v/${slug}/20001</url>`])
    assert.ok(meta.text.includes(tag), 'meta.xml sem ' + tag);
  assert.ok(!meta.text.includes('Toro') && !meta.text.includes('Argo'));

  const feeds = (await call('GET', '/api/store/feeds', undefined, a)).body;
  assert.equal(feeds.napista.itens, 1);
  assert.equal(feeds.napista.ua, 'NaPistaBot/1.0');
  assert.equal(feeds.facebook.itens, 1);
  assert.equal((await call('GET', '/api/store/feeds')).status, 401);
});
