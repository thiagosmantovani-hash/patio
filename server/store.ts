// Armazenamento do sistema completo (a interface do protótipo) no banco de cada empresa.
// Cada registro é um item com chave ("m:veh:352", "s:fin:titulos", "v:cfg") e o JSON do registro.
// Toda gravação ganha um número de revisão crescente: assim cada navegador busca só o que mudou
// desde a última vez. Itens apagados ficam com data NULL para que os outros navegadores saibam.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './db.ts';
import { tx } from './db.ts';
import { HttpError } from './http.ts';

export const STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS store_items (
  k TEXT PRIMARY KEY,
  data TEXT,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_store_rev ON store_items(rev);
CREATE TABLE IF NOT EXISTS store_meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
`;

const KEY_RE = /^(m|s|v):[A-Za-z0-9_]{1,40}(:[A-Za-z0-9_.\-]{1,80})?$/;
/** Números de registro começam em 10001, acima dos usados pelos catálogos padrão. */
const SEQ_START = 10_000;

function meta(db: DB, k: string, start = 0): number {
  const row = db.prepare('SELECT v FROM store_meta WHERE k = ?').get(k) as { v: number } | undefined;
  return row?.v ?? start;
}
function setMeta(db: DB, k: string, v: number) {
  db.prepare('INSERT INTO store_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}
function nextRev(db: DB) {
  const v = meta(db, 'rev') + 1;
  setMeta(db, 'rev', v);
  return v;
}

export function storeRev(db: DB) {
  return meta(db, 'rev');
}

/** Itens vivos da loja, como [chave, json]. */
export function storeItems(db: DB): [string, string][] {
  return (db.prepare('SELECT k, data FROM store_items WHERE data IS NOT NULL ORDER BY k').all() as { k: string; data: string }[]).map((r) => [r.k, r.data]);
}

export function storeGet<T = any>(db: DB, k: string): T | null {
  const row = db.prepare('SELECT data FROM store_items WHERE k = ? AND data IS NOT NULL').get(k) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as T) : null;
}

/** Registros de uma coleção (ex.: "veh"), já convertidos. */
export function storeCollection<T = any>(db: DB, coll: string): T[] {
  return (db.prepare("SELECT data FROM store_items WHERE k LIKE ? AND data IS NOT NULL").all(`m:${coll}:%`) as { data: string }[]).map((r) => JSON.parse(r.data) as T);
}

export function storePut(db: DB, k: string, data: string | null, userId: number | null = null) {
  db.prepare(
    `INSERT INTO store_items (k, data, rev, updated_at, updated_by) VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(k) DO UPDATE SET data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(k, data, nextRev(db), userId);
}

export function allocIds(db: DB, n = 200): { from: number; to: number } {
  return tx(db, () => {
    const from = meta(db, 'seq', SEQ_START) + 1;
    const to = from + Math.max(1, Math.min(n, 1000)) - 1;
    setMeta(db, 'seq', to);
    return { from, to };
  });
}

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

export function storeRoutes(db: DB, uploadDir: string) {
  const r = Router();
  mkdirSync(uploadDir, { recursive: true });

  r.get('/', (_req, res) => {
    res.json({ rev: storeRev(db), items: storeItems(db) });
  });

  r.get('/changes', (req, res) => {
    const since = Number(req.query.since ?? 0) || 0;
    const rows = db.prepare('SELECT k, data, rev FROM store_items WHERE rev > ? ORDER BY rev').all(since) as { k: string; data: string | null; rev: number }[];
    res.json({ rev: Math.max(since, storeRev(db)), items: rows.map((x) => [x.k, x.data]) });
  });

  r.post('/save', (req, res) => {
    const put = Array.isArray(req.body.put) ? (req.body.put as unknown[]) : [];
    const del = Array.isArray(req.body.del) ? (req.body.del as unknown[]) : [];
    if (put.length + del.length > 5000) throw new HttpError(400, 'Alterações demais em uma única gravação.');
    for (const p of put) {
      if (!Array.isArray(p) || typeof p[0] !== 'string' || typeof p[1] !== 'string' || !KEY_RE.test(p[0])) throw new HttpError(400, 'Registro inválido.');
      try {
        JSON.parse(p[1]);
      } catch {
        throw new HttpError(400, `Conteúdo inválido em ${p[0]}.`);
      }
    }
    for (const k of del) if (typeof k !== 'string' || !KEY_RE.test(k)) throw new HttpError(400, 'Registro inválido.');
    const uid = req.user?.id ?? null;
    tx(db, () => {
      for (const [k, data] of put as [string, string][]) storePut(db, k, data, uid);
      for (const k of del as string[]) storePut(db, k, null, uid);
    });
    res.json({ rev: storeRev(db) });
  });

  r.post('/ids', (req, res) => {
    res.json(allocIds(db, Number(req.body.n) || 200));
  });

  /** Um único navegador converte cada pedido da vitrine em atendimento. */
  r.post('/inbox/claim', (req, res) => {
    const k = String(req.body.k ?? '');
    if (!/^m:inbox:[A-Za-z0-9_\-]+$/.test(k)) throw new HttpError(400, 'Registro inválido.');
    const ok = tx(db, () => {
      const row = db.prepare('SELECT 1 FROM store_items WHERE k = ? AND data IS NOT NULL').get(k);
      if (!row) return false;
      storePut(db, k, null, req.user?.id ?? null);
      return true;
    });
    res.json({ ok });
  });

  /** Fotos chegam como data URL (já reduzidas no navegador) e viram arquivo em /uploads. */
  r.post('/files', (req, res) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.data ?? ''));
    if (!m) throw new HttpError(400, 'Envie uma imagem JPG, PNG ou WebP.');
    const buf = Buffer.from(m[2]!, 'base64');
    if (buf.length > 12 * 1024 * 1024) throw new HttpError(400, 'Imagem grande demais (máximo 12 MB).');
    const name = `${Date.now()}-${randomBytes(12).toString('hex')}${IMAGE_EXT[m[1]!]}`;
    writeFileSync(join(uploadDir, name), buf);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  return r;
}

/** Pedido de interesse da vitrine: fica na caixa de entrada até um navegador da loja convertê-lo em atendimento. */
export function storeInbox(db: DB, item: Record<string, unknown>) {
  const id = `x${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  tx(db, () => storePut(db, `m:inbox:${id}`, JSON.stringify({ ...item, em: new Date().toISOString() })));
  return id;
}
