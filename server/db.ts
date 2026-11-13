import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { STORE_SCHEMA } from './store.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin','gerente','vendedor')),
  commission_rate REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  document TEXT,
  phone TEXT,
  email TEXT,
  birth_date TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  plate TEXT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  version TEXT,
  year_fab INTEGER,
  year_model INTEGER,
  color TEXT,
  fuel TEXT,
  transmission TEXT,
  km INTEGER NOT NULL DEFAULT 0,
  doors INTEGER,
  chassis TEXT,
  renavam TEXT,
  status TEXT NOT NULL DEFAULT 'preparacao'
    CHECK (status IN ('preparacao','disponivel','reservado','vendido')),
  purchase_price REAL NOT NULL DEFAULT 0,
  sale_price REAL NOT NULL DEFAULT 0,
  fipe_price REAL,
  purchase_date TEXT,
  supplier TEXT,
  description TEXT,
  features TEXT NOT NULL DEFAULT '[]',
  featured INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicle_photos (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vehicle_costs (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outros',
  estimated REAL NOT NULL DEFAULT 0,
  actual REAL,
  date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','publicado','pausado','removido')),
  external_url TEXT,
  price REAL,
  views INTEGER NOT NULL DEFAULT 0,
  contacts INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (vehicle_id, channel)
);

CREATE TABLE IF NOT EXISTS appraisals (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  appraiser_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  plate TEXT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  version TEXT,
  year_model INTEGER,
  km INTEGER,
  color TEXT,
  market_price REAL NOT NULL DEFAULT 0,
  margin_percent REAL NOT NULL DEFAULT 15,
  offered_price REAL,
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','concluida','aprovada','recusada','convertida')),
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appraisal_items (
  id INTEGER PRIMARY KEY,
  appraisal_id INTEGER NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  item TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'ok' CHECK (condition IN ('ok','atencao','ruim','na')),
  repair_cost REAL NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS appraisal_photos (
  id INTEGER PRIMARY KEY,
  appraisal_id INTEGER NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  filename TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'loja',
  stage TEXT NOT NULL DEFAULT 'novo'
    CHECK (stage IN ('novo','contato','visita','proposta','ganho','perdido')),
  value REAL,
  notes TEXT,
  lost_reason TEXT,
  next_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'nota',
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  sale_date TEXT NOT NULL,
  sale_price REAL NOT NULL,
  down_payment REAL NOT NULL DEFAULT 0,
  financed_amount REAL NOT NULL DEFAULT 0,
  bank TEXT,
  installments INTEGER,
  trade_in_value REAL NOT NULL DEFAULT 0,
  trade_in_vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'a_vista',
  commission REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'concluida' CHECK (status IN ('concluida','cancelada')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('receita','despesa')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  paid_at TEXT,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_transactions_due ON transactions(due_date);
`;

export type DB = DatabaseSync;

export function openDatabase(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  db.exec(STORE_SCHEMA);
  return db;
}

/** Executa `fn` dentro de uma transação, desfazendo tudo em caso de erro. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
