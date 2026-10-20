/**
 * Test de bout en bout contre un serveur lancé : une TV et deux téléphones jouent une partie de 2 manches.
 * « Alice » répond juste (via la vraie recherche Deezer), « Bob » choisit un autre titre du même artiste.
 *
 * Usage : pnpm --filter @nightspot/server smoke   (serveur sur http://127.0.0.1:3001)
 */
import {
  type ClientToServerEvents,
  difficultyInfo,
  type SearchResult,
  type ServerToClientEvents,
  type SessionView,
} from '@nightspot/shared';
import { readFileSync } from 'node:fs';
import { HISTORY_FILE } from '../src/engine/history';
import { io, type Socket } from 'socket.io-client';
import { guessTheClip } from '../src/modules/guess-the-clip';
import { getClips } from '../src/modules/guess-the-clip/catalog';

const BASE = process.env.SMOKE_URL ?? 'http://127.0.0.1:3001';
const startedAt = Date.now();
const played: string[] = [];
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const clips = getClips();
const connect = () => io(BASE, { transports: ['websocket'], forceNew: true }) as Client;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ÉCHEC : ${message}`);
  console.log(`  ✓ ${message}`);
}

/** Attend le prochain état qui satisfait `predicate`. */
function waitFor(socket: Client, predicate: (v: SessionView) => boolean, timeoutMs = 15000): Promise<SessionView> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout en attendant un état')), timeoutMs);
    const handler = (view: SessionView) => {
      if (!predicate(view)) return;
      clearTimeout(timer);
      socket.off('state', handler);
      resolve(view);
    };
    socket.on('state', handler);
  });
}

async function search(q: string): Promise<SearchResult[]> {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}`);
  return ((await res.json()) as { results: SearchResult[] }).results;
}

