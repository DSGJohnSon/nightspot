import {
  type AdminCatalog,
  DEFAULT_VIEW_THRESHOLDS,
  DIFFICULTIES,
  levelFromViews,
  suggestThresholds,
  type ThresholdMethod,
} from '@nightspot/shared';
import { useState } from 'react';
import { Button, cx, DifficultyPill } from '../components/ui';
import { adminApi } from './api';
import { inputClass } from './fields';

const toMillions = (views: number) => String(views / 1_000_000);

/** Seuils de vues de chaque niveau, avec la répartition du catalogue recalculée en direct. */
export function DifficultySettings({
  catalog,
  onSaved,
  onError,
}: {
  catalog: AdminCatalog;
  onSaved: () => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const [values, setValues] = useState(() => catalog.settings.viewThresholds.map(toMillions));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const propose = (method: ThresholdMethod) => {
    const suggested = suggestThresholds(
      catalog.clips.map((c) => c.views ?? 0),
      method,
    );
    if (!suggested) return setNotice('Pas assez de clips aux vues variées pour proposer 5 niveaux.');
    setValues(suggested.map(toMillions));
    setNotice(
      method === 'balanced'
        ? 'Proposition : à peu près autant de clips dans chaque niveau. Vérifie la répartition, puis enregistre.'
        : 'Proposition : paliers réguliers entre le clip le plus vu et le moins vu. Vérifie la répartition, puis enregistre.',
    );
  };

  const thresholds = values.map((v) => Math.round(parseFloat(v.replace(',', '.')) * 1_000_000));
  const valid = thresholds.every((t, i) => Number.isFinite(t) && t > 0 && (i === 0 || t < thresholds[i - 1]));
  const changed = thresholds.some((t, i) => t !== catalog.settings.viewThresholds[i]);

  const counts = [0, 0, 0, 0, 0];
  let forced = 0;
  for (const clip of catalog.clips) {
    if (clip.difficultyOverride) forced++;
    const level = clip.difficultyOverride ?? (clip.views != null && valid ? levelFromViews(clip.views, thresholds) : 3);
    counts[level - 1]++;
  }

  const save = () => {
    setSaving(true);
    adminApi
      .saveSettings({ viewThresholds: thresholds })
      .then(onSaved)
      .catch(onError)
      .finally(() => setSaving(false));
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface/80 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-bold">Seuils de difficulté</div>
        <div className="text-sm text-faint">
          Vues YouTube minimales par niveau, en millions. Le niveau d’un clip ne dépend que de ses vues.
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-5">
        {DIFFICULTIES.map((d, i) => (
          <div key={d.level} className="rounded-xl bg-surface-2/60 p-3">
            <DifficultyPill level={d.level} className="px-2 py-0.5 text-[10px]" />
            <div className="mt-3 flex items-center gap-1.5 text-sm text-muted">
              {i < 4 ? (
                <>
                  ≥
                  <input
                    value={values[i]}
                    inputMode="decimal"
                    aria-label={`Vues minimales pour ${d.name}, en millions`}
                    onChange={(e) => {
                      setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)));
                      setNotice(null);
                    }}
                    className={cx(inputClass, 'h-9! max-w-24 px-2 text-right font-mono text-sm')}
                  />
                  M
                </>
              ) : (
                <span className="flex h-9 items-center font-mono">&lt; {values[3]} M</span>
              )}
            </div>
            <div className="mt-2 text-sm">
              <b>{counts[i]}</b> <span className="text-faint">clip{counts[i] > 1 ? 's' : ''}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!valid || !changed || saving} className="h-10 text-sm">
          {saving ? 'Enregistrement…' : 'Enregistrer les seuils'}
        </Button>
        <Button
          variant="ghost"
          className="h-10 text-sm"
          title="Autant de clips dans chaque niveau (dépend de la composition du catalogue)"
          onClick={() => propose('balanced')}
        >
          Proposer : niveaux équilibrés
        </Button>
        <Button
          variant="ghost"
          className="h-10 text-sm"
          title="Paliers réguliers (échelle logarithmique) entre le clip le plus vu et le moins vu"
          onClick={() => propose('spread')}
        >
          Proposer : échelle des vues
        </Button>
        <Button
          variant="ghost"
          className="h-10 text-sm"
          onClick={() => {
            setValues(DEFAULT_VIEW_THRESHOLDS.map(toMillions));
            setNotice(null);
          }}
        >
          Valeurs par défaut
        </Button>
        {!valid && <span className="text-sm text-expert">Les seuils doivent être positifs et décroissants.</span>}
        {valid && notice && <span className="text-sm text-medium">{notice}</span>}
        {forced > 0 && (
          <span className="text-sm text-faint">
            {forced} clip{forced > 1 ? 's' : ''} à difficulté forcée (non concernés par les seuils)
          </span>
        )}
      </div>
    </div>
  );
}
