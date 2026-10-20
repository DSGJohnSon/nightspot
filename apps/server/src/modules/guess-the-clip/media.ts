import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { type CandidateSource, highlightWindow } from '@nightspot/shared';

const run = promisify(execFile);
const YTDLP = process.env.YTDLP_PATH ?? 'yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FORMAT = 'bv*[height<=1080][ext=mp4]/bv*[height<=1080]/b';

export const watchUrl = (youtubeId: string) => `https://www.youtube.com/watch?v=${youtubeId}`;

export interface VideoProbe {
  duration: number;
  /** URL du flux vidéo, valable quelques heures ; `null` si YouTube interdit le téléchargement. */
  streamUrl: string | null;
  views: number | null;
  /** Courbe « Most replayed » de YouTube. */
  heatmap: { start_time: number; end_time: number; value: number }[];
}

export const BLOCKED_MESSAGE =
  'YouTube interdit le téléchargement de cette vidéo : colle ou importe une capture d’écran à la place.';

/**
 * Certaines vidéos (souvent VEVO / grands labels) ne sont lisibles que dans un vrai navigateur :
 * les lecteurs utilisés par défaut par yt-dlp les disent « indisponibles ». Le lecteur web donne encore
 * les infos (durée, vues, courbe), mais aucun flux téléchargeable.
 */
const PROTECTED = /not available|Requested format is not available|page needs to be reloaded/i;
const WEB_PLAYER = ['--extractor-args', 'youtube:player_client=web', '--ignore-no-formats-error'];

const errorText = (err: unknown) => {
  const e = err as { stderr?: string; message?: string };
  return `${e.stderr ?? ''} ${e.message ?? ''}`;
};

type YtInfo = { duration: number; url?: string; view_count?: number; heatmap?: VideoProbe['heatmap'] };

export async function probeVideo(youtubeId: string): Promise<VideoProbe> {
  const options = { maxBuffer: 64 * 1024 * 1024, timeout: 90_000 };
  try {
    const { stdout } = await run(YTDLP, ['-q', '--no-warnings', '-j', '-f', FORMAT, watchUrl(youtubeId)], options);
    const info = JSON.parse(stdout) as YtInfo;
    return { duration: info.duration, streamUrl: info.url ?? null, views: info.view_count ?? null, heatmap: info.heatmap ?? [] };
  } catch (err) {
    if (!PROTECTED.test(errorText(err))) throw new Error(explainMediaError(err));
  }
  try {
    const { stdout } = await run(YTDLP, ['-q', '--no-warnings', '-j', '--skip-download', ...WEB_PLAYER, watchUrl(youtubeId)], options);
    const info = JSON.parse(stdout) as YtInfo;
    return { duration: info.duration, streamUrl: null, views: info.view_count ?? null, heatmap: info.heatmap ?? [] };
  } catch (err) {
    throw new Error(explainMediaError(err));
  }
}

/** Capture collée dans l'admin : le navigateur l'envoie en JPEG ; on vérifie qu'il s'agit bien d'un JPEG. */
export function decodeJpegDataUrl(dataUrl: string): Buffer {
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('Image invalide (JPEG attendu).');
  }
  return bytes;
}

/**
 * Pour une vidéo protégée : les images que YouTube génère lui-même (vraies images du clip, à environ
 * 25, 50 et 75 % de la durée), en 1280×720 quand elles existent.
 */
export async function youtubeImages(
  youtubeId: string,
  duration: number,
  outFile: (n: number) => string,
): Promise<{ at: number; file: string; ratio: number }[]> {
  const images: { at: number; file: string; ratio: number }[] = [];
  for (const n of [1, 2, 3]) {
    for (const size of ['maxres', 'sd', 'hq']) {
      const res = await fetch(`https://i.ytimg.com/vi/${youtubeId}/${size}${n}.jpg`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const file = outFile(n);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      images.push({ at: Math.round((duration * n) / 4), file, ratio: n / 4 });
      break;
    }
  }
  return images;
}

/** Recherche YouTube (sans clé d'API) : les `count` premiers résultats. */
export async function searchYoutube(
  query: string,
  count = 8,
): Promise<{ id: string; title: string; channel: string; views: number | null; duration: number | null }[]> {
  try {
    const { stdout } = await run(YTDLP, ['-q', '--no-warnings', '--flat-playlist', '-j', `ytsearch${count}:${query}`], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 90_000,
    });
    return stdout
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as { id: string; title?: string; channel?: string; uploader?: string; view_count?: number; duration?: number })
      .filter((e) => /^[\w-]{11}$/.test(e.id))
      .map((e) => ({
        id: e.id,
        title: e.title ?? '',
        channel: e.channel ?? e.uploader ?? '',
        views: e.view_count ?? null,
        duration: e.duration ?? null,
      }));
  } catch (err) {
    throw new Error(explainMediaError(err));
  }
}

