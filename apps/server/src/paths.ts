import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dossier des données (catalogue, thèmes, historique, brouillons, captures).
 * `DATA_DIR` permet de lancer un serveur de test sur une copie, sans toucher aux vraies données.
 */
export const DATA_DIR = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR) + sep
  : fileURLToPath(new URL('../data/', import.meta.url));
