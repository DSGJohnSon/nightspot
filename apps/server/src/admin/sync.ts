import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DATA_DIR } from '../paths';

/**
 * Synchronisation du catalogue entre le PC (où l'on ajoute les clips) et le serveur en ligne :
 * `pnpm data:push` / `pnpm data:pull`. Seuls ces fichiers circulent ; l'historique des parties et les
 * brouillons restent propres à chaque machine.
 */
export const SYNCED_FILE = /^(clips|themes|settings)\.json$|^media\/[\w-]+\.jpg$/;

export interface ManifestEntry {
  path: string;
  size: number;
  mtime: number;
  hash: string;
}

export function buildManifest(dataDir: string = DATA_DIR): ManifestEntry[] {
  const paths = [
    ...['clips.json', 'themes.json', 'settings.json'],
    ...(existsSync(`${dataDir}media`) ? readdirSync(`${dataDir}media`).map((f) => `media/${f}`) : []),
  ].filter((p) => SYNCED_FILE.test(p) && existsSync(dataDir + p));
  return paths.map((path) => {
    const content = readFileSync(dataDir + path);
    return {
      path,
      size: content.length,
      mtime: Math.round(statSync(dataDir + path).mtimeMs),
      hash: createHash('sha1').update(content).digest('hex'),
    };
  });
}

/** Écriture atomique ; un JSON doit être valide avant de remplacer l'existant. */
export function writeSyncedFile(path: string, content: Buffer, dataDir: string = DATA_DIR): void {
  if (!SYNCED_FILE.test(path)) throw new Error(`Fichier non synchronisable : ${path}`);
  if (path.endsWith('.json')) JSON.parse(content.toString('utf8'));
  const target = dataDir + path;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(`${target}.tmp`, content);
  renameSync(`${target}.tmp`, target);
}

/** Routes montées dans l'espace admin (donc protégées par son mot de passe). */
export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 32 * 1024 * 1024 }, (_req, body, done) =>
    done(null, body),
  );

  app.get('/sync/manifest', async () => buildManifest());

  app.get<{ Querystring: { path?: string } }>('/sync/file', async (req, reply) => {
    const path = String(req.query.path ?? '');
    if (!SYNCED_FILE.test(path) || !existsSync(DATA_DIR + path)) return reply.code(404).send({ error: 'Fichier introuvable.' });
    return reply.type('application/octet-stream').send(readFileSync(DATA_DIR + path));
  });

  app.put<{ Querystring: { path?: string } }>('/sync/file', async (req, reply) => {
    const path = String(req.query.path ?? '');
    if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: 'Contenu binaire attendu.' });
    try {
      writeSyncedFile(path, req.body);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    return { ok: true };
  });
}
