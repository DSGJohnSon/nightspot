import { difficultyInfo, formatMultiplier, YEAR_BONUS } from '@nightspot/shared';
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Logo({ className }: { className?: string }) {
  return <span className={cx('logo select-none leading-none', className)}>nightspot</span>;
}

/** Petit libellé en capitales espacées. `lg` pour la TV, lue à plusieurs mètres. */
export function Label({ children, size = 'sm', className }: { children: ReactNode; size?: 'sm' | 'lg'; className?: string }) {
  return (
    <div
      className={cx(
        'font-semibold uppercase text-muted',
        size === 'lg' ? 'text-[17px] tracking-[0.2em]' : 'text-[11px] tracking-[0.22em]',
        className,
      )}
    >
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' };

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-6 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        variant === 'primary'
          ? 'bg-accent text-accent-ink hover:brightness-110'
          : 'border border-line bg-surface text-ink hover:bg-surface-2',
        className,
      )}
    />
  );
}

export interface SegmentOption<T> {
  value: T;
  label: ReactNode;
  /** Couleur de la pastille, façon sélecteur de difficulté songspot. */
  color?: string;
  /** Petit compteur affiché dans la pastille (ex. nombre de clips). */
  count?: number;
}

/** Sélection multiple ; aucune sélection = « Tous ». */
export function MultiChips<T extends string | number>({
  values,
  options,
  onChange,
  allLabel = 'Tous',
}: {
  values: T[];
  options: SegmentOption<T>[];
  onChange: (values: T[]) => void;
  allLabel?: string;
}) {
  const chip = (key: string, label: ReactNode, active: boolean, onClick: () => void, color = 'var(--color-accent)', count?: number) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-base font-semibold transition hover:brightness-125"
      style={
        active
          ? { background: color, color: 'var(--color-accent-ink)' }
          : { background: `color-mix(in srgb, ${color} 13%, transparent)`, color }
      }
    >
      {label}
      {count != null && <span className="font-mono text-sm opacity-70">{count}</span>}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {chip('*', allLabel, values.length === 0, () => onChange([]))}
      {options.map((o) =>
        chip(
          String(o.value),
          o.label,
          values.includes(o.value),
          () => onChange(values.includes(o.value) ? values.filter((v) => v !== o.value) : [...values, o.value]),
          o.color,
          o.count,
        ),
      )}
    </div>
  );
}

const DIFFICULTY_COLORS = [
  'var(--color-easy)',
  'var(--color-medium)',
  'var(--color-hard)',
  'var(--color-expert)',
  'var(--color-impossible)',
];

export function difficultyColor(level: number): string {
  return DIFFICULTY_COLORS[difficultyInfo(level).level - 1];
}

/** « EXPERT ×1,75 » aux couleurs du sélecteur de difficulté songspot. */
export function DifficultyPill({ level, className = 'px-3 py-1 text-xs' }: { level: number; className?: string }) {
  const info = difficultyInfo(level);
  const color = difficultyColor(level);
  return (
    <span
      className={cx('inline-flex shrink-0 items-center gap-2 rounded-full font-bold uppercase tracking-[0.15em]', className)}
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {info.name}
      <span className="font-mono tracking-normal">{formatMultiplier(info.multiplier)}</span>
    </span>
  );
}

/** « Année pile ! », « À 1 an près »… selon les points du bonus année. */
export function yearBonusLabel(points: number): string {
  if (points === YEAR_BONUS[0]) return 'Année pile !';
  if (points === YEAR_BONUS[1]) return 'À 1 an près';
  if (points === YEAR_BONUS[2]) return 'À 2 ans près';
  return 'Raté';
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option.value === value;
        const color = option.color ?? 'var(--color-accent)';
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className="h-11 rounded-full px-6 text-base font-semibold transition hover:brightness-125"
            style={
              active
                ? { background: color, color: 'var(--color-accent-ink)' }
                : { background: `color-mix(in srgb, ${color} 13%, transparent)`, color }
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pastille de couleur du joueur ; creuse quand il est hors ligne. */
export function PlayerDot({ color, size = 12, offline = false }: { color: string; size?: number; offline?: boolean }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={
        offline
          ? { width: size, height: size, border: `2px solid ${color}`, opacity: 0.6 }
          : { width: size, height: size, background: color, boxShadow: `0 0 ${size}px ${color}66` }
      }
    />
  );
}

export function OfflineTag({ className = 'text-xs' }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md bg-expert/12 px-2 py-0.5 font-bold uppercase tracking-wider text-expert',
        className,
      )}
    >
      <Icon name="wifiOff" className="size-[1.1em]" />
      Hors ligne
    </span>
  );
}

export function PartBadge({ ok, children }: { ok: boolean | undefined; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide',
        ok ? 'bg-accent/15 text-accent' : 'bg-expert/15 text-expert',
      )}
    >
      <Icon name={ok ? 'check' : 'x'} className="size-3.5" />
      {children}
    </span>
  );
}

const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14Z M20 20l-4.35-4.35',
  check: 'M5 12.5 10 17l9-10',
  x: 'M6 6l12 12M18 6 6 18',
  tv: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5Z M9 21h6',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M11 18h2',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  volume: 'M4 10v4h3l5 4V6l-5 4H4Z M16 9a4 4 0 0 1 0 6',
  calendar: 'M8 3v3 M16 3v3 M4 9h16 M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  play: 'M8 5.5v13l10.5-6.5Z',
  stop: 'M7 7h10v10H7Z',
  wifiOff:
    'M12 20h.01 M8.5 16.43a5 5 0 0 1 7 0 M5 12.86a10 10 0 0 1 5.17-2.69 M19 12.86a10 10 0 0 0-2-1.52 M2 8.82a15 15 0 0 1 4.18-2.64 M22 8.82a15 15 0 0 0-11.29-3.76 M2 2l20 20',
} as const;

export function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Barre de temps qui se vide (animation CSS, aucune re-render nécessaire). */
export function TimerBar({
  startedAt,
  endsAt,
  offset,
  shifting = false,
  className,
}: {
  startedAt: number;
  endsAt: number;
  offset: number;
  /** Passe du vert au jaune puis au rouge en fin de course. */
  shifting?: boolean;
  className?: string;
}) {
  const total = Math.max(1, endsAt - startedAt);
  // Calculé une fois par manche : changer animation-delay en cours d'animation la ferait sauter.
  const elapsed = useMemo(() => Math.min(Math.max(Date.now() + offset - startedAt, 0), total), [startedAt, endsAt]);
  return (
    <div className={cx('overflow-hidden rounded-full bg-surface-2', className)}>
      <div
        key={endsAt}
        className={cx('timer-fill h-full rounded-full', shifting ? 'shifting bg-accent' : 'bg-faint')}
        style={{ animationDuration: `${total}ms`, animationDelay: `-${elapsed}ms` }}
      />
    </div>
  );
}

/** Compteur qui défile de `from` à `to`. */
export function CountUp({ from, to, run, className }: { from: number; to: number; run: boolean; className?: string }) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run) {
      setValue(from);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min((t - start) / 900, 1);
      setValue(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, run]);
  return <span className={className}>{value}</span>;
}

export function ordinal(rank: number): string {
  return rank === 1 ? '1er' : `${rank}e`;
}
