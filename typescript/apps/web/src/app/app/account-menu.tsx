"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@mcpfy/ui";
import { authClient } from "@/lib/auth-client";

export function AccountMenu({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid size-7 place-items-center rounded-full border border-line-default bg-panel",
          "font-mono text-2xs text-fg transition-colors hover:border-line-strong",
        )}
      >
        {initials || "?"}
        <span className="sr-only">Account menu for {name}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-9 w-56 overflow-hidden rounded-[var(--radius-lg)] border border-line-default bg-elevated shadow-[var(--shadow-overlay)]"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-base text-hi">{name}</p>
            <p className="truncate text-2xs text-subtle">{email}</p>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
              router.refresh();
            }}
            className="w-full px-3 py-2 text-left text-base text-muted transition-colors hover:bg-panel hover:text-fg"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
