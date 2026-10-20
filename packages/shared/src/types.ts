import type { z } from 'zod';
import type { blockSettingsSchema, sessionSettingsSchema, trackChoiceSchema } from './schemas';

/* ---------- Modules & réglages ---------- */

export const MODULE_IDS = ['guess-the-clip'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const SEARCH_MODES = ['deezer', 'catalog'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

/** Durée d'affichage des réponses par défaut : le clip joue au moins ce temps avant le classement. */
export const DEFAULT_REVEAL_SEC = 30;

export type BlockSettings = z.infer<typeof blockSettingsSchema>;
export type SessionSettings = z.infer<typeof sessionSettingsSchema>;
export type DrawFilters = Pick<BlockSettings, 'themes' | 'decades' | 'difficulties'>;

/* ---------- Réponses ---------- */

export type TrackChoice = z.infer<typeof trackChoiceSchema>;

export interface SearchResult extends TrackChoice {}

/* ---------- État de la session vu par les clients ---------- */

export type Phase = 'lobby' | 'prepare' | 'question' | 'reveal' | 'scores' | 'podium';
export type Role = 'host' | 'player';

export interface PlayerPublic {
  id: string;
  name: string;
  color: string;
  score: number;
  connected: boolean;
  /** A validé sa réponse pour la manche en cours. */
  answered: boolean;
  /** A tenté le bonus année pendant le reveal (la valeur reste secrète jusqu'au classement). */
  yearGuessed: boolean;
}

export interface RoundResult {
  playerId: string;
  answer: TrackChoice | null;
  parts: Record<string, boolean>;
  points: number;
  elapsedMs: number | null;
  /** Points crédités en direct ; la valeur tentée reste cachée jusqu'au classement. */
  yearGuess: number | null;
  yearPoints: number;
}

/** Bonus année remporté pendant le reveal, annoncé en direct sur la TV. */
export interface YearWin {
  playerId: string;
  points: number;
  at: number;
}

export interface Solution {
  title: string;
  artist: string;
  year?: number;
  cover?: string;
}

export interface RoundPublic {
  index: number;
  total: number;
  blockIndex: number;
  moduleId: ModuleId;
  timerSec: number;
  revealSec: number;
  searchMode: SearchMode;
  /** Points maximum de la manche, multiplicateur de difficulté compris. */
  maxPoints: number;
  startedAt: number | null;
  endsAt: number | null;
  /** Fin de la phase reveal (horloge serveur). */
  revealEndsAt: number | null;
  /** La manche propose le bonus année pendant le reveal. */
  yearBonus: boolean;
  yearWins: YearWin[];
  /** Niveau 1 (facile) à 5 (impossible), qui fixe le multiplicateur de points. */
  difficulty: number;
  /** Écran TV uniquement : capture à afficher. */
  imageUrl?: string;
  /** Écran TV uniquement : vidéo à précharger pour le reveal. */
  media?: { youtubeId: string; startSec: number };
  /** À partir du reveal ; l'année n'apparaît qu'au classement, une fois le bonus clos. */
  solution?: Solution;
  results?: RoundResult[];
}

export interface SessionView {
  code: string;
  role: Role;
  phase: Phase;
  players: PlayerPublic[];
  round: RoundPublic | null;
  totalRounds: number;
  /** Horloge serveur au moment de l'envoi, pour synchroniser les timers. */
  serverNow: number;
  me?: {
    id: string;
    answer: TrackChoice | null;
    elapsedMs: number | null;
    yearGuess: number | null;
  };
}
