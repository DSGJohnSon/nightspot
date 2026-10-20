import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { CandidateSource, Clip, Draft, DraftFields } from '@nightspot/shared';
import { DATA_DIR, DRAFT_MEDIA_DIR, framePath, getClips, newClipId, upsertClip } from './catalog';
import {
  type Entry,
  fetchOembed,
  findDeezerMatches,
  guessFromVideoTitle,
  parseEntry,
  rankVideos,
  searchQueryFromVideo,
} from './lookup';
import {
  BLOCKED_MESSAGE,
  decodeJpegDataUrl,
  extractFrameWithRetry,
  highlightTimes,
  probeVideo,
  searchYoutube,
  youtubeImages,
} from './media';

/**
 * Liens YouTube collés dans l'admin : analysés un par un (infos, Deezer, captures candidates),
 * puis confirmés ou ignorés. Persistés pour survivre à un redémarrage du serveur.
 */
interface StoredDraft extends Omit<Draft, 'candidates'> {
  candidates: { at: number; file: string; source?: CandidateSource }[];
}

const DRAFTS_PATH = `${DATA_DIR}drafts.json`;
const CANDIDATES = 4;

let drafts: StoredDraft[] = existsSync(DRAFTS_PATH) ? JSON.parse(readFileSync(DRAFTS_PATH, 'utf8')) : [];
/** URL du flux vidéo par brouillon, pour extraire d'autres captures sans tout réanalyser. */
const streams = new Map<string, { url: string; at: number }>();
let working = false;

function persist(): void {
  writeFileSync(`${DRAFTS_PATH}.tmp`, JSON.stringify(drafts, null, 2));
  renameSync(`${DRAFTS_PATH}.tmp`, DRAFTS_PATH);
}

function toPublic(draft: StoredDraft): Draft {
  return {
    ...draft,
    candidates: draft.candidates.map((c) => ({ at: c.at, url: `/api/admin/media/drafts/${c.file}`, source: c.source })),
  };
}

const emptyFields = (): DraftFields => ({ title: '', artist: '', featuring: [], aliases: [], year: null, themes: [] });

export function listDrafts(): Draft[] {
  return [...drafts].sort((a, b) => b.createdAt - a.createdAt).map(toPublic);
}

export function createDrafts(urls: string[]): void {
  const now = Date.now();
  for (const [i, url] of urls.filter((u) => u.trim()).entries()) {
    drafts.push({
      id: randomUUID().slice(0, 8),
      url: url.trim(),
      youtubeId: null,
      status: 'queued',
      candidates: [],
      matches: [],
      fields: emptyFields(),
      createdAt: now + i, // garde l'ordre de collage
    });
  }
  persist();
  void work();
}

export function discardDraft(id: string): void {
  const draft = drafts.find((d) => d.id === id);
  if (!draft) return;
  draft.candidates.forEach((c) => rmSync(DRAFT_MEDIA_DIR + c.file, { force: true }));
  drafts = drafts.filter((d) => d.id !== id);
  streams.delete(id);
  persist();
}

/** Ajoute une capture candidate à un instant choisi à la main. */
export async function addCandidate(id: string, atSec: number): Promise<Draft> {
  const draft = drafts.find((d) => d.id === id);
  if (!draft?.youtubeId || draft.status !== 'ready') throw new Error('Brouillon introuvable ou pas prêt.');
  const file = `${draft.id}-${Date.now()}.jpg`;
  const url = await extractFrameWithRetry(
    draft.youtubeId,
    await streamUrl(draft.id, draft.youtubeId),
    Math.round(atSec),
    DRAFT_MEDIA_DIR + file,
  );
  streams.set(draft.id, { url, at: Date.now() });
  draft.candidates.push({ at: Math.round(atSec), file, source: { kind: 'manual' } });
  persist();
  return toPublic(draft);
}

/** Capture d'écran collée ou importée dans l'admin (indispensable pour une vidéo protégée). */
export function addUploadedImage(id: string, atSec: number, dataUrl: string): Draft {
  const draft = drafts.find((d) => d.id === id);
  if (!draft || draft.status !== 'ready') throw new Error('Brouillon introuvable ou pas prêt.');
  const file = `${draft.id}-up${Date.now()}.jpg`;
  writeFileSync(DRAFT_MEDIA_DIR + file, decodeJpegDataUrl(dataUrl));
  draft.candidates.push({ at: Math.round(atSec), file, source: { kind: 'upload' } });
  persist();
  return toPublic(draft);
}

