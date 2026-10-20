/* Catalogue du module guess-the-clip et espace admin. */

export interface Theme {
  id: string;
  name: string;
}

export interface Clip {
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  featuring?: string[];
  /** Autres titres acceptés comme bonne réponse. */
  aliases?: string[];
  /** Année de première sortie du titre (album ou single). */
  year?: number;
  themes?: string[];
  /** IDs Deezer de l'artiste principal et des invités. */
  artistIds?: number[];
  deezerTrackId?: number;
  cover?: string;
  /** Instant de la capture affichée pendant la question (s). */
  frameAt?: number;
  /** Instant où démarre la vidéo au reveal (s). */
  revealAt?: number;
  /** Vues YouTube, base du calcul de difficulté. */
  views?: number;
  viewsCheckedAt?: number;
  /** Difficulté forcée (1 à 5) ; sinon calculée d'après les vues. */
  difficultyOverride?: number;
}

/** Ce que la TV doit savoir pour compter les clips disponibles selon les filtres choisis. */
export interface CatalogSummary {
  themes: Theme[];
  items: { themes: string[]; decade: number | null; difficulty: number }[];
}

export interface AdminClip extends Clip {
  difficulty: number;
  lastPlayedAt: number;
  frameUrl: string | null;
}

export interface DeezerMatch {
  trackId: number;
  title: string;
  artist: string;
  artistIds: number[];
  featuring: string[];
  cover: string | null;
  year: number | null;
}

export interface DraftFields {
  title: string;
  artist: string;
  featuring: string[];
  aliases: string[];
  year: number | null;
  themes: string[];
}

export type DraftStatus = 'queued' | 'analyzing' | 'ready' | 'duplicate' | 'error';

/** D'où vient une capture candidate. */
export type CandidateSource =
  /** Pic de la courbe « Most replayed » ; intensité 0-1 par rapport au moment le plus revu de la vidéo. */
  | { kind: 'peak'; rank: number; intensity: number }
  /** Repère fixe (fraction de la durée), quand la courbe n'offre pas assez de pics. */
  | { kind: 'fixed'; ratio: number }
  /** Image générée par YouTube (vidéo protégée contre le téléchargement), position approximative. */
  | { kind: 'youtube'; ratio: number }
  /** Capture d'écran collée ou importée dans l'admin. */
  | { kind: 'upload' }
  | { kind: 'manual' };

/**
 * Zone où l'on cherche les moments forts : on ignore le début (tout le monde démarre à 0, la courbe
 * y est toujours haute) et la fin.
 */
export function highlightWindow(duration: number): { from: number; to: number } {
  return { from: Math.max(10, duration * 0.1), to: duration * 0.92 };
}

/** Vidéo YouTube trouvée pour une ligne « Artiste – Titre ». */
export interface VideoOption {
  id: string;
  title: string;
  channel: string;
  views: number | null;
}

/** Un lien YouTube (ou une ligne « Artiste – Titre ») collé dans l'admin, analysé puis à confirmer. */
export interface Draft {
  id: string;
  /** Ce qui a été collé : lien YouTube ou « Artiste – Titre ». */
  url: string;
  /** Recherche effectuée quand la ligne n'était pas un lien. */
  query?: string;
  /** Résultats YouTube de cette recherche, du plus probable au moins probable. */
  videoOptions?: VideoOption[];
  youtubeId: string | null;
  status: DraftStatus;
  error?: string;
  videoTitle?: string;
  channel?: string;
  views?: number;
  duration?: number;
  /**
   * YouTube interdit le téléchargement de cette vidéo (souvent VEVO / grands labels) : pas de capture à
   * un instant précis, seulement les images générées par YouTube ou une capture importée. Le reveal
   * fonctionne quand même (la vidéo reste intégrable).
   */
  blocked?: boolean;
  /** Courbe « Most replayed » (segments de même durée, valeurs 0-1). */
  heatmap?: number[];
  /** Captures candidates, aux moments les plus revus du clip. */
  candidates: { at: number; url: string; source?: CandidateSource }[];
  matches: DeezerMatch[];
  fields: DraftFields;
  createdAt: number;
}

export interface ViewsJob {
  running: boolean;
  done: number;
  total: number;
  errors: number;
  finishedAt: number | null;
}

export interface CatalogSettings {
  /** Vues minimales pour Facile, Moyen, Difficile, Expert (décroissantes). */
  viewThresholds: number[];
}

export interface AdminCatalog {
  clips: AdminClip[];
  themes: (Theme & { count: number })[];
  viewsJob: ViewsJob;
  settings: CatalogSettings;
}
