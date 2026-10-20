import type { DeezerMatch, Draft, Theme } from '@nightspot/shared';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, cx, Icon, Label } from '../components/ui';
import { adminApi } from './api';
import { ClipFields, type FieldsForm, formatTime, formatViews, fromForm, inputClass, parseTime, toForm } from './fields';
import { CapturePaste, describeSource, ReplayCurve, RevealPreview } from './media';

export function AddTab({
  themes,
  onAdded,
  onError,
}: {
  themes: Theme[];
  onAdded: () => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const load = useCallback(() => adminApi.drafts().then(setDrafts).catch(onError), [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tant qu'une analyse tourne, on rafraîchit : les captures apparaissent au fil de l'eau.
  const pending = drafts.some((d) => d.status === 'queued' || d.status === 'analyzing');
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(load, 1500);
    return () => clearInterval(id);
  }, [pending, load]);

  const submit = () => {
    // Une entrée par ligne ; plusieurs liens sur une même ligne restent séparés.
    const urls = text.split(/\r?\n/).flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      const links = trimmed.split(/\s+/).filter((word) => /^(https?:\/\/|www\.|youtu)/i.test(word));
      return links.length ? links : [trimmed];
    });
    if (!urls.length) return;
    adminApi
      .createDrafts(urls)
      .then((list) => {
        setDrafts(list);
        setText('');
      })
      .catch(onError);
  };

  const replace = (draft: Draft) => setDrafts((list) => list.map((d) => (d.id === draft.id ? draft : d)));
  const remove = (id: string) => setDrafts((list) => list.filter((d) => d.id !== id));

  return (
    <>
      <div className="rounded-3xl border border-line bg-surface/80 p-6">
        <Label>Liens YouTube ou « Artiste – Titre »</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={'https://www.youtube.com/watch?v=…\nIndila – Dernière danse\nQueen - Bohemian Rhapsody'}
          className={cx(inputClass, 'mt-2 h-auto py-3 font-mono text-sm')}
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="text-sm text-faint">
            Une entrée par ligne : un lien, ou « Artiste – Titre » (le clip officiel est cherché sur YouTube ; puces,
            numéros, années et [thèmes] des listes sont ignorés). Morceau Deezer, année, vues et captures sont récupérés
            automatiquement, environ 15 s par clip. Tu valides ensuite chaque clip.
          </span>
          <Button onClick={submit} disabled={!text.trim()} className="h-11 shrink-0">
            Analyser
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            themes={themes}
            onUpdate={replace}
            onList={setDrafts}
            onError={onError}
            onDone={() => {
              remove(draft.id);
              void onAdded();
            }}
            onDiscard={() => adminApi.discardDraft(draft.id).then(() => remove(draft.id)).catch(onError)}
          />
        ))}
      </div>
    </>
  );
}

function DraftCard({
  draft,
  themes,
  onUpdate,
  onList,
  onError,
  onDone,
  onDiscard,
}: {
  draft: Draft;
  themes: Theme[];
  onUpdate: (d: Draft) => void;
  onList: (list: Draft[]) => void;
  onError: (err: unknown) => void;
  onDone: () => void;
  onDiscard: () => void;
}) {
  const pending = draft.status === 'queued' || draft.status === 'analyzing';
  return (
    <div className="rounded-3xl border border-line bg-surface/80 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {draft.query && (
            <div className="text-sm text-muted">
              Recherche YouTube : <span className="text-ink">« {draft.query} »</span>
            </div>
          )}
          <div className="truncate text-lg font-bold">{draft.videoTitle ?? draft.url}</div>
          <div className="text-sm text-faint">
            {draft.channel && <span>{draft.channel} · </span>}
            {draft.views != null && <span>{formatViews(draft.views)} · </span>}
            {draft.youtubeId && (
              <a href={`https://www.youtube.com/watch?v=${draft.youtubeId}`} target="_blank" rel="noreferrer" className="hover:text-muted">
                YouTube ↗
              </a>
            )}
          </div>
        </div>
        <button type="button" onClick={onDiscard} className="shrink-0 text-sm text-faint hover:text-muted">
          Ignorer
        </button>
      </div>

      {!pending && <VideoChooser draft={draft} onList={onList} onError={onError} />}

      {pending && (
        <div className="mt-4">
          <div className="flex items-center gap-3 text-muted">
            <span className="size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            {draft.status === 'queued'
              ? 'En attente…'
              : draft.query && !draft.youtubeId
                ? 'Recherche du clip officiel sur YouTube…'
                : 'Analyse en cours : infos, Deezer, captures…'}
          </div>
          {draft.candidates.length > 0 && (
            <div className="mt-3 flex gap-2">
              {draft.candidates.map((c) => (
                <img key={c.url} src={c.url} alt="" className="aspect-video w-40 rounded-lg object-cover" />
              ))}
            </div>
          )}
        </div>
      )}

      {draft.status === 'duplicate' && <div className="mt-4 text-medium">{draft.error}</div>}
      {draft.status === 'error' && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="text-expert">{draft.error}</span>
          <Button
            variant="ghost"
            className="h-9 text-sm"
            onClick={() => adminApi.retryDraft(draft.id).then(onList).catch(onError)}
          >
            Réessayer
          </Button>
        </div>
      )}

      {draft.status === 'ready' && (
        <ReadyDraft draft={draft} themes={themes} onUpdate={onUpdate} onDone={onDone} />
      )}
    </div>
  );
}

