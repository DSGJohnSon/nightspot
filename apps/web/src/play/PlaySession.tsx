import {
  type PlayerPublic,
  type RoundPublic,
  type SearchResult,
  type SessionView,
  type TrackChoice,
  YEAR_BONUS,
} from '@nightspot/shared';
import { motion } from 'motion/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import {
  Button,
  cx,
  DifficultyPill,
  Icon,
  Label,
  Logo,
  ordinal,
  PartBadge,
  PlayerDot,
  TimerBar,
  yearBonusLabel,
} from '../components/ui';
import { useNow, useSessionView, useWakeLock } from '../lib/session';
import { socket } from '../lib/socket';
import { NAME_KEY, playerTokenKey, store } from '../lib/storage';
import { TrackSearch } from './TrackSearch';

export function PlaySession() {
  const { code = '' } = useParams();
  const token = store.get(playerTokenKey(code));
  const name = store.get(NAME_KEY) ?? '';
  const [error, setError] = useState<string | null>(null);

  const { view, offset, connected } = useSessionView(() => {
    if (!token) return;
    socket.emit('player:join', { code, name, token }, (res) => setError(res.ok ? null : res.error));
  });
  useWakeLock();

  if (!token) return <Navigate to={`/join?code=${code}`} replace />;

  if (error) {
    return (
      <Shell>
        <Centered>
          <div className="text-2xl font-bold">{error}</div>
          <Link to="/join" className="mt-6 text-accent underline underline-offset-4">
            Rejoindre une autre partie
          </Link>
        </Centered>
      </Shell>
    );
  }

  const me = view?.players.find((p) => p.id === view.me?.id);
  if (!view || !me) {
    return (
      <Shell>
        <Centered>
          <div className="animate-pulse text-muted">Connexion à la partie…</div>
        </Centered>
      </Shell>
    );
  }

  return (
    <Shell me={me} offline={!connected}>
      <Screen view={view} me={me} offset={offset} />
    </Shell>
  );
}

function Screen({ view, me, offset }: { view: SessionView; me: PlayerPublic; offset: number }) {
  const round = view.round;

  if (view.phase === 'lobby') {
    return (
      <Centered>
        <PlayerDot color={me.color} size={56} />
        <div className="mt-6 text-3xl font-extrabold">{me.name}</div>
        <p className="mt-3 max-w-xs text-muted">Tu es dans la partie ! Garde les yeux sur la TV, ça va commencer.</p>
        <Label className="mt-10">{view.players.length} joueur{view.players.length > 1 ? 's' : ''} connecté{view.players.length > 1 ? 's' : ''}</Label>
      </Centered>
    );
  }

  if (!round) return null;

  if (view.phase === 'prepare') {
    return (
      <Centered>
        <Label>
          Manche {round.index + 1} / {round.total}
        </Label>
        <div className="mt-3 animate-pulse text-5xl font-black italic">Prépare-toi…</div>
        <p className="mt-3 text-muted">Regarde la TV !</p>
      </Centered>
    );
  }

  if (view.phase === 'question') {
    if (view.me?.answer) return <Locked answer={view.me.answer} elapsedMs={view.me.elapsedMs} />;
    return <Answering key={round.index} round={round} offset={offset} />;
  }

  if (view.phase === 'podium') {
    const rank = rankOf(view, me);
    return (
      <Centered>
        <Label>Partie terminée</Label>
        <div className={cx('mt-4 text-8xl font-black italic', rank === 1 ? 'text-accent' : 'text-ink')}>{ordinal(rank)}</div>
        <div className="mt-2 text-muted">sur {view.players.length} joueurs</div>
        <div className="mt-6 font-mono text-3xl font-bold">{me.score} pts</div>
        <Link to="/join" className="mt-12 text-accent underline underline-offset-4">
          Rejoindre une autre partie
        </Link>
      </Centered>
    );
  }

  // reveal & scores
  return <RoundResultScreen view={view} round={round} me={me} offset={offset} />;
}

