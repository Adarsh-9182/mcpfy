"use client";

import * as React from "react";
import { cn } from "../cn";

export interface Command {
  id: string;
  label: string;
  group: string;
  /** Extra words to match against that are not shown, e.g. "logs stderr". */
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

/**
 * §30 — the global command palette.
 *
 * Opens on ⌘K / Ctrl+K, filters as you type, and is driven entirely by the
 * keyboard: ↑/↓ move, Enter runs, Escape closes. It uses the ARIA combobox +
 * listbox pattern so the active option is announced as it changes.
 */
export function CommandMenu({ commands }: { commands: Command[] }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // Focus after paint, otherwise the element is not yet in the document.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  React.useEffect(() => setActive(0), [query]);

  const groups = React.useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const c of matches) {
      const list = map.get(c.group);
      if (list) list.push(c);
      else map.set(c.group, [c]);
    }
    return [...map.entries()];
  }, [matches]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(matches.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % Math.max(matches.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = matches[active];
      if (cmd) {
        setOpen(false);
        cmd.run();
      }
    }
  }

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] border border-line-default bg-elevated shadow-[var(--shadow-overlay)]">
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <span aria-hidden="true" className="text-subtle">
            ⌕
          </span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={
              matches[active] ? `${listId}-${matches[active].id}` : undefined
            }
            aria-label="Search commands"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands…"
            className="h-11 w-full bg-transparent text-md text-fg placeholder:text-faint focus:outline-none"
          />
          <kbd className="rounded-[var(--radius-xs)] border border-line-default px-1.5 py-0.5 font-mono text-2xs text-subtle">
            esc
          </kbd>
        </div>

        <div id={listId} role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {matches.length === 0 ? (
            <p className="px-2.5 py-6 text-center text-base text-subtle">
              No commands match “{query}”.
            </p>
          ) : (
            groups.map(([group, items]) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-2.5 py-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
                  {group}
                </p>
                {items.map((cmd) => {
                  flatIndex += 1;
                  const isActive = flatIndex === active;
                  const myIndex = flatIndex;
                  return (
                    <button
                      key={cmd.id}
                      id={`${listId}-${cmd.id}`}
                      role="option"
                      type="button"
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(myIndex)}
                      onClick={() => {
                        setOpen(false);
                        cmd.run();
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-base",
                        isActive ? "bg-panel text-hi" : "text-muted",
                      )}
                    >
                      <span>{cmd.label}</span>
                      {cmd.shortcut ? (
                        <kbd className="font-mono text-2xs text-faint">
                          {cmd.shortcut}
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
