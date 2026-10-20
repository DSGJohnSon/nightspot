import { createReadStream, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { Ack } from '@nightspot/shared';
import { sessionSettingsSchema } from '@nightspot/shared/schemas';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { adminRoutes } from './admin/routes';
import { createSession, getSession } from './engine/sessions';
import type { AppSocket, IO } from './engine/types';
import { catalogSummary, searchCatalog } from './modules/guess-the-clip';
import { searchDeezer } from './search/deezer';

const PORT = Number(process.env.PORT ?? 3001);
const WEB_DIST = fileURLToPath(new URL('../../web/dist/', import.meta.url));

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
// Pings rapprochés : un téléphone parti en veille apparaît « hors ligne » en moins de 20 s (45 s par défaut).
const io: IO = new Server(app.server, { serveClient: false, pingInterval: 10_000, pingTimeout: 8_000 });

/* ---------- HTTP ---------- */

/** Adresses du serveur sur le réseau local, pour que le QR code fonctionne en dev. */
function lanAddresses(): string[] {
  const found: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' && !i.internal) found.push({ name, address: i.address });
  }
  const rank = ({ name, address }: { name: string; address: string }) =>
    (/vethernet|virtual|vmware|wsl|hyper-v|docker|tailscale|zerotier/i.test(name) ? 10 : 0) +
    (address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2);
  return found.sort((a, b) => rank(a) - rank(b)).map((f) => f.address);
}

app.get('/api/info', async () => ({
  publicUrl: process.env.PUBLIC_URL ?? null,
  lanAddresses: lanAddresses(),
}));

app.get<{ Querystring: { q?: string; mode?: string } }>('/api/search', async (req, reply) => {
  const q = String(req.query.q ?? '').trim().slice(0, 100);
  if (q.length < 2) return { results: [] };
  if (req.query.mode === 'catalog') return { results: searchCatalog(q) };
  // Les clips absents de Deezer seraient introuvables : on les ajoute en tête des résultats.
  const offDeezer = searchCatalog(q, 3, true);
  try {
    return { results: [...offDeezer, ...(await searchDeezer(q))].slice(0, 10) };
  } catch (err) {
    req.log.warn({ err }, 'recherche Deezer en échec');
    if (offDeezer.length) return { results: offDeezer };
    return reply.code(503).send({ error: 'Recherche indisponible, réessaie dans un instant.' });
  }
});

/** Thèmes et filtres disponibles, pour l'écran de création de partie. */
app.get('/api/catalog', async () => catalogSummary());

await app.register(adminRoutes, { prefix: '/api/admin' });

app.get<{ Params: { code: string; round: string } }>('/media/:code/:round', async (req, reply) => {
  const file = getSession(req.params.code)?.imageFor(Number(req.params.round));
  if (!file || !existsSync(file)) return reply.code(404).send();
  reply.header('Cache-Control', 'private, max-age=3600').type('image/jpeg');
  return reply.send(createReadStream(file));
});

// En production, le serveur sert aussi le front buildé.
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.method === 'GET' && !req.url.startsWith('/api/')
      ? reply.sendFile('index.html')
      : reply.code(404).send({ error: 'Not found' }),
  );
}

/* ---------- Temps réel ---------- */

/** Les événements arrivent du réseau : on ne fait confiance ni au payload ni à la présence du callback. */
function safeAck<T>(ack: unknown): (res: Ack<T>) => void {
  return typeof ack === 'function' ? (ack as (res: Ack<T>) => void) : () => {};
}

io.on('connection', (socket: AppSocket) => {
  const hostSession = () => {
    const session = getSession(socket.data.code);
    return session?.hostSocketId === socket.id ? session : undefined;
  };

  socket.on('host:create', (settings, ack) => {
    const reply = safeAck<{ code: string; hostToken: string }>(ack);
    const parsed = sessionSettingsSchema.safeParse(settings);
    if (!parsed.success) return reply({ ok: false, error: 'Réglages invalides.' });
    try {
      const session = createSession(parsed.data, io);
      socket.data.code = session.code;
      reply({ ok: true, code: session.code, hostToken: session.hostToken });
      session.attachHost(socket.id);
    } catch (err) {
      reply({ ok: false, error: (err as Error).message });
    }
  });

  socket.on('host:resume', (payload, ack) => {
    const reply = safeAck(ack);
    const session = getSession(payload?.code);
    if (!session || session.hostToken !== payload?.hostToken) return reply({ ok: false, error: 'Partie introuvable.' });
    socket.data.code = session.code;
    reply({ ok: true });
    session.attachHost(socket.id);
  });

  socket.on('host:start', () => hostSession()?.start());
  socket.on('host:ready', () => hostSession()?.hostReady());
  socket.on('host:next', () => hostSession()?.next());

  socket.on('player:join', (payload, ack) => {
    const reply = safeAck<{ playerId: string; token: string }>(ack);
    const session = getSession(payload?.code);
    if (!session) return reply({ ok: false, error: 'Aucune partie avec ce code.' });
    const token = typeof payload.token === 'string' ? payload.token : undefined;
    const res = session.join(String(payload.name ?? ''), token, socket.id);
    if (res.ok) socket.data.code = session.code;
    reply(res);
  });

  socket.on('player:answer', (answer, ack) => {
    const reply = safeAck<{ elapsedMs: number }>(ack);
    const session = getSession(socket.data.code);
    if (!session) return reply({ ok: false, error: 'Partie introuvable.' });
    reply(session.answer(socket.id, answer));
  });

  socket.on('player:year', (year, ack) => {
    const reply = safeAck(ack);
    const session = getSession(socket.data.code);
    if (!session) return reply({ ok: false, error: 'Partie introuvable.' });
    reply(session.guessYear(socket.id, year));
  });

  socket.on('disconnect', () => getSession(socket.data.code)?.disconnect(socket.id));
});

await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`NightSpot prêt sur le port ${PORT} — réseau local : ${lanAddresses().join(', ') || 'aucune adresse'}`);
