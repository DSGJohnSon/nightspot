import type { SessionView } from '@nightspot/shared';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Button, Label, Logo, OfflineTag, PlayerDot } from '../components/ui';
import { useJoinUrl } from '../lib/joinUrl';

const HOW_TO_PLAY = [
  { title: 'Scanne le QR code', text: 'ou ouvre l’adresse affichée et tape le code' },
  { title: 'Devine le clip', text: 'cherche le titre ou l’artiste sur ton téléphone' },
  { title: 'Sois rapide', text: 'plus tu valides tôt, plus tu marques de points' },
];

export function TvLobby({ view, onStart }: { view: SessionView; onStart: () => void }) {
  const joinUrl = useJoinUrl(view.code);
  const players = view.players;

  return (
    <div className="flex h-full flex-col px-24 py-16">
      <header className="flex items-center justify-between">
        <Logo className="text-[72px]" />
        <Label size="lg">
          Guess the Clip · {view.totalRounds} manches
        </Label>
      </header>

      <div className="mt-14 grid flex-1 grid-cols-[auto_1fr] gap-28">
        <div className="flex flex-col items-center">
          <div className="rounded-[32px] bg-white p-7 shadow-[0_0_120px_-30px_rgb(30_215_96/0.6)]">
            {joinUrl ? <QRCodeSVG value={joinUrl} size={340} level="M" /> : <div className="size-[340px]" />}
          </div>
          <Label size="lg" className="mt-10">Code de la partie</Label>
          <div className="mt-2 pl-[0.18em] font-mono text-[132px] font-bold leading-none tracking-[0.18em] text-accent [text-shadow:0_0_50px_rgb(30_215_96/0.45)]">
            {view.code}
          </div>
          {joinUrl && (
            <div className="mt-4 font-mono text-xl text-muted">{joinUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '')}</div>
          )}
        </div>

        <div className="flex min-h-0 flex-col">
          <Label size="lg">Joueurs · {players.length}</Label>
          <div className="mt-6 flex flex-wrap content-start gap-4">
            <AnimatePresence>
              {players.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: p.connected ? 1 : 0.6 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="flex items-center gap-4 rounded-2xl border border-line bg-surface/90 px-6 py-4 text-3xl font-semibold"
                >
                  <PlayerDot color={p.color} size={18} offline={!p.connected} />
                  {p.name}
                  {!p.connected && <OfflineTag className="text-sm" />}
                </motion.div>
              ))}
            </AnimatePresence>
            {!players.length && (
              <div className="animate-pulse pt-2 text-3xl text-faint">En attente des joueurs… scanne le QR code !</div>
            )}
          </div>

          <div className="mt-auto grid grid-cols-3 gap-4">
            {HOW_TO_PLAY.map((step, i) => (
              <div key={step.title} className="rounded-2xl border border-line bg-surface/60 p-6">
                <div className="font-mono text-3xl font-bold text-accent">{i + 1}</div>
                <div className="mt-3 text-2xl font-bold">{step.title}</div>
                <div className="mt-1 text-lg text-muted">{step.text}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-end gap-6">
            <span className="text-lg text-muted">ou appuie sur Entrée</span>
            <Button onClick={onStart} disabled={!players.length} className="h-20 px-12 text-2xl">
              Lancer la partie
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