/** « Changer de vidéo » : on repart de zéro sur la vidéo choisie parmi les résultats de la recherche. */
export function chooseVideo(id: string, youtubeId: string): void {
  restart(id, youtubeId);
}

/** « Réessayer » après une erreur (souvent un refus passager de YouTube) : même vidéo si elle était trouvée. */
export function retryDraft(id: string): void {
  const draft = drafts.find((d) => d.id === id);
  restart(id, draft?.youtubeId ?? null);
}

function restart(id: string, youtubeId: string | null): void {
  const draft = drafts.find((d) => d.id === id);
  if (!draft) throw new Error('Brouillon introuvable.');
  if (draft.status === 'queued' || draft.status === 'analyzing') throw new Error('Analyse en cours, patiente un instant.');
  draft.candidates.forEach((c) => rmSync(DRAFT_MEDIA_DIR + c.file, { force: true }));
  Object.assign(draft, {
    youtubeId,
    status: 'queued',
    error: undefined,
    videoTitle: undefined,
    channel: undefined,
    views: undefined,
    duration: undefined,
    heatmap: undefined,
    blocked: undefined,
    candidates: [],
    matches: [],
    fields: emptyFields(),
  });
  streams.delete(id);
  persist();
  void work();
}

/**
 * Recherche Deezer manuelle, quand la détection automatique s'est trompée : les résultats passent
 * en tête des correspondances du brouillon (gardées côté serveur, pour des IDs d'artistes fiables).
 */
export async function searchDraftMatches(id: string, query: string): Promise<Draft> {
  const draft = drafts.find((d) => d.id === id);
  if (!draft || draft.status !== 'ready') throw new Error('Brouillon introuvable ou pas prêt.');
  const found = await findDeezerMatches(query, 6);
  if (!found.length) throw new Error(`Aucun résultat Deezer pour « ${query} ».`);
  const known = new Set(found.map((m) => m.trackId));
  draft.matches = [...found, ...draft.matches.filter((m) => !known.has(m.trackId))].slice(0, 15);
  persist();
  return toPublic(draft);
}

export function confirmDraft(
  id: string,
  payload: { fields: DraftFields; candidate: number; matchIndex: number | null },
): Clip {
  const draft = drafts.find((d) => d.id === id);
  if (!draft?.youtubeId || draft.status !== 'ready') throw new Error('Brouillon introuvable ou pas prêt.');
  const candidate = draft.candidates[payload.candidate];
  if (!candidate) throw new Error('Capture introuvable.');
  const match = payload.matchIndex == null ? null : draft.matches[payload.matchIndex];
  const { fields } = payload;

  const clip: Clip = {
    id: newClipId(fields.artist, fields.title),
    youtubeId: draft.youtubeId,
    title: fields.title,
    artist: fields.artist,
    ...(fields.featuring.length ? { featuring: fields.featuring } : {}),
    ...(fields.aliases.length ? { aliases: fields.aliases } : {}),
    ...(fields.year ? { year: fields.year } : {}),
    themes: fields.themes,
    ...(match ? { artistIds: match.artistIds, deezerTrackId: match.trackId, ...(match.cover ? { cover: match.cover } : {}) } : {}),
    frameAt: candidate.at,
    revealAt: candidate.at,
    ...(draft.views != null ? { views: draft.views, viewsCheckedAt: Date.now() } : {}),
  };
  copyFileSync(DRAFT_MEDIA_DIR + candidate.file, framePath(clip));
  upsertClip(clip);
  discardDraft(id);
  return clip;
}

async function streamUrl(draftId: string, youtubeId: string): Promise<string> {
  const cached = streams.get(draftId);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.url;
  const { streamUrl: url } = await probeVideo(youtubeId);
  if (!url) throw new Error(BLOCKED_MESSAGE);
  streams.set(draftId, { url, at: Date.now() });
  return url;
}

