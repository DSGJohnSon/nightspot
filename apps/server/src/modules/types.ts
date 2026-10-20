import type { DrawFilters, ModuleId, Solution } from '@nightspot/shared';

/**
 * Contrat d'un module de jeu. Le moteur gère joueurs, phases, timer, bonus de vitesse et
 * multiplicateur de difficulté ; le module fournit le contenu et dit ce que vaut une réponse.
 */
export interface GameModule<Item extends { id: string }, Answer> {
  id: ModuleId;
  /** Points maximum d'une manche, avant bonus de vitesse et multiplicateur de difficulté. */
  maxPoints: number;
  /** Tire `count` éléments jouables correspondant aux filtres, en évitant ceux joués récemment. */
  draw(count: number, lastPlayedAt: (itemId: string) => number, filters: DrawFilters): Item[];
  /** Niveau 1 (facile) à 5 (impossible). */
  difficulty(item: Item): number;
  /** Image affichée par la TV pendant la question (chemin local). */
  imageFile(item: Item): string;
  /** Vidéo jouée au reveal. */
  media(item: Item): { youtubeId: string; startSec: number };
  solution(item: Item): Solution;
  /** Valide la réponse brute reçue du téléphone. */
  parseAnswer(raw: unknown): Answer | null;
  evaluate(item: Item, answer: Answer): { parts: Record<string, boolean>; basePoints: number };
}
