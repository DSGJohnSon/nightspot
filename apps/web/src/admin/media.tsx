import { type CandidateSource, DEFAULT_REVEAL_SEC, highlightWindow } from '@nightspot/shared';
import { useEffect, useRef, useState } from 'react';
import { Button, cx, Icon, Label } from '../components/ui';
import { loadYouTube, type YTPlayer } from '../lib/youtube';
import { formatTime } from './fields';

/**
 * Lecture du clip à l'instant où il démarrera au reveal, sous la capture ; arrêtable.
 * Une barre verte suit les `windowSec` secondes que le clip jouera au minimum en partie.
 */
export function RevealPreview({
  youtubeId,
  start,
  windowSec = DEFAULT_REVEAL_SEC,
}: {
  youtubeId: string;
  start: number;
  windowSec?: number;
}) {
  const [playing, setPlaying] = useState(false);
  const at = Math.max(0, Math.round(start));

  return (
    <div className="mt-3">
      {/* Changer d'instant recrée le lecteur au nouvel instant. */}
      {playing && <PreviewPlayer key={`${youtubeId}-${at}`} youtubeId={youtubeId} start={at} windowSec={windowSec} />}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {playing ? (
          <Button variant="ghost" className="h-10 text-sm" onClick={() => setPlaying(false)}>
            <Icon name="stop" className="size-4" />
            Arrêter l’aperçu
          </Button>
        ) : (
          <Button variant="ghost" className="h-10 text-sm" onClick={() => setPlaying(true)}>
            <Icon name="play" className="size-4" />
            Écouter le reveal à {formatTime(at)}
          </Button>
        )}
        <span className="text-sm text-muted">
          En partie, le clip joue au moins de <b className="font-mono text-ink">{formatTime(at)}</b> à{' '}
          <b className="font-mono text-ink">{formatTime(at + windowSec)}</b> ({windowSec} s).
        </span>
      </div>
    </div>
  );
}

function PreviewPlayer({ youtubeId, start, windowSec }: { youtubeId: string; start: number; windowSec: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;
    let poll = 0;
    loadYouTube().then((YT) => {
      if (cancelled || !container.current) return;
      const target = document.createElement('div');
      container.current.append(target);
      player = new YT.Player(target, {
        width: '100%',
        height: '100%',
        videoId: youtubeId,
        playerVars: { start, autoplay: 1, cc_load_policy: 1, rel: 0, playsinline: 1 },
        events: { onReady: () => player?.playVideo() },
      });
      // Position réelle de lecture : une pub ou un chargement ne décalent pas la barre.
      poll = window.setInterval(() => {
        const t = player?.getCurrentTime?.();
        if (typeof t === 'number' && t > 0) setElapsed(t - start);
      }, 250);
    });
    return () => {
      cancelled = true;
      clearInterval(poll);
      player?.destroy();
      container.current?.replaceChildren();
    };
  }, [youtubeId, start]);

  const progress = Math.min(1, Math.max(0, elapsed / windowSec));
  const done = elapsed >= windowSec;

  return (
    <div className="overflow-hidden rounded-2xl bg-black">
      <div ref={container} className="aspect-video [&>iframe]:size-full" />
      <div className="bg-surface-2 px-3 pb-2 pt-2.5">
        <div className="h-2 overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 font-mono text-[11px] text-muted">
          <span>{formatTime(start)}</span>
          <span className="truncate font-sans">
            {done
              ? `${windowSec} s écoulées : le classement s’affiche, le clip continue jusqu’à « Manche suivante »`
              : `Durée minimale au reveal : ${Math.floor(Math.max(0, elapsed))} / ${windowSec} s`}
          </span>
          <span>{formatTime(start + windowSec)}</span>
        </div>
      </div>
    </div>
  );
}

/** « Pic n°1 · 42 % », « Repère 35 % », « Choisi à la main »… */
export function describeSource(source: CandidateSource | undefined): string | null {
  if (!source) return null;
  if (source.kind === 'peak') return `Pic n°${source.rank} · ${Math.round(source.intensity * 100)} %`;
  if (source.kind === 'fixed') return `Repère ${Math.round(source.ratio * 100)} % du clip`;
  if (source.kind === 'youtube') return `Image YouTube ~${Math.round(source.ratio * 100)} %`;
  if (source.kind === 'upload') return 'Capture importée';
  return 'Choisi à la main';
}

