import { useEffect, useState } from 'react';

/**
 * URL à encoder dans le QR code. Si la TV tourne sur « localhost », les téléphones ne peuvent pas
 * l'atteindre : on utilise alors l'adresse de la machine sur le réseau local.
 */
export function useJoinUrl(code: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const port = location.port ? `:${location.port}` : '';
    fetch('/api/info')
      .then((res) => res.json() as Promise<{ publicUrl: string | null; lanAddresses: string[] }>)
      .then((info) => {
        const lan = info.lanAddresses[0];
        const base = info.publicUrl ?? (local && lan ? `${location.protocol}//${lan}${port}` : location.origin);
        setUrl(`${base.replace(/\/$/, '')}/join?code=${code}`);
      })
      .catch(() => setUrl(`${location.origin}/join?code=${code}`));
  }, [code]);

  return url;
}
