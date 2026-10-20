import type { DraftFields, Theme } from '@nightspot/shared';
import type { ReactNode } from 'react';
import { cx, Label } from '../components/ui';

export const inputClass =
  'h-11 w-full rounded-xl border border-line bg-surface-2/60 px-3 text-base outline-none placeholder:text-faint focus:border-accent/60';

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function ThemePicker({ themes, value, onChange }: { themes: Theme[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!themes.length) return <div className="text-sm text-faint">Aucun thème : crée-en dans l’onglet Thèmes.</div>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {themes.map((t) => {
        const active = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(active ? value.filter((v) => v !== t.id) : [...value, t.id])}
            className={cx(
              'h-8 rounded-full px-3 text-sm font-semibold transition',
              active ? 'bg-accent text-accent-ink' : 'bg-accent/10 text-accent hover:bg-accent/20',
            )}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

/** Formulaire titre / artiste / invités / année / alias / thèmes, partagé par l'ajout et l'édition. */
export interface FieldsForm {
  title: string;
  artist: string;
  featuring: string;
  aliases: string;
  year: string;
  themes: string[];
}

export function toForm(fields: DraftFields): FieldsForm {
  return {
    title: fields.title,
    artist: fields.artist,
    featuring: fields.featuring.join(', '),
    aliases: fields.aliases.join(' | '),
    year: fields.year ? String(fields.year) : '',
    themes: fields.themes,
  };
}

export function fromForm(form: FieldsForm): DraftFields {
  const list = (text: string, sep: RegExp) => text.split(sep).map((s) => s.trim()).filter(Boolean);
  const year = parseInt(form.year, 10);
  return {
    title: form.title.trim(),
    artist: form.artist.trim(),
    featuring: list(form.featuring, /,/),
    aliases: list(form.aliases, /\|/),
    year: year >= 1900 && year <= 2100 ? year : null,
    themes: form.themes,
  };
}

export function ClipFields({ form, themes, onChange }: { form: FieldsForm; themes: Theme[]; onChange: (f: FieldsForm) => void }) {
  const set = (patch: Partial<FieldsForm>) => onChange({ ...form, ...patch });
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Titre" className="col-span-2">
        <input className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Artiste">
        <input className={inputClass} value={form.artist} onChange={(e) => set({ artist: e.target.value })} />
      </Field>
      <Field label="Année de sortie" hint="Première sortie du titre (album ou single)">
        <input
          className={inputClass}
          inputMode="numeric"
          value={form.year}
          onChange={(e) => set({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })}
        />
      </Field>
      <Field label="Featuring" hint="Séparés par des virgules" className="col-span-2">
        <input className={inputClass} value={form.featuring} onChange={(e) => set({ featuring: e.target.value })} />
      </Field>
      <Field label="Autres titres acceptés" hint="Séparés par | (ex. titre original, surnom)" className="col-span-2">
        <input className={inputClass} value={form.aliases} onChange={(e) => set({ aliases: e.target.value })} />
      </Field>
      <Field label="Thèmes" className="col-span-2">
        <ThemePicker themes={themes} value={form.themes} onChange={(v) => set({ themes: v })} />
      </Field>
    </div>
  );
}

/** « 1:23 » ou « 83 » → 83 secondes. */
export function parseTime(text: string): number | null {
  const m = text.trim().match(/^(?:(\d+):)?(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  return (m[1] ? parseInt(m[1], 10) * 60 : 0) + parseFloat(m[2]);
}

export function formatTime(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
export const formatViews = (views?: number) => (views == null ? 'vues inconnues' : `${compact.format(views)} vues`);

export function formatLastPlayed(at: number): string {
  if (!at) return 'jamais joué';
  const days = Math.floor((Date.now() - at) / 86_400_000);
  return days === 0 ? 'joué aujourd’hui' : days === 1 ? 'joué hier' : `joué il y a ${days} j`;
}
