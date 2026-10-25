import { useCallback, useEffect, useState } from 'react';

import GameBoyColor from './gbc/GameBoyColor';
import type { GbcButtonEvent } from './gbc/input';

/**
 * Client-only island wrapping the 3D console.
 *
 * Kept separate from the page copy so the text renders as static HTML and
 * only this subtree waits on hydration + WebGL.
 */
export default function HomeConsole() {
  const [lastButton, setLastButton] = useState<string | null>(null);

  const handleButton = useCallback((event: GbcButtonEvent) => {
    if (event.phase !== 'press') return;
    setLastButton(event.button);
  }, []);

  // Screen programs only *request* navigation; the page decides.
  const handleAction = useCallback(
    (detail: { type: string } & Record<string, unknown>) => {
      if (detail.type === 'navigate' && typeof detail.href === 'string') {
        window.location.href = detail.href;
      }
    },
    [],
  );

  useEffect(() => {
    if (!lastButton) return;
    const timer = window.setTimeout(() => setLastButton(null), 1200);
    return () => window.clearTimeout(timer);
  }, [lastButton]);

  return (
    <>
      <GameBoyColor onButton={handleButton} onAction={handleAction} />
      <p className="home-readout" aria-hidden="true">
        {lastButton ? `\u25b8 ${lastButton.toUpperCase()}` : '\u00a0'}
      </p>
    </>
  );
}
