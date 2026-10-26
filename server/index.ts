import { join, resolve } from 'node:path';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { openDatabase } from './db.ts';

const root = resolve(import.meta.dirname, '..');
const dataDir = process.env.DATA_DIR ?? join(root, 'data');
const port = Number(process.env.PORT ?? 3000);

const db = openDatabase(join(dataDir, 'patio.db'));

// Primeiro acesso: cria o administrador inicial se não houver nenhum usuário.
const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
if (n === 0) {
  const email = process.env.ADMIN_EMAIL ?? 'admin@patio.local';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Administrador', ?, ?, 'admin')").run(email, hashPassword(password));
  console.log(`Usuário administrador criado: ${email} / ${password} — troque a senha após o primeiro acesso.`);
}

const app = createApp(db, { uploadDir: join(dataDir, 'uploads'), webDir: join(root, 'web', 'dist') });
app.listen(port, () => console.log(`Pátio rodando em http://localhost:${port}`));
