import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { type AdminCatalog, type AdminClip, type Clip, normalizeName } from '@nightspot/shared';
import {
  clipUpdateSchema,
  deezerSearchSchema,
  draftConfirmSchema,
  draftCreateSchema,
  draftVideoSchema,
  frameRequestSchema,
  imageUploadSchema,
  loginSchema,
  settingsSchema,
  themeNameSchema,
} from '@nightspot/shared/schemas';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { lastPlayedAt } from '../engine/history';
import {
  difficultyOf,
  framePath,
  getClips,
  getSettings,
  getThemes,
  hasFrame,
  MEDIA_DIR,
  saveClips,
  saveSettings,
  saveThemes,
  upsertClip,
} from '../modules/guess-the-clip/catalog';
import {
  addCandidate,
  addUploadedImage,
  chooseVideo,
  confirmDraft,
  createDrafts,
  discardDraft,
  listDrafts,
  retryDraft,
  searchDraftMatches,
} from '../modules/guess-the-clip/drafts';
import { BLOCKED_MESSAGE, decodeJpegDataUrl, extractFrame, probeVideo } from '../modules/guess-the-clip/media';
import { getViewsJob, startViewsJob } from '../modules/guess-the-clip/views';
import { syncRoutes } from './sync';

const COOKIE = 'ns_admin';
const PASSWORD = process.env.ADMIN_PASSWORD;
const sha = (text: string) => createHash('sha256').update(text).digest();
/** Valeur du cookie : dérivée du mot de passe, elle reste valable après un redémarrage du serveur. */
const SESSION_TOKEN = PASSWORD ? sha(`nightspot-admin:${PASSWORD}`).toString('hex') : null;

