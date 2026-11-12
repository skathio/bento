// Display formatting for the planner. Pure, so it is unit-tested.

/** Minutes as an elapsed clock: 5 → "0:05", 135 → "2:15". */
export function fmtClock(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes as a duration: 45 → "45 min", 180 → "3 h", 150 → "2 h 30 min". */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Millilitres, switching to litres from 1000: 750 → "750 ml", 1500 → "1.5 L". */
export function fmtFluid(ml: number): string {
  if (ml >= 1000) return `${(ml / 1000).toFixed(1).replace(/\.0$/, "")} L`;
  return `${Math.round(ml)} ml`;
}

export const fmtGrams = (g: number): string => `${Math.round(g)} g`;
export const fmtMg = (mg: number): string => `${Math.round(mg)} mg`;
export const fmtBand = ([lo, hi]: readonly [number, number], unit: string): string => (lo === hi ? `${hi} ${unit}` : `${lo}-${hi} ${unit}`);

/** Seconds per km as a running pace: 330 → "5:30". 0 (unknown) → "". */
export function fmtPace(secKm: number): string {
  if (secKm <= 0) return "";
  const s = Math.round(secKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A typed pace ("5:30", "5.30" or "5") as seconds per km, 0 when blank, or null when unreadable. */
export function parsePace(text: string): number | null {
  const t = text.trim();
  if (t === "") return 0;
  const m = /^(\d{1,2})(?:[:.](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const sec = Number(m[2] ?? 0);
  if (sec > 59) return null;
  const total = Number(m[1]) * 60 + sec;
  return total >= 150 && total <= 1200 ? total : null;
}
