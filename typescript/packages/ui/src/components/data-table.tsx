import * as React from "react";
import { cn } from "../cn";

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align numeric columns; monospace them for scanability (§28). */
  align?: "left" | "right";
  mono?: boolean;
  width?: string;
  render: (row: T) => React.ReactNode;
}

/**
 * A dense table. Rows may link, in which case the whole row is one anchor
 * target rather than a div with an onClick, so keyboard and middle-click
 * behave the way the browser already knows how to (§47).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  className,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  empty?: React.ReactNode;
  className?: string;
  /** Screen-reader description of what the table lists. */
  caption: string;
}) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface",
        className,
      )}
    >
      <table className="w-full border-collapse text-base">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "px-4 py-2.5 text-2xs font-medium uppercase tracking-wider text-subtle",
                  col.align === "right" ? "text-right" : "text-left",
                )}
              >
                {col.header}
              </th>
            ))}
            {rowHref ? <th scope="col" className="w-8" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                className="border-b border-line last:border-0 transition-colors hover:bg-panel"
              >
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-2.5 text-fg",
                      col.align === "right" && "text-right",
                      col.mono && "font-mono text-sm tabular-nums",
                    )}
                  >
                    {href && i === 0 ? (
                      // The first cell carries the link; ::after stretches it
                      // across the row so the whole row is clickable without
                      // nesting interactive elements.
                      <a
                        href={href}
                        className="relative font-medium text-hi after:absolute after:inset-0 after:content-[''] hover:text-accent-text"
                      >
                        {col.render(row)}
                      </a>
                    ) : (
                      col.render(row)
                    )}
                  </td>
                ))}
                {href ? (
                  <td className="pr-4 text-right text-faint" aria-hidden="true">
                    ›
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
