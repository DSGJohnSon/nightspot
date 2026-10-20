import type { SearchMode, SearchResult } from '@nightspot/shared';
import { useEffect, useState } from 'react';
import { Button, cx, Icon } from '../components/ui';

/** Recherche de morceau façon « Name that track » : on tape, on choisit, on valide. */
export function TrackSearch({
  mode,
  sending,
  error,
  onSubmit,
}: {
  mode: SearchMode;
  sending: boolean;
  error: string | null;
  onSubmit: (choice: SearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    // Debounce : on n'interroge l'API qu'une fois la frappe calmée.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?mode=${mode}&q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = (await res.json()) as { results?: SearchResult[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Recherche indisponible.');
        setResults(json.results ?? []);
        setSearchError(null);
      } catch (err) {
        if (!controller.signal.aborted) setSearchError((err as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, mode]);

  const select = (result: SearchResult) => {
    setSelected(result);
    // Ferme le clavier pour dégager le bouton Valider.
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="mt-4 flex h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 focus-within:border-accent/60">
        <Icon name="search" className="size-5 shrink-0 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Titre ou artiste…"
          className="h-full min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-faint"
        />
        {loading && <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
      </label>
      {mode === 'catalog' && (
        <div className="mt-2 text-xs text-muted">Recherche facile : seuls les clips du jeu sont proposés.</div>
      )}

      <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
        {results.map((r) => {
          const active = selected?.trackId === r.trackId;
          return (
            <li key={r.trackId}>
              <button
                type="button"
                onClick={() => select(r)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition',
                  active ? 'border-accent bg-accent/12' : 'border-transparent bg-surface/70 active:bg-surface-2',
                )}
              >
                {r.cover ? (
                  <img src={r.cover} alt="" className="size-12 shrink-0 rounded-lg" />
                ) : (
                  <div className="size-12 shrink-0 rounded-lg bg-surface-2" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.title}</div>
                  <div className="truncate text-sm text-muted">{r.artist}</div>
                </div>
                {active && <Icon name="check" className="size-6 shrink-0 text-accent" />}
              </button>
            </li>
          );
        })}
        {query.trim().length >= 2 && !loading && !results.length && !searchError && (
          <li className="py-6 text-center text-muted">Aucun résultat</li>
        )}
        {searchError && <li className="py-6 text-center text-expert">{searchError}</li>}
      </ul>

      {error && <div className="mb-2 text-center text-sm text-expert">{error}</div>}
      <Button
        onClick={() => selected && onSubmit(selected)}
        disabled={!selected || sending}
        className="h-14 w-full shrink-0 text-lg"
      >
        <span className="truncate">{selected ? `Valider « ${selected.title} »` : 'Choisis un morceau'}</span>
      </Button>
    </div>
  );
}
