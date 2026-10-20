import type { SessionSettings } from '@nightspot/shared';
import { Session } from './session';
import type { IO } from './types';

const sessions = new Map<string, Session>();

// Sans I ni O pour éviter la confusion avec 1 et 0.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const IDLE_LIMIT_MS = 6 * 60 * 60 * 1000;

function newCode(): string {
  for (;;) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    if (!sessions.has(code)) return code;
  }
}

export function createSession(settings: SessionSettings, io: IO): Session {
  const session = Session.create(newCode(), settings, io);
  sessions.set(session.code, session);
  return session;
}

export function getSession(code: unknown): Session | undefined {
  return typeof code === 'string' ? sessions.get(code.trim().toUpperCase()) : undefined;
}

// Les sessions vivent en mémoire : on oublie celles abandonnées depuis plusieurs heures.
setInterval(() => {
  const now = Date.now();
  for (const [code, session] of sessions) {
    if (now - session.lastActivity > IDLE_LIMIT_MS) {
      session.dispose();
      sessions.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();