/** Pour une ligne « Artiste – Titre » : les autres vidéos trouvées, si la première n'est pas le bon clip. */
function VideoChooser({
  draft,
  onList,
  onError,
}: {
  draft: Draft;
  onList: (list: Draft[]) => void;
  onError: (err: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!draft.videoOptions || draft.videoOptions.length < 2) return null;

  const choose = (youtubeId: string) => {
    setBusy(true);
    adminApi
      .draftVideo(draft.id, youtubeId)
      .then((list) => {
        onList(list);
        setOpen(false);
      })
      .catch(onError)
      .finally(() => setBusy(false));
  };

  return (
    <div className="mt-3">
      <button type="button" className="text-sm text-accent hover:underline" onClick={() => setOpen((o) => !o)}>
        {open ? 'Masquer les autres vidéos' : 'Pas le bon clip ? Changer de vidéo'}
      </button>
      {open && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {draft.videoOptions.map((v) => {
            const current = v.id === draft.youtubeId;
            return (
              <button
                key={v.id}
                type="button"
                disabled={busy || current}
                onClick={() => choose(v.id)}
                className={cx(
                  'flex items-center gap-3 rounded-xl border p-2 text-left transition',
                  current ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface-2',
                )}
              >
                <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" className="aspect-video w-24 shrink-0 rounded-md object-cover" />
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-semibold">{v.title}</div>
                  <div className="truncate text-xs text-muted">
                    {v.channel}
                    {v.views != null && ` · ${formatViews(v.views)}`}
                    {current && ' · choisie'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReadyDraft({
  draft,
  themes,
  onUpdate,
  onDone,
}: {
  draft: Draft;
  themes: Theme[];
  onUpdate: (d: Draft) => void;
  onDone: () => void;
}) {
  const [candidate, setCandidate] = useState(0);
  const [matchIndex, setMatchIndex] = useState<number | null>(draft.matches.length ? 0 : null);
  const [form, setForm] = useState<FieldsForm>(() => toForm(draft.fields));
  const [customAt, setCustomAt] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'frame' | 'search' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const chosen = draft.candidates[candidate];

  const pickMatch = (index: number | null, matches: DeezerMatch[] = draft.matches) => {
    setMatchIndex(index);
    const match = index == null ? null : matches[index];
    if (match) {
      setForm((f) => ({
        ...f,
        title: match.title,
        artist: match.artist,
        featuring: match.featuring.join(', '),
        year: match.year ? String(match.year) : f.year,
      }));
    }
  };

  /** Détection ratée : recherche Deezer à la main, le premier résultat est sélectionné. */
  const search = (e: FormEvent) => {
    e.preventDefault();
    setBusy('search');
    setError(null);
    adminApi
      .draftSearch(draft.id, query.trim())
      .then((updated) => {
        onUpdate(updated);
        pickMatch(0, updated.matches);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(null));
  };

  /** Nouvelle capture : extraite de la vidéo à l'instant saisi, ou fournie (collée / importée). */
  const addCapture = (image?: string) => {
    const at = parseTime(customAt);
    if (at == null) {
      return setCaptureError(
        image
          ? 'Indique d’abord l’instant de ta capture (ex. 1:23) : c’est là que démarrera le clip au reveal.'
          : 'Instant invalide (ex. 1:23).',
      );
    }
    setBusy('frame');
    setCaptureError(null);
    (image ? adminApi.draftImage(draft.id, at, image) : adminApi.draftFrame(draft.id, at))
      .then((updated) => {
        onUpdate(updated);
        setCandidate(updated.candidates.length - 1);
        setCustomAt('');
      })
      .catch((err: Error) => setCaptureError(err.message))
      .finally(() => setBusy(null));
  };

  const confirm = () => {
    const fields = fromForm(form);
    if (!fields.title || !fields.artist) return setError('Titre et artiste sont obligatoires.');
    if (!chosen) return setError('Ajoute d’abord une capture (colle une capture d’écran à gauche).');
    setBusy('save');
    setError(null);
    adminApi
      .confirmDraft(draft.id, { fields, candidate, matchIndex })
      .then(onDone)
      .catch((err: Error) => {
        setError(err.message);
        setBusy(null);
      });
  };

  return (
    <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
          {chosen && <img src={chosen.url} alt="" className="size-full object-contain" />}
          {chosen && (
            <span className="absolute bottom-3 left-3 rounded-md bg-black/70 px-2 py-1 font-mono text-sm">{formatTime(chosen.at)}</span>
          )}
        </div>
        {chosen && draft.youtubeId && <RevealPreview youtubeId={draft.youtubeId} start={chosen.at} />}

        {draft.blocked && (
          <div className="mt-4 rounded-xl border border-medium/40 bg-medium/10 p-3 text-sm text-medium">
            YouTube interdit le téléchargement de cette vidéo (fréquent pour les clips VEVO et des grands labels) :
            impossible d’extraire une image à un instant précis. {draft.candidates.length ? 'Les images ci-dessous sont générées par YouTube, à des positions approximatives ; ' : ''}
            tu peux coller ta propre capture d’écran. Le reveal fonctionnera normalement.
          </div>
        )}

        <Label className="mt-5">Capture affichée pendant la question</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {draft.candidates.map((c, i) => (
            <button
              key={c.url}
              type="button"
              onClick={() => setCandidate(i)}
              className={cx('w-32 text-left transition', i === candidate ? '' : 'opacity-70 hover:opacity-100')}
            >
              <span
                className={cx(
                  'relative block overflow-hidden rounded-lg ring-2',
                  i === candidate ? 'ring-accent' : 'ring-transparent',
                )}
              >
                <img src={c.url} alt="" className="aspect-video w-full object-cover" />
                <span className="absolute left-1 top-1 rounded-full bg-black/70 px-1.5 font-mono text-[10px] font-bold">{i + 1}</span>
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px]">{formatTime(c.at)}</span>
              </span>
              {describeSource(c.source) && (
                <span className="mt-1 block text-[11px] leading-tight text-muted">{describeSource(c.source)}</span>
              )}
            </button>
          ))}
        </div>
        {draft.heatmap?.length && draft.duration ? (
          <ReplayCurve
            heatmap={draft.heatmap}
            duration={draft.duration}
            candidates={draft.candidates}
            chosen={candidate}
            onPick={(sec) => setCustomAt(formatTime(sec))}
          />
        ) : null}
        <div className="mt-2 text-[11px] text-faint">
          Captures proposées : les pics de la courbe « Most replayed » (les moments les plus revus), espacés d’au moins
          15 s ; à défaut, des repères fixes. Les % comparent chaque pic au moment le plus revu de la vidéo.
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            className={cx(inputClass, 'max-w-28 font-mono')}
            placeholder="1:23"
            aria-label="Instant de la capture"
            value={customAt}
            onChange={(e) => setCustomAt(e.target.value)}
          />
          {!draft.blocked && (
            <Button variant="ghost" className="h-11 text-sm" onClick={() => addCapture()} disabled={!!busy || !customAt}>
              {busy === 'frame' ? 'Extraction…' : 'Capturer à cet instant'}
            </Button>
          )}
        </div>
        <CapturePaste busy={busy === 'frame'} onImage={(image) => addCapture(image)} />
        {captureError && <div className="mt-2 text-sm text-expert">{captureError}</div>}
        <div className="mt-1 text-xs text-faint">
          Pour une capture à toi, indique l’instant où tu l’as prise : le clip démarrera là au reveal, l’image prend vie.
        </div>
      </div>

      <div>
        <Label>Morceau sur Deezer</Label>
        <form onSubmit={search} className="mt-2 flex gap-2">
          <input
            className={cx(inputClass, 'h-10!')}
            placeholder="Pas le bon morceau ? Cherche : titre, artiste…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" variant="ghost" className="h-10 shrink-0 text-sm" disabled={query.trim().length < 2 || !!busy}>
            {busy === 'search' ? 'Recherche…' : 'Chercher'}
          </Button>
        </form>
        <div className="mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {draft.matches.map((m, i) => (
            <button
              key={m.trackId}
              type="button"
              onClick={() => pickMatch(i)}
              className={cx(
                'flex w-full items-center gap-3 rounded-xl border p-2 text-left transition',
                i === matchIndex ? 'border-accent bg-accent/10' : 'border-line hover:bg-surface-2',
              )}
            >
              {m.cover ? <img src={m.cover} alt="" className="size-10 rounded-md" /> : <div className="size-10 rounded-md bg-surface-2" />}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.title}</div>
                <div className="truncate text-sm text-muted">
                  {m.artist}
                  {m.featuring.length > 0 && ` feat. ${m.featuring.join(', ')}`}
                  {m.year && <span className="font-mono"> · {m.year}</span>}
                </div>
              </div>
              {i === matchIndex && <Icon name="check" className="size-5 text-accent" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => pickMatch(null)}
            className={cx(
              'w-full rounded-xl border p-2 text-left text-sm transition',
              matchIndex == null ? 'border-accent bg-accent/10' : 'border-line text-muted hover:bg-surface-2',
            )}
          >
            Aucun ne correspond : saisie manuelle (l’artiste sera validé par son nom)
          </button>
        </div>

        <div className="mt-5">
          <ClipFields form={form} themes={themes} onChange={setForm} />
        </div>

        {error && <div className="mt-4 text-sm text-expert">{error}</div>}
        <Button onClick={confirm} disabled={!!busy} className="mt-5 h-12 w-full">
          {busy === 'save' ? 'Ajout…' : 'Ajouter au catalogue'}
        </Button>
      </div>
    </div>
  );
}
