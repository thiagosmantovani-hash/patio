import type { NextFunction, Request, Response } from 'express';
import { HttpError } from './http.ts';

/** Limite simples em memória: no máximo `max` tentativas por chave dentro da janela. */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const limit = Date.now() - windowMs;
    for (const [k, v] of hits) {
      const kept = v.filter((t) => t > limit);
      if (kept.length) hits.set(k, kept);
      else hits.delete(k);
    }
  }, windowMs).unref();
  return {
    hit(key: string) {
      const now = Date.now();
      const list = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (list.length >= max) {
        const wait = Math.ceil((list[0]! + windowMs - now) / 60_000);
        throw new HttpError(429, `Muitas tentativas. Aguarde ${wait} minuto${wait === 1 ? '' : 's'} e tente de novo.`);
      }
      list.push(now);
      hits.set(key, list);
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
