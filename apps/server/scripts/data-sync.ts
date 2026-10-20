/**
 * Synchronise le catalogue entre ce PC et le serveur en ligne.
 *
 *   pnpm data:push   → envoie clips, thèmes, réglages et les captures nouvelles ou modifiées
 *   pnpm data:pull   → récupère l'état du serveur (si le catalogue a été modifié en ligne)
 *
 * Ajoute dans apps/server/.env :
 *   REMOTE_URL=https://ton-projet.up.railway.app
 *   REMOTE_ADMIN_PASSWORD=le mot de passe admin du serveur
 *
 * Par sécurité, push refuse d'écraser un fichier modifié en ligne plus récemment qu'ici
 * (fais d'abord un pull) ; --force passe outre.
 */
import { buildManifest, type ManifestEntry, writeSyncedFile } from '../src/admin/sync';
import { DATA_DIR } from '../src/paths';
import { readFileSync } from 'node:fs';

const mode = process.argv[2];
const force = process.argv.includes('--force');
const remote = process.env.REMOTE_URL?.replace(/\/$/, '');
const password = process.env.REMOTE_ADMIN_PASSWORD;

if (mode !== 'push' && mode !== 'pull') {
  console.error('Usage : data-sync push|pull [--force]');
  process.exit(1);
}
if (!remote || !password) {
  console.error('Définis REMOTE_URL et REMOTE_ADMIN_PASSWORD dans apps/server/.env.');
  process.exit(1);
}

let cookie = '';

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${remote}/api/admin${path}`, { ...init, headers: { ...init.headers, cookie } });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} : HTTP ${res.status} ${await res.text()}`);
  return res;
}

async function login(): Promise<void> {
  const res = await fetch(`${remote}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error(`Connexion refusée par ${remote} (HTTP ${res.status}) : vérifie REMOTE_ADMIN_PASSWORD.`);
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
}

/** Données JSON d'abord ou en dernier : les captures doivent exister avant le catalogue qui les utilise. */
const mediaFirst = (a: ManifestEntry, b: ManifestEntry) => Number(a.path.endsWith('.json')) - Number(b.path.endsWith('.json'));

async function main() {
  await login();
  const remoteFiles = new Map(((await (await api('/sync/manifest')).json()) as ManifestEntry[]).map((f) => [f.path, f]));
  const localFiles = new Map(buildManifest().map((f) => [f.path, f]));

  if (mode === 'push') {
    const changed = [...localFiles.values()].filter((f) => remoteFiles.get(f.path)?.hash !== f.hash).sort(mediaFirst);
    const newerOnline = changed.filter((f) => f.path.endsWith('.json') && (remoteFiles.get(f.path)?.mtime ?? 0) > f.mtime);
    if (newerOnline.length && !force) {
      console.error(
        `Modifié en ligne plus récemment qu'ici : ${newerOnline.map((f) => f.path).join(', ')}.\n` +
          'Fais d’abord « pnpm data:pull », ou relance avec --force pour écraser.',
      );
      process.exit(1);
    }
    for (const [i, f] of changed.entries()) {
      await api(`/sync/file?path=${encodeURIComponent(f.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: readFileSync(DATA_DIR + f.path),
      });
      process.stdout.write(`\r  envoyé ${i + 1}/${changed.length}`);
    }
    console.log(changed.length ? `\n✓ ${changed.length} fichier(s) envoyé(s) vers ${remote}` : '✓ Déjà à jour.');
  } else {
    const changed = [...remoteFiles.values()].filter((f) => localFiles.get(f.path)?.hash !== f.hash).sort(mediaFirst);
    for (const [i, f] of changed.entries()) {
      const content = Buffer.from(await (await api(`/sync/file?path=${encodeURIComponent(f.path)}`)).arrayBuffer());
      writeSyncedFile(f.path, content);
      process.stdout.write(`\r  reçu ${i + 1}/${changed.length}`);
    }
    console.log(changed.length ? `\n✓ ${changed.length} fichier(s) récupéré(s) depuis ${remote}` : '✓ Déjà à jour.');
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
