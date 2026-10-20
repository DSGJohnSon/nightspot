import {
  type CatalogSummary,
  looselyEqual,
  normalizeName,
  normalizeTitle,
  type SearchResult,
  type TrackChoice,
} from '@nightspot/shared';
import { trackChoiceSchema } from '@nightspot/shared/schemas';
import { drawFreshest } from '../draw';
import type { GameModule } from '../types';
import {
  type Clip,
  decadeOf,
  difficultyOf,
  displayArtist,
  framePath,
  getClips,
  getThemes,
  hasFrame,
  matchesFilters,
} from './catalog';

const TITLE_POINTS = 600;
const ARTIST_POINTS = 400;

export const guessTheClip: GameModule<Clip, TrackChoice> = {
  id: 'guess-the-clip',
  maxPoints: TITLE_POINTS + ARTIST_POINTS,

  draw(count, lastPlayedAt, filters) {
    const pool = getClips().filter((clip) => hasFrame(clip) && matchesFilters(clip, filters));
    return drawFreshest(pool, count, lastPlayedAt);
  },

  difficulty: difficultyOf,

  imageFile: framePath,

  media: (clip) => ({ youtubeId: clip.youtubeId, startSec: clip.revealAt ?? 0 }),

  solution: (clip) => ({
    title: clip.title,
    artist: displayArtist(clip),
    year: clip.year,
    cover: clip.cover,
  }),

  parseAnswer(raw) {
    const parsed = trackChoiceSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  },

  evaluate(clip, answer) {
    const title = [clip.title, ...(clip.aliases ?? [])].some((t) =>
      looselyEqual(normalizeTitle(t), normalizeTitle(answer.title)),
    );
    const artist =
      (answer.artistId != null && (clip.artistIds ?? []).includes(answer.artistId)) ||
      [clip.artist, ...(clip.featuring ?? [])].some((a) =>
        looselyEqual(normalizeName(a), normalizeName(answer.artist)),
      );
    return {
      parts: { title, artist },
      basePoints: (title ? TITLE_POINTS : 0) + (artist ? ARTIST_POINTS : 0),
    };
  },
};

/** De quoi compter, côté TV, les clips disponibles pour une combinaison de filtres (sans rien dévoiler). */
export function catalogSummary(): CatalogSummary {
  return {
    themes: getThemes(),
    items: getClips()
      .filter(hasFrame)
      .map((clip) => ({ themes: clip.themes ?? [], decade: decadeOf(clip), difficulty: difficultyOf(clip) })),
  };
}

/**
 * Recherche dans le catalogue NightSpot : tout le catalogue en mode « facile », ou seulement les clips
 * absents de Deezer (chansons de YouTubeurs, versions introuvables…) pour compléter la recherche Deezer.
 * Pas de pochette pour ces derniers : une vignette YouTube trahirait la capture affichée sur la TV.
 */
export function searchCatalog(query: string, limit = 8, offDeezerOnly = false): SearchResult[] {
  const terms = normalizeName(query).split(' ').filter(Boolean);
  return getClips()
    .filter((clip) => !offDeezerOnly || !clip.deezerTrackId)
    .filter((clip) => {
      const haystack = normalizeName(`${clip.title} ${clip.artist} ${(clip.featuring ?? []).join(' ')}`);
      return terms.every((t) => haystack.includes(t));
    })
    .slice(0, limit)
    .map((clip) => ({
      trackId: clip.id,
      title: clip.title,
      artist: clip.artist,
      artistId: clip.artistIds?.[0],
      cover: clip.cover,
    }));
}