function Answering({ round, offset }: { round: RoundPublic; offset: number }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (choice: SearchResult) => {
    setSending(true);
    setError(null);
    socket.emit('player:answer', choice, (res) => {
      setSending(false);
      if (!res.ok) setError(res.error);
      else navigator.vibrate?.(40);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
      <div className="flex items-center gap-3">
        <Label>
          Manche {round.index + 1}/{round.total}
        </Label>
        <DifficultyPill level={round.difficulty} className="px-2 py-0.5 text-[10px]" />
        {round.startedAt && round.endsAt && (
          <>
            <TimerBar startedAt={round.startedAt} endsAt={round.endsAt} offset={offset} shifting className="h-2 flex-1" />
            <Countdown endsAt={round.endsAt} offset={offset} />
          </>
        )}
      </div>
      <TrackSearch mode={round.searchMode} sending={sending} error={error} onSubmit={submit} />
    </div>
  );
}

function Countdown({ endsAt, offset }: { endsAt: number; offset: number }) {
  const now = useNow(offset, 250);
  return <span className="w-10 text-right font-mono text-sm font-bold">{Math.max(0, Math.ceil((endsAt - now) / 1000))}s</span>;
}

function Locked({ answer, elapsedMs }: { answer: TrackChoice; elapsedMs: number | null }) {
  return (
    <Centered>
      <Label>Réponse verrouillée</Label>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-5 w-full">
        <ChoiceCard choice={answer} />
      </motion.div>
      {elapsedMs != null && (
        <div className="mt-4 font-mono text-accent">en {(elapsedMs / 1000).toFixed(1).replace('.', ',')} s</div>
      )}
      <p className="mt-10 animate-pulse text-muted">Réponse à l'écran dans un instant…</p>
    </Centered>
  );
}

function RoundResultScreen({
  view,
  round,
  me,
  offset,
}: {
  view: SessionView;
  round: RoundPublic;
  me: PlayerPublic;
  offset: number;
}) {
  const result = round.results?.find((r) => r.playerId === me.id);
  const scores = view.phase === 'scores';

  return (
    <Centered>
      <Label>
        Manche {round.index + 1} / {round.total}
      </Label>
      {result?.answer ? (
        <>
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className={cx('mt-3 font-mono text-6xl font-bold', result.points ? 'text-accent' : 'text-faint')}
          >
            {result.points ? `+${result.points}` : '0'}
          </motion.div>
          <div className="mt-3 flex gap-2">
            <PartBadge ok={result.parts.title}>Titre</PartBadge>
            <PartBadge ok={result.parts.artist}>Artiste</PartBadge>
          </div>
        </>
      ) : (
        <div className="mt-3 text-3xl font-bold text-muted">Pas de réponse cette fois</div>
      )}

      {/* Le bonus année est la seule action possible pendant le reveal : il passe en premier. */}
      {!scores && round.yearBonus && (
        <YearBonus round={round} offset={offset} guess={view.me?.yearGuess ?? null} points={result?.yearPoints ?? 0} />
      )}
      {scores && result?.yearGuess != null && <YearResult guess={result.yearGuess} points={result.yearPoints} />}

      {round.solution && (
        <div className="mt-5 w-full rounded-2xl border border-accent/30 bg-accent/5 p-4 text-left">
          <Label>La réponse</Label>
          <div className="mt-2 text-xl font-bold">{round.solution.title}</div>
          <div className="text-muted">
            {round.solution.artist}
            {round.solution.year && <span className="font-mono"> · {round.solution.year}</span>}
          </div>
        </div>
      )}
      {scores && result?.answer && (
        <div className="mt-3 w-full opacity-70">
          <ChoiceCard choice={result.answer} />
        </div>
      )}

      {scores && (
        <div className="mt-6 text-lg">
          Tu es <b>{ordinal(rankOf(view, me))}</b> sur {view.players.length} ·{' '}
          <span className="font-mono font-bold">{me.score}</span> pts
        </div>
      )}
    </Centered>
  );
}

/** Bonus année : ouvert à tous pendant le reveal, une seule tentative, verdict immédiat. */
function YearBonus({
  round,
  offset,
  guess,
  points,
}: {
  round: RoundPublic;
  offset: number;
  guess: number | null;
  points: number;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (guess != null) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cx(
          'mt-5 w-full rounded-2xl border p-4',
          points ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface/80',
        )}
      >
        <Label>Bonus année · {guess}</Label>
        {points ? (
          <div className="mt-1 font-mono text-4xl font-bold text-accent">+{points}</div>
        ) : (
          <div className="mt-1 text-3xl font-bold text-muted">Raté…</div>
        )}
        <div className="mt-1 text-sm text-muted">
          {points ? `${yearBonusLabel(points)} — c’est sur la TV !` : 'La bonne année s’affiche au classement.'}
        </div>
      </motion.div>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.length !== 4) return setError('4 chiffres, par exemple 1998.');
    setSending(true);
    setError(null);
    socket.emit('player:year', Number(value), (res) => {
      setSending(false);
      if (!res.ok) setError(res.error);
      else navigator.vibrate?.(res.points ? [40, 60, 40] : 30);
    });
  };

  return (
    <form onSubmit={submit} className="mt-5 w-full rounded-2xl border border-medium/40 bg-medium/10 p-4 text-left">
      <Label className="text-medium">Bonus : l’année ?</Label>
      <div className="mt-1 text-xs text-muted">
        pile <b className="text-ink">+{YEAR_BONUS[0]}</b> · à 1 an <b className="text-ink">+{YEAR_BONUS[1]}</b> · à 2 ans{' '}
        <b className="text-ink">+{YEAR_BONUS[2]}</b>
      </div>
      {round.revealEndsAt && (
        <TimerBar
          startedAt={round.revealEndsAt - round.revealSec * 1000}
          endsAt={round.revealEndsAt}
          offset={offset}
          shifting
          className="mt-3 h-1.5"
        />
      )}
      <div className="mt-3 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          placeholder="AAAA"
          aria-label="Année de sortie"
          className="h-14 min-w-0 flex-1 rounded-xl border border-line bg-surface text-center font-mono text-3xl font-bold tracking-[0.3em] outline-none placeholder:text-faint focus:border-medium/60"
        />
        <Button type="submit" disabled={value.length !== 4 || sending} className="h-14 px-5">
          Valider
        </Button>
      </div>
      {error && <div className="mt-2 text-sm text-expert">{error}</div>}
    </form>
  );
}

