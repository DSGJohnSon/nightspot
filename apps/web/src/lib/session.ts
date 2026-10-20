import type { SessionView } from '@nightspot/shared';
import { useEffect, useReducer, useRef, useState } from 'react';
import { socket } from './socket';

/**
 * Suit l'état de la session poussé par le serveur.
 * `onConnect` est rejoué à chaque (re)connexion pour se ré-identifier (hôte ou joueur).
 */
export function useSessionView(onConnect: () => void) {
  const [view, setView] = useState<SessionView | null>(null);
  const [offset, setOffset] = useState(0);
  const [connected, setConnected] = useState(socket.connected);
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

  useEffect(() => {
    const handleState = (next: SessionView) => {
      // Écart entre l'horloge du serveur et la nôtre, pour afficher les mêmes timers partout.
      setOffset(next.serverNow - Date.now());
      setView(next);
    };
    const handleConnect = () => {
      setConnected(true);
      onConnectRef.current();
    };
    const handleDisconnect = () => setConnected(false);

    socket.on('state', handleState);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) onConnectRef.current();
    else socket.connect();

    return () => {
      socket.off('state', handleState);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return { view, offset, connected };
}

/** Heure serveur, rafraîchie à intervalle régulier. */
export function useNow(offset: number, intervalMs = 100): number {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return Date.now() + offset;
}

/** Empêche l'écran de se mettre en veille (ignoré hors HTTPS). */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        // Contexte non sécurisé (http sur le réseau local) : tant pis.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !disposed) void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}
