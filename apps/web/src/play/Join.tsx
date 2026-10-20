import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Label, Logo } from '../components/ui';
import { socket } from '../lib/socket';
import { NAME_KEY, playerTokenKey, store } from '../lib/storage';

export function Join() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [name, setName] = useState(store.get(NAME_KEY) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    socket.connect();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    if (cleanCode.length !== 4) return setError('Le code fait 4 lettres.');
    if (!cleanName) return setError('Choisis un pseudo.');

    setBusy(true);
    setError(null);
    store.set(NAME_KEY, cleanName);
    const token = store.get(playerTokenKey(cleanCode)) ?? undefined;
    socket.emit('player:join', { code: cleanCode, name: cleanName, token }, (res) => {
      setBusy(false);
      if (!res.ok) return setError(res.error);
      store.set(playerTokenKey(cleanCode), res.token);
      navigate(`/play/${cleanCode}`);
    });
  };

  return (
    <div className="stage flex min-h-dvh flex-col items-center px-5 pb-10 pt-16">
      <Logo className="text-5xl" />
      <form onSubmit={submit} className="mt-12 w-full max-w-sm space-y-7">
        <div>
          <Label>Code de la partie</Label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABCD"
            className="mt-2 h-20 w-full rounded-2xl border border-line bg-surface pl-[0.5em] text-center font-mono text-4xl font-bold tracking-[0.5em] text-accent outline-none placeholder:text-faint focus:border-accent/60"
          />
        </div>
        <div>
          <Label>Ton pseudo</Label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 16))}
            autoComplete="nickname"
            placeholder="Ex. Fred"
            className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface px-4 text-lg outline-none placeholder:text-faint focus:border-accent/60"
          />
        </div>
        {error && <div className="text-center text-expert">{error}</div>}
        <Button type="submit" disabled={busy} className="h-14 w-full text-lg">
          {busy ? 'Connexion…' : 'Rejoindre'}
        </Button>
      </form>
    </div>
  );
}
