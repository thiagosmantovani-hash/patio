import type { Request } from 'express';
import { createUserToken } from './auth.ts';
import { mailTemplate, noMailer, type Mailer } from './mail.ts';
import { readSettings } from './routes/settings.ts';
import type { Tenant } from './tenants.ts';

// E-mails da conta: redefinir senha, convite de usuário e confirmação de e-mail.
// Os links usam APP_URL (nunca o cabeçalho Host da requisição em produção, para ninguém forjar o endereço).

export interface MailOptions {
  mailer?: Mailer;
  /** Endereço público do sistema, ex.: https://patio-production.up.railway.app */
  appUrl?: string;
}

export interface MailUser {
  id: number;
  name: string;
  email: string;
}

const HOUR = 60 * 60_000;
export const mailerOf = (o: MailOptions) => o.mailer ?? noMailer;
export const baseUrl = (o: MailOptions, req: Request) => (o.appUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const storeName = (t: Tenant) => readSettings(t.db).store_name || t.company.name;
const first = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';

/** "12.abc…" → empresa 12 e código "abc…" */
export function splitLink(v: unknown): { companyId: number; token: string } | null {
  const m = /^(\d{1,9})\.([A-Za-z0-9_-]{20,100})$/.exec(String(v ?? ''));
  return m ? { companyId: Number(m[1]), token: m[2]! } : null;
}

export async function sendReset(t: Tenant, u: MailUser, o: MailOptions, req: Request): Promise<boolean> {
  const mailer = mailerOf(o);
  if (!mailer.enabled) return false;
  const url = `${baseUrl(o, req)}/redefinir-senha?t=${t.company.id}.${createUserToken(t.db, u.id, 'reset', HOUR)}`;
  return mailer.send(
    mailTemplate({
      to: u.email,
      subject: 'Redefinir sua senha do Pátio',
      title: 'Redefinir senha',
      lines: [`Olá, ${first(u.name)}.`, `Recebemos um pedido para redefinir a sua senha de acesso à ${storeName(t)} no Pátio. O link vale por 1 hora.`],
      button: 'Criar nova senha',
      url,
      foot: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
    }),
  );
}

export async function sendInvite(t: Tenant, u: MailUser, o: MailOptions, req: Request, inviter?: string): Promise<boolean> {
  const mailer = mailerOf(o);
  if (!mailer.enabled) return false;
  const url = `${baseUrl(o, req)}/redefinir-senha?t=${t.company.id}.${createUserToken(t.db, u.id, 'invite', 7 * 24 * HOUR)}&convite=1`;
  return mailer.send(
    mailTemplate({
      to: u.email,
      subject: `Seu acesso ao Pátio da ${storeName(t)}`,
      title: 'Você foi convidado para o Pátio',
      lines: [`Olá, ${first(u.name)}.`, `${inviter ? first(inviter) + ' criou' : 'Foi criado'} o seu acesso ao sistema da ${storeName(t)}. Clique no botão para criar a sua senha. O convite vale por 7 dias.`],
      button: 'Criar minha senha',
      url,
    }),
  );
}

export async function sendVerify(t: Tenant, u: MailUser, o: MailOptions, req: Request): Promise<boolean> {
  const mailer = mailerOf(o);
  if (!mailer.enabled) return false;
  const url = `${baseUrl(o, req)}/api/auth/verify?t=${t.company.id}.${createUserToken(t.db, u.id, 'verify', 3 * 24 * HOUR)}`;
  return mailer.send(
    mailTemplate({
      to: u.email,
      subject: 'Confirme seu e-mail no Pátio',
      title: 'Confirme seu e-mail',
      lines: [`Olá, ${first(u.name)}.`, `Falta só confirmar que este e-mail é seu para concluir o cadastro da ${storeName(t)} no Pátio.`],
      button: 'Confirmar e-mail',
      url,
    }),
  );
}
