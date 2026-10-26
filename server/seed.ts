// Popula o banco com dados de demonstração usando a própria API (mesmas regras de negócio).
// Uso: npm run seed            (recria data/patio.db)
import { rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { openDatabase } from './db.ts';

const root = resolve(import.meta.dirname, '..');
const dataDir = process.env.DATA_DIR ?? join(root, 'data');
const dbFile = join(dataDir, 'patio.db');
for (const suffix of ['', '-wal', '-shm']) rmSync(dbFile + suffix, { force: true });

const db = openDatabase(dbFile);
db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Administrador', 'admin@patio.local', ?, 'admin')").run(hashPassword('admin123'));

const server = createApp(db, { uploadDir: join(dataDir, 'uploads') }).listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
let cookie = '';

async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0]!;
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error}`);
  return data as T;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

try {
  await api('POST', '/auth/login', { email: 'admin@patio.local', password: 'admin123' });

  await api('PUT', '/settings', {
    store_name: 'Pátio Automóveis',
    document: '12.345.678/0001-90',
    phone: '(11) 3333-4444',
    whatsapp: '(11) 99999-0000',
    email: 'contato@patioautomoveis.com.br',
    address: 'Av. das Nações, 1500',
    city: 'São Paulo - SP',
    about: 'Seminovos revisados, com garantia e procedência. Financiamento facilitado e avaliação justa do seu usado.',
    default_margin: 15,
  });

  const manager = await api('POST', '/users', { name: 'Carla Menezes', email: 'carla@patio.local', password: 'patio123', role: 'gerente', commission_rate: 0 });
  const sellerA = await api('POST', '/users', { name: 'Rafael Souza', email: 'rafael@patio.local', password: 'patio123', role: 'vendedor', commission_rate: 1 });
  const sellerB = await api('POST', '/users', { name: 'Juliana Prado', email: 'juliana@patio.local', password: 'patio123', role: 'vendedor', commission_rate: 1.2 });
  const sellers = [sellerA.id, sellerB.id, manager.id];

  const customerData = [
    ['Marcos Oliveira', '(11) 98111-2233', 'marcos.oliveira@email.com', 'São Paulo'],
    ['Fernanda Lima', '(11) 97222-3344', 'fernanda.lima@email.com', 'Guarulhos'],
    ['João Pedro Santos', '(11) 96333-4455', 'joaopedro@email.com', 'Osasco'],
    ['Patrícia Gomes', '(11) 95444-5566', 'patricia.gomes@email.com', 'São Paulo'],
    ['Ricardo Alves', '(11) 94555-6677', 'ricardo.alves@email.com', 'Santo André'],
    ['Aline Costa', '(11) 93666-7788', 'aline.costa@email.com', 'São Bernardo do Campo'],
    ['Bruno Martins', '(11) 92777-8899', 'bruno.martins@email.com', 'São Paulo'],
    ['Camila Rocha', '(11) 91888-9900', 'camila.rocha@email.com', 'Barueri'],
    ['Diego Fernandes', '(11) 98999-0011', 'diego.f@email.com', 'São Paulo'],
    ['Eduarda Ribeiro', '(11) 97000-1122', 'eduarda.r@email.com', 'Taboão da Serra'],
    ['Gustavo Pereira', '(11) 96111-2233', 'gustavo.p@email.com', 'São Paulo'],
    ['Helena Barbosa', '(11) 95222-3344', 'helena.b@email.com', 'Mogi das Cruzes'],
  ];
  const customers = [];
  for (const [name, phone, email, city] of customerData) customers.push(await api('POST', '/customers', { name, phone, email, city, state: 'SP' }));

  const F = ['Ar-condicionado', 'Direção elétrica', 'Vidros elétricos', 'Travas elétricas', 'Alarme'];
  const vehicleData: [string, string, string, number, number, string, string, string, number, number, number, number][] = [
    // marca, modelo, versão, ano, km, cor, combustível, câmbio, compra, venda, FIPE, dias desde a compra
    ['Volkswagen', 'Polo', '1.0 TSI Highline', 2022, 38000, 'Branco', 'Flex', 'Automático', 82000, 96900, 98500, 12],
    ['Chevrolet', 'Onix', '1.0 Turbo LTZ', 2021, 52000, 'Prata', 'Flex', 'Automático', 68000, 79900, 81200, 25],
    ['Fiat', 'Argo', '1.3 Drive', 2020, 61000, 'Vermelho', 'Flex', 'Manual', 52000, 61900, 63000, 70],
    ['Hyundai', 'HB20', '1.0 Comfort Plus', 2021, 44000, 'Cinza', 'Flex', 'Manual', 58000, 67900, 69000, 8],
    ['Toyota', 'Corolla', '2.0 XEi', 2020, 72000, 'Preto', 'Flex', 'CVT', 105000, 122900, 124000, 40],
    ['Honda', 'HR-V', '1.8 EXL', 2019, 80000, 'Branco', 'Flex', 'CVT', 92000, 108900, 110500, 95],
    ['Jeep', 'Renegade', '1.8 Longitude', 2020, 66000, 'Azul', 'Flex', 'Automático', 79000, 92900, 94000, 18],
    ['Renault', 'Kwid', '1.0 Zen', 2022, 29000, 'Laranja', 'Flex', 'Manual', 42000, 49900, 51000, 5],
    ['Ford', 'Ka', '1.5 SE Plus', 2019, 75000, 'Prata', 'Flex', 'Automático', 50000, 58900, 60000, 62],
    ['Nissan', 'Kicks', '1.6 SV', 2021, 47000, 'Vermelho', 'Flex', 'CVT', 88000, 101900, 103500, 30],
    ['Volkswagen', 'T-Cross', '1.0 TSI Comfortline', 2022, 33000, 'Cinza', 'Flex', 'Automático', 104000, 119900, 121000, 3],
    ['Chevrolet', 'Tracker', '1.0 Turbo LT', 2021, 51000, 'Branco', 'Flex', 'Automático', 89000, 103900, 105000, 15],
    // vendidos nos últimos meses
    ['Fiat', 'Mobi', '1.0 Like', 2021, 39000, 'Branco', 'Flex', 'Manual', 41000, 48900, 50000, 160],
    ['Hyundai', 'Creta', '1.6 Action', 2022, 28000, 'Prata', 'Flex', 'Automático', 98000, 114900, 116000, 150],
    ['Toyota', 'Yaris', '1.5 XL', 2020, 58000, 'Preto', 'Flex', 'CVT', 72000, 84900, 86000, 130],
    ['Volkswagen', 'Gol', '1.0 MPI', 2019, 83000, 'Prata', 'Flex', 'Manual', 39000, 46900, 47500, 120],
    ['Chevrolet', 'Onix Plus', '1.0 Turbo Premier', 2022, 31000, 'Azul', 'Flex', 'Automático', 84000, 97900, 99000, 100],
    ['Honda', 'City', '1.5 EX', 2021, 42000, 'Cinza', 'Flex', 'CVT', 86000, 99900, 101000, 85],
    ['Renault', 'Duster', '1.6 Intense', 2020, 69000, 'Marrom', 'Flex', 'CVT', 70000, 82900, 84000, 60],
    ['Jeep', 'Compass', '2.0 Longitude', 2019, 88000, 'Branco', 'Flex', 'Automático', 108000, 124900, 126000, 45],
  ];
  const plateOf = (i: number) => `${'ABCDEFGHJK'[i % 10]}${'RSTUV'[i % 5]}${'QWXYZ'[(i * 3) % 5]}${(i % 10)}${'ABCDEFGHIJ'[(i * 7) % 10]}${String(10 + i * 3).slice(-2)}`;

  const vehicles = [];
  for (const [i, [brand, model, version, year, km, color, fuel, transmission, purchase, sale, fipe, age]] of vehicleData.entries()) {
    const v = await api('POST', '/vehicles', {
      plate: plateOf(i), brand, model, version, year_fab: year, year_model: year + (i % 3 === 0 ? 1 : 0), km, color, fuel, transmission,
      doors: 4, purchase_price: purchase, sale_price: sale, fipe_price: fipe, purchase_date: daysAgo(age),
      supplier: i % 4 === 0 ? 'Troca na venda' : i % 4 === 1 ? 'Leilão' : 'Particular',
      description: `${brand} ${model} ${version}, ${km.toLocaleString('pt-BR')} km, revisado, manual e chave reserva.`,
      features: [...F, ...(transmission !== 'Manual' ? ['Piloto automático', 'Central multimídia'] : []), ...(i % 2 ? ['Câmera de ré'] : [])],
      featured: i % 5 === 0,
      status: i < 12 && age > 7 ? 'disponivel' : 'preparacao',
    });
    vehicles.push(v);
    const costs = [
      ['Revisão completa', 'mecanica', 900 + (i % 4) * 250, i % 3 === 0 ? null : 950 + (i % 5) * 230],
      ['Polimento e higienização', 'estetica', 450, 450 + (i % 2) * 120],
      ...(i % 3 === 1 ? [['Reparo para-choque', 'funilaria', 700, i % 2 ? 980 : 650]] : []),
      ...(i % 4 === 2 ? [['Par de pneus', 'pneus', 1200, 1350]] : []),
      ['Transferência e vistoria', 'documentacao', 350, 350],
    ] as const;
    for (const [description, category, estimated, actual] of costs) {
      await api('POST', `/vehicles/${v.id}/costs`, { description, category, estimated, actual, date: daysAgo(Math.max(0, age - 3)) });
    }
  }

  // Anúncios dos veículos disponíveis
  const channels = ['Site próprio', 'OLX', 'Webmotors', 'iCarros', 'Mercado Livre', 'Facebook Marketplace'];
  for (const [i, v] of vehicles.entries()) {
    if (v.status !== 'disponivel' && i < 12) continue;
    for (const [j, channel] of channels.entries()) {
      if ((i + j) % 4 === 3) continue;
      await api('PUT', `/vehicles/${v.id}/listings/${encodeURIComponent(channel)}`, {
        status: 'publicado', views: 80 + ((i * 37 + j * 53) % 900), contacts: 2 + ((i * 7 + j * 11) % 25),
      });
    }
  }

  // Vendas (os 8 últimos veículos)
  const payments = [
    { method: 'a_vista' },
    { method: 'financiamento', down: 0.3, bank: 'Banco Alfa', installments: 48 },
    { method: 'misto', down: 0.2, trade: 0.25, bank: 'Financeira Beta', installments: 36 },
    { method: 'financiamento', down: 0.4, bank: 'Banco Gama', installments: 24 },
  ];
  const saleAges = [140, 118, 96, 75, 58, 34, 16, 6];
  const tradeIns = [
    { brand: 'Fiat', model: 'Uno', version: '1.0 Way', year_model: 2016, km: 98000, color: 'Branco' },
    { brand: 'Chevrolet', model: 'Celta', version: '1.0 LT', year_model: 2014, km: 120000, color: 'Prata' },
  ];
  let tradeIdx = 0;
  for (const [k, v] of vehicles.slice(12).entries()) {
    if (v.status === 'preparacao') await api('PATCH', `/vehicles/${v.id}/status`, { status: 'disponivel' });
    const p = payments[k % payments.length]!;
    const price = Math.round(v.sale_price * (0.97 + (k % 3) * 0.01) / 100) * 100;
    const trade = p.trade ? Math.round((price * p.trade) / 100) * 100 : 0;
    const down = p.down ? Math.round((price * p.down) / 100) * 100 : price - trade;
    const financed = price - down - trade;
    const customer = customers[k]!;
    const lead = await api('POST', '/leads', { customer_id: customer.id, vehicle_id: v.id, seller_id: sellers[k % 2], source: ['site', 'portal', 'loja', 'whatsapp', 'indicacao'][k % 5], stage: 'proposta', value: price });
    await api('POST', '/sales', {
      vehicle_id: v.id, customer_id: customer.id, seller_id: sellers[k % 2], lead_id: lead.id, sale_date: daysAgo(saleAges[k]!),
      sale_price: price, down_payment: down, financed_amount: financed, trade_in_value: trade, bank: p.bank, installments: p.installments,
      payment_method: p.method, trade_in: trade ? tradeIns[tradeIdx++ % tradeIns.length] : undefined,
    });
  }

  // Funil de leads em aberto
  const stages = ['novo', 'novo', 'contato', 'contato', 'visita', 'proposta', 'perdido', 'novo', 'contato', 'visita'];
  for (const [i, stage] of stages.entries()) {
    const v = vehicles[i % 12]!;
    const lead = await api('POST', '/leads', {
      customer_id: customers[(i + 4) % customers.length]!.id, vehicle_id: v.id, seller_id: sellers[i % 2],
      source: ['site', 'portal', 'whatsapp', 'telefone', 'redes_sociais', 'loja'][i % 6], stage: 'novo', value: v.sale_price,
      next_contact: stage === 'perdido' ? null : daysAgo(1 - (i % 4)), notes: 'Interesse em financiamento; possui usado para troca.',
    });
    await api('POST', `/leads/${lead.id}/activities`, { type: 'whatsapp', description: 'Primeiro contato realizado, enviou fotos e condições.' });
    if (stage !== 'novo') await api('PATCH', `/leads/${lead.id}/stage`, { stage, lost_reason: stage === 'perdido' ? 'Comprou em outra loja' : undefined });
  }

  // Avaliações
  const ap1 = await api('POST', '/appraisals', { customer_id: customers[2]!.id, plate: 'QWE1A23', brand: 'Volkswagen', model: 'Fox', version: '1.6 Connect', year_model: 2018, km: 76000, color: 'Prata', market_price: 48000 });
  const det1 = await api('GET', `/appraisals/${ap1.id}`);
  await api('PUT', `/appraisals/${ap1.id}/items`, {
    items: det1.items.map((it: any) =>
      it.item === 'Para-choque dianteiro' ? { ...it, condition: 'ruim', repair_cost: 800, notes: 'Trincado' }
      : it.item === 'Pneus traseiros' ? { ...it, condition: 'atencao', repair_cost: 900 }
      : it.item === 'Embreagem' ? { ...it, condition: 'atencao', repair_cost: 1200, notes: 'Patinando' }
      : it),
  });
  await api('PATCH', `/appraisals/${ap1.id}/status`, { status: 'concluida' });
  await api('POST', '/appraisals', { customer_id: customers[6]!.id, plate: 'RTY4B56', brand: 'Fiat', model: 'Toro', version: '1.8 Freedom', year_model: 2019, km: 91000, color: 'Cinza', market_price: 89000 });

  // Despesas fixas da loja
  for (let m = 0; m < 6; m++) {
    const d = new Date();
    d.setMonth(d.getMonth() - m, 5);
    const due = d.toISOString().slice(0, 10);
    const paid = m > 0 ? due : null;
    await api('POST', '/finance', { type: 'despesa', category: 'aluguel', description: 'Aluguel do pátio', amount: 8500, due_date: due, paid_at: paid });
    await api('POST', '/finance', { type: 'despesa', category: 'salarios', description: 'Folha de pagamento', amount: 14200, due_date: due, paid_at: paid });
    await api('POST', '/finance', { type: 'despesa', category: 'marketing', description: 'Planos dos portais de anúncio', amount: 1890, due_date: due, paid_at: paid });
  }
  // Repasses de financiamento antigos já recebidos
  db.prepare("UPDATE transactions SET paid_at = due_date WHERE category IN ('financiamento','comissao') AND due_date < date('now')").run();

  console.log('Dados de demonstração criados.');
  console.log('Acessos: admin@patio.local / admin123 · carla@patio.local / patio123 (gerente) · rafael@patio.local / patio123 (vendedor)');
} finally {
  server.close();
  db.close();
}
