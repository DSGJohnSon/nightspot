// localStorage peut être indisponible (navigation privée, stockage bloqué) : on ne plante jamais.
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignoré */
    }
  },
};

export const NAME_KEY = 'nightspot.name';
export const hostTokenKey = (code: string) => `nightspot.host.${code}`;
export const playerTokenKey = (code: string) => `nightspot.player.${code}`;
