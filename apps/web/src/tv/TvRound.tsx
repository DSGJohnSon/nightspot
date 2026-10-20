import { type PlayerPublic, speedFactor, type RoundPublic, type SessionView, YEAR_BONUS } from '@nightspot/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  cx,
  DifficultyPill,
  Icon,
  Label,
  Logo,
  OfflineTag,
  PartBadge,
  PlayerDot,
  TimerBar,
  yearBonusLabel,
} from '../components/ui';
import { useNow } from '../lib/session';
import { socket } from '../lib/socket';
import { TvStandings } from './TvStandings';
import { YouTubeReveal } from './YouTubeReveal';

/**
 * Une manche côté TV : intro → capture + chrono → reveal (le clip prend vie, réponses de chacun)
 * → classement, pendant que le clip continue jusqu'à ce que l'hôte passe à la suite.
 */
export function TvRound({ view, offset, onNext }: { view: SessionView; offset: number; onNext: () => void }) {
  const round = view.round!;
  const phase = view.phase;
  const [imageReady, setImageReady] = useState(false);
  const readySent = useRef(false);

  // Précharge la capture pendant l'intro « Manche N », puis donne le top départ au serveur.
  useEffect(() => {
    if (!round.imageUrl) return;
    let cancelled = false;
    const img = new Image();
    img.src = round.imageUrl;
    const intro = new Promise((r) => setTimeout(r, phase === 'prepare' ? 1800 : 0));
    Promise.all([img.decode().catch(() => {}), intro]).then(() => {
      if (cancelled) return;
      setImageReady(true);
      if (phase === 'prepare' && !readySent.current) {
        readySent.current = true;
        socket.emit('host:ready');
      }
    });
    return () => {
      cancelled = true;
    };
    // Seule la phase au montage compte : on ne rejoue pas l'intro.
  }, [round.imageUrl]);

  const revealed = phase === 'reveal' || phase === 'scores';

  let aside: ReactNode;
  if (phase === 'scores') aside = <TvStandings view={view} onNext={onNext} />;
  else if (phase === 'reveal') aside = <Answers view={view} />;
  else aside = <AnswerStatus view={view} onSkip={onNext} />;

  return (
    <div className="flex h-full flex-col px-16 py-12">
      <header className="flex h-16 items-center justify-between">
        <div className="flex items-baseline gap-4">
          <Label size="lg">Manche</Label>
          <span className="font-mono text-4xl font-bold">
            {round.index + 1}
            <span className="text-faint"> / {round.total}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-accent/12 px-6 py-2 text-sm font-bold uppercase tracking-[0.22em] text-accent">
            Guess the Clip
          </span>
          <DifficultyPill level={round.difficulty} className="px-5 py-2 text-sm" />
        </div>
        <Logo className="text-5xl" />
      </header>

      <div className="mt-8 grid min-h-0 flex-1 grid-cols-[1240px_1fr] gap-12">
        <section className="flex flex-col">
          <div className="glow-accent relative aspect-video w-full overflow-hidden rounded-[28px] bg-black">
            <AnimatePresence>
              {phase === 'prepare' && (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.08 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 flex flex-col items-center justify-center"
                >
                  <Label size="lg">
                    Manche {round.index + 1} / {round.total}
                  </Label>
                  <div className="mt-4 text-[110px] font-black italic leading-none">Devine le clip</div>
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 16 }}
                    className="mt-8"
                  >
                    <DifficultyPill level={round.difficulty} className="px-8 py-3 text-3xl" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            {phase !== 'prepare' && imageReady && (
              <motion.img
                src={round.imageUrl}
                alt=""
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="absolute inset-0 size-full object-contain"
              />
            )}
            {round.media && (
              <YouTubeReveal videoId={round.media.youtubeId} start={round.media.startSec} playing={revealed} />
            )}
            <YearWinToasts round={round} players={view.players} offset={offset} />
          </div>

          <div className="mt-8">
            {phase === 'question' && <QuestionFooter round={round} offset={offset} />}
            {revealed && <SolutionFooter round={round} offset={offset} counting={phase === 'reveal'} />}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-line bg-surface/70 p-8">
          {aside}
        </aside>
      </div>
    </div>
  );
}

function QuestionFooter({ round, offset }: { round: RoundPublic; offset: number }) {
  const now = useNow(offset);
  if (!round.startedAt || !round.endsAt) return null;
  const total = round.endsAt - round.startedAt;
  const elapsed = Math.min(Math.max(now - round.startedAt, 0), total);
  const points = Math.round(round.maxPoints * speedFactor(elapsed, total));

  return (
    <div>
      <TimerBar startedAt={round.startedAt} endsAt={round.endsAt} offset={offset} shifting className="h-4" />
      <div className="mt-5 flex items-end justify-between">
        <div>
          <Label size="lg">Temps restant</Label>
          <div className="mt-1 font-mono text-6xl font-bold tabular-nums">{((total - elapsed) / 1000).toFixed(1)}s</div>
        </div>
        <div className="text-right">
          <Label size="lg">Points en jeu</Label>
          <div className="mt-1 font-mono text-6xl font-bold tabular-nums text-accent">{points}</div>
        </div>
      </div>
    </div>
  );
}

