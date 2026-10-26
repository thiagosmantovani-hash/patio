import { Router } from 'express';
import type { DB } from '../db.ts';
import { createSession, destroySession, requireAuth, SESSION_COOKIE, sessionToken, verifyPassword } from '../auth.ts';
import { HttpError, str } from '../http.ts';

export function authRoutes(db: DB) {
  const r = Router();

  r.post('/login', (req, res) => {
    const email = str(req.body, 'email', { required: true, label: 'e-mail' })!;
    const password = str(req.body, 'password', { required: true, label: 'senha' })!;
    const user = db.prepare('SELECT id, name, email, role, password_hash, active FROM users WHERE email = ?').get(email) as
      | { id: number; name: string; email: string; role: string; password_hash: string; active: number }
      | undefined;
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    const { token, expires } = createSession(db, user.id);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', expires, path: '/' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  r.post('/logout', (req, res) => {
    const token = sessionToken(req);
    if (token) destroySession(db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/me', requireAuth(db), (req, res) => {
    res.json({ user: req.user });
  });

  return r;
}
