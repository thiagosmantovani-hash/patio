import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.ts';
import { scheduleBackups } from './backup.ts';
import { resendMailer } from './mail.ts';
import { Tenants } from './tenants.ts';

const root = resolve(import.meta.dirname, '..');
const dataDir = process.env.DATA_DIR ?? join(root, 'data');
const port = Number(process.env.PORT ?? 3000);
const production = process.env.NODE_ENV === 'production';

const tenants = new Tenants(dataDir);

// Instalações antigas (uma loja só, em data/patio.db) viram a empresa nº 1, com os mesmos usuários.
const legacy = join(dataDir, 'patio.db');
if (existsSync(legacy) && tenants.all().length === 0) {
  const old = new DatabaseSync(legacy);
  const nameRow = old.prepare("SELECT value FROM settings WHERE key = 'store_name'").get() as { value: string } | undefined;
  const emails = (old.prepare('SELECT email FROM users').all() as { email: string }[]).map((u) => u.email);
  old.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  old.close();
  const name = nameRow ? JSON.parse(nameRow.value) : 'Minha Revenda';
  const info = tenants.control.prepare('INSERT INTO companies (slug, name, terms_accepted_at) VALUES (?, ?, ?)').run(tenants.uniqueSlug(name), name, new Date().toISOString());
  const id = Number(info.lastInsertRowid);
  mkdirSync(join(dataDir, 'empresas', String(id)), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(legacy + suffix)) renameSync(legacy + suffix, tenants.dbFile(id) + suffix);
  for (const e of emails) tenants.claim(e, id);
  console.log(`Banco antigo migrado para a empresa nº ${id} (${name}).`);
}

const platformAdmins = (process.env.PLATFORM_ADMINS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const trustProxy = process.env.TRUST_PROXY ?? (production ? '1' : 'loopback');
// Endereço público usado nos links dos e-mails. No Railway vem sozinho (RAILWAY_PUBLIC_DOMAIN).
const appUrl = process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined);
const mailer = resendMailer(process.env.RESEND_API_KEY, process.env.MAIL_FROM ?? 'Pátio <onboarding@resend.dev>');

const app = createApp(tenants, {
  uploadDir: join(dataDir, 'uploads'),
  webDir: join(root, 'web', 'dist'),
  appHtml: join(root, 'prototipo', 'index.html'),
  secureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === '1' : production,
  platformAdmins,
  trustProxy: /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  mailer,
  appUrl,
});

if (process.env.BACKUPS !== '0') scheduleBackups(tenants, join(dataDir, 'backups'), Number(process.env.BACKUP_DAYS ?? 14));

const server = app.listen(port, () => {
  console.log(`Pátio rodando em http://localhost:${port} · ${tenants.all().length} empresa(s) cadastrada(s)`);
  if (!platformAdmins.length) console.log('Dica: defina PLATFORM_ADMINS com seu e-mail para ver o painel da plataforma.');
  console.log(mailer.enabled ? `E-mails ligados (Resend) · links em ${appUrl ?? 'endereço da requisição'}` : 'E-mails desligados: defina RESEND_API_KEY para enviar convites e redefinição de senha.');
  if (production && mailer.enabled && !appUrl) console.warn('Atenção: defina APP_URL para os links dos e-mails.');
});

const shutdown = () => {
  server.close(() => {
    tenants.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
