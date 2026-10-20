import { type AdminCatalog, type AdminClip, DIFFICULTIES, normalizeName } from '@nightspot/shared';
import { useState } from 'react';
import { Button, cx, difficultyColor, DifficultyPill, Icon } from '../components/ui';
import { adminApi } from './api';
import { ClipEditor } from './ClipEditor';
import { DifficultySettings } from './DifficultySettings';
import { formatLastPlayed, formatViews, inputClass } from './fields';

export function CatalogTab({
  catalog,
  onChange,
  onError,
}: {
  catalog: AdminCatalog;
  onChange: () => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('');
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [editing, setEditing] = useState<AdminClip | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const themeNames = new Map(catalog.themes.map((t) => [t.id, t.name]));

  const terms = normalizeName(query).split(' ').filter(Boolean);
  const clips = [...catalog.clips]
    .reverse() // les derniers ajoutés d'abord
    .filter((c) => terms.every((t) => normalizeName(`${c.title} ${c.artist}`).includes(t)))
    .filter((c) => !theme || (theme === '-' ? !c.themes?.length : c.themes?.includes(theme)))
    .filter((c) => difficulty == null || c.difficulty === difficulty);

  const job = catalog.viewsJob;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className={cx(inputClass, 'max-w-xs')}
          placeholder="Rechercher un titre ou un artiste…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className={cx(inputClass, 'max-w-56')} value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="">Tous les thèmes</option>
          {catalog.themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.count})
            </option>
          ))}
          <option value="-">Sans thème</option>
        </select>
        <div className="flex gap-1.5">
          {DIFFICULTIES.map((d) => {
            const active = difficulty === d.level;
            const color = difficultyColor(d.level);
            return (
              <button
                key={d.level}
                type="button"
                onClick={() => setDifficulty(active ? null : d.level)}
                className="h-9 rounded-full px-3 text-sm font-semibold"
                style={active ? { background: color, color: 'var(--color-accent-ink)' } : { background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}
              >
                {d.name}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {job.running ? (
            <div className="w-56">
              <div className="text-sm text-muted">
                Mise à jour des vues… {job.done}/{job.total}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-accent transition-all" style={{ width: `${(job.done / Math.max(job.total, 1)) * 100}%` }} />
              </div>
            </div>
          ) : (
            job.finishedAt && (
              <span className="text-sm text-faint">
                Vues à jour{job.errors ? ` (${job.errors} échec${job.errors > 1 ? 's' : ''})` : ''}
              </span>
            )
          )}
          <Button
            variant="ghost"
            className="h-10 text-sm"
            disabled={job.running}
            onClick={() => adminApi.refreshViews().then(onChange).catch(onError)}
            title="Recalcule les niveaux de difficulté d'après les vues YouTube"
          >
            Mettre à jour les vues
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-sm text-faint">
        Difficulté : d’après les vues YouTube et des seuils fixes (sauf difficulté forcée).
        <button type="button" className="text-accent hover:underline" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? 'Masquer les seuils' : 'Régler les seuils'}
        </button>
      </div>
      {showSettings && <DifficultySettings catalog={catalog} onSaved={onChange} onError={onError} />}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {clips.map((clip) => (
          <button
            key={clip.id}
            type="button"
            onClick={() => setEditing(clip)}
            className="group overflow-hidden rounded-2xl border border-line bg-surface/80 text-left transition hover:border-accent/50"
          >
            <div className="relative aspect-video bg-black">
              {clip.frameUrl ? (
                <img src={clip.frameUrl} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" />
              ) : (
                <div className="flex size-full items-center justify-center text-sm text-expert">Capture manquante</div>
              )}
              <div className="absolute left-2 top-2">
                <DifficultyPill level={clip.difficulty} className="bg-black/70! px-2 py-0.5 text-[10px] backdrop-blur" />
              </div>
              {clip.difficultyOverride && (
                <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-muted">forcée</span>
              )}
            </div>
            <div className="p-3">
              <div className="truncate font-bold">{clip.title}</div>
              <div className="truncate text-sm text-muted">
                {clip.artist}
                {clip.year && <span className="font-mono"> · {clip.year}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(clip.themes ?? []).map((t) => (
                  <span key={t} className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                    {themeNames.get(t) ?? t}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-faint">
                <span>{formatViews(clip.views)}</span>
                <span>{formatLastPlayed(clip.lastPlayedAt)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      {!clips.length && (
        <div className="mt-12 flex flex-col items-center gap-2 text-muted">
          <Icon name="search" className="size-8" />
          Aucun clip ne correspond.
        </div>
      )}

      {editing && (
        <ClipEditor
          clip={editing}
          themes={catalog.themes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void onChange();
          }}
          onError={onError}
        />
      )}
    </>
  );
}
