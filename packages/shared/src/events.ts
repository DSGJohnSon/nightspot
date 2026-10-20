import type { SessionSettings, SessionView, TrackChoice } from './types';

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  'host:create': (
    settings: SessionSettings,
    ack: (res: Ack<{ code: string; hostToken: string }>) => void,
  ) => void;
  'host:resume': (payload: { code: string; hostToken: string }, ack: (res: Ack) => void) => void;
  'host:start': () => void;
  /** La TV a préchargé la capture : le chrono peut démarrer. */
  'host:ready': () => void;
  /** Passe à l'écran suivant (fin du reveal, manche suivante, podium). */
  'host:next': () => void;

  'player:join': (
    payload: { code: string; name: string; token?: string },
    ack: (res: Ack<{ playerId: string; token: string }>) => void,
  ) => void;
  'player:answer': (answer: TrackChoice, ack: (res: Ack<{ elapsedMs: number }>) => void) => void;
  /** Bonus année, pendant le reveal uniquement ; les points sont crédités immédiatement. */
  'player:year': (year: number, ack: (res: Ack<{ points: number }>) => void) => void;
}

export interface ServerToClientEvents {
  state: (view: SessionView) => void;
}