export async function fetchViews(youtubeId: string): Promise<number> {
  const args = ['-q', '--no-warnings', '--skip-download', '--print', '%(view_count)s', watchUrl(youtubeId)];
  let stdout: string;
  try {
    ({ stdout } = await run(YTDLP, args, { timeout: 90_000 }));
  } catch (err) {
    if (!PROTECTED.test(errorText(err))) throw new Error(explainMediaError(err));
    try {
      ({ stdout } = await run(YTDLP, [...WEB_PLAYER, ...args], { timeout: 90_000 }));
    } catch (err2) {
      throw new Error(explainMediaError(err2));
    }
  }
  const views = Number(stdout.trim());
  if (!Number.isFinite(views)) throw new Error('nombre de vues introuvable');
  return views;
}

/**
 * Moments forts du clip : pics de la courbe « Most replayed », espacés d'au moins `minGapSec`,
 * en ignorant le début (tout le monde démarre à 0) et la fin. Complété par des repères fixes.
 */
export function highlightTimes(
  probe: VideoProbe,
  count: number,
  minGapSec = 15,
): { at: number; source: CandidateSource }[] {
  const { from, to } = highlightWindow(probe.duration);
  const picked: { at: number; source: CandidateSource }[] = [];
  const tryAdd = (at: number, source: CandidateSource) => {
    if (picked.length < count && picked.every((p) => Math.abs(p.at - at) >= minGapSec)) picked.push({ at, source });
  };
  probe.heatmap
    .filter((s) => s.start_time >= from && s.end_time <= to)
    .sort((a, b) => b.value - a.value)
    .forEach((s) => {
      const rank = picked.filter((p) => p.source.kind === 'peak').length + 1;
      tryAdd(Math.round(s.start_time), { kind: 'peak', rank, intensity: Math.round(s.value * 100) / 100 });
    });
  [0.35, 0.55, 0.75, 0.2].forEach((ratio) => tryAdd(Math.round(probe.duration * ratio), { kind: 'fixed', ratio }));
  return picked;
}

export async function extractFrame(streamUrl: string, atSec: number, outFile: string): Promise<void> {
  try {
    await run(
      FFMPEG,
      [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-ss', String(atSec),
        '-i', streamUrl,
        '-frames:v', '1', '-vf', 'scale=w=min(1920\\,iw):h=-2', '-q:v', '3',
        outFile,
      ],
      { timeout: 90_000 },
    );
  } catch (err) {
    throw new Error(explainMediaError(err));
  }
}

/**
 * Extraction robuste : YouTube refuse parfois un flux (403) quand les requêtes s'enchaînent.
 * On redemande alors une adresse de flux neuve et on réessaie. Renvoie l'adresse utilisée.
 */
export async function extractFrameWithRetry(
  youtubeId: string,
  streamUrl: string,
  atSec: number,
  outFile: string,
): Promise<string> {
  try {
    await extractFrame(streamUrl, atSec, outFile);
    return streamUrl;
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    const { streamUrl: fresh } = await probeVideo(youtubeId);
    if (!fresh) throw new Error(BLOCKED_MESSAGE);
    await extractFrame(fresh, atSec, outFile);
    return fresh;
  }
}

function explainMediaError(err: unknown): string {
  const e = err as NodeJS.ErrnoException & { stderr?: string };
  if (e.code === 'ENOENT') return 'yt-dlp ou ffmpeg introuvable : installe-les ou définis YTDLP_PATH / FFMPEG_PATH.';
  const text = `${e.stderr ?? ''} ${e.message ?? ''}`;
  if (/403|Forbidden/i.test(text)) {
    return 'YouTube a refusé le téléchargement (403). Réessaie dans un instant ; si ça persiste, mets yt-dlp à jour (« yt-dlp -U »).';
  }
  if (/Video unavailable|Private video|removed/i.test(text)) return 'Vidéo indisponible ou privée.';
  if (/Sign in to confirm/i.test(text)) return 'YouTube demande une vérification anti-robot : réessaie plus tard ou mets yt-dlp à jour.';
  return (e.stderr || e.message || String(err)).split('\n').find((l) => l.trim())?.slice(0, 200) ?? 'Erreur inconnue';
}
