import type { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what = 'Registro') => new HttpError(404, `${what} não encontrado.`);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('UNIQUE constraint failed')) {
    res.status(409).json({ error: 'Já existe um registro com esses dados.' });
    return;
  }
  if (message.includes('CHECK constraint failed') || message.includes('FOREIGN KEY constraint failed')) {
    res.status(400).json({ error: 'Dados inválidos.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
}

// Leitores de campos do corpo da requisição: convertem e validam uma única vez na borda.

type Body = Record<string, unknown>;

export function str(body: Body, key: string, opts: { required?: boolean; label?: string } = {}): string | null {
  const v = body[key];
  if (v == null || (typeof v === 'string' && v.trim() === '')) {
    if (opts.required) throw new HttpError(400, `Campo obrigatório: ${opts.label ?? key}.`);
    return null;
  }
  return String(v).trim();
}

export function num(body: Body, key: string, opts: { required?: boolean; label?: string; min?: number } = {}): number | null {
  const v = body[key];
  if (v == null || v === '') {
    if (opts.required) throw new HttpError(400, `Campo obrigatório: ${opts.label ?? key}.`);
    return null;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new HttpError(400, `Valor numérico inválido: ${opts.label ?? key}.`);
  if (opts.min != null && n < opts.min) throw new HttpError(400, `${opts.label ?? key} deve ser no mínimo ${opts.min}.`);
  return n;
}

export function int(body: Body, key: string, opts: { required?: boolean; label?: string; min?: number } = {}): number | null {
  const n = num(body, key, opts);
  return n == null ? null : Math.trunc(n);
}

export function oneOf<T extends string>(body: Body, key: string, allowed: readonly T[], fallback?: T): T {
  const v = body[key];
  if (v == null || v === '') {
    if (fallback) return fallback;
    throw new HttpError(400, `Campo obrigatório: ${key}.`);
  }
  if (!allowed.includes(v as T)) throw new HttpError(400, `Valor inválido para ${key}.`);
  return v as T;
}

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identificador inválido.');
  return n;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
