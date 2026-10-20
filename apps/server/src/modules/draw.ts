/**
 * Tire `count` éléments en privilégiant ceux jamais joués, puis ceux joués il y a le plus longtemps.
 * L'ordre de passage dans la partie reste aléatoire.
 */
export function drawFreshest<T extends { id: string }>(
  items: T[],
  count: number,
  lastPlayedAt: (itemId: string) => number,
): T[] {
  // Tri stable : à fraîcheur égale (ex. jamais joués), l'ordre aléatoire du mélange est conservé.
  const byFreshness = shuffle(items).sort((a, b) => lastPlayedAt(a.id) - lastPlayedAt(b.id));
  return shuffle(byFreshness.slice(0, count));
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
