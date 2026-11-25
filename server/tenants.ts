// Empresas (multiempresa): um banco central guarda as empresas e qual e-mail pertence a qual empresa;
// cada empresa tem o próprio banco SQLite, com o mesmo esquema do sistema. Assim os dados de uma loja
// nunca ficam na mesma tabela que os de outra, e as rotas de negócio continuam iguais.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase, type DB } from './db.ts';
import { HttpError } from './http.ts';

const CONTROL_SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  document TEXT,
  city TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','suspensa')),
  terms_accepted_at TEXT,
  trial_ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE
);
`;

export interface Company {
  id: number;
  slug: string;
  name: string;
  document: string | null;
  city: string | null;
  phone: string | null;
  status: 'ativa' | 'suspensa';
  terms_accepted_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface Tenant {
  company: Company;
  db: DB;
  /** Rotas internas desta empresa, montadas uma vez e reaproveitadas. */
  routers: Record<string, unknown>;
}

export const TRIAL_DAYS = 30;

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'loja'
  );
}

export class Tenants {
  readonly control: DB;
  readonly dataDir: string;
  private cache = new Map<number, Tenant>();
  private seen = new Map<number, number>();

  constructor(dataDir: string, controlFile = join(dataDir, 'control.db')) {
    this.dataDir = dataDir;
    if (controlFile !== ':memory:') mkdirSync(dataDir, { recursive: true });
    this.control = new DatabaseSync(controlFile);
    this.control.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.control.exec(CONTROL_SCHEMA);
  }

  dbFile(id: number) {
    return join(this.dataDir, 'empresas', String(id), 'patio.db');
  }

  private company(where: string, value: unknown): Company | undefined {
    return this.control.prepare(`SELECT * FROM companies WHERE ${where} = ?`).get(value as any) as unknown as Company | undefined;
  }

  get(id: number | null | undefined): Tenant | null {
    if (!id || !Number.isInteger(id)) return null;
    const company = this.company('id', id);
    if (!company) {
      this.cache.delete(id);
      return null;
    }
    let t = this.cache.get(id);
    if (!t) {
      t = { company, db: openDatabase(this.dbFile(id)), routers: {} };
      this.cache.set(id, t);
    } else {
      t.company = company;
    }
    return t;
  }

  bySlug(slug: string): Tenant | null {
    const c = this.company('slug', slug);
    return c ? this.get(c.id) : null;
  }

  all(): Company[] {
    return this.control.prepare('SELECT * FROM companies ORDER BY created_at DESC').all() as unknown as Company[];
  }

  companyForEmail(email: string): number | null {
    const row = this.control.prepare('SELECT company_id FROM accounts WHERE email = ?').get(email.trim()) as { company_id: number } | undefined;
    return row?.company_id ?? null;
  }

  /** Reserva o e-mail para esta empresa. Um e-mail só pode entrar em uma empresa. */
  claim(email: string, companyId: number) {
    const owner = this.companyForEmail(email);
    if (owner && owner !== companyId) throw new HttpError(409, 'Este e-mail já está em uso em outra empresa cadastrada no Pátio.');
    if (!owner) this.control.prepare('INSERT INTO accounts (email, company_id) VALUES (?, ?)').run(email.trim(), companyId);
  }

  release(email: string, companyId: number) {
    this.control.prepare('DELETE FROM accounts WHERE email = ? AND company_id = ?').run(email.trim(), companyId);
  }

  uniqueSlug(name: string): string {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; this.company('slug', slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  create(data: { name: string; document?: string | null; city?: string | null; phone?: string | null; termsAccepted?: boolean }): Tenant {
    const trial = new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString().slice(0, 10);
    const info = this.control
      .prepare('INSERT INTO companies (slug, name, document, city, phone, terms_accepted_at, trial_ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(this.uniqueSlug(data.name), data.name, data.document ?? null, data.city ?? null, data.phone ?? null,
        data.termsAccepted ? new Date().toISOString() : null, trial);
    return this.get(Number(info.lastInsertRowid))!;
  }

  /** Desfaz um cadastro que falhou no meio (remove registro, e-mails e arquivos da empresa). */
  destroy(id: number) {
    const t = this.cache.get(id);
    if (t) {
      try { t.db.close(); } catch { /* já fechado */ }
      this.cache.delete(id);
    }
    this.control.prepare('DELETE FROM companies WHERE id = ?').run(id);
    rmSync(join(this.dataDir, 'empresas', String(id)), { recursive: true, force: true });
  }

  setStatus(id: number, status: Company['status']) {
    this.control.prepare('UPDATE companies SET status = ? WHERE id = ?').run(status, id);
  }

  /** Registra o último uso da empresa (no máximo uma escrita a cada 5 minutos). */
  touch(id: number) {
    const now = Date.now();
    if (now - (this.seen.get(id) ?? 0) < 300_000) return;
    this.seen.set(id, now);
    this.control.prepare('UPDATE companies SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), id);
  }

  close() {
    for (const t of this.cache.values()) {
      try { t.db.close(); } catch { /* já fechado */ }
    }
    this.cache.clear();
    this.control.close();
  }
}
