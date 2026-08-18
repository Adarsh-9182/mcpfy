"use client";

import * as React from "react";
import { cn } from "../cn";

/**
 * Built on the native <dialog> element, which gives us the focus trap,
 * Escape handling, inert background and top-layer stacking for free — all
 * the parts hand-rolled modals reliably get wrong (§47).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        // The dialog element fills the viewport; a click landing on the
        // element itself (not its content box) is a backdrop click.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-xl)] border border-line-default",
        "bg-elevated p-0 text-fg shadow-[var(--shadow-overlay)]",
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-1 border-b border-line px-5 py-4">
        <h2 id={titleId} className="text-lg font-medium text-hi">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="text-base text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {children ? <div className="px-5 py-4">{children}</div> : null}
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
