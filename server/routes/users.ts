import { Router } from 'express';
import type { DB } from '../db.ts';
import { hashPassword, requireRole, sessionToken, verifyPassword } from '../auth.ts';
import { HttpError, idParam, notFound, num, oneOf, str } from '../http.ts';
import { EMAIL_RE } from '../security.ts';

const ROLES = ['admin', 'gerente', 'vendedor'] as const;
const PUBLIC_FIELDS = 'id, name, email, role, commission_rate, active, created_at';

/** Ganchos para manter o índice central de e-mails (login multiempresa) em dia. */
export interface AccountHooks {
  claim(email: string): void;
  release(email: string): void;
}

const noHooks: AccountHooks = { claim() {}, release() {} };

export function userRoutes(db: DB, accounts: AccountHooks = noHooks) {
  const r = Router();

  // Lista resumida para seletores (vendedor responsável etc.), disponível a todos.
  r.get('/options', (_req, res) => {
    res.json(db.prepare('SELECT id, name, role FROM users WHERE active = 1 ORDER BY name').all());
  });

  r.post('/me/password', (req, res) => {
    const current = str(req.body, 'current', { required: true, label: 'senha atual' })!;
    const next = str(req.body, 'password', { required: true, label: 'nova senha' })!;
    if (next.length < 6) throw new HttpError(400, 'A nova senha deve ter pelo menos 6 caracteres.');
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
    if (!verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Senha atual incorreta.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user!.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user!.id, sessionToken(req) ?? '');
    res.json({ ok: true });
  });

  r.use(requireRole('admin'));

  r.get('/', (_req, res) => {
    res.json(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users ORDER BY name`).all());
  });

  r.post('/', (req, res) => {
    const password = str(req.body, 'password', { required: true, label: 'senha' })!;
    if (password.length < 6) throw new HttpError(400, 'A senha deve ter pelo menos 6 caracteres.');
    const email = str(req.body, 'email', { required: true, label: 'e-mail' })!.toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
    accounts.claim(email);
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, role, commission_rate) VALUES (?, ?, ?, ?, ?)')
      .run(
        str(req.body, 'name', { required: true, label: 'nome' }),
        email,
        hashPassword(password),
        oneOf(req.body, 'role', ROLES, 'vendedor'),
        num(req.body, 'commission_rate', { min: 0 }) ?? 0,
      );
    res.status(201).json(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(info.lastInsertRowid));
  });

  r.put('/:id', (req, res) => {
    const id = idParam(req);
    const existing = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id) as { id: number; email: string } | undefined;
    if (!existing) throw notFound('Usuário');
    const email = str(req.body, 'email', { required: true, label: 'e-mail' })!.toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (email !== existing.email.toLowerCase()) {
      if (db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').get(email, id)) throw new HttpError(409, 'Já existe um usuário com este e-mail.');
      accounts.claim(email);
      accounts.release(existing.email);
    }
    const active = req.body.active === false || req.body.active === 0 ? 0 : 1;
    if (id === req.user!.id && (active === 0 || req.body.role !== 'admin')) {
      throw new HttpError(400, 'Você não pode remover seu próprio acesso de administrador.');
    }
    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, commission_rate = ?, active = ? WHERE id = ?').run(
      str(req.body, 'name', { required: true, label: 'nome' }),
      email,
      oneOf(req.body, 'role', ROLES),
      num(req.body, 'commission_rate', { min: 0 }) ?? 0,
      active,
      id,
    );
    const password = str(req.body, 'password');
    if (password) {
      if (password.length < 6) throw new HttpError(400, 'A senha deve ter pelo menos 6 caracteres.');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
    }
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    res.json(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id));
  });

  return r;
}
