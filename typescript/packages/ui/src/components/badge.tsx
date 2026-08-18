import * as React from "react";
import { cn } from "../cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-panel text-muted border-line-default",
  accent: "bg-accent-surface text-accent-text border-accent-border",
  success: "bg-success-surface text-success border-success-border",
  warning: "bg-warning-surface text-warning border-warning-border",
  danger: "bg-danger-surface text-danger border-danger-border",
  info: "bg-info-surface text-info border-info-border",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  mono?: boolean;
}

export function Badge({
  tone = "neutral",
  mono = false,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-xs)] border px-1.5 py-0.5",
        "text-2xs font-medium leading-none",
        mono && "font-mono",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