function YearResult({ guess, points }: { guess: number; points: number }) {
  return (
    <div
      className={cx(
        'mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-semibold',
        points ? 'bg-medium/15 text-medium' : 'bg-surface-2 text-muted',
      )}
    >
      <Icon name="calendar" className="size-4" />
      Année {guess} · {points ? `+${points}` : 'raté'}
    </div>
  );
}

function ChoiceCard({ choice }: { choice: TrackChoice }) {
  return (
    <div className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-3 text-left">
      {choice.cover ? (
        <img src={choice.cover} alt="" className="size-14 shrink-0 rounded-lg" />
      ) : (
        <div className="size-14 shrink-0 rounded-lg bg-surface-2" />
      )}
      <div className="min-w-0">
        <div className="truncate font-bold">{choice.title}</div>
        <div className="truncate text-sm text-muted">{choice.artist}</div>
      </div>
    </div>
  );
}

/** Rang avec ex æquo : 1 + nombre de joueurs strictement devant. */
function rankOf(view: SessionView, me: PlayerPublic): number {
  return 1 + view.players.filter((p) => p.score > me.score).length;
}

function Shell({ me, offline, children }: { me?: PlayerPublic; offline?: boolean; children: ReactNode }) {
  return (
    <div className="stage flex h-dvh flex-col">
      {offline && (
        <div className="bg-medium px-4 py-1.5 text-center text-sm font-semibold text-accent-ink">
          Connexion perdue, reconnexion…
        </div>
      )}
      <header className="flex items-center justify-between px-4 py-3">
        <Logo className="text-2xl" />
        {me && (
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1.5 pl-3 pr-4">
            <PlayerDot color={me.color} size={10} />
            <span className="max-w-36 truncate text-sm font-semibold">{me.name}</span>
            <span className="font-mono text-sm font-bold text-accent">{me.score}</span>
          </div>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
      {children}
    </div>
  );
}
