import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { DB } from './db.ts';
import { HttpError } from './http.ts';

export type Role = 'admin' | 'gerente' | 'vendedor';

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

const SESSION_DAYS = 7;
export const SESSION_COOKIE = 'patio_session';

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function createSession(db: DB, userId: number): { token: string; expires: Date } {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires.toISOString());
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  return { token, expires };
}

export function destroySession(db: DB, token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionToken(req: Request) {
  return readToken(req);
}

export function requireAuth(db: DB) {
  const stmt = db.prepare(`
    SELECT u.id, u.name, u.email, u.role FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1`);
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    const user = token ? (stmt.get(token, new Date().toISOString()) as SessionUser | undefined) : undefined;
    if (!user) return next(new HttpError(401, 'Sessão expirada. Faça login novamente.'));
    req.user = { ...user };
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return next(new HttpError(403, 'Sem permissão para esta ação.'));
    next();
  };
}
