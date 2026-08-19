import * as React from "react";
import { cn } from "../cn";

export interface BarItem {
  label: string;
  value: number;
  /** A portion of `value` that failed, drawn in the error hue. */
  errors?: number;
  /** Shown right-aligned instead of the raw value, e.g. "184ms". */
  display?: string;
  href?: string;
}

/**
 * Ranked magnitudes — tools, methods, clients, error codes.
 *
 * A bar list rather than a pie or a donut: these are ranked comparisons where
 * the exact number matters, and length along a common baseline is the easiest
 * encoding to read precisely. One hue, because every row measures the same
 * thing; colour here would encode nothing.
 */
export function BarList({
  items,
  total,
  empty = "Nothing recorded in this period.",
  className,
}: {
  items: BarItem[];
  /** Denominator for the bars. Defaults to the largest value. */
  total?: number;
  empty?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p className={cn("px-1 py-6 text-center text-2xs text-subtle", className)}>
        {empty}
      </p>
    );
  }

  const max = total ?? Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className={cn("flex flex-col", className)}>
      {items.map((item) => {
        const width = (item.value / max) * 100;
        const errorWidth =
          item.errors && item.value > 0
            ? (item.errors / item.value) * 100
            : 0;

        const row = (
          <>
            <span className="relative z-10 truncate font-mono text-sm text-fg">
              {item.label}
            </span>
            <span className="relative z-10 ml-auto shrink-0 pl-3 font-mono text-sm tabular-nums text-muted">
              {item.display ?? item.value.toLocaleString()}
            </span>
            {/* The bar sits behind the text so labels stay on ink tokens. */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 flex overflow-hidden rounded-[3px]"
              style={{ width: `${Math.max(width, 1.5)}%` }}
            >
              <span
                className="h-full flex-1"
                style={{ background: "var(--chart-volume)", opacity: 0.22 }}
              />
            </span>
            {errorWidth > 0 ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 overflow-hidden rounded-[3px]"
                style={{ width: `${Math.max((width * errorWidth) / 100, 1)}%` }}
              >
                <span
                  className="block h-full"
                  style={{ background: "var(--chart-error)", opacity: 0.42 }}
                />
              </span>
            ) : null}
          </>
        );

        return (
          <li key={item.label} className="relative">
            {item.href ? (
              <a
                href={item.href}
                className="relative flex items-center rounded-[3px] px-2 py-1.5 transition-colors hover:bg-panel"
              >
                {row}
              </a>
            ) : (
              <span className="relative flex items-center rounded-[3px] px-2 py-1.5">
                {row}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
