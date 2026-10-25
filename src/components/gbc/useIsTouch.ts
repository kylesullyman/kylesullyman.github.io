/**
 * True when the primary input is touch and cannot hover.
 *
 * Deliberately a capability query, not a width breakpoint: a narrow desktop
 * window still has a mouse and should keep canvas dragging, while a large
 * tablet needs the hold-to-spin handle. The primary pointer query keeps
 * mouse-first laptops using desktop dragging.
 *
 * Returns false during SSR and on the first client render, then corrects
 * after mount. React would otherwise warn about a hydration mismatch, and
 * the handle is additive, so appearing a frame late is harmless.
 */

import { useEffect, useState } from 'react';

const QUERY = '(hover: none) and (pointer: coarse)';

export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const update = () => setIsTouch(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isTouch;
}