/** « Artiste – Titre » : on garde le meilleur résultat, les autres restent proposés dans l'admin. */
async function resolveVideo(draft: StoredDraft, entry: Extract<Entry, { kind: 'search' }>): Promise<string> {
  draft.query = entry.query;
  const results = await searchYoutube(`${entry.query} official video`);
  if (!results.length) throw new Error(`Aucune vidéo YouTube trouvée pour « ${entry.query} ».`);
  draft.videoOptions = rankVideos(results, entry)
    .slice(0, 6)
    .map(({ id, title, channel, views }) => ({ id, title, channel, views }));
  persist();
  return draft.videoOptions[0].id;
}

async function analyze(draft: StoredDraft): Promise<void> {
  const entry = parseEntry(draft.url);
  if (!entry) throw new Error('Ni un lien YouTube, ni une ligne « Artiste – Titre ».');
  // Une vidéo déjà choisie (« Changer de vidéo ») l'emporte sur la recherche.
  const youtubeId = draft.youtubeId ?? (entry.kind === 'video' ? entry.youtubeId : await resolveVideo(draft, entry));
  draft.youtubeId = youtubeId;

  const existing = getClips().find((c) => c.youtubeId === youtubeId);
  const twin = drafts.find((d) => d !== draft && d.youtubeId === youtubeId && d.status !== 'error');
  if (existing || twin) {
    draft.status = 'duplicate';
    draft.error = existing
      ? `Déjà dans le catalogue : ${existing.artist} – ${existing.title}`
      : 'Cette vidéo est déjà dans un autre brouillon.';
    return;
  }

  const meta = await fetchOembed(youtubeId);
  draft.videoTitle = meta.title;
  draft.channel = meta.author;
  persist();

  // Une ligne « Artiste – Titre » décrit mieux le morceau que le titre de la vidéo.
  const deezerQuery = entry.kind === 'search' ? entry.query : searchQueryFromVideo(meta.title, meta.author);
  draft.matches = await findDeezerMatches(deezerQuery).catch(() => []);
  const top = draft.matches[0];
  const guess = guessFromVideoTitle(meta.title, meta.author);
  draft.fields = {
    ...emptyFields(),
    title: top?.title ?? guess.title,
    artist: top?.artist ?? guess.artist,
    featuring: top?.featuring ?? [],
    year: top?.year ?? (entry.kind === 'search' ? entry.yearHint : null),
  };
  persist();

  const probe = await probeVideo(youtubeId);
  draft.views = probe.views ?? undefined;
  draft.duration = probe.duration;
  draft.heatmap = probe.heatmap.map((s) => Math.round(s.value * 1000) / 1000);

  if (!probe.streamUrl) {
    // Vidéo protégée : images générées par YouTube ; une capture collée dans l'admin reste possible.
    draft.blocked = true;
    const images = await youtubeImages(youtubeId, probe.duration, (n) => `${DRAFT_MEDIA_DIR}${draft.id}-yt${n}.jpg`);
    draft.candidates = images.map((img) => ({
      at: img.at,
      file: `${draft.id}-yt${img.ratio * 4}.jpg`,
      source: { kind: 'youtube', ratio: img.ratio },
    }));
    draft.status = 'ready'; // même sans image : une capture peut être collée dans la fiche
    return;
  }

  let url = probe.streamUrl;
  streams.set(draft.id, { url, at: Date.now() });
  for (const { at, source } of highlightTimes(probe, CANDIDATES)) {
    const file = `${draft.id}-${at}.jpg`;
    url = await extractFrameWithRetry(youtubeId, url, at, DRAFT_MEDIA_DIR + file);
    streams.set(draft.id, { url, at: Date.now() });
    draft.candidates.push({ at, file, source });
    persist(); // les captures apparaissent au fil de l'eau dans l'admin
  }
  draft.status = 'ready';
}

/** Traite la file un brouillon à la fois (yt-dlp et Deezer n'aiment pas les rafales). */
async function work(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (let draft = next(); draft; draft = next()) {
      draft.status = 'analyzing';
      persist();
      try {
        await analyze(draft);
      } catch (err) {
        draft.status = 'error';
        draft.error = (err as Error).message;
      }
      persist();
    }
  } finally {
    working = false;
  }
}

function next(): StoredDraft | undefined {
  return drafts.find((d) => d.status === 'queued');
}

// Au démarrage : reprend les analyses interrompues.
for (const draft of drafts) if (draft.status === 'analyzing') draft.status = 'queued';
if (drafts.some((d) => d.status === 'queued')) void work();
