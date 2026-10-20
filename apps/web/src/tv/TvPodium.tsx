import type { SessionView } from '@nightspot/shared';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Button, cx, Logo, PlayerDot } from '../components/ui';

// Ordre à l'écran : 2e, 1er, 3e. Le 3e monte en premier, le vainqueur en dernier.
const SLOTS = [
  { rank: 2, height: 300, delay: 0.6 },
  { rank: 1, height: 420, delay: 1.3 },
  { rank: 3, height: 220, delay: 0 },
];

export function TvPodium({ view }: { view: SessionView }) {
  const navigate = useNavigate();
  const ranked = [...view.players].sort((a, b) => b.score - a.score);

  return (
    <div className="flex h-full flex-col items-center px-24 py-16">
      <Logo className="text-5xl" />
      <h2 className="mt-6 text-8xl font-black italic">Podium</h2>

      <div className="mt-auto flex items-end gap-10">
        {SLOTS.map(({ rank, height, delay }) => {
          const p = ranked[rank - 1];
          if (!p) return <div key={rank} className="w-[360px]" />;
          return (
            <div key={p.id} className="flex w-[360px] flex-col items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: delay + 0.5 }}
                className="mb-6 flex flex-col items-center"
              >
                <PlayerDot color={p.color} size={rank === 1 ? 36 : 26} />
                <div className={cx('mt-3 max-w-[340px] truncate font-bold', rank === 1 ? 'text-5xl' : 'text-4xl')}>
                  {p.name}
                </div>
                <div className="mt-1 font-mono text-3xl text-accent">{p.score}</div>
              </motion.div>
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ height, transformOrigin: 'bottom' }}
                className={cx(
                  'flex w-full justify-center rounded-t-3xl border border-b-0 pt-6',
                  rank === 1 ? 'glow-accent border-accent/50 bg-accent/15' : 'border-line bg-surface',
                )}
              >
                <span className={cx('text-8xl font-black italic', rank === 1 ? 'text-accent' : 'text-muted')}>{rank}</span>
              </motion.div>
            </div>
          );
        })}
      </div>

      {ranked.length > 3 && (
        <div className="mt-6 flex gap-8 text-xl text-muted">
          {ranked.slice(3, 8).map((p, i) => (
            <span key={p.id}>
              {i + 4}. {p.name} · <span className="font-mono">{p.score}</span>
            </span>
          ))}
        </div>
      )}

      <Button variant="ghost" onClick={() => navigate('/tv')} className="mt-8 h-14 px-8 text-lg">
        Nouvelle partie
      </Button>
    </div>
  );
}