/** Convertit une image (capture d'écran, fichier) en JPEG d'au plus 1920 px de large. */
async function toJpegDataUrl(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1920 / img.naturalWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Zone pour fournir sa propre capture : coller (Ctrl+V après un clic dans la zone), glisser une image
 * ou choisir un fichier. Indispensable pour les vidéos que YouTube interdit de télécharger.
 */
export function CapturePaste({ busy, onImage }: { busy: boolean; onImage: (jpegDataUrl: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (blob: Blob | null | undefined) => {
    if (!blob || !blob.type.startsWith('image/')) return setError('Ce n’est pas une image.');
    setError(null);
    try {
      onImage(await toJpegDataUrl(blob));
    } catch {
      setError('Image illisible.');
    }
  };

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label="Coller ou importer une capture d’écran"
      onPaste={(e) => {
        const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
        if (!item) return;
        e.preventDefault();
        void handle(item.getAsFile());
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handle(e.dataTransfer.files[0]);
      }}
      className="mt-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted outline-none transition focus:border-accent/60 focus:bg-accent/5"
    >
      {busy ? (
        'Envoi de la capture…'
      ) : (
        <>
          Clique ici puis <b className="text-ink">Ctrl+V</b> pour coller une capture d’écran, glisse une image, ou{' '}
          <button type="button" className="text-accent hover:underline" onClick={() => input.current?.click()}>
            choisis un fichier
          </button>
          .
        </>
      )}
      {error && <div className="mt-1 text-xs text-expert">{error}</div>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Courbe « Most replayed » de YouTube, avec l'emplacement des captures candidates (numérotées comme
 * les vignettes). Survol : instant et taux de réécoute ; clic : propose cet instant pour une capture.
 */
export function ReplayCurve({
  heatmap,
  duration,
  candidates,
  chosen,
  onPick,
  revealSec = DEFAULT_REVEAL_SEC,
}: {
  heatmap: number[];
  duration: number;
  candidates: { at: number }[];
  chosen: number;
  onPick: (seconds: number) => void;
  revealSec?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { from, to } = highlightWindow(duration);
  const pct = (sec: number) => (sec / duration) * 100;
  const replayAt = (sec: number) => heatmap[Math.min(heatmap.length - 1, Math.floor((sec / duration) * heatmap.length))] ?? 0;
  const toSeconds = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  };

  // Tracé en coordonnées 0-1000 × 0-100, étiré à la largeur du bloc (trait d'épaisseur constante).
  const points = heatmap.map((v, i) => `${(((i + 0.5) / heatmap.length) * 1000).toFixed(1)},${(100 - v * 90).toFixed(1)}`);
  const line = `M${points.join(' L')}`;
  const area = `M0,100 L${points.join(' L')} L1000,100 Z`;

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <Label>Courbe de réécoute YouTube</Label>
        <span className="text-[11px] text-faint">clic sur la courbe : choisir cet instant</span>
      </div>
      <div
        ref={box}
        className="relative mt-4 h-20 cursor-crosshair select-none rounded-lg bg-surface-2/40"
        onPointerMove={(e) => setHover(toSeconds(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onPick(Math.round(toSeconds(e.clientX)))}
      >
        {/* Début et fin, où l'on ne cherche pas de pic. */}
        <div className="absolute inset-y-0 left-0 rounded-l-lg bg-black/40" style={{ width: `${pct(from)}%` }} />
        <div className="absolute inset-y-0 right-0 rounded-r-lg bg-black/40" style={{ width: `${100 - pct(to)}%` }} />

        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <path d={area} fill="var(--color-accent)" fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Ce que le clip jouera au minimum au reveal, depuis la capture choisie. */}
        {candidates[chosen] && (
          <div
            className="pointer-events-none absolute bottom-0 h-1.5 rounded-full bg-accent"
            style={{
              left: `${pct(candidates[chosen].at)}%`,
              width: `${pct(Math.min(revealSec, duration - candidates[chosen].at))}%`,
            }}
          />
        )}

        {candidates.map((c, i) => (
          <div key={`${c.at}-${i}`} className="pointer-events-none absolute inset-y-0" style={{ left: `${pct(c.at)}%` }}>
            <div className={cx('absolute inset-y-0 w-px', i === chosen ? 'bg-ink' : 'bg-muted/60')} />
            <span
              className={cx(
                'absolute -top-2.5 -translate-x-1/2 rounded-full px-1.5 font-mono text-[10px] font-bold ring-2 ring-surface',
                i === chosen ? 'bg-ink text-bg' : 'bg-surface-2 text-muted',
              )}
            >
              {i + 1}
            </span>
          </div>
        ))}

        {hover != null && (
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pct(hover)}%` }}>
            <div className="absolute inset-y-0 w-px bg-ink/50" />
            <div
              className={cx(
                'absolute top-2 whitespace-nowrap rounded-md bg-bg/95 px-2 py-1 text-xs ring-1 ring-line',
                pct(hover) < 12 ? 'translate-x-0' : pct(hover) > 88 ? '-translate-x-full' : '-translate-x-1/2',
              )}
            >
              <b className="font-mono">{formatTime(hover)}</b>
              <span className="text-muted"> · réécoute {Math.round(replayAt(hover) * 100)} %</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
        <span>0:00</span>
        <span className="font-sans">
          trait vert : {revealSec} s jouées au reveal · zones sombres : début et fin, ignorés pour les pics
        </span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
