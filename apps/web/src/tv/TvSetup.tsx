import {
  type CatalogSummary,
  DEFAULT_REVEAL_SEC,
  DIFFICULTIES,
  type SearchMode,
  type SessionSettings,
} from '@nightspot/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, cx, difficultyColor, Label, Logo, MultiChips, Segmented, type SegmentOption } from '../components/ui';
import { socket } from '../lib/socket';
import { hostTokenKey, store } from '../lib/storage';
import { TvCanvas } from './TvCanvas';

const MODULES = [
  { id: 'guess-the-clip', name: 'Guess the Clip', description: 'Une capture, un clip à retrouver', available: true },
  { id: 'guess-the-film', name: 'Guess the Film', description: 'Bientôt', available: false },
  { id: 'guess-the-poster', name: 'Guess the Affiche', description: 'Bientôt', available: false },
];

const ROUND_PRESETS = [5, 10, 15];

// Même code couleur que les difficultés de songspot, appliqué aussi aux valeurs saisies à la main.
const TIMER_PRESETS = [30, 20, 10];
function timerColor(seconds: number): string {
  if (seconds >= 30) return 'var(--color-easy)';
  if (seconds >= 20) return 'var(--color-medium)';
  if (seconds >= 15) return 'var(--color-hard)';
  if (seconds >= 10) return 'var(--color-expert)';
  return 'var(--color-impossible)';
}

// Durée d'affichage des réponses ; ensuite le classement les remplace et le clip continue.
// Une seule valeur proposée (celle que l'admin prévisualise) ; la saisie libre reste possible.
const REVEAL_PRESETS = [DEFAULT_REVEAL_SEC];

const SEARCH_OPTIONS: SegmentOption<SearchMode>[] = [
  { value: 'deezer', label: 'Tout Deezer' },
  { value: 'catalog', label: 'Facile : clips du jeu', color: 'var(--color-medium)' },
];

const decadeLabel = (decade: number) => (decade < 2000 ? `${String(decade).slice(2)}s` : `${decade}s`);

export function TvSetup() {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState(10);
  const [timerSec, setTimerSec] = useState(20);
  const [revealSec, setRevealSec] = useState(DEFAULT_REVEAL_SEC);
  const [searchMode, setSearchMode] = useState<SearchMode>('deezer');
  const [themes, setThemes] = useState<string[]>([]);
  const [decades, setDecades] = useState<number[]>([]);
  const [difficulties, setDifficulties] = useState<number[]>([]);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.connect();
    fetch('/api/catalog')
      .then((res) => res.json() as Promise<CatalogSummary>)
      .then(setSummary)
      .catch(() => setError('Catalogue indisponible.'));
  }, []);

  const items = summary?.items ?? [];
  const available = items.filter(
    (item) =>
      (!themes.length || item.themes.some((t) => themes.includes(t))) &&
      (!decades.length || (item.decade != null && decades.includes(item.decade))) &&
      (!difficulties.length || difficulties.includes(item.difficulty)),
  ).length;

  const themeOptions = (summary?.themes ?? [])
    .map((t) => ({ value: t.id, label: t.name, count: items.filter((i) => i.themes.includes(t.id)).length }))
    .filter((o) => o.count > 0);
  const decadeOptions = [...new Set(items.map((i) => i.decade).filter((d): d is number => d != null))]
    .sort()
    .map((d) => ({ value: d, label: decadeLabel(d), count: items.filter((i) => i.decade === d).length }));
  const difficultyOptions = DIFFICULTIES.map((d) => ({
    value: d.level as number,
    label: d.name,
    color: difficultyColor(d.level),
    count: items.filter((i) => i.difficulty === d.level).length,
  }));

  const create = () => {
    const settings: SessionSettings = {
      blocks: [{ moduleId: 'guess-the-clip', rounds, timerSec, revealSec, searchMode, themes, decades, difficulties }],
    };
    setBusy(true);
    setError(null);
    socket.emit('host:create', settings, (res) => {
      setBusy(false);
      if (!res.ok) return setError(res.error);
      store.set(hostTokenKey(res.code), res.hostToken);
      navigate(`/tv/${res.code}`);
    });
  };

  return (
    <TvCanvas>
      <div className="flex h-full flex-col items-center justify-center">
        <div className="flex w-[1640px] items-end justify-between">
          <Logo className="text-[112px]" />
          <Link to="/admin" className="mb-4 text-lg text-muted hover:text-ink">
            Gérer le catalogue →
          </Link>
        </div>
        <div className="mt-8 grid w-[1640px] grid-cols-2 gap-14 rounded-4xl border border-line bg-surface/80 p-12 backdrop-blur">
          <div>
            <Row label="Module">
              <div className="grid grid-cols-3 gap-3">
                {MODULES.map((m) => (
                  <div
                    key={m.id}
                    className={cx(
                      'rounded-2xl border px-4 py-3',
                      m.available ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface-2/50 opacity-50',
                    )}
                  >
                    <div className="text-lg font-bold">{m.name}</div>
                    <div className="text-sm text-muted">{m.description}</div>
                  </div>
                ))}
              </div>
            </Row>
            <Row label="Longueur">
              <PresetPicker value={rounds} presets={ROUND_PRESETS} min={1} max={50} unit="manches" onChange={setRounds} />
            </Row>
            <Row label="Temps de réponse">
              <PresetPicker
                value={timerSec}
                presets={TIMER_PRESETS}
                min={5}
                max={120}
                unit="s"
                colorFor={timerColor}
                onChange={setTimerSec}
              />
            </Row>
            <Row label="Réponses affichées">
              <PresetPicker value={revealSec} presets={REVEAL_PRESETS} min={5} max={120} unit="s" onChange={setRevealSec} />
            </Row>
            <Row label="Recherche">
              <Segmented value={searchMode} options={SEARCH_OPTIONS} onChange={setSearchMode} />
            </Row>
          </div>

          <div className="flex flex-col">
            <Row label="Thèmes">
              <MultiChips values={themes} options={themeOptions} onChange={setThemes} />
            </Row>
            <Row label="Époque">
              <MultiChips values={decades} options={decadeOptions} onChange={setDecades} allLabel="Toutes" />
            </Row>
            <Row label="Difficulté (selon les vues YouTube)">
              <MultiChips values={difficulties} options={difficultyOptions} onChange={setDifficulties} allLabel="Toutes" />
            </Row>

            <div className="mt-auto pt-6">
              <div className="flex items-baseline justify-between">
                <span className={cx('text-2xl font-bold', available ? 'text-ink' : 'text-expert')}>
                  {summary ? `${available} clip${available > 1 ? 's' : ''} disponible${available > 1 ? 's' : ''}` : '…'}
                </span>
                {summary && available > 0 && available < rounds && (
                  <span className="text-lg text-medium">La partie fera {available} manches</span>
                )}
              </div>
              {error && <div className="mt-3 text-lg text-expert">{error}</div>}
              <Button onClick={create} disabled={busy || !available} className="mt-4 h-16 w-full text-xl">
                {busy ? 'Création…' : 'Créer la partie'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TvCanvas>
  );
}

