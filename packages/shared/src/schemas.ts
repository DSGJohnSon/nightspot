// Validation des données reçues par le serveur. Importé via « @nightspot/shared/schemas »
// pour que Zod n'atterrisse pas dans le bundle des téléphones.
import { z } from 'zod';
import { MODULE_IDS, SEARCH_MODES } from './types';

/** Un bloc = un module joué sur N manches avec ses propres réglages. */
export const blockSettingsSchema = z.object({
  moduleId: z.enum(MODULE_IDS),
  rounds: z.number().int().min(1).max(50),
  timerSec: z.number().int().min(5).max(120),
  /** Durée d'affichage des réponses ; ensuite le classement remplace les réponses et le clip continue. */
  revealSec: z.number().int().min(5).max(120),
  searchMode: z.enum(SEARCH_MODES),
  /** Filtres du tirage ; une liste vide = pas de filtre. */
  themes: z.array(z.string().max(60)).max(50),
  decades: z.array(z.number().int().min(1900).max(2100)).max(20),
  difficulties: z.array(z.number().int().min(1).max(5)).max(5),
});

export const sessionSettingsSchema = z.object({
  blocks: z.array(blockSettingsSchema).min(1).max(10),
});

/** Réponse du module guess-the-clip : un morceau choisi dans la recherche. */
export const trackChoiceSchema = z.object({
  trackId: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  artistId: z.number().int().positive().optional(),
  // Pochettes Deezer uniquement : elles sont affichées telles quelles sur la TV.
  cover: z
    .string()
    .max(500)
    .regex(/^https:\/\/[a-z0-9-]+\.dzcdn\.net\//)
    .optional(),
});

/* ---------- Admin ---------- */

export const loginSchema = z.object({ password: z.string().min(1).max(200) });

export const clipFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().min(1).max(200),
  featuring: z.array(z.string().trim().min(1).max(100)).max(10),
  aliases: z.array(z.string().trim().min(1).max(200)).max(20),
  year: z.number().int().min(1900).max(2100).nullable(),
  themes: z.array(z.string().max(60)).max(30),
});

export const clipUpdateSchema = clipFieldsSchema.extend({
  revealAt: z.number().min(0).max(36000),
  difficultyOverride: z.number().int().min(1).max(5).nullable(),
});

/** Liens YouTube ou lignes « Artiste – Titre ». */
export const draftCreateSchema = z.object({ urls: z.array(z.string().trim().max(500)).min(1).max(150) });

export const draftVideoSchema = z.object({ youtubeId: z.string().regex(/^[\w-]{11}$/) });

export const draftConfirmSchema = z.object({
  fields: clipFieldsSchema,
  /** Index de la capture choisie parmi les candidates. */
  candidate: z.number().int().min(0),
  /** Correspondance Deezer retenue (pour les IDs d'artistes et la pochette), ou aucune. */
  matchIndex: z.number().int().min(0).nullable(),
});

export const frameRequestSchema = z.object({ at: z.number().min(0).max(36000) });

/** Capture collée ou importée : JPEG en data URL (converti et redimensionné par le navigateur). */
export const imageUploadSchema = z.object({
  at: z.number().min(0).max(36000),
  image: z
    .string()
    .max(12_000_000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
});

export const deezerSearchSchema = z.object({ query: z.string().trim().min(2).max(200) });

export const themeNameSchema = z.object({ name: z.string().trim().min(1).max(40) });

export const settingsSchema = z.object({
  viewThresholds: z
    .array(z.number().int().positive())
    .length(4)
    .refine((t) => t.every((v, i) => i === 0 || v < t[i - 1]), 'Les seuils doivent être décroissants.'),
});
