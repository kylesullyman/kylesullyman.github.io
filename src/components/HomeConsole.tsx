import { useCallback, useEffect, useState } from 'react';

import GameBoyColor from './gbc/GameBoyColor';
import type { GbcButtonEvent } from './gbc/input';

/**
 * Wide screens with a real pointer get the side panel; everything else
 * navigates to the standalone page. Keep in sync with the `.home-panel`
 * media query in Layout.
 */
const PANEL_QUERY = '(min-width: 64rem) and (hover: hover) and (pointer: fine)';

function findPanel(href: string) {
  return document.querySelector<HTMLElement>(`[data-home-panel="${href}"]`);
}

/** The href a `#projects`-style hash refers to, if it has a panel. */
function hrefFromHash() {
  const name = window.location.hash.slice(1);
  if (!name) return null;
  const href = `/${name}`;
  return findPanel(href) ? href : null;
}

/** How far the console turns toward an open panel, radians. */
const PANEL_LEAN = 0.32;

/**
 * Client-only island wrapping the 3D console.
 *
 * Kept separate from the page copy so the text renders as static HTML and
 * only this subtree waits on hydration + WebGL.
 */
export default function HomeConsole() {
  const [lastButton, setLastButton] = useState<string | null>(null);
  /** Href of the side panel showing, if any. */
  const [panel, setPanel] = useState<string | null>(null);

  const closePanel = useCallback(() => {
    setPanel(null);
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleButton = useCallback(
    (event: GbcButtonEvent) => {
      if (event.phase !== 'press') return;
      setLastButton(event.button);
      // B is "back" everywhere else on the console.
      if (event.button === 'b') closePanel();
    },
    [closePanel],
  );

  // Screen programs only *request* navigation; the page decides. On desktop
  // a link with a matching panel opens beside the console instead.
  const handleAction = useCallback(
    (detail: { type: string } & Record<string, unknown>) => {
      if (detail.type !== 'navigate' || typeof detail.href !== 'string') return;
      if (window.matchMedia(PANEL_QUERY).matches && findPanel(detail.href)) {
        setPanel(detail.href);
        // A hash, not a path: reloading lands back here with the panel open
        // rather than on the standalone page.
        history.replaceState(null, '', `#${detail.href.slice(1)}`);
        return;
      }
      window.location.href = detail.href;
    },
    [],
  );

  // Reflect the open panel onto the static markup outside this island.
  useEffect(() => {
    const home = document.querySelector<HTMLElement>('.home');
    if (panel) home?.setAttribute('data-panel', panel);
    else home?.removeAttribute('data-panel');

    document.querySelectorAll<HTMLElement>('[data-home-panel]').forEach((el) => {
      const open = el.dataset.homePanel === panel;
      el.classList.toggle('is-open', open);
      el.inert = !open;
      if (!open) {
        // Nothing keeps playing in a panel nobody can see.
        el.querySelectorAll('video').forEach((video) => video.pause());
      } else {
        el.scrollTop = 0;
      }
    });
  }, [panel]);

  // Close button, Escape, a shared #hash on load, and shrinking the window
  // below the breakpoint (where the panel has no room to exist).
  useEffect(() => {
    const mql = window.matchMedia(PANEL_QUERY);
    if (mql.matches) {
      const initial = hrefFromHash();
      if (initial) setPanel(initial);
    }

    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-home-panel-close]')) closePanel();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    const media = () => {
      if (!mql.matches) closePanel();
    };

    document.addEventListener('click', click);
    window.addEventListener('keydown', key);
    mql.addEventListener('change', media);
    return () => {
      document.removeEventListener('click', click);
      window.removeEventListener('keydown', key);
      mql.removeEventListener('change', media);
    };
  }, [closePanel]);

  useEffect(() => {
    if (!lastButton) return;
    const timer = window.setTimeout(() => setLastButton(null), 1200);
    return () => window.clearTimeout(timer);
  }, [lastButton]);

  return (
    <>
      <GameBoyColor
        onButton={handleButton}
        onAction={handleAction}
        lean={panel ? PANEL_LEAN : 0}
      />
      <p className="home-readout" aria-hidden="true">
        {lastButton ? `▸ ${lastButton.toUpperCase()}` : ' '}
      </p>
    </>
  );
}
