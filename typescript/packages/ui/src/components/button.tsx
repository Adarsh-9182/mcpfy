import * as React from "react";
import { cn } from "../cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent border border-transparent hover:bg-accent-hover active:translate-y-px",
  secondary:
    "bg-panel text-fg border border-line-default hover:bg-elevated hover:border-line-strong",
  ghost:
    "bg-transparent text-muted border border-transparent hover:bg-panel hover:text-fg",
  danger:
    "bg-danger-surface text-danger border border-danger-border hover:border-danger",
  link: "bg-transparent text-accent-text border-0 px-0 h-auto hover:underline underline-offset-4",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-2xs gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-8 px-3 text-xs gap-2 rounded-[var(--radius-md)]",
  lg: "h-10 px-4 text-base gap-2 rounded-[var(--radius-md)]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Rendered before the label. Decorative — give the button a real label too. */
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        // A loading button stays focusable and keeps its label, so screen
        // readers announce the state change rather than the button vanishing.
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
          "transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      >
        {loading ? <Spinner className="size-3.5" /> : icon}
        {children}
      </button>
    );
  },
);
