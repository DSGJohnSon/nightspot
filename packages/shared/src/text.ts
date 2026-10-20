/**
 * Normalise un titre pour la comparaison :
 * « Bohemian Rhapsody - Remastered 2011 » → « bohemian rhapsody »
 * « Single Ladies (Put a Ring on It) »     → « single ladies »
 */
export function normalizeTitle(input: string): string {
  return baseNormalize(
    input
      .replace(/\s*[([].*?[)\]]/g, ' ')
      .replace(/\s+[-–—]\s+.*$/, ' ')
      .replace(/\b(feat|ft|featuring)\b\.?.*$/i, ' '),
  );
}

/** Normalise un nom d'artiste : « Beyoncé » → « beyonce », « Guns N' Roses » → « guns n roses ». */
export function normalizeName(input: string): string {
  return baseNormalize(input);
}

function baseNormalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

/** Similarité de Levenshtein ramenée entre 0 et 1. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Deux textes déjà normalisés désignent-ils la même chose, à une faute de frappe près ? */
export function looselyEqual(a: string, b: string, threshold = 0.85): boolean {
  if (a === b) return a.length > 0;
  if (Math.min(a.length, b.length) < 5) return false;
  return similarity(a, b) >= threshold;
}
