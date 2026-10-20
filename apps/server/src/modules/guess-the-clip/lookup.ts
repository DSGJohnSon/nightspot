import { type DeezerMatch, normalizeName, normalizeTitle } from '@nightspot/shared';
import { deezerApi, type DeezerTrack } from '../../search/deezer';
import { watchUrl } from './media';

/** Accepte les liens watch, youtu.be, shorts, embed… ou un ID nu. */
export function parseYoutubeId(input: string): string | null {
  const text = input.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(/^https?:\/\//.test(text) ? text : `https://${text}`);
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.slice(1, 12);
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ?? null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export type Entry =
  | { kind: 'video'; youtubeId: string }
  | { kind: 'search'; query: string; artist: string | null; title: string; yearHint: number | null };

/**
 * Une ligne collée dans l'admin : lien YouTube, ou « Artiste – Titre » (puces, numérotation,
 * « (1985) » et « [Thèmes] » des listes générées sont ignorés).
 */
export function parseEntry(raw: string): Entry | null {
  const text = raw.trim().replace(/^(?:\d+\s*[.)]|[-*•])\s+/, '');
  if (/^(https?:\/\/|www\.|m\.youtube|youtu\.be|youtube\.com)/i.test(text) || /^[\w-]{11}$/.test(text)) {
    const youtubeId = parseYoutubeId(text);
    return youtubeId ? { kind: 'video', youtubeId } : null;
  }
  const yearHint = Number(text.match(/\((\d{4})\)/)?.[1]) || null;
  const query = text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\d{4}\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (query.length < 2) return null;
  const [left, ...rest] = query.split(/\s[-–—|]\s/);
  return rest.length
    ? { kind: 'search', query, artist: left.trim(), title: rest.join(' - ').trim(), yearHint }
    : { kind: 'search', query, artist: null, title: query, yearHint };
}

const UNWANTED = /\b(lyrics?|paroles|cover|live|karaok[eé]|audio|remix|r[eé]action|sped ?up|slowed|8d|instrumental|nightcore|tuto(rial)?|parod(y|ie))\b/gi;
const OFFICIAL = /\b(official|officiel|officielle|clip)\b/i;

/**
 * Classe les résultats YouTube d'une recherche « Artiste – Titre » : on veut le clip officiel de
 * cette chanson, pas une autre chanson de l'artiste, une vidéo de paroles, une reprise ou une piste
 * « - Topic » (image fixe).
 */
export function rankVideos<T extends { title: string; channel: string; views: number | null; duration: number | null }>(
  videos: T[],
  entry: { query: string; artist: string | null; title: string },
): T[] {
  // Un mot « indésirable » présent dans la recherche elle-même (« Live While We're Young ») ne pénalise pas.
  const wanted = new Set((entry.query.match(UNWANTED) ?? []).map((w) => w.toLowerCase()));
  const songTitle = normalizeTitle(entry.title);
  // « Bigflo & Oli » doit reconnaître la chaîne « Bigflo et Oli ».
  const artistForms = entry.artist
    ? [normalizeName(entry.artist), normalizeName(entry.artist).replace(/\band\b/g, 'et')]
    : [];

  const score = (v: T) => {
    const title = normalizeName(v.title);
    const channel = normalizeName(v.channel);
    const unwanted = (v.title.match(UNWANTED) ?? []).some((w) => !wanted.has(w.toLowerCase()));
    const byArtist = artistForms.some((a) => channel.includes(a) || channel.replace(/ /g, '').includes(a.replace(/ /g, '')));
    return (
      (songTitle && title.includes(songTitle) ? 5 : -5) +
      (OFFICIAL.test(v.title) ? 3 : 0) +
      // VEVO = clip officiel publié par le label ; à égalité, il passe devant la chaîne de l'artiste.
      (/vevo$/i.test(v.channel) ? 4 : 0) +
      (byArtist ? 3 : 0) -
      (unwanted ? 4 : 0) -
      (/- topic$/i.test(v.channel) ? 6 : 0) -
      (v.duration != null && v.duration < 60 ? 3 : 0) + // Shorts
      Math.log10((v.views ?? 0) + 1) / 3
    );
  };
  return [...videos].sort((a, b) => score(b) - score(a));
}

export async function fetchOembed(youtubeId: string): Promise<{ title: string; author: string }> {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(youtubeId))}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("Cette vidéo interdit l'intégration : elle ne pourrait pas être jouée au reveal.");
  }
  if (!res.ok) throw new Error('Vidéo introuvable ou privée.');
  const json = (await res.json()) as { title: string; author_name: string };
  return { title: json.title, author: json.author_name };
}

/** « Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster) » → requête Deezer. */
export function searchQueryFromVideo(videoTitle: string, channel: string): string {
  const cleaned = videoTitle
    .replace(/[([{【][^)\]}】]*[)\]}】]/g, ' ')
    .replace(/\b(official\s+(music\s+)?video|clip\s+officiel|music\s+video|lyrics?\s+video|m\/v|mv|hd|4k)\b/gi, ' ');
  const hasArtist = /\s[-–—|]\s/.test(cleaned);
  const artist = channel.replace(/vevo$/i, '').replace(/\s*-\s*topic$/i, '').replace(/\bofficial\b/i, '');
  return `${hasArtist ? '' : artist} ${cleaned}`.replace(/[-–—|]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Si Deezer ne trouve rien : « Artiste - Titre (Official Video) » découpé à la main. */
export function guessFromVideoTitle(videoTitle: string, channel: string): { artist: string; title: string } {
  const cleaned = videoTitle.replace(/[([{【][^)\]}】]*[)\]}】]/g, ' ').replace(/\s+/g, ' ').trim();
  const [left, ...rest] = cleaned.split(/\s[-–—|]\s/);
  if (rest.length) return { artist: left.trim(), title: rest.join(' - ').trim() };
  return { artist: channel.replace(/vevo$/i, '').trim(), title: cleaned };
}

const stripFeat = (title: string) => title.replace(/\s*[([](feat|ft)\.?\s[^)\]]*[)\]]/i, '').trim();

/**
 * Morceaux Deezer correspondant à la vidéo, du plus pertinent au moins pertinent.
 * L'année retenue est la plus ancienne parmi les versions du même titre (album d'origine plutôt que best-of).
 */
export async function findDeezerMatches(query: string, max = 5): Promise<DeezerMatch[]> {
  const { data = [] } = await deezerApi<{ data?: DeezerTrack[] }>(`/search/track?limit=25&q=${encodeURIComponent(query)}`);

  const groups = new Map<string, DeezerTrack[]>();
  for (const track of data) {
    const key = `${normalizeTitle(track.title_short || track.title)}|${track.artist.id}`;
    groups.set(key, [...(groups.get(key) ?? []), track]);
  }

  return Promise.all(
    [...groups.values()].slice(0, max).map(async (versions) => {
      const details = await Promise.all(versions.slice(0, 3).map((v) => deezerApi<DeezerTrack>(`/track/${v.id}`)));
      const main = details[0];
      const contributors = main.contributors ?? [];
      const years = details.map((d) => parseInt(d.release_date ?? '', 10)).filter((y) => y > 1900);
      return {
        trackId: main.id,
        title: stripFeat(main.title_short || main.title),
        artist: main.artist.name,
        artistIds: [...new Set([main.artist.id, ...contributors.map((c) => c.id)])],
        featuring: contributors.filter((c) => c.id !== main.artist.id).map((c) => c.name),
        cover: main.album?.cover_medium ?? null,
        year: years.length ? Math.min(...years) : null,
      };
    }),
  );
}