/**
 * Trois préréglages et une valeur libre. La saisie est prise en compte dès qu'elle est dans les
 * bornes, et ramenée dans les bornes quand on quitte le champ.
 */
function PresetPicker({
  value,
  presets,
  min,
  max,
  unit,
  colorFor,
  onChange,
}: {
  value: number;
  presets: number[];
  min: number;
  max: number;
  unit: string;
  colorFor?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(presets.includes(value) ? '' : String(value));
  const custom = !presets.includes(value) || text !== '';
  const color = (colorFor ?? (() => 'var(--color-accent)'))(value);

  const options: SegmentOption<number>[] = presets.map((p) => ({
    value: p,
    label: `${p} ${unit}`,
    color: colorFor?.(p),
  }));

  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    setText(digits);
    const n = parseInt(digits, 10);
    if (n >= min && n <= max) onChange(n);
  };

  const settle = () => {
    if (!text) return;
    const n = Math.min(max, Math.max(min, parseInt(text, 10)));
    setText(String(n));
    onChange(n);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        value={custom ? Number.NaN : value}
        options={options}
        onChange={(p) => {
          setText('');
          onChange(p);
        }}
      />
      <label
        className="flex h-11 cursor-text items-center gap-1.5 rounded-full px-4 text-base font-semibold transition"
        style={
          custom
            ? { background: color, color: 'var(--color-accent-ink)' }
            : { background: 'color-mix(in srgb, var(--color-muted) 12%, transparent)', color: 'var(--color-muted)' }
        }
      >
        <input
          value={text}
          onChange={(e) => type(e.target.value)}
          onBlur={settle}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          inputMode="numeric"
          placeholder="Autre"
          aria-label={`Valeur personnalisée (${min} à ${max} ${unit})`}
          className={cx(
            'w-14 bg-transparent text-center font-mono outline-none',
            custom ? 'placeholder:text-accent-ink/60' : 'placeholder:text-muted',
          )}
        />
        <span>{unit}</span>
      </label>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-line/60 py-4 first:pt-0 last:border-0">
      <Label size="lg" className="mb-3">
        {label}
      </Label>
      {children}
    </div>
  );
}
