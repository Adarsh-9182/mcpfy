"use client";

import * as React from "react";

/**
 * Words drifting slowly behind the page.
 *
 * The brief was floating bubbles carrying short words. The restraint that
 * makes it work rather than look like a screensaver: very low opacity, slow
 * uneven paths, a slight blur so nothing competes with real text for focus,
 * and `aria-hidden` so a screen reader is never read a wall of loose verbs.
 *
 * The words are the things MCPfy does. Decorative text that says nothing
 * about the product is just noise with better styling.
 */
const WORDS = [
  { text: "Deploy", left: 3, top: 8, size: 15, duration: 34, delay: 0 },
  { text: "Inspect", left: 86, top: 9, size: 13, duration: 41, delay: -6 },
  { text: "Trace", left: 2, top: 46, size: 12, duration: 38, delay: -13 },
  { text: "Route", left: 92, top: 40, size: 14, duration: 45, delay: -3 },
  { text: "Audit", left: 4, top: 92, size: 12, duration: 36, delay: -19 },
  { text: "Ship", left: 90, top: 86, size: 16, duration: 43, delay: -9 },
  { text: "Connect", left: 34, top: 3, size: 12, duration: 48, delay: -24 },
  { text: "Observe", left: 62, top: 96, size: 13, duration: 39, delay: -16 },
] as const;

export function DriftingWords() {
  const [animate, setAnimate] = React.useState(false);

  // Rendered still until mount, and left still for a reduced-motion reader.
  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAnimate(!query.matches);
    const onChange = () => setAnimate(!query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        // Faded at the edges and through the middle, so the words never sit
        // directly behind the headline or the diagram.
        maskImage:
          "radial-gradient(78% 72% at 50% 48%, transparent 42%, #000 88%)",
        WebkitMaskImage:
          "radial-gradient(78% 72% at 50% 48%, transparent 42%, #000 88%)",
      }}
    >
      {WORDS.map((word, i) => (
        <span
          key={word.text}
          className="absolute select-none font-mono uppercase tracking-[0.22em]"
          style={{
            left: `${word.left}%`,
            top: `${word.top}%`,
            fontSize: `${word.size}px`,
            // A per-theme token, not a fixed opacity: the same value reads as
            // decoration on dark and as legible text on white.
            color: "var(--drift-ink)",
            filter: "blur(0.4px)",
            animation: animate
              ? `mcpfy-drift-${i % 3} ${word.duration}s ease-in-out ${word.delay}s infinite`
              : undefined,
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
}