function readCookie(req: FastifyRequest, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function isLoggedIn(req: FastifyRequest): boolean {
  const cookie = readCookie(req, COOKIE);
  return !!SESSION_TOKEN && !!cookie && cookie.length === SESSION_TOKEN.length &&
    timingSafeEqual(Buffer.from(cookie), Buffer.from(SESSION_TOKEN));
}

function parse<T extends z.ZodType>(schema: T, body: unknown, reply: FastifyReply): z.infer<T> | null {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  void reply.code(400).send({ error: 'Données invalides.' });
  return null;
}

function toAdminClip(clip: Clip): AdminClip {
  const file = framePath(clip);
  return {
    ...clip,
    difficulty: difficultyOf(clip),
    lastPlayedAt: lastPlayedAt('guess-the-clip', clip.id),
    frameUrl: hasFrame(clip) ? `/api/admin/media/${clip.youtubeId}.jpg?v=${Math.round(statSync(file).mtimeMs)}` : null,
  };
}

function catalog(): AdminCatalog {
  const clips = getClips();
  return {
    clips: clips.map(toAdminClip),
    themes: getThemes().map((t) => ({ ...t, count: clips.filter((c) => c.themes?.includes(t.id)).length })),
    viewsJob: getViewsJob(),
    settings: getSettings(),
  };
}

/** Espace admin, monté sous /api/admin. */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/api/admin/status' || path === '/api/admin/login') return;
    if (!SESSION_TOKEN) return reply.code(503).send({ error: 'Définis ADMIN_PASSWORD pour activer l’admin.' });
    if (!isLoggedIn(req)) return reply.code(401).send({ error: 'Connexion requise.' });
  });

  app.get('/status', async (req) => ({ configured: !!SESSION_TOKEN, loggedIn: isLoggedIn(req) }));

  // Synchronisation du catalogue PC ↔ serveur en ligne (pnpm data:push / data:pull).
  await app.register(syncRoutes);

  app.post('/login', async (req, reply) => {
    const body = parse(loginSchema, req.body, reply);
    if (!body) return;
    if (!PASSWORD || !timingSafeEqual(sha(body.password), sha(PASSWORD))) {
      return reply.code(401).send({ error: 'Mot de passe incorrect.' });
    }
    reply.header('Set-Cookie', `${COOKIE}=${SESSION_TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`);
    return { ok: true };
  });

  app.post('/logout', async (_req, reply) => {
    reply.header('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return { ok: true };
  });

  /* ---------- Catalogue ---------- */

  app.get('/catalog', async () => catalog());

  app.put<{ Params: { id: string } }>('/clips/:id', async (req, reply) => {
    const clip = getClips().find((c) => c.id === req.params.id);
    if (!clip) return reply.code(404).send({ error: 'Clip introuvable.' });
    const body = parse(clipUpdateSchema, req.body, reply);
    if (!body) return;
    const updated: Clip = {
      ...clip,
      title: body.title,
      artist: body.artist,
      featuring: body.featuring.length ? body.featuring : undefined,
      aliases: body.aliases.length ? body.aliases : undefined,
      year: body.year ?? undefined,
      themes: body.themes,
      revealAt: Math.round(body.revealAt),
      difficultyOverride: body.difficultyOverride ?? undefined,
    };
    upsertClip(JSON.parse(JSON.stringify(updated)) as Clip); // retire les champs undefined
    return toAdminClip(updated);
  });

  /** Nouvelle capture à un instant donné ; le reveal suit si il démarrait sur l'ancienne capture. */
  app.post<{ Params: { id: string } }>('/clips/:id/frame', async (req, reply) => {
    const clip = getClips().find((c) => c.id === req.params.id);
    if (!clip) return reply.code(404).send({ error: 'Clip introuvable.' });
    const body = parse(frameRequestSchema, req.body, reply);
    if (!body) return;
    const at = Math.round(body.at);
    try {
      const { streamUrl } = await probeVideo(clip.youtubeId);
      if (!streamUrl) return reply.code(422).send({ error: BLOCKED_MESSAGE });
      await extractFrame(streamUrl, at, framePath(clip));
    } catch (err) {
      return reply.code(502).send({ error: (err as Error).message });
    }
    const updated = { ...clip, frameAt: at, revealAt: clip.revealAt === clip.frameAt ? at : clip.revealAt };
    upsertClip(updated);
    return toAdminClip(updated);
  });

  /** Capture collée ou importée (vidéo protégée contre le téléchargement, ou image choisie à la main). */
  app.post<{ Params: { id: string } }>('/clips/:id/image', { bodyLimit: 16 * 1024 * 1024 }, async (req, reply) => {
    const clip = getClips().find((c) => c.id === req.params.id);
    if (!clip) return reply.code(404).send({ error: 'Clip introuvable.' });
    const body = parse(imageUploadSchema, req.body, reply);
    if (!body) return;
    try {
      writeFileSync(framePath(clip), decodeJpegDataUrl(body.image));
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    const at = Math.round(body.at);
    const updated = { ...clip, frameAt: at, revealAt: clip.revealAt === clip.frameAt ? at : clip.revealAt };
    upsertClip(updated);
    return toAdminClip(updated);
  });

  app.post<{ Params: { id: string } }>('/drafts/:id/image', { bodyLimit: 16 * 1024 * 1024 }, async (req, reply) => {
    const body = parse(imageUploadSchema, req.body, reply);
    if (!body) return;
    try {
      return addUploadedImage(req.params.id, body.at, body.image);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/clips/:id', async (req) => {
    const clip = getClips().find((c) => c.id === req.params.id);
    if (clip) {
      saveClips(getClips().filter((c) => c.id !== clip.id));
      rmSync(framePath(clip), { force: true });
    }
    return { ok: true };
  });

  app.put('/settings', async (req, reply) => {
    const body = parse(settingsSchema, req.body, reply);
    if (!body) return;
    saveSettings(body);
    return catalog();
  });

  app.post('/views/refresh', async () => {
    startViewsJob();
    return getViewsJob();
  });

  /* ---------- Ajout par liens YouTube ---------- */

  app.get('/drafts', async () => listDrafts());

  app.post('/drafts', async (req, reply) => {
    const body = parse(draftCreateSchema, req.body, reply);
    if (!body) return;
    createDrafts(body.urls);
    return listDrafts();
  });

  app.post<{ Params: { id: string } }>('/drafts/:id/frames', async (req, reply) => {
    const body = parse(frameRequestSchema, req.body, reply);
    if (!body) return;
    try {
      return await addCandidate(req.params.id, body.at);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/drafts/:id/video', async (req, reply) => {
    const body = parse(draftVideoSchema, req.body, reply);
    if (!body) return;
    try {
      chooseVideo(req.params.id, body.youtubeId);
      return listDrafts();
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/drafts/:id/retry', async (req, reply) => {
    try {
      retryDraft(req.params.id);
      return listDrafts();
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/drafts/:id/search', async (req, reply) => {
    const body = parse(deezerSearchSchema, req.body, reply);
    if (!body) return;
    try {
      return await searchDraftMatches(req.params.id, body.query);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>('/drafts/:id/confirm', async (req, reply) => {
    const body = parse(draftConfirmSchema, req.body, reply);
    if (!body) return;
    try {
      return toAdminClip(confirmDraft(req.params.id, body));
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/drafts/:id', async (req) => {
    discardDraft(req.params.id);
    return { ok: true };
  });

  /* ---------- Thèmes ---------- */

  app.post('/themes', async (req, reply) => {
    const body = parse(themeNameSchema, req.body, reply);
    if (!body) return;
    const themes = getThemes();
    const base = normalizeName(body.name).replace(/ /g, '-') || 'theme';
    let id = base;
    for (let n = 2; themes.some((t) => t.id === id); n++) id = `${base}-${n}`;
    saveThemes([...themes, { id, name: body.name }]);
    return catalog();
  });

  app.patch<{ Params: { id: string } }>('/themes/:id', async (req, reply) => {
    const body = parse(themeNameSchema, req.body, reply);
    if (!body) return;
    saveThemes(getThemes().map((t) => (t.id === req.params.id ? { ...t, name: body.name } : t)));
    return catalog();
  });

  app.delete<{ Params: { id: string } }>('/themes/:id', async (req) => {
    const id = req.params.id;
    saveThemes(getThemes().filter((t) => t.id !== id));
    saveClips(getClips().map((c) => (c.themes?.includes(id) ? { ...c, themes: c.themes.filter((t) => t !== id) } : c)));
    return catalog();
  });

  /* ---------- Images (captures du catalogue et des brouillons) ---------- */

  app.get<{ Params: { '*': string } }>('/media/*', async (req, reply) => {
    const rel = req.params['*'];
    if (!/^(drafts\/)?[\w-]+\.jpg$/.test(rel) || !existsSync(MEDIA_DIR + rel)) return reply.code(404).send();
    reply.header('Cache-Control', 'private, max-age=86400').type('image/jpeg');
    return reply.send(createReadStream(MEDIA_DIR + rel));
  });
}
