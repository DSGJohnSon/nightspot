import { type AdminClip, DIFFICULTIES, type Theme } from '@nightspot/shared';
import { useEffect, useState } from 'react';
import { Button, cx, difficultyColor, DifficultyPill, Icon, Label } from '../components/ui';
import { adminApi } from './api';
import { ClipFields, Field, formatLastPlayed, formatTime, formatViews, fromForm, inputClass, parseTime, toForm } from './fields';
import { CapturePaste, RevealPreview } from './media';

export function ClipEditor({
  clip: initial,
  themes,
  onClose,
  onSaved,
  onError,
}: {
  clip: AdminClip;
  themes: Theme[];
  onClose: () => void;
  onSaved: () => void;
  onError: (err: unknown) => void;
}) {
  const [clip, setClip] = useState(initial);
  const [form, setForm] = useState(() =>
    toForm({
      title: clip.title,
      artist: clip.artist,
      featuring: clip.featuring ?? [],
      aliases: clip.aliases ?? [],
      year: clip.year ?? null,
      themes: clip.themes ?? [],
    }),
  );
  const [frameAt, setFrameAt] = useState(formatTime(clip.frameAt ?? 0));
  const [revealAt, setRevealAt] = useState(formatTime(clip.revealAt ?? 0));
  const [override, setOverride] = useState<number | null>(clip.difficultyOverride ?? null);
  const [busy, setBusy] = useState<'frame' | 'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fail = (err: unknown) => {
    setBusy(null);
    setError((err as Error).message);
    onError(err);
  };

  const captureFrame = () => {
    const at = parseTime(frameAt);
    if (at == null) return setError('Instant invalide (ex. 1:23).');
    setBusy('frame');
    setError(null);
    adminApi
      .clipFrame(clip.id, at)
      .then((updated) => {
        setClip(updated);
        setRevealAt(formatTime(updated.revealAt ?? 0));
        setBusy(null);
      })
      .catch(fail);
  };

  /** Capture collée ou importée, à l'instant indiqué dans « Capture à ». */
  const uploadFrame = (image: string) => {
    const at = parseTime(frameAt);
    if (at == null) return setError('Indique l’instant de ta capture dans « Capture à » (ex. 1:23).');
    setBusy('frame');
    setError(null);
    adminApi
      .clipImage(clip.id, at, image)
      .then((updated) => {
        setClip(updated);
        setRevealAt(formatTime(updated.revealAt ?? 0));
        setBusy(null);
      })
      .catch(fail);
  };

  const save = () => {
    const fields = fromForm(form);
    const reveal = parseTime(revealAt);
    if (!fields.title || !fields.artist) return setError('Titre et artiste sont obligatoires.');
    if (reveal == null) return setError('Départ du reveal invalide (ex. 1:23).');
    setBusy('save');
    adminApi
      .updateClip(clip.id, { ...fields, revealAt: reveal, difficultyOverride: override })
      .then(onSaved)
      .catch(fail);
  };

  const remove = () => {
    if (!confirm(`Supprimer « ${clip.title} » du catalogue ?`)) return;
    setBusy('delete');
    adminApi.deleteClip(clip.id).then(onSaved).catch(fail);
  };

  const revealSec = parseTime(revealAt) ?? clip.revealAt ?? 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-6xl overflow-y-auto rounded-3xl border border-line bg-surface p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-extrabold">{clip.title}</div>
            <div className="text-muted">{clip.artist}</div>
          </div>
          <button type="button" onClick={onClose} className="text-faint hover:text-ink" aria-label="Fermer">
            <Icon name="x" className="size-6" />
          </button>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
              {clip.frameUrl ? (
                <img src={clip.frameUrl} alt="" className="size-full object-contain" />
              ) : (
                <div className="flex size-full items-center justify-center text-expert">Capture manquante</div>
              )}
              {busy === 'frame' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-muted">Extraction de la capture…</div>
              )}
            </div>
            <RevealPreview youtubeId={clip.youtubeId} start={revealSec} />

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Field label="Capture à">
                <input className={cx(inputClass, 'max-w-24 font-mono')} value={frameAt} onChange={(e) => setFrameAt(e.target.value)} />
              </Field>
              <Button variant="ghost" className="h-11 text-sm" disabled={!!busy} onClick={captureFrame}>
                Nouvelle capture
              </Button>
              <Field label="Départ au reveal">
                <input className={cx(inputClass, 'max-w-24 font-mono')} value={revealAt} onChange={(e) => setRevealAt(e.target.value)} />
              </Field>
            </div>
            <CapturePaste busy={busy === 'frame'} onImage={uploadFrame} />
            <div className="mt-1 text-xs text-faint">
              Une capture à toi (ou pour une vidéo que YouTube interdit de télécharger) : indique son instant dans « Capture à ».
            </div>

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-faint">
              <span>{formatViews(clip.views)}</span>
              <span>{formatLastPlayed(clip.lastPlayedAt)}</span>
              <a href={`https://www.youtube.com/watch?v=${clip.youtubeId}`} target="_blank" rel="noreferrer" className="hover:text-muted">
                Ouvrir sur YouTube ↗
              </a>
            </div>
          </div>

          <div>
            <ClipFields form={form} themes={themes} onChange={setForm} />

            <div className="mt-5">
              <Label>Difficulté</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setOverride(null)}
                  className={cx(
                    'h-8 rounded-full px-3 text-sm font-semibold',
                    override == null ? 'bg-accent text-accent-ink' : 'bg-accent/10 text-accent',
                  )}
                >
                  Auto (vues)
                </button>
                {DIFFICULTIES.map((d) => {
                  const color = difficultyColor(d.level);
                  const active = override === d.level;
                  return (
                    <button
                      key={d.level}
                      type="button"
                      onClick={() => setOverride(d.level)}
                      className="h-8 rounded-full px-3 text-sm font-semibold"
                      style={active ? { background: color, color: 'var(--color-accent-ink)' } : { background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-faint">
                Niveau actuel <DifficultyPill level={clip.difficulty} className="px-2 py-0.5 text-[10px]" />
              </div>
            </div>

            {error && <div className="mt-4 text-sm text-expert">{error}</div>}
            <div className="mt-6 flex items-center gap-3">
              <Button onClick={save} disabled={!!busy} className="h-11">
                {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              <Button variant="ghost" onClick={onClose} className="h-11">
                Annuler
              </Button>
              <button type="button" onClick={remove} disabled={!!busy} className="ml-auto text-sm text-expert/80 hover:text-expert">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
