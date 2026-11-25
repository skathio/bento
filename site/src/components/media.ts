import { useSyncExternalStore } from "react";

/** Tailwind's lg breakpoint, where the plan column turns sticky and scrolls on its own. */
export const LG_UP = "(min-width: 64rem)";

export const isLgUp = (): boolean => window.matchMedia(LG_UP).matches;

export function onLgUpChange(cb: () => void): () => void {
  const mql = window.matchMedia(LG_UP);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

/** Whether the page is at lg or wider. The server render and first paint assume the phone. */
export const useLgUp = (): boolean => useSyncExternalStore(onLgUpChange, isLgUp, () => false);
