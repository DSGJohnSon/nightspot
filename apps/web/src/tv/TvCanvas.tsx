import { useLayoutEffect, useState, type ReactNode } from 'react';

export const TV_WIDTH = 1920;
export const TV_HEIGHT = 1080;

/**
 * L'écran TV est dessiné sur un canevas fixe 1920×1080, mis à l'échelle de la fenêtre :
 * le rendu est identique sur une TV 4K, un vidéoprojecteur ou un portable.
 */
export function TvCanvas({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / TV_WIDTH, window.innerHeight / TV_HEIGHT));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="stage fixed inset-0 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: TV_WIDTH, height: TV_HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
