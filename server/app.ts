import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { requireAuth, sessionCompany } from './auth.ts';
import { errorHandler, HttpError } from './http.ts';
import { securityHeaders } from './security.ts';
import type { Tenant, Tenants } from './tenants.ts';
import { appraisalRoutes } from './routes/appraisals.ts';
import { authRoutes, type AuthOptions } from './routes/auth.ts';
import { customerRoutes } from './routes/customers.ts';
import { financeRoutes } from './routes/finance.ts';
import { leadRoutes } from './routes/leads.ts';
import { platformRoutes } from './routes/platform.ts';
import { publicRoutes } from './routes/public.ts';
import { reportRoutes } from './routes/reports.ts';
import { saleRoutes } from './routes/sales.ts';
import { settingsRoutes } from './routes/settings.ts';
import { userRoutes } from './routes/users.ts';
import { vehicleRoutes } from './routes/vehicles.ts';

export interface AppOptions extends AuthOptions {
  uploadDir: string;
  webDir?: string;
  /** Valor do "trust proxy" do Express (ex.: 1 atrás do proxy da hospedagem). */
  trustProxy?: string | number | boolean;
}

/** Rotas internas de uma empresa, montadas sobre o banco dela (as mesmas regras para todas). */
function tenantApi(t: Tenant, tenants: Tenants, uploadDir: string): Router {
  const db = t.db;
  const id = t.company.id;
  const api = Router();
  api.use(requireAuth(db));
  api.use('/users', userRoutes(db, { claim: (e) => tenants.claim(e, id), release: (e) => tenants.release(e, id) }));
  api.use('/settings', settingsRoutes(db));
  api.use('/vehicles', vehicleRoutes(db, uploadDir));
  api.use('/appraisals', appraisalRoutes(db, uploadDir));
  api.use('/customers', customerRoutes(db));
  api.use('/leads', leadRoutes(db));
  api.use('/sales', saleRoutes(db));
  api.use('/finance', financeRoutes(db));
  api.use('/reports', reportRoutes(db));
  return api;
}

const routerOf = (t: Tenant, key: string, make: () => Router) => (t.routers[key] ??= make()) as Router;

export function createApp(tenants: Tenants, opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', opts.trustProxy ?? 'loopback');
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Fotos: nomes aleatórios e únicos, uma pasta para todas as empresas.
  app.use('/uploads', express.static(opts.uploadDir, { maxAge: '7d', fallthrough: false }));

  app.use('/api/auth', authRoutes(tenants, opts));
  app.use('/api/platform', platformRoutes(tenants, opts));

  // Vitrine e feed de cada loja: /api/public/<endereço-da-loja>/...
  app.use('/api/public/:slug', (req: Request, res: Response, next: NextFunction) => {
    const t = tenants.bySlug(String(req.params.slug));
    if (!t || t.company.status !== 'ativa') return next(new HttpError(404, 'Loja não encontrada.'));
    routerOf(t, 'public', () => publicRoutes(t.db))(req, res, next);
  });

  // Demais rotas: a empresa vem da sessão; cada uma usa só o próprio banco.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const t = tenants.get(sessionCompany(req));
    if (!t) return next(new HttpError(401, 'Sessão expirada. Faça login novamente.'));
    if (t.company.status !== 'ativa') return next(new HttpError(403, 'O acesso desta empresa está suspenso. Fale com o suporte do Pátio.'));
    tenants.touch(t.company.id);
    routerOf(t, 'api', () => tenantApi(t, tenants, opts.uploadDir))(req, res, next);
  });
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

  // Front-end compilado (SPA): qualquer rota fora da API devolve o index.html.
  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    app.use(express.static(opts.webDir, { index: false }));
    app.get(/.*/, (_req, res) => res.sendFile(join(opts.webDir!, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
