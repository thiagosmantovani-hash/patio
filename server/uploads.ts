import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { HttpError } from './http.ts';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export function imageUploader(dir: string) {
  mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${IMAGE_TYPES[file.mimetype] ?? extname(file.originalname)}`),
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 20 },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) cb(null, true);
      else cb(new HttpError(400, 'Envie imagens JPG, PNG ou WebP.'));
    },
  });
}

/** Remove um arquivo enviado; ignora se já não existir. */
export function removeUpload(dir: string, filename: string) {
  if (filename.includes('/') || filename.includes('\\')) return;
  rmSync(join(dir, filename), { force: true });
}
