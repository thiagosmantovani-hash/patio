import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { requireAuth } from './auth.ts';
import { errorHandler, HttpError } from './http.ts';
import { appraisalRoutes } from './routes/appraisals.ts';
import { authRoutes } from './routes/auth.ts';
import { customerRoutes } from './routes/customers.ts';
import { financeRoutes } from './routes/finance.ts';
import { leadRoutes } from './routes/leads.ts';
import { publicRoutes } from './routes/public.ts';
import { reportRoutes } from './routes/reports.ts';
import { saleRoutes } from './routes/sales.ts';
import { settingsRoutes } from './routes/settings.ts';
import { userRoutes } from './routes/users.ts';
import { vehicleRoutes } from './routes/vehicles.ts';

export interface AppOptions {
  uploadDir: string;
  webDir?: string;
}

export function createApp(db: DB, opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '1mb' }));

  app.use('/uploads', express.static(opts.uploadDir, { maxAge: '7d', fallthrough: false }));

  app.use('/api/auth', authRoutes(db));
  app.use('/api/public', publicRoutes(db));

  const api = express.Router();
  api.use(requireAuth(db));
  api.use('/users', userRoutes(db));
  api.use('/settings', settingsRoutes(db));
  api.use('/vehicles', vehicleRoutes(db, opts.uploadDir));
  api.use('/appraisals', appraisalRoutes(db, opts.uploadDir));
  api.use('/customers', customerRoutes(db));
  api.use('/leads', leadRoutes(db));
  api.use('/sales', saleRoutes(db));
  api.use('/finance', financeRoutes(db));
  api.use('/reports', reportRoutes(db));
  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));

  // Front-end compilado (SPA): qualquer rota fora da API devolve o index.html.
  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    app.use(express.static(opts.webDir, { index: false }));
    app.get(/.*/, (_req, res) => res.sendFile(join(opts.webDir!, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
