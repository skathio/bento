import { useState, type ReactNode } from "react";
import { applyTheme, loadTheme, nextTheme, type Theme } from "../lib/theme.ts";

const LABEL: Record<Theme, string> = { auto: "Auto", light: "Light", dark: "Dark" };
const ICON: Record<Theme, ReactNode> = {
  auto: <><circle cx="12" cy="12" r="8" /><path d="M12 4v16a8 8 0 0 0 0-16Z" fill="currentColor" /></>,
  light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
};

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
      className="flex min-h-11 min-w-11 items-center gap-2 rounded-full border border-line px-3.5 text-sm font-medium text-muted hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICON[theme]}
      </svg>
      {LABEL[theme]}
    </button>
  );
}
