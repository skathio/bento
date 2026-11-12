import { useState } from "react";
import { applyTheme, loadTheme, nextTheme, type Theme } from "../lib/theme.ts";

const LABEL: Record<Theme, string> = { auto: "Auto", light: "Light", dark: "Dark" };

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const cycle = () => {
    const next = nextTheme(theme);
    applyTheme(next);
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[theme]}. Switch theme`}
      className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted hover:text-ink"
    >
      {LABEL[theme]}
    </button>
  );
}