/** Titre de la solution ; pendant le reveal, un compte à rebours annonce l'arrivée du classement. */
function SolutionFooter({ round, offset, counting }: { round: RoundPublic; offset: number; counting: boolean }) {
  const solution = round.solution;
  if (!solution) return null;
  const countdown = counting && round.revealEndsAt;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex items-center gap-8">
        {solution.cover && <img src={solution.cover} alt="" className="size-28 rounded-2xl ring-1 ring-line" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-6xl font-extrabold leading-tight">{solution.title}</div>
          <div className="mt-1 flex items-center gap-4 text-3xl text-muted">
            <span className="truncate">{solution.artist}</span>
            {solution.year ? (
              <motion.span
                initial={{ scale: 1.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                className="shrink-0 rounded-full bg-accent px-4 py-1 font-mono text-xl font-bold text-accent-ink"
              >
                {solution.year}
              </motion.span>
            ) : (
              round.yearBonus &&
              counting && (
                <span className="flex shrink-0 items-center gap-2 rounded-full bg-medium/15 px-4 py-1 text-xl font-bold text-medium">
                  <Icon name="calendar" className="size-5" />
                  Bonus : devine l’année sur ton tél. !
                </span>
              )
            )}
          </div>
        </div>
        {countdown && <RevealCountdown endsAt={round.revealEndsAt!} offset={offset} />}
      </div>
      {countdown && (
        <TimerBar
          startedAt={round.revealEndsAt! - round.revealSec * 1000}
          endsAt={round.revealEndsAt!}
          offset={offset}
          className="mt-6 h-2"
        />
      )}
    </motion.div>
  );
}

function RevealCountdown({ endsAt, offset }: { endsAt: number; offset: number }) {
  const now = useNow(offset, 250);
  return (
    <div className="shrink-0 text-right">
      <Label size="lg">Classement dans</Label>
      <div className="mt-1 font-mono text-5xl font-bold tabular-nums">{Math.max(0, Math.ceil((endsAt - now) / 1000))}s</div>
    </div>
  );
}

function AnswerStatus({ view, onSkip }: { view: SessionView; onSkip: () => void }) {
  const answered = view.players.filter((p) => p.answered).length;
  const offline = view.players.filter((p) => !p.connected).length;
  const compact = view.players.length > 9;

  return (
    <>
      <div className="flex items-center justify-between">
        <Label size="lg">Réponses</Label>
        <span className="font-mono text-2xl font-bold">
          {answered}
          <span className="text-faint"> / {view.players.length}</span>
        </span>
      </div>
      <ul className={cx('mt-6 grid gap-3', compact && 'grid-cols-2')}>
        {view.players.map((p) => (
          <li
            key={p.id}
            className={cx(
              'flex items-center gap-4 rounded-2xl font-semibold transition-colors duration-300',
              compact ? 'px-4 py-2.5 text-lg' : 'px-5 py-4 text-2xl',
              p.answered ? 'bg-accent/12' : 'bg-surface-2/60',
            )}
          >
            <PlayerDot color={p.color} size={compact ? 10 : 14} offline={!p.connected} />
            <span className={cx('flex-1 truncate', !p.connected && 'text-muted')}>{p.name}</span>
            {p.answered ? (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-accent">
                <Icon name="check" className={compact ? 'size-5' : 'size-7'} />
              </motion.span>
            ) : !p.connected ? (
              <OfflineTag className={compact ? 'text-xs' : 'text-sm'} />
            ) : (
              <span className="animate-pulse text-faint">…</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-end justify-between gap-4 pt-4 text-base">
        <span className="text-muted">{offline > 0 && `${offline} hors ligne, pas attendu${offline > 1 ? 's' : ''}`}</span>
        <button type="button" onClick={onSkip} className="shrink-0 text-faint hover:text-muted">
          Révéler maintenant →
        </button>
      </div>
    </>
  );
}

/** Les réponses de chacun, mises en avant : c'est là qu'on rigole. */
function Answers({ view }: { view: SessionView }) {
  const players = new Map(view.players.map((p) => [p.id, p]));
  const results = view.round?.results ?? [];
  const density = results.length <= 5 ? 'full' : results.length <= 7 ? 'compact' : 'dense';

  return (
    <>
      <Label size="lg">Leurs réponses</Label>
      <ul className={cx('mt-5', density === 'full' ? 'space-y-3' : 'space-y-2')}>
        {results.map((r, i) => {
          const p = players.get(r.playerId);
          if (!p) return null;
          const points = (
            <span
              className={cx(
                'shrink-0 font-mono font-bold tabular-nums',
                density === 'full' ? 'text-2xl' : 'text-xl',
                r.points ? 'text-accent' : 'text-faint',
              )}
            >
              {r.points ? `+${r.points}` : '0'}
            </span>
          );
          return (
            <motion.li
              key={r.playerId}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + 0.18 * i, type: 'spring', stiffness: 260, damping: 24 }}
              className={cx('rounded-2xl bg-surface-2/60', density === 'full' ? 'p-4' : 'px-4 py-2.5')}
            >
              {density === 'dense' ? (
                <div className="flex items-center gap-3">
                  <PlayerDot color={p.color} size={10} offline={!p.connected} />
                  <span className="w-24 shrink-0 truncate text-base text-muted">{p.name}</span>
                  {p.yearGuessed && <Icon name="calendar" className="size-4 shrink-0 text-medium" />}
                  {r.answer ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-lg font-bold">{r.answer.title}</span>
                      <PartBadge ok={r.parts.title}>T</PartBadge>
                      <PartBadge ok={r.parts.artist}>A</PartBadge>
                    </>
                  ) : (
                    <span className="flex-1 italic text-faint">Pas de réponse…</span>
                  )}
                  {points}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <PlayerDot color={p.color} size={density === 'full' ? 12 : 10} offline={!p.connected} />
                    <span className={cx('flex-1 truncate font-semibold text-muted', density === 'full' ? 'text-lg' : 'text-base')}>
                      {p.name}
                    </span>
                    {!p.connected && <OfflineTag />}
                    {p.yearGuessed && <YearChip points={r.yearPoints} />}
                    {points}
                  </div>
                  {r.answer ? (
                    <div className={cx('flex items-center gap-4', density === 'full' ? 'mt-3' : 'mt-2')}>
                      {r.answer.cover && (
                        <img
                          src={r.answer.cover}
                          alt=""
                          className={cx('shrink-0 rounded-xl', density === 'full' ? 'size-16' : 'size-11')}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <AnswerPart ok={r.parts.title} className={density === 'full' ? 'text-[26px] font-bold leading-tight' : 'text-xl font-bold'}>
                          {r.answer.title}
                        </AnswerPart>
                        <AnswerPart ok={r.parts.artist} className={density === 'full' ? 'text-xl' : 'text-base'}>
                          {r.answer.artist}
                        </AnswerPart>
                      </div>
                    </div>
                  ) : (
                    <div className={cx('italic text-faint', density === 'full' ? 'mt-2 text-xl' : 'mt-1 text-base')}>
                      Pas de réponse…
                    </div>
                  )}
                </>
              )}
            </motion.li>
          );
        })}
      </ul>
    </>
  );
}

/** Le joueur a tenté le bonus année : on montre ce qu'il a gagné, jamais l'année tentée. */
function YearChip({ points }: { points: number }) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider',
        points ? 'bg-medium/15 text-medium' : 'bg-surface text-faint',
      )}
    >
      <Icon name="calendar" className="size-3.5" />
      {points ? `+${points}` : 'Année'}
    </motion.span>
  );
}

/**
 * Bonus année gagnés en direct : le nom du joueur et ses points s'affichent en grand sur le clip.
 * Seuls les gains sont annoncés, jamais les ratés ni l'année tentée.
 */
function YearWinToasts({ round, players, offset }: { round: RoundPublic; players: PlayerPublic[]; offset: number }) {
  const [toasts, setToasts] = useState<{ key: string; name: string; color: string; points: number }[]>([]);
  const seen = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const now = Date.now() + offset;
    for (const win of round.yearWins) {
      if (seen.current.has(win.playerId)) continue;
      seen.current.add(win.playerId);
      const player = players.find((p) => p.id === win.playerId);
      if (!player || now - win.at > 4000) continue; // gain déjà ancien (ex. TV rechargée)
      const key = `${win.playerId}-${win.at}`;
      setToasts((list) => [...list, { key, name: player.name, color: player.color, points: win.points }]);
      timers.current.push(setTimeout(() => setToasts((list) => list.filter((t) => t.key !== key)), 3200));
    }
  }, [round.yearWins, players, offset]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-5">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.key}
            layout
            initial={{ scale: 0.4, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 20 }}
            className="flex items-center gap-10 rounded-3xl bg-black/75 px-12 py-6 backdrop-blur-md"
            style={{ boxShadow: `0 0 0 3px ${toast.color}, 0 0 90px ${toast.color}88` }}
          >
            <div>
              <div className="flex items-center gap-2 text-xl font-bold uppercase tracking-[0.2em] text-medium">
                <Icon name="calendar" className="size-6" />
                {yearBonusLabel(toast.points)}
              </div>
              <div className="max-w-155 truncate text-7xl font-black italic leading-tight" style={{ color: toast.color }}>
                {toast.name}
              </div>
            </div>
            <div
              className={cx(
                'font-mono text-8xl font-bold',
                toast.points === YEAR_BONUS[0] ? 'text-accent' : 'text-medium',
              )}
            >
              +{toast.points}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Une partie de la réponse (titre ou artiste) : verte si juste, avec une croix rouge sinon. */
function AnswerPart({ ok, className, children }: { ok: boolean | undefined; className?: string; children: ReactNode }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <Icon name={ok ? 'check' : 'x'} className={cx('size-[0.8em] shrink-0', ok ? 'text-accent' : 'text-expert')} />
      <span className={cx('truncate', ok ? 'text-accent' : 'text-ink')}>{children}</span>
    </div>
  );
}
