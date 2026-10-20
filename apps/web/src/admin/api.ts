import type { AdminCatalog, AdminClip, CatalogSettings, Draft, DraftFields, ViewsJob } from '@nightspot/shared';

/** Session admin expirée ou absente : l'interface revient à l'écran de connexion. */
export class AuthError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) throw new AuthError(json.error ?? 'Connexion requise.');
  if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
  return json;
}

export interface ClipUpdate extends DraftFields {
  revealAt: number;
  difficultyOverride: number | null;
}

export const adminApi = {
  status: () => request<{ configured: boolean; loggedIn: boolean }>('GET', '/status'),
  login: (password: string) => request<{ ok: true }>('POST', '/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/logout'),

  catalog: () => request<AdminCatalog>('GET', '/catalog'),
  updateClip: (id: string, update: ClipUpdate) => request<AdminClip>('PUT', `/clips/${id}`, update),
  clipFrame: (id: string, at: number) => request<AdminClip>('POST', `/clips/${id}/frame`, { at }),
  clipImage: (id: string, at: number, image: string) => request<AdminClip>('POST', `/clips/${id}/image`, { at, image }),
  deleteClip: (id: string) => request<{ ok: true }>('DELETE', `/clips/${id}`),
  refreshViews: () => request<ViewsJob>('POST', '/views/refresh'),
  saveSettings: (settings: CatalogSettings) => request<AdminCatalog>('PUT', '/settings', settings),

  drafts: () => request<Draft[]>('GET', '/drafts'),
  createDrafts: (urls: string[]) => request<Draft[]>('POST', '/drafts', { urls }),
  draftFrame: (id: string, at: number) => request<Draft>('POST', `/drafts/${id}/frames`, { at }),
  draftImage: (id: string, at: number, image: string) => request<Draft>('POST', `/drafts/${id}/image`, { at, image }),
  draftSearch: (id: string, query: string) => request<Draft>('POST', `/drafts/${id}/search`, { query }),
  draftVideo: (id: string, youtubeId: string) => request<Draft[]>('POST', `/drafts/${id}/video`, { youtubeId }),
  retryDraft: (id: string) => request<Draft[]>('POST', `/drafts/${id}/retry`),
  confirmDraft: (id: string, body: { fields: DraftFields; candidate: number; matchIndex: number | null }) =>
    request<AdminClip>('POST', `/drafts/${id}/confirm`, body),
  discardDraft: (id: string) => request<{ ok: true }>('DELETE', `/drafts/${id}`),

  createTheme: (name: string) => request<AdminCatalog>('POST', '/themes', { name }),
  renameTheme: (id: string, name: string) => request<AdminCatalog>('PATCH', `/themes/${id}`, { name }),
  deleteTheme: (id: string) => request<AdminCatalog>('DELETE', `/themes/${id}`),
};
