import { Link } from 'react-router';
import { Icon, Logo } from './components/ui';

export function Home() {
  return (
    <div className="stage flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <Logo className="text-6xl sm:text-8xl" />
      <p className="mt-4 text-center text-muted">Le jeu de soirée sur grand écran. Les téléphones servent de buzzers.</p>

      <div className="mt-12 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <Link
          to="/join"
          className="rounded-3xl border border-accent/40 bg-accent/10 p-6 transition hover:bg-accent/15 active:scale-[0.99]"
        >
          <Icon name="phone" className="size-8 text-accent" />
          <div className="mt-4 text-2xl font-bold">Rejoindre une partie</div>
          <div className="mt-1 text-muted">Avec le code affiché sur la TV</div>
        </Link>
        <Link
          to="/tv"
          className="rounded-3xl border border-line bg-surface/80 p-6 transition hover:bg-surface-2 active:scale-[0.99]"
        >
          <Icon name="tv" className="size-8 text-muted" />
          <div className="mt-4 text-2xl font-bold">Lancer sur la TV</div>
          <div className="mt-1 text-muted">Crée une partie et affiche le QR code</div>
        </Link>
      </div>
    </div>
  );
}
