import { normalizeTitle, type SearchResult } from '@nightspot/shared';

export interface DeezerTrack {
  id: number;
  title: string;
  title_short?: string;
  release_date?: string;
  artist: { id: number; name: string };
  album?: { cover_medium?: string };
  contributors?: { id: number; name: string }[];
}

// Deezer limite à 50 requêtes / 5 s par IP, et joueurs comme admin passent par ce serveur.
const WINDOW_MS = 5000;
const MAX_PER_WINDOW = 45;
let calls: number[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    calls = calls.filter((t) => now - t < WINDOW_MS);
    if (calls.length < MAX_PER_WINDOW) {
      calls.push(now);
      return;
    }
    await sleep(WINDOW_MS - (now - calls[0]) + 10);
  }
}

/** Appel à l'API publique de Deezer, en respectant sa limite de débit. */
export async function deezerApi<T>(path: string): Promise<T> {
  await throttle();
  const res = await fetch(`https://api.deezer.com${path}`, { signal: AbortSignal.timeout(5000) });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;
const cache = new Map<string, { at: number; results: SearchResult[] }>();

/** Recherche des joueurs pendant une manche (mise en cache : tout le monde tape les mêmes débuts de titres). */
export async function searchDeezer(query: string): Promise<SearchResult[]> {
  const key = query.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  const { data = [] } = await deezerApi<{ data?: DeezerTrack[] }>(
    `/search/track?limit=15&q=${encodeURIComponent(query)}`,
  );

  // Une seule ligne par couple titre/artiste : on masque remasters, versions album, etc.
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const track of data) {
    const title = track.title_short || track.title;
    const dedupe = `${normalizeTitle(title)}|${track.artist.id}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    results.push({
      trackId: String(track.id),
      title,
      artist: track.artist.name,
      artistId: track.artist.id,
      cover: track.album?.cover_medium,
    });
    if (results.length >= 8) break;
  }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), results });
  return results;
}
