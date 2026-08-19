"use client";

import * as React from "react";
import { cn } from "@mcpfy/ui";

/**
 * Light / dark / system, persisted.
 *
 * Three states, not two. "System" is the default and has to stay reachable:
 * a reader who never touches this should follow their OS, and one who
 * switched once should be able to hand control back.
 *
 * The chosen value is written to `data-theme` on the root element, which is
 * exactly what the token file keys off — no component branches on theme, only
 * the tokens move.
 */

export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "mcpfy-theme";

/**
 * Runs before first paint, from the document head.
 *
 * Without it the page renders in the system theme, then React hydrates and
 * corrects it — a white flash on every load for anyone who chose dark. This
 * has to be blocking and inline; a module would be too late.
 */
export const THEME_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (e) {
    // Private mode can throw on localStorage. Falling through leaves the
    // document unstamped, which is the system default — the right fallback.
  }
})();
`.trim();

const OPTIONS: { value: Theme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
        <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M8 1.4v1.5M8 13.1v1.5M14.6 8h-1.5M2.9 8H1.4M12.7 3.3l-1 1M4.3 11.7l-1 1M12.7 12.7l-1-1M4.3 4.3l-1-1"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
        <rect
          x="1.9"
          y="2.9"
          width="12.2"
          height="8.2"
          rx="1.4"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path d="M5.5 13.6h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true" fill="none">
        <path
          d="M13.2 9.6A5.6 5.6 0 016.4 2.8a5.6 5.6 0 106.8 6.8z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<Theme>("system");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* private mode */
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;

    if (next === "system") {
      root.removeAttribute("data-theme");
      try {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {
        /* private mode */
      }
      return;
    }

    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn(
        "flex items-center gap-px rounded-full border border-line-default bg-panel p-0.5",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        // Before mount every option renders unselected. Guessing the active
        // one server-side produces a hydration mismatch, since the answer
        // lives in localStorage.
        const selected = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => choose(option.value)}
            className={cn(
              "grid size-6 place-items-center rounded-full transition-colors",
              selected
                ? "bg-elevated text-hi shadow-[var(--edge-highlight)]"
                : "text-faint hover:text-fg",
            )}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
