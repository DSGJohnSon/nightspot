import { useEffect, useRef, useState } from 'react';
import { cx, Icon } from '../components/ui';
import { loadYouTube, YT_PLAYING, type YTPlayer } from '../lib/youtube';

/**
 * Lecteur YouTube superposé à la capture. Il est créé dès le début de la manche et pré-bufferisé
 * en muet, pour que l'image « prenne vie » instantanément au reveal.
 */
export function YouTubeReveal({ videoId, start, playing }: { videoId: string; start: number; playing: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);
  const [needsSound, setNeedsSound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let instance: YTPlayer | null = null;

    loadYouTube().then((YT) => {
      if (cancelled || !container.current) return;
      const target = document.createElement('div');
      container.current.append(target);
      instance = new YT.Player(target, {
        width: '100%',
        height: '100%',
        videoId,
        // cc_load_policy : sous-titres toujours affichés, pour le karaoké improvisé.
        playerVars: { start, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, rel: 0, cc_load_policy: 1 },
        events: {
          onReady: () => {
            if (cancelled || !instance) return;
            player.current = instance;
            instance.mute();
            instance.playVideo(); // pré-buffering, mis en pause dès que la lecture démarre
            setReady(true);
          },
          onStateChange: ({ data }) => {
            if (data !== YT_PLAYING) return;
            if (playingRef.current) setLive(true);
            else instance?.pauseVideo();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      instance?.destroy();
      player.current = null;
      container.current?.replaceChildren();
    };
  }, [videoId, start]);

  useEffect(() => {
    const p = player.current;
    if (!p || !ready) return;
    if (!playing) {
      p.pauseVideo();
      setLive(false);
      return;
    }
    p.seekTo(start, true);
    p.unMute();
    p.setVolume(100);
    p.playVideo();
    // Si le lecteur ne démarre pas (pub, réseau lent), on l'affiche quand même.
    const showAnyway = setTimeout(() => setLive(true), 2500);
    const checkSound = setTimeout(() => setNeedsSound(p.isMuted()), 1500);
    return () => {
      clearTimeout(showAnyway);
      clearTimeout(checkSound);
    };
  }, [playing, ready, start]);

  return (
    <div
      className={cx(
        'absolute inset-0 transition-opacity duration-700',
        playing && live ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div ref={container} className="size-full [&>iframe]:size-full" />
      {needsSound && (
        <button
          type="button"
          onClick={() => {
            player.current?.unMute();
            setNeedsSound(false);
          }}
          className="absolute bottom-6 right-6 flex items-center gap-3 rounded-full bg-accent px-6 py-3 text-xl font-bold text-accent-ink"
        >
          <Icon name="volume" className="size-6" />
          Activer le son
        </button>
      )}
    </div>
  );
}
