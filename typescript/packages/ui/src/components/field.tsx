"use client";

import * as React from "react";
import { cn } from "../cn";

const FieldContext = React.createContext<{
  id: string;
  descriptionId?: string;
  errorId?: string;
  invalid: boolean;
} | null>(null);

function useField() {
  return React.useContext(FieldContext);
}

/**
 * Wires label, description and error message to the control via aria-*
 * so the association is impossible to forget at the call site (§47).
 */
export function Field({
  children,
  error,
  className,
}: {
  children: React.ReactNode;
  error?: string | null;
  className?: string;
}) {
  const id = React.useId();
  const value = React.useMemo(
    () => ({
      id,
      descriptionId: `${id}-description`,
      errorId: `${id}-error`,
      invalid: Boolean(error),
    }),
    [id, error],
  );

  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        {children}
        {error ? (
          <p
            id={value.errorId}
            role="alert"
            className="text-2xs text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

export function Label({
  className,
  hint,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: React.ReactNode }) {
  const field = useField();
  return (
    <label
      htmlFor={field?.id}
      className={cn(
        "flex items-center justify-between text-xs font-medium text-muted",
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {hint ? <span className="text-2xs text-faint">{hint}</span> : null}
    </label>
  );
}

export function Description({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const field = useField();
  return (
    <p
      id={field?.descriptionId}
      className={cn("text-2xs leading-relaxed text-subtle", className)}
      {...props}
    />
  );
}

const CONTROL_BASE =
  "w-full rounded-[var(--radius-md)] border bg-raised px-2.5 text-base text-fg " +
  "placeholder:text-faint transition-colors " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }
>(function Input({ className, mono, ...props }, ref) {
  const field = useField();
  return (
    <input
      ref={ref}
      id={field?.id}
      aria-invalid={field?.invalid || undefined}
      aria-describedby={
        field?.invalid ? field.errorId : field?.descriptionId
      }
      className={cn(
        CONTROL_BASE,
        "h-9",
        mono && "font-mono text-sm",
        field?.invalid ? "border-danger" : "border-line-default",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }
>(function Textarea({ className, mono, ...props }, ref) {
  const field = useField();
  return (
    <textarea
      ref={ref}
      id={field?.id}
      aria-invalid={field?.invalid || undefined}
      aria-describedby={field?.invalid ? field.errorId : field?.descriptionId}
      className={cn(
        CONTROL_BASE,
        "min-h-24 resize-y py-2 leading-relaxed",
        mono && "font-mono text-sm",
        field?.invalid ? "border-danger" : "border-line-default",
        className,
      )}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  const field = useField();
  return (
    <select
      ref={ref}
      id={field?.id}
      aria-invalid={field?.invalid || undefined}
      aria-describedby={field?.invalid ? field.errorId : field?.descriptionId}
      className={cn(
        CONTROL_BASE,
        "h-9 appearance-none pr-8",
        // Chevron drawn in CSS so the control needs no icon font or asset.
        "bg-[length:14px] bg-[right_0.6rem_center] bg-no-repeat",
        "bg-[image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22%239aa1ad%22 stroke-width=%221.5%22><path d=%22M4 6l4 4 4-4%22/></svg>')]",
        field?.invalid ? "border-danger" : "border-line-default",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
