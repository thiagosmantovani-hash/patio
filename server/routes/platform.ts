import { Router } from 'express';
import { sessionCompany, sessionUser } from '../auth.ts';
import { HttpError, idParam, oneOf } from '../http.ts';
import type { Tenants } from '../tenants.ts';
import type { AuthOptions } from './auth.ts';

// Painel do dono do Pátio: quem se cadastrou e quanto cada empresa está usando.
// Acesso só para os e-mails listados em PLATFORM_ADMINS.

export function platformRoutes(tenants: Tenants, opts: AuthOptions) {
  const r = Router();
  r.use((req, _res, next) => {
    const t = tenants.get(sessionCompany(req));
    const user = t ? sessionUser(t.db, req) : null;
    if (!user) return next(new HttpError(401, 'Sessão expirada. Faça login novamente.'));
    if (!(opts.platformAdmins ?? []).includes(user.email.toLowerCase())) return next(new HttpError(403, 'Sem permissão para esta ação.'));
    next();
  });

  r.get('/companies', (_req, res) => {
    const count = (db: any, sql: string) => (db.prepare(sql).get() as { n: number }).n;
    res.json(
      tenants.all().map((c) => {
        const t = tenants.get(c.id)!;
        const admin = t.db.prepare("SELECT name, email FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get() as { name: string; email: string } | undefined;
        return {
          ...c,
          admin_name: admin?.name ?? null,
          admin_email: admin?.email ?? null,
          users: count(t.db, 'SELECT COUNT(*) AS n FROM users WHERE active = 1'),
          vehicles: count(t.db, "SELECT COUNT(*) AS n FROM vehicles WHERE status != 'vendido'"),
          sales: count(t.db, "SELECT COUNT(*) AS n FROM sales WHERE status = 'concluida'"),
          leads: count(t.db, 'SELECT COUNT(*) AS n FROM leads'),
          appraisals: count(t.db, 'SELECT COUNT(*) AS n FROM appraisals'),
        };
      }),
    );
  });

  r.put('/companies/:id/status', (req, res) => {
    const id = idParam(req);
    if (!tenants.get(id)) throw new HttpError(404, 'Empresa não encontrada.');
    tenants.setStatus(id, oneOf(req.body, 'status', ['ativa', 'suspensa'] as const));
    res.json({ ok: true });
  });

  return r;
}
