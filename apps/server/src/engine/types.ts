import type { ClientToServerEvents, ServerToClientEvents } from '@nightspot/shared';
import type { Server, Socket } from 'socket.io';

export interface SocketData {
  code?: string;
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
