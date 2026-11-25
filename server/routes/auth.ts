import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { checkUserToken, hashPassword, createSession, destroySession, SESSION_COOKIE, sessionCompany, sessionToken, sessionUser, sessionValue, verifyPassword } from '../auth.ts';
import { mailerOf, sendReset, sendVerify, splitLink, type MailOptions } from '../accountMail.ts';
import type { DB } from '../db.ts';
import { tx } from '../db.ts';
import { HttpError, str } from '../http.ts';
import { EMAIL_RE, MIN_PASSWORD, rateLimiter } from '../security.ts';
import type { Tenant, Tenants } from '../tenants.ts';
import { readSettings } from './settings.ts';

export interface AuthOptions extends MailOptions {
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

export const isPlatform = (opts: AuthOptions, email: string) => (opts.platformAdmins ?? []).includes(email.toLowerCase());

export const emailVerified = (db: DB, userId: number) =>
  Boolean((db.prepare('SELECT email_verified_at AS v FROM users WHERE id = ?').get(userId) as { v: string | null } | undefined)?.v);

/** Menu Plataforma: e-mail na lista PLATFORM_ADMINS e, se o envio de e-mails estiver ligado, e-mail confirmado. */
export const platformAllowed = (opts: AuthOptions, db: DB, user: { id: number; email: string }) =>
  isPlatform(opts, user.email) && (!mailerOf(opts).enabled || emailVerified(db, user.id));

/** Informações da conta que as telas usam (e-mail confirmado, envio de e-mail ligado, plataforma). */
export const accountInfo = (opts: AuthOptions, db: DB, user: { id: number; email: string }) => ({
  email_verified: emailVerified(db, user.id),
  mail: mailerOf(opts).enabled,
  platform: platformAllowed(opts, db, user),
});

function setSession(res: Response, opts: AuthOptions, t: Tenant, userId: number) {
  const { token, expires } = createSession(t.db, userId);
  res.cookie(SESSION_COOKIE, sessionValue(t.company.id, token), { httpOnly: true, sameSite: 'lax', secure: Boolean(opts.secureCookies), expires, path: '/' });
}

const ip = (req: Request) => req.ip ?? 'desconhecido';
/** Hash descartável: o login gasta o mesmo tempo com e-mail existente ou não. */
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export function authRoutes(tenants: Tenants, opts: AuthOptions) {
  const r = Router();
  const loginLimit = rateLimiter(opts.limits?.loginPer15Min ?? 10, 15 * 60_000);
  const signupLimit = rateLimiter(opts.limits?.signupPerHour ?? 5, 60 * 60_000);
  const forgotLimit = rateLimiter(opts.limits?.loginPer15Min ?? 10, 15 * 60_000);

  r.post('/login', (req, res) => {
    const email = str(req.body, 'email', { required: true, label: 'e-mail' })!.toLowerCase();
    const password = str(req.body, 'password', { required: true, label: 'senha' })!;
    loginLimit.hit(`${ip(req)}|${email}`);
    const t = tenants.get(tenants.companyForEmail(email));
    const user = t?.db.prepare('SELECT id, name, email, role, password_hash, active FROM users WHERE email = ?').get(email) as
      | { id: number; name: string; email: string; role: string; password_hash: string; active: number }
      | undefined;
    const ok = user ? verifyPassword(password, user.password_hash) : verifyPassword(password, DUMMY_HASH);
    if (!t || !user || !user.active || !ok) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    if (t.company.status !== 'ativa') throw new HttpError(403, 'O acesso desta empresa está suspenso. Fale com o suporte do Pátio.');
    loginLimit.reset(`${ip(req)}|${email}`);
    setSession(res, opts, t, user.id);
    tenants.touch(t.company.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, company: companyInfo(t), ...accountInfo(opts, t.db, user) });
  });

  /** Cadastro de uma nova empresa: cria o banco da loja e o primeiro usuário (administrador). */
  r.post('/signup', async (req, res) => {
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
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
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
    const verify_sent = await sendVerify(t, { id: userId, name, email }, opts, req);
    res.status(201).json({ user: { id: userId, name, email, role: 'admin' }, company: companyInfo(t), ...accountInfo(opts, t.db, { id: userId, email }), verify_sent });
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
    res.json({ user, company: companyInfo(t), ...accountInfo(opts, t.db, user) });
  });

  /** Esqueci minha senha: a resposta é sempre a mesma, para não revelar quais e-mails têm conta. */
  r.post('/forgot', async (req, res) => {
    const email = str(req.body, 'email', { required: true, label: 'e-mail' })!.toLowerCase();
    forgotLimit.hit(`f|${ip(req)}`);
    const t = tenants.get(tenants.companyForEmail(email));
    const user = t?.db.prepare('SELECT id, name, email FROM users WHERE email = ? AND active = 1').get(email) as { id: number; name: string; email: string } | undefined;
    if (t && user && t.company.status === 'ativa') await sendReset(t, user, opts, req);
    res.json({ ok: true, mail: mailerOf(opts).enabled });
  });

  /** Confere um link de senha (redefinição ou convite) antes de mostrar o formulário. */
  r.get('/token', (req, res) => {
    const l = splitLink(req.query.t);
    const t = l ? tenants.get(l.companyId) : null;
    const ok = t && l ? checkUserToken(t.db, l.token, ['reset', 'invite']) : null;
    if (!t || !ok) throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo.');
    const u = t.db.prepare('SELECT name, email FROM users WHERE id = ? AND active = 1').get(ok.userId) as { name: string; email: string } | undefined;
    if (!u) throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo.');
    res.json({ kind: ok.kind, name: u.name, email: u.email, store: companyInfo(t).name });
  });

  /** Cria a nova senha a partir do link e já entra no sistema. */
  r.post('/reset', (req, res) => {
    forgotLimit.hit(`r|${ip(req)}`);
    const password = str(req.body, 'password', { required: true, label: 'senha' })!;
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `A senha deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
    const l = splitLink(req.body.t);
    const t = l ? tenants.get(l.companyId) : null;
    if (!t || !l || t.company.status !== 'ativa') throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo.');
    const ok = tx(t.db, () => {
      const c = checkUserToken(t.db, l.token, ['reset', 'invite'], true);
      if (!c) return null;
      const u = t.db.prepare('SELECT id, active FROM users WHERE id = ?').get(c.userId) as { id: number; active: number } | undefined;
      if (!u || !u.active) return null;
      // Quem abriu o link recebeu o e-mail: o endereço fica confirmado.
      t.db.prepare("UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(hashPassword(password), new Date().toISOString(), u.id);
      t.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      return u.id;
    });
    if (!ok) throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo.');
    setSession(res, opts, t, ok);
    res.json({ ok: true });
  });

  /** Link do e-mail de confirmação. */
  r.get('/verify', (req, res) => {
    const l = splitLink(req.query.t);
    const t = l ? tenants.get(l.companyId) : null;
    const c = t && l ? checkUserToken(t.db, l.token, ['verify'], true) : null;
    if (!t || !c) return res.redirect('/login?link=invalido');
    t.db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').run(new Date().toISOString(), c.userId);
    res.redirect('/login?confirmado=1');
  });

  /** Reenvia a confirmação para quem está logado. */
  r.post('/verify/resend', async (req, res) => {
    const t = tenants.get(sessionCompany(req));
    const user = t ? sessionUser(t.db, req) : null;
    if (!t || !user) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
    forgotLimit.hit(`v|${ip(req)}`);
    if (emailVerified(t.db, user.id)) return res.json({ sent: false, verified: true });
    res.json({ sent: await sendVerify(t, user, opts, req) });
  });

  return r;
}
