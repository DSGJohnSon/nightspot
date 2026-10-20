/**
 * Complète data/clips.json en lot (l'admin fait la même chose clip par clip) :
 *  - IDs Deezer (artiste + invités) et pochette, pour valider les réponses ;
 *  - vues YouTube (difficulté), moment fort via la courbe « Most replayed » ;
 *  - capture HD à cet instant dans data/media/<youtubeId>.jpg (yt-dlp + ffmpeg).
 *
 * Usage : pnpm clips:enrich           → ne traite que ce qui manque
 *         pnpm clips:enrich --force   → recalcule tout
 */
import { normalizeName, normalizeTitle } from '@nightspot/shared';
import { framePath, getClips, hasFrame, saveClips } from '../src/modules/guess-the-clip/catalog';
import { findDeezerMatches } from '../src/modules/guess-the-clip/lookup';
import { extractFrame, highlightTimes, probeVideo } from '../src/modules/guess-the-clip/media';

const force = process.argv.includes('--force');

async function main() {
  const clips = getClips();
  let failures = 0;

  for (const [i, clip] of clips.entries()) {
    const label = `[${i + 1}/${clips.length}] ${clip.artist} – ${clip.title}`;
    try {
      const steps: string[] = [];
      if (force || !clip.artistIds?.length) {
        const matches = await findDeezerMatches(`${clip.artist} ${clip.title.replace(/^\.+/, '')}`);
        const sameArtist = matches.filter((m) => normalizeName(m.artist) === normalizeName(clip.artist));
        const match = sameArtist.find((m) => normalizeTitle(m.title) === normalizeTitle(clip.title)) ?? sameArtist[0];
        if (!match) throw new Error('aucun résultat Deezer');
        clip.deezerTrackId = match.trackId;
        clip.artistIds = match.artistIds;
        if (match.cover) clip.cover = match.cover;
        steps.push(`deezer ${clip.artistIds.join(',')}`);
      }
      if (force || clip.revealAt == null || clip.views == null || !hasFrame(clip)) {
        const probe = await probeVideo(clip.youtubeId);
        if (probe.views != null) Object.assign(clip, { views: probe.views, viewsCheckedAt: Date.now() });
        if (force || clip.revealAt == null) clip.frameAt = clip.revealAt = highlightTimes(probe, 1)[0].at;
        if (!probe.streamUrl) steps.push('téléchargement bloqué par YouTube : capture à coller dans l’admin');
        else if (force || !hasFrame(clip)) await extractFrame(probe.streamUrl, clip.frameAt ?? clip.revealAt!, framePath(clip));
        steps.push(`${probe.views?.toLocaleString('fr-FR')} vues, capture @${clip.frameAt}s`);
      }
      saveClips(clips); // sauvegarde au fil de l'eau : un échec n'efface pas le reste
      console.log(`✓ ${label}${steps.length ? ' — ' + steps.join(', ') : ' (déjà complet)'}`);
    } catch (err) {
      failures++;
      console.error(`✗ ${label} — ${(err as Error).message.split('\n')[0]}`);
    }
  }

  console.log(failures ? `\n${failures} clip(s) en échec.` : '\nCatalogue complet.');
  process.exitCode = failures ? 1 : 0;
}

main();
