/** Part minimale des points conservée quand on répond à la toute fin du timer. */
export const SPEED_FLOOR = 0.5;

/**
 * Multiplicateur de vitesse : 100 % à t = 0, SPEED_FLOOR à la fin du timer.
 * Une bonne réponse lente bat toujours une réponse rapide à moitié juste.
 */
export function speedFactor(elapsedMs: number, timerMs: number): number {
  const ratio = Math.min(Math.max(elapsedMs / timerMs, 0), 1);
  return 1 - (1 - SPEED_FLOOR) * ratio;
}

export function applySpeed(basePoints: number, elapsedMs: number, timerMs: number): number {
  return Math.round(basePoints * speedFactor(elapsedMs, timerMs));
}

/**
 * Difficulté d'une question, d'après ses vues YouTube et des seuils fixes (réglables dans l'admin) :
 * le niveau d'un clip ne dépend que de lui, pas du reste du catalogue.
 * Le multiplicateur s'applique aux points de la réponse.
 */
export const DIFFICULTIES = [
  { level: 1, name: 'Facile', multiplier: 1 },
  { level: 2, name: 'Moyen', multiplier: 1.25 },
  { level: 3, name: 'Difficile', multiplier: 1.5 },
  { level: 4, name: 'Expert', multiplier: 1.75 },
  { level: 5, name: 'Impossible', multiplier: 2 },
] as const;

/** Vues minimales pour Facile, Moyen, Difficile, Expert ; en dessous du dernier seuil : Impossible. */
export const DEFAULT_VIEW_THRESHOLDS = [1_000_000_000, 300_000_000, 100_000_000, 20_000_000];

export function levelFromViews(views: number, thresholds: readonly number[]): number {
  const index = thresholds.findIndex((min) => views >= min);
  return index === -1 ? thresholds.length + 1 : index + 1;
}

export type ThresholdMethod = 'balanced' | 'spread';

/**
 * Seuils proposés d'après les vues du catalogue ; l'admin les ajuste puis les enregistre, et ils
 * restent fixes ensuite.
 *  - « balanced » : autant de clips dans chaque niveau (quantiles des vues) ;
 *  - « spread »   : paliers réguliers, en échelle logarithmique, du clip le plus vu au moins vu.
 * Arrondis à des valeurs lisibles (1, 2, 5 × 10ⁿ quand c'est possible).
 * `null` sous 5 clips, ou si les vues sont trop proches pour former 5 niveaux distincts.
 */
export function suggestThresholds(views: number[], method: ThresholdMethod): number[] | null {
  const logs = views
    .filter((v) => v > 0)
    .sort((a, b) => b - a)
    .map(Math.log10);
  if (logs.length < 5) return null;

  const raw =
    method === 'balanced'
      ? [1, 2, 3, 4].map((k) => {
          // Frontière entre deux groupes : à mi-chemin (en log) des clips de part et d'autre.
          const i = Math.round((k * logs.length) / 5);
          return (logs[i - 1] + logs[i]) / 2;
        })
      : [1, 2, 3, 4].map((k) => logs[0] - (k * (logs[0] - logs[logs.length - 1])) / 5);

  return roundDecreasing(raw.map((log) => 10 ** log));
}

/** Arrondit le plus grossièrement possible tout en gardant des seuils strictement décroissants. */
function roundDecreasing(values: number[]): number[] | null {
  const scales = [
    [1, 2, 5],
    [1, 1.5, 2, 3, 5, 7],
    [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9],
  ];
  const decreasing = (list: number[]) => list.every((v, i) => i === 0 || v < list[i - 1]);
  for (const steps of scales) {
    const rounded = values.map((v) => nearestStep(v, steps));
    if (decreasing(rounded)) return rounded;
  }
  const precise = values.map((v) => Math.round(Number(v.toPrecision(2))));
  return decreasing(precise) ? precise : null;
}

/** Valeur de la forme step × 10ⁿ la plus proche de `value` (en échelle logarithmique). */
function nearestStep(value: number, steps: number[]): number {
  const exponent = Math.floor(Math.log10(value));
  let best = value;
  let bestDistance = Infinity;
  for (const e of [exponent - 1, exponent, exponent + 1]) {
    for (const step of steps) {
      const candidate = step * 10 ** e;
      const distance = Math.abs(Math.log10(candidate / value));
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return Math.round(best);
}

export function difficultyInfo(level: number) {
  return DIFFICULTIES[Math.min(Math.max(Math.round(level), 1), 5) - 1];
}

/** « ×1,75 » */
export function formatMultiplier(multiplier: number): string {
  return `×${String(multiplier).replace('.', ',')}`;
}

/**
 * Bonus « année », ouvert à tous pendant le reveal, indexé par l'écart en années :
 * pile → 100, à 1 an près → 50, à 2 ans près → 25. Environ 10 % d'une manche parfaite.
 * Il n'est pas multiplié par la difficulté.
 */
export const YEAR_BONUS = [100, 50, 25] as const;

export function yearBonus(guess: number, actual: number): number {
  return YEAR_BONUS[Math.abs(guess - actual)] ?? 0;
}
