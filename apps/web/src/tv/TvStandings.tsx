import { type SessionView, YEAR_BONUS } from '@nightspot/shared';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Button, CountUp, cx, Icon, Label, PlayerDot } from '../components/ui';

const VISIBLE_ROWS = 8;

/** Classement affiché à côté du clip, qui continue de jouer jusqu'à ce que l'hôte passe à la suite. */
export function TvStandings({ view, onNext }: { view: SessionView; onNext: () => void }) {
  const round = view.round;
  const results = new Map((round?.results ?? []).map((r) => [r.playerId, r]));
  const gained = new Map((round?.results ?? []).map((r) => [r.playerId, r.points + r.yearPoints]));
  const before = (id: string, score: number) => score - (gained.get(id) ?? 0);

  // On affiche d'abord l'ordre d'avant la manche, puis les lignes glissent à leur nouvelle place.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, []);

  const ranked = [...view.players].sort((a, b) =>
    settled ? b.score - a.score : before(b.id, b.score) - before(a.id, a.score),
  );
  const isLast = !!round && round.index + 1 >= round.total;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <Label size="lg">Classement</Label>
        {round && (
          <span className="font-mono text-lg text-faint">
            après {round.index + 1}/{round.total}
          </span>
        )}
      </div>

      <ol className="mt-5 space-y-2.5">
        {ranked.slice(0, VISIBLE_ROWS).map((p, i) => {
          const gain = gained.get(p.id) ?? 0;
          const yearGuess = results.get(p.id)?.yearGuess;
          const yearPoints = results.get(p.id)?.yearPoints ?? 0;
          return (
            <motion.li
              layout
              key={p.id}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className={cx(
                'flex h-15 items-center gap-4 rounded-2xl border px-5',
                i === 0 && settled ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface-2/60',
                !p.connected && 'opacity-50',
              )}
            >
              <span className="w-7 font-mono text-2xl font-bold text-muted">{i + 1}</span>
              <PlayerDot color={p.color} size={12} offline={!p.connected} />
              <span className="flex-1 truncate text-2xl font-semibold">{p.name}</span>
              {yearGuess != null && (
                <span
                  title={`Bonus année : +${yearPoints}`}
                  className={cx(
                    'shrink-0 rounded-md px-2 py-0.5 font-mono text-base font-bold',
                    yearPoints === YEAR_BONUS[0]
                      ? 'bg-accent text-accent-ink'
                      : yearPoints > 0
                        ? 'bg-medium/20 text-medium'
                        : 'bg-surface-2 text-faint line-through',
                  )}
                >
                  {yearGuess}
                </span>
              )}
              {gain > 0 && <span className="font-mono text-lg font-bold text-accent">+{gain}</span>}
              <CountUp
                from={before(p.id, p.score)}
                to={p.score}
                run={settled}
                className="w-24 text-right font-mono text-2xl font-bold tabular-nums"
              />
            </motion.li>
          );
        })}
      </ol>
      {ranked.length > VISIBLE_ROWS && (
        <div className="mt-3 text-lg text-muted">+ {ranked.length - VISIBLE_ROWS} autres joueurs</div>
      )}

      <div className="mt-auto pt-6">
        <Button onClick={onNext} className="h-16 w-full text-xl">
          {isLast ? 'Voir le podium' : 'Manche suivante'}
          <Icon name="arrow" className="size-6" />
        </Button>
        <div className="mt-3 text-center text-base text-faint">ou Entrée · le clip continue en attendant</div>
      </div>
    </>
  );
}
