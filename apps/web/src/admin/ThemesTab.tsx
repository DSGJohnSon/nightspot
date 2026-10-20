import type { AdminCatalog } from '@nightspot/shared';
import { useState, type FormEvent } from 'react';
import { Button, cx } from '../components/ui';
import { adminApi } from './api';
import { inputClass } from './fields';

export function ThemesTab({
  catalog,
  onChange,
  onError,
}: {
  catalog: AdminCatalog;
  onChange: (c: AdminCatalog) => void;
  onError: (err: unknown) => void;
}) {
  const [name, setName] = useState('');

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    adminApi
      .createTheme(name.trim())
      .then((c) => {
        onChange(c);
        setName('');
      })
      .catch(onError);
  };

  return (
    <div className="max-w-2xl">
      <p className="text-muted">
        Les thèmes servent à composer des parties : genre musical, musiques de films, YouTubeurs, soirée années 2000…
        Un clip peut appartenir à plusieurs thèmes ; on les attribue depuis la fiche du clip.
      </p>

      <form onSubmit={add} className="mt-6 flex gap-3">
        <input
          className={inputClass}
          placeholder="Nouveau thème (ex. Génériques de dessins animés)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
        <Button type="submit" disabled={!name.trim()} className="h-11 shrink-0">
          Ajouter
        </Button>
      </form>

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface/80">
        {catalog.themes.map((theme) => (
          <li key={theme.id} className="flex items-center gap-4 px-4 py-3">
            <input
              defaultValue={theme.name}
              maxLength={40}
              aria-label="Nom du thème"
              className={cx(inputClass, 'h-10 flex-1 border-transparent bg-transparent focus:bg-surface-2/60')}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== theme.name) adminApi.renameTheme(theme.id, next).then(onChange).catch(onError);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <span className="w-20 text-right text-sm text-muted">
              {theme.count} clip{theme.count > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="text-sm text-faint hover:text-expert"
              onClick={() => {
                if (theme.count && !confirm(`Retirer « ${theme.name} » de ${theme.count} clip(s) et le supprimer ?`)) return;
                adminApi.deleteTheme(theme.id).then(onChange).catch(onError);
              }}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