async function main() {
  const tv = connect();
  const alice = connect();
  const bob = connect();
  const tvState: { last: SessionView | null } = { last: null };
  tv.on('state', (v) => (tvState.last = v));

  console.log('Création de la partie');
  const created = await tv.emitWithAck('host:create', {
    blocks: [{ moduleId: 'guess-the-clip', rounds: 2, timerSec: 10, revealSec: 5, searchMode: 'deezer', themes: [], decades: [], difficulties: [] }],
  });
  check(created.ok, 'la TV crée une partie');
  const code = created.code;

  const lobby = waitFor(tv, (v) => v.players.length === 2);
  const a = await alice.emitWithAck('player:join', { code, name: 'Alice' });
  const b = await bob.emitWithAck('player:join', { code, name: 'Bob' });
  check(a.ok && b.ok, 'deux joueurs rejoignent avec le code');
  await lobby;
  const intruder = connect();
  const duplicate = await intruder.emitWithAck('player:join', { code, name: 'alice' });
  check(!duplicate.ok, 'pseudo déjà pris refusé');
  intruder.close();

  const rejoin = await alice.emitWithAck('player:join', { code, name: 'peu importe', token: a.ok ? a.token : '' });
  check(rejoin.ok && a.ok && rejoin.playerId === a.playerId, 'reconnexion avec le jeton : même joueur');

  tv.emit('host:start');

  for (let round = 0; round < 2; round++) {
    console.log(`Manche ${round + 1}`);
    const prepare = await waitFor(tv, (v) => v.phase === 'prepare' && v.round?.index === round);
    const clip = clips.find((c) => c.youtubeId === prepare.round?.media?.youtubeId);
    check(clip, `la TV reçoit la vidéo à précharger (${clip?.artist} – ${clip?.title})`);

    const image = await fetch(`${BASE}${prepare.round?.imageUrl}`);
    check(image.ok && image.headers.get('content-type') === 'image/jpeg', 'la capture est servie à la TV');
    const future = await fetch(`${BASE}/media/${code}/${round + 1}`);
    check(future.status === 404, 'impossible de récupérer la capture de la manche suivante');

    const playerView = await new Promise<SessionView>((resolve) => {
      alice.once('state', resolve);
      tv.emit('host:ready');
    });
    check(playerView.phase === 'question', 'la question démarre quand la TV est prête');
    check(!playerView.round?.media && !playerView.round?.imageUrl && !playerView.round?.solution, 'le téléphone ne reçoit aucun indice');
    played.push(clip.id);
    if (round === 0) {
      const early = await alice.emitWithAck('player:year', clip.year ?? 2000);
      check(!early.ok, 'pas de bonus année pendant la question');
    }

    const good = (await search(`${clip.artist} ${clip.title}`)).find((r) => clip.artistIds?.includes(r.artistId ?? -1));
    check(good, `la recherche Deezer trouve « ${good?.title} – ${good?.artist} »`);
    const other = (await search(clip.artist)).find(
      (r) => clip.artistIds?.includes(r.artistId ?? -1) && r.title.toLowerCase() !== clip.title.toLowerCase(),
    );

    // Dernière manche : le téléphone de Bob se met en veille.
    const bobAsleep = round === 1;
    if (bobAsleep) {
      const seenOffline = waitFor(tv, (v) => v.players.some((p) => p.name === 'Bob' && !p.connected));
      bob.disconnect();
      await seenOffline;
      check(true, 'la TV voit Bob hors ligne');
    }

    const reveal = waitFor(tv, (v) => v.phase === 'reveal');
    await sleep(1200);
    const aliceAnswer = await alice.emitWithAck('player:answer', good);
    check(aliceAnswer.ok, `Alice valide en ${aliceAnswer.ok ? aliceAnswer.elapsedMs : '?'} ms`);
    const twice = await alice.emitWithAck('player:answer', good);
    check(!twice.ok, 'une réponse validée est définitive');

    if (!bobAsleep) {
      await sleep(800);
      await bob.emitWithAck('player:answer', other ?? { trackId: 'x', title: 'Mauvaise réponse', artist: 'Personne' });
    }
    const revealed = await reveal;
    if (bobAsleep) {
      check(revealed.serverNow < (revealed.round?.endsAt ?? 0), 'reveal anticipé : la manche n’attend pas le joueur hors ligne');
    }

    const results = new Map(revealed.round?.results?.map((r) => [r.playerId, r]));
    const ra = results.get(a.ok ? a.playerId : '');
    const rb = results.get(b.ok ? b.playerId : '');
    check(ra?.parts.title && ra.parts.artist, 'Alice : titre ✓ artiste ✓');
    const maxPoints = revealed.round!.maxPoints;
    const level = difficultyInfo(revealed.round!.difficulty);
    check(maxPoints === Math.round(1000 * level.multiplier), `difficulté ${level.name} : ${maxPoints} pts en jeu (×${level.multiplier})`);
    check(ra && ra.points > maxPoints / 2 && ra.points < maxPoints, `Alice marque ${ra?.points} pts (vitesse et difficulté appliquées)`);
    if (other && !bobAsleep) {
      check(rb && !rb.parts.title && rb.parts.artist, `Bob (« ${other.title} ») : titre ✗ artiste ✓ → ${rb?.points} pts`);
    }
    check(revealed.round?.solution?.title === clip.title, 'la solution est révélée');

    // Bonus année : Alice tombe pile (manche 1) ou loin (manche 2), Bob à un an près.
    check(revealed.round?.yearBonus && revealed.round.solution?.year === undefined, 'bonus année ouvert, année encore cachée');
    const aliceYear = round === 0 ? clip.year! : clip.year! - 3;
    const scoreBefore = revealed.players.find((p) => p.name === 'Alice')!.score;
    const live = waitFor(tv, (v) => v.players.find((p) => p.name === 'Alice')?.yearGuessed === true);
    const aliceBonus = await alice.emitWithAck('player:year', aliceYear);
    check(aliceBonus.ok && aliceBonus.points === (round === 0 ? 100 : 0), `Alice tente ${aliceYear} → +${aliceBonus.ok ? aliceBonus.points : '?'} tout de suite`);
    const liveView = await live;
    const liveAlice = liveView.round?.results?.find((r) => r.playerId === (a.ok ? a.playerId : ''));
    check(liveView.players.find((p) => p.name === 'Alice')!.score === scoreBefore + (round === 0 ? 100 : 0), 'les points de l’année sont crédités en direct');
    check(liveAlice?.yearGuess === null && liveView.round?.solution?.year === undefined, 'pendant le reveal, ni l’année ni la tentative ne fuitent');
    check(
      (liveView.round?.yearWins.some((w) => w.playerId === (a.ok ? a.playerId : '')) ?? false) === (round === 0),
      round === 0 ? 'la TV reçoit le gain d’Alice pour l’animation' : 'pas d’animation pour un raté',
    );
    check(!(await alice.emitWithAck('player:year', clip.year!)).ok, 'une seule tentative pour l’année');
    if (!bobAsleep) check((await bob.emitWithAck('player:year', clip.year! + 1)).ok, `Bob tente ${clip.year! + 1}`);

    const scores = await waitFor(tv, (v) => v.phase === 'scores', 8000);
    check(scores.round?.solution?.year === clip.year, `l’année ${clip.year} est révélée au classement`);
    const final = new Map(scores.round?.results?.map((r) => [r.playerId, r]));
    const ya = final.get(a.ok ? a.playerId : '')!;
    check(ya.yearPoints === (round === 0 ? 100 : 0), `Alice : année ${ya.yearGuess} → +${ya.yearPoints}`);
    const aliceAfter = scores.players.find((p) => p.name === 'Alice')!.score;
    check(aliceAfter === scoreBefore + ya.yearPoints, 'le bonus année s’ajoute au score');
    if (!bobAsleep) {
      const yb = final.get(b.ok ? b.playerId : '')!;
      check(yb.yearPoints === 50, `Bob : année ${yb.yearGuess} → +${yb.yearPoints}`);
    }
    check(scores.round?.media, 'au classement, la TV garde la vidéo (le clip continue)');
    await sleep(1500);
    check(tvState.last?.phase === 'scores', 'le classement attend l’hôte (pas de passage automatique)');
    tv.emit('host:next');
  }

  const podium = await waitFor(tv, (v) => v.phase === 'podium');
  const ranking = [...podium.players].sort((x, y) => y.score - x.score).map((p) => `${p.name} ${p.score}`);
  check(podium.players[0], `podium : ${ranking.join(' · ')}`);

  console.log('Historique');
  const history = JSON.parse(readFileSync(HISTORY_FILE, 'utf8')) as Record<string, Record<string, number>>;
  const lastPlayed = (id: string) => history['guess-the-clip']?.[id] ?? 0;
  check(played.every((id) => lastPlayed(id) >= startedAt), 'les clips joués sont enregistrés dans l’historique');
  const next = guessTheClip.draw(clips.length - played.length, lastPlayed, { themes: [], decades: [], difficulties: [] });
  check(!next.some((c) => played.includes(c.id)), `la partie suivante (${next.length} manches) évite les clips qu’on vient de jouer`);

  tv.close();
  alice.close();
  bob.close();
  console.log('\nPartie complète jouée avec succès.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
