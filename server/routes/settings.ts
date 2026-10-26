import { Router } from 'express';
import type { DB } from '../db.ts';
import { requireRole } from '../auth.ts';
import { DEFAULT_CHANNELS } from '../domain.ts';
import { HttpError } from '../http.ts';

export interface StoreSettings {
  store_name: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  about: string;
  default_margin: number;
  channels: string[];
}

export const DEFAULT_SETTINGS: StoreSettings = {
  store_name: 'Minha Revenda',
  document: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  about: '',
  default_margin: 15,
  channels: DEFAULT_CHANNELS,
};

export function readSettings(db: DB): StoreSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key in DEFAULT_SETTINGS) out[key] = JSON.parse(value);
  }
  return out as unknown as StoreSettings;
}

export function settingsRoutes(db: DB) {
  const r = Router();

  r.get('/', (_req, res) => res.json(readSettings(db)));

  r.put('/', requireRole('admin', 'gerente'), (req, res) => {
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof StoreSettings)[]) {
      if (!(key in req.body)) continue;
      let value = req.body[key];
      if (key === 'default_margin') {
        value = Number(value);
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new HttpError(400, 'Margem padrão deve estar entre 0 e 100.');
      } else if (key === 'channels') {
        if (!Array.isArray(value)) throw new HttpError(400, 'Canais inválidos.');
        value = [...new Set(value.map((c: unknown) => String(c).trim()).filter(Boolean))];
      } else {
        value = String(value ?? '').trim();
      }
      upsert.run(key, JSON.stringify(value));
    }
    res.json(readSettings(db));
  });

  return r;
}
