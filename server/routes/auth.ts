import { Router, type Request, type Response } from 'express';
import { hashPassword, createSession, destroySession, SESSION_COOKIE, sessionCompany, sessionToken, sessionUser, sessionValue, verifyPassword } from '../auth.ts';
import { tx } from '../db.ts';
import { HttpError, str } from '../http.ts';
import { EMAIL_RE, rateLimiter } from '../security.ts';
import type { Tenant, Tenants } from '../tenants.ts';
import { readSettings } from './settings.ts';

export interface AuthOptions {
  /** Cookie só por HTTPS (produção). */
  secureCookies?: boolean;
  /** E-mails com acesso ao painel da plataforma (lista de empresas). */
  platformAdmins?: string[];
  /** Limites por IP: cadastros por hora e tentativas de login a cada 15 minutos. */
  limits?: { signupPerHour?: number; loginPer15Min?: number };
}

export const companyInfo = (t: Tenant) => {
  const s = readSettings(t.db);
  return { id: t.company.id, slug: t.company.slug, name: s.store_name || t.company.name, trial_ends_at: t.company.trial_ends_at, created_at: t.company.created_at };
};

const isPlatform = (opts: AuthOptions, email: string) => (opts.platformAdmins ?? []).includes(email.toLowerCase());

function setSession(res: Response, opts: AuthOptions, t: Tenant, userId: number) {
  const { token, expires } = createSession(t.db, userId);
  res.cookie(SESSION_COOKIE, sessionValue(t.company.id, token), { httpOnly: true, sameSite: 'lax', secure: Boolean(opts.secureCookies), expires, path: '/' });
}

const ip = (req: Request) => req.ip ?? 'desconhecido';

export function authRoutes(tenants: Tenants, opts: AuthOptions) {
  const r = Router();
  const loginLimit = rateLimiter(opts.limits?.loginPer15Min ?? 10, 15 * 60_000);
  const signupLimit = rateLimiter(opts.limits?.signupPerHour ?? 5, 60 * 60_000);

  r.post('/login', (req, res) => {
    const email = str(req.body, 'email', { required: true, label: 'e-mail' })!.toLowerCase();
    const password = str(req.body, 'password', { required: true, label: 'senha' })!;
    loginLimit.hit(`${ip(req)}|${email}`);
    const t = tenants.get(tenants.companyForEmail(email));
    const user = t?.db.prepare('SELECT id, name, email, role, password_hash, active FROM users WHERE email = ?').get(email) as
      | { id: number; name: string; email: string; role: string; password_hash: string; active: number }
      | undefined;
    if (!t || !user || !user.active || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    if (t.company.status !== 'ativa') throw new HttpError(403, 'O acesso desta empresa está suspenso. Fale com o suporte do Pátio.');
    loginLimit.reset(`${ip(req)}|${email}`);
    setSession(res, opts, t, user.id);
    tenants.touch(t.company.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, company: companyInfo(t), platform: isPlatform(opts, user.email) });
  });

  /** Cadastro de uma nova empresa: cria o banco da loja e o primeiro usuário (administrador). */
  r.post('/signup', (req, res) => {
    signupLimit.hit(ip(req));
    const companyName = str(req.body, 'company_name', { required: true, label: 'nome da loja' })!;
    const name = str(req.body, 'name', { required: true, label: 'seu nome' })!;
    const email = str(req.body, 'email', { required: true, label: 'e-mail' })!.toLowerCase();
    const password = str(req.body, 'password', { required: true, label: 'senha' })!;
    const document = str(req.body, 'document');
    const city = str(req.body, 'city');
    const phone = str(req.body, 'phone');
    if (companyName.length > 80 || name.length > 80) throw new HttpError(400, 'Nome muito longo.');
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (password.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    if (req.body.accept_terms !== true) throw new HttpError(400, 'É preciso aceitar os termos de uso e a política de privacidade.');
    if (tenants.companyForEmail(email)) throw new HttpError(409, 'Este e-mail já tem uma conta no Pátio. Use a opção Entrar.');

    const t = tenants.create({ name: companyName, document, city, phone, termsAccepted: true });
    let userId: number;
    try {
      userId = tx(t.db, () => {
        const upsert = t.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
        upsert.run('store_name', JSON.stringify(companyName));
        if (document) upsert.run('document', JSON.stringify(document));
        if (city) upsert.run('city', JSON.stringify(city));
        if (phone) {
          upsert.run('phone', JSON.stringify(phone));
          upsert.run('whatsapp', JSON.stringify(phone));
        }
        upsert.run('email', JSON.stringify(email));
        return Number(
          t.db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run(name, email, hashPassword(password)).lastInsertRowid,
        );
      });
      tenants.claim(email, t.company.id);
    } catch (err) {
      tenants.destroy(t.company.id);
      throw err;
    }
    setSession(res, opts, t, userId);
    console.log(`[cadastro] nova empresa #${t.company.id} "${companyName}" (${t.company.slug})`);
    res.status(201).json({ user: { id: userId, name, email, role: 'admin' }, company: companyInfo(t), platform: isPlatform(opts, email) });
  });

  r.post('/logout', (req, res) => {
    const t = tenants.get(sessionCompany(req));
    const token = sessionToken(req);
    if (t && token) destroySession(t.db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  r.get('/me', (req, res) => {
    const t = tenants.get(sessionCompany(req));
    const user = t && t.company.status === 'ativa' ? sessionUser(t.db, req) : null;
    if (!t || !user) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
    tenants.touch(t.company.id);
    res.json({ user, company: companyInfo(t), platform: isPlatform(opts, user.email) });
  });

  return r;
}
