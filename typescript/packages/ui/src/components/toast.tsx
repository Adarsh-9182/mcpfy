"use client";

import * as React from "react";
import { cn } from "../cn";

type Tone = "info" | "success" | "danger";

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
}

const ToastContext = React.createContext<{
  push: (t: Omit<Toast, "id">) => void;
} | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE: Record<Tone, string> = {
  info: "border-line-default",
  success: "border-success-border",
  danger: "border-danger-border",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const next = React.useRef(0);

  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = next.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((x) => x.id !== id)),
      t.tone === "danger" ? 8000 : 4500,
    );
  }, []);

  const value = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        aria-live=polite so a success toast does not interrupt whatever the
        user is reading; errors stay on screen long enough to be read.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-[var(--radius-lg)] border bg-elevated px-3.5 py-3",
              "shadow-[var(--shadow-overlay)]",
              TONE[t.tone],
            )}
          >
            <p className="text-base font-medium text-hi">{t.title}</p>
            {t.description ? (
              <p className="mt-0.5 text-2xs leading-relaxed text-muted">
                {t.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
