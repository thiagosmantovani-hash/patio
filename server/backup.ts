import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Tenants } from './tenants.ts';

/**
 * Cópia de segurança de todos os bancos (central + uma por empresa) em backups/AAAA-MM-DD.
 * Usa VACUUM INTO, que gera uma cópia consistente sem parar o sistema. Mantém os últimos `keep` dias.
 */
export function backupAll(tenants: Tenants, dir: string, keep = 14, uploadDir?: string) {
  const day = new Date().toISOString().slice(0, 10);
  const target = join(dir, day);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, 'empresas'), { recursive: true });
  const q = (p: string) => p.replace(/'/g, "''");
  tenants.control.exec(`VACUUM INTO '${q(join(target, 'control.db'))}'`);
  let n = 0;
  for (const c of tenants.all()) {
    const t = tenants.get(c.id);
    if (!t) continue;
    t.db.exec(`VACUUM INTO '${q(join(target, 'empresas', `${c.id}.db`))}'`);
    n++;
  }
  if (existsSync(dir)) {
    const days = readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    for (const old of days.slice(0, Math.max(0, days.length - keep))) rmSync(join(dir, old), { recursive: true, force: true });
  }
  // Fotos: os nomes são únicos e nunca mudam, então basta copiar as novas para backups/fotos.
  let photos = 0;
  if (uploadDir && existsSync(uploadDir)) {
    const dest = join(dir, 'fotos');
    mkdirSync(dest, { recursive: true });
    const have = new Set(readdirSync(dest));
    for (const f of readdirSync(uploadDir)) {
      if (have.has(f) || !/^[\w.-]+$/.test(f)) continue;
      copyFileSync(join(uploadDir, f), join(dest, f));
      photos++;
    }
  }
  return { day, companies: n, photos };
}

/** Cópia avulsa e consistente do banco de uma empresa (para baixar pelo painel da plataforma). */
export function snapshotCompany(tenants: Tenants, id: number, file: string) {
  const t = tenants.get(id);
  if (!t) return false;
  rmSync(file, { force: true });
  t.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  return true;
}

export function scheduleBackups(tenants: Tenants, dir: string, keep = 14, uploadDir?: string) {
  const run = () => {
    try {
      const r = backupAll(tenants, dir, keep, uploadDir);
      console.log(`[backup] ${r.day}: ${r.companies} empresa(s) copiadas, ${r.photos} foto(s) nova(s)`);
    } catch (err) {
      console.error('[backup] falhou:', err);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, 24 * 3600_000).unref();
}
