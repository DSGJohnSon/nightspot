import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { ModuleId } from '@nightspot/shared';
import { DATA_DIR } from '../paths';

/** Dernier passage de chaque question, conservé d'une partie à l'autre pour éviter les répétitions. */
export const HISTORY_FILE = `${DATA_DIR}history.json`;

type History = Partial<Record<ModuleId, Record<string, number>>>;

const history: History = load();

function load(): History {
  try {
    return existsSync(HISTORY_FILE) ? (JSON.parse(readFileSync(HISTORY_FILE, 'utf8')) as History) : {};
  } catch {
    // Fichier illisible : on repart de zéro plutôt que d'empêcher de jouer.
    return {};
  }
}

/** 0 si la question n'a jamais été jouée. */
export function lastPlayedAt(moduleId: ModuleId, itemId: string): number {
  return history[moduleId]?.[itemId] ?? 0;
}

export function markPlayed(moduleId: ModuleId, itemId: string): void {
  (history[moduleId] ??= {})[itemId] = Date.now();
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.warn(`Historique non enregistré : ${(err as Error).message}`);
  }
}
