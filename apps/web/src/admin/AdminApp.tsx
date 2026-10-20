import type { AdminCatalog } from '@nightspot/shared';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button, cx, Label, Logo } from '../components/ui';
import { AddTab } from './AddTab';
import { adminApi, AuthError } from './api';
import { CatalogTab } from './CatalogTab';
import { inputClass } from './fields';
import { ThemesTab } from './ThemesTab';

type Tab = 'catalog' | 'add' | 'themes';

export function AdminApp() {
  const [status, setStatus] = useState<'loading' | 'disabled' | 'login' | 'ready'>('loading');
  const [tab, setTab] = useState<Tab>('catalog');
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = useCallback((err: unknown) => {
    if (err instanceof AuthError) setStatus('login');
    else setError((err as Error).message);
  }, []);

  const reload = useCallback(async () => {
    try {
      setCatalog(await adminApi.catalog());
      setError(null);
    } catch (err) {
      handle(err);
    }
  }, [handle]);

  useEffect(() => {
    adminApi
      .status()
      .then((s) => setStatus(!s.configured ? 'disabled' : s.loggedIn ? 'ready' : 'login'))
      .catch(() => setError('Serveur injoignable.'));
  }, []);

  useEffect(() => {
    if (status === 'ready') void reload();
  }, [status, reload]);

  // Pendant la mise à jour des vues, on suit la progression.
  useEffect(() => {
    if (!catalog?.viewsJob.running) return;
    const id = setInterval(reload, 2000);
    return () => clearInterval(id);
  }, [catalog?.viewsJob.running, reload]);

  if (status === 'loading') return <Centered>{error ?? 'Chargement…'}</Centered>;

  if (status === 'disabled') {
    return (
      <Centered>
        <div className="max-w-lg text-left">
          <div className="text-2xl font-bold">Admin désactivé</div>
          <p className="mt-3 text-muted">
            Définis un mot de passe dans <code className="text-ink">apps/server/.env</code> :
          </p>
          <pre className="mt-3 rounded-xl bg-surface p-4 font-mono text-accent">ADMIN_PASSWORD=ton-mot-de-passe</pre>
          <p className="mt-3 text-muted">puis relance le serveur.</p>
        </div>
      </Centered>
    );
  }

  if (status === 'login') return <Login onDone={() => setStatus('ready')} />;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'catalog', label: `Catalogue${catalog ? ` · ${catalog.clips.length}` : ''}` },
    { id: 'add', label: 'Ajouter des clips' },
    { id: 'themes', label: 'Thèmes' },
  ];

  return (
    <div className="stage min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo className="text-4xl" />
            <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-bold uppercase tracking-widest text-muted">admin</span>
          </div>
          <nav className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cx(
                  'h-10 rounded-full px-5 font-semibold transition',
                  tab === t.id ? 'bg-accent text-accent-ink' : 'bg-accent/10 text-accent hover:bg-accent/20',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-5 text-sm">
            <Link to="/tv" className="text-muted hover:text-ink">
              Lancer une partie →
            </Link>
            <button
              type="button"
              className="text-faint hover:text-muted"
              onClick={() => adminApi.logout().finally(() => setStatus('login'))}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && <div className="mb-6 rounded-xl border border-expert/40 bg-expert/10 px-4 py-3 text-expert">{error}</div>}
        {!catalog ? (
          <div className="text-muted">Chargement du catalogue…</div>
        ) : tab === 'catalog' ? (
          <CatalogTab catalog={catalog} onChange={reload} onError={handle} />
        ) : tab === 'add' ? (
          <AddTab themes={catalog.themes} onAdded={reload} onError={handle} />
        ) : (
          <ThemesTab catalog={catalog} onChange={setCatalog} onError={handle} />
        )}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    adminApi
      .login(password)
      .then(onDone)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <Centered>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <Logo className="text-5xl" />
        <div>
          <Label>Mot de passe admin</Label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cx(inputClass, 'mt-2 h-12')}
          />
        </div>
        {error && <div className="text-expert">{error}</div>}
        <Button type="submit" disabled={busy || !password} className="h-12 w-full">
          Se connecter
        </Button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="stage flex min-h-dvh flex-col items-center justify-center px-6 text-center text-muted">{children}</div>;
}
