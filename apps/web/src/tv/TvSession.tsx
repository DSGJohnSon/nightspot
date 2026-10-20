import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, Icon, Label, Logo } from '../components/ui';
import { useSessionView, useWakeLock } from '../lib/session';
import { socket } from '../lib/socket';
import { hostTokenKey, store } from '../lib/storage';
import { TvCanvas } from './TvCanvas';
import { TvLobby } from './TvLobby';
import { TvPodium } from './TvPodium';
import { TvRound } from './TvRound';

export function TvSession() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const token = store.get(hostTokenKey(code));
  const [error, setError] = useState<string | null>(token ? null : 'Cette partie a été créée sur un autre écran.');

  const { view, offset } = useSessionView(() => {
    if (!token) return;
    socket.emit('host:resume', { code, hostToken: token }, (res) => {
      if (!res.ok) setError(res.error);
    });
  });
  useWakeLock();

  const phase = view?.phase;
  const start = () => socket.emit('host:start');
  const next = () => socket.emit('host:next');

  // Télécommande minimale : Entrée / Espace / → pour avancer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['Enter', ' ', 'ArrowRight'].includes(e.key)) return;
      if (e.target instanceof HTMLButtonElement) return; // le bouton gère déjà sa propre activation
      e.preventDefault();
      if (phase === 'lobby') start();
      else if (phase === 'reveal' || phase === 'scores') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  let screen;
  if (error) {
    screen = (
      <div className="flex h-full flex-col items-center justify-center gap-8">
        <Logo className="text-8xl" />
        <div className="text-4xl font-bold">{error}</div>
        <Button onClick={() => navigate('/tv')} className="h-16 px-10 text-xl">
          Créer une nouvelle partie
        </Button>
      </div>
    );
  } else if (!view) {
    screen = <div className="flex h-full items-center justify-center text-3xl text-muted">Connexion…</div>;
  } else if (view.phase === 'lobby') {
    screen = <TvLobby view={view} onStart={start} />;
  } else if (view.phase === 'podium') {
    screen = <TvPodium view={view} />;
  } else {
    // prepare → question → reveal → scores : même écran, pour que le clip continue pendant le classement.
    screen = <TvRound key={view.round?.index} view={view} offset={offset} onNext={next} />;
  }

  return (
    <TvCanvas>
      {screen}
      <SoundHint />
    </TvCanvas>
  );
}

/** Les navigateurs bloquent le son tant qu'on n'a pas interagi avec la page (ex. après un rechargement). */
function SoundHint() {
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  const [active, setActive] = useState(() => nav.userActivation?.hasBeenActive ?? true);

  useEffect(() => {
    if (active) return;
    const activate = () => setActive(true);
    window.addEventListener('pointerdown', activate, { once: true });
    window.addEventListener('keydown', activate, { once: true });
    return () => {
      window.removeEventListener('pointerdown', activate);
      window.removeEventListener('keydown', activate);
    };
  }, [active]);

  if (active) return null;
  return (
    <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-medium/40 bg-surface px-7 py-4 text-xl">
      <Icon name="volume" className="size-6 text-medium" />
      <span>
        Clique n'importe où sur cet écran pour <b>autoriser le son</b> des clips
      </span>
      <Label size="lg" className="ml-2">une seule fois</Label>
    </div>
  );
}
