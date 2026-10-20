import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import {
  type CatalogSettings,
  type Clip,
  DEFAULT_VIEW_THRESHOLDS,
  type DrawFilters,
  levelFromViews,
  normalizeName,
  type Theme,
} from '@nightspot/shared';
import { DATA_DIR } from '../../paths';

export type { Clip };
export { DATA_DIR };
const CLIPS_PATH = `${DATA_DIR}clips.json`;
const THEMES_PATH = `${DATA_DIR}themes.json`;
export const MEDIA_DIR = `${DATA_DIR}media/`;
export const DRAFT_MEDIA_DIR = `${MEDIA_DIR}drafts/`;
mkdirSync(DRAFT_MEDIA_DIR, { recursive: true });

/**
 * Fichier JSON gardé en mémoire et relu s'il a été modifié ailleurs
 * (ex. `pnpm clips:enrich` lancé pendant que le serveur tourne).
 */
class JsonStore<T> {
  private value: T;
  private mtime = 0;

  constructor(
    private readonly path: string,
    private readonly fallback: T,
    private readonly format: (value: T) => string,
  ) {
    this.value = fallback;
    this.reloadIfChanged();
  }

  get(): T {
    this.reloadIfChanged();
    return this.value;
  }

  set(value: T): void {
    this.value = value;
    // Écriture atomique : un arrêt brutal ne laisse pas un fichier à moitié écrit.
    writeFileSync(`${this.path}.tmp`, this.format(value));
    renameSync(`${this.path}.tmp`, this.path);
    this.mtime = statSync(this.path).mtimeMs;
  }

  private reloadIfChanged(): void {
    if (!existsSync(this.path)) return;
    const mtime = statSync(this.path).mtimeMs;
    if (mtime === this.mtime) return;
    this.value = JSON.parse(readFileSync(this.path, 'utf8')) as T;
    this.mtime = mtime;
  }
}

// Une ligne par clip : le fichier reste lisible et les diffs courts.
const clipsStore = new JsonStore<Clip[]>(CLIPS_PATH, [], (list) => `[\n${list.map((c) => '  ' + JSON.stringify(c)).join(',\n')}\n]\n`);
const themesStore = new JsonStore<Theme[]>(THEMES_PATH, [], (list) => JSON.stringify(list, null, 2) + '\n');
const settingsStore = new JsonStore<CatalogSettings>(
  `${DATA_DIR}settings.json`,
  { viewThresholds: DEFAULT_VIEW_THRESHOLDS },
  (settings) => JSON.stringify(settings, null, 2) + '\n',
);

export function getClips(): Clip[] {
  return clipsStore.get();
}

export function saveClips(clips: Clip[]): void {
  clipsStore.set(clips);
}

export function upsertClip(clip: Clip): void {
  const clips = getClips();
  const exists = clips.some((c) => c.id === clip.id);
  saveClips(exists ? clips.map((c) => (c.id === clip.id ? clip : c)) : [...clips, clip]);
}

export function getThemes(): Theme[] {
  return themesStore.get();
}

export function saveThemes(themes: Theme[]): void {
  themesStore.set(themes);
}

export function getSettings(): CatalogSettings {
  return settingsStore.get();
}

export function saveSettings(settings: CatalogSettings): void {
  settingsStore.set(settings);
}

/**
 * Difficulté 1 (facile) à 5 (impossible) d'après les vues YouTube et des seuils fixes :
 * le niveau d'un clip ne dépend que de lui. Une difficulté forcée l'emporte.
 */
export function difficultyOf(clip: Clip): number {
  if (clip.difficultyOverride) return clip.difficultyOverride;
  if (clip.views == null) return 3; // vues inconnues : niveau intermédiaire
  return levelFromViews(clip.views, getSettings().viewThresholds);
}

export function decadeOf(clip: Clip): number | null {
  return clip.year ? Math.floor(clip.year / 10) * 10 : null;
}

/** Une liste de filtre vide ne filtre pas ; sinon il suffit d'un thème commun. */
export function matchesFilters(clip: Clip, filters: DrawFilters): boolean {
  const decade = decadeOf(clip);
  return (
    (!filters.themes.length || (clip.themes ?? []).some((t) => filters.themes.includes(t))) &&
    (!filters.decades.length || (decade != null && filters.decades.includes(decade))) &&
    (!filters.difficulties.length || filters.difficulties.includes(difficultyOf(clip)))
  );
}

export function framePath(clip: Pick<Clip, 'youtubeId'>): string {
  return `${MEDIA_DIR}${clip.youtubeId}.jpg`;
}

export function hasFrame(clip: Clip): boolean {
  return existsSync(framePath(clip));
}

export function displayArtist(clip: Clip): string {
  return clip.featuring?.length ? `${clip.artist} feat. ${clip.featuring.join(', ')}` : clip.artist;
}

/** « Guns N' Roses », « Sweet Child O' Mine » → « guns-n-roses-sweet-child-o-mine » (unique). */
export function newClipId(artist: string, title: string): string {
  const base = normalizeName(`${artist} ${title}`).replace(/ /g, '-') || 'clip';
  const taken = new Set(getClips().map((c) => c.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}
