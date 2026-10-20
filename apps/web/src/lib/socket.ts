import type { ClientToServerEvents, ServerToClientEvents } from '@nightspot/shared';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Une seule connexion par onglet ; elle se reconnecte toute seule après une coupure. */
export const socket: AppSocket = io({ autoConnect: false });
