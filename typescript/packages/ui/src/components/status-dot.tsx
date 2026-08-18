import { cn } from "../cn";

export type Status =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "building"
  | "idle"
  | "unknown";

const TONE: Record<Status, string> = {
  healthy: "bg-success",
  degraded: "bg-warning",
  unhealthy: "bg-danger",
  building: "bg-info",
  idle: "bg-faint",
  unknown: "bg-faint",
};

const LABEL: Record<Status, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  building: "Building",
  idle: "Idle",
  unknown: "Unknown",
};

/**
 * §47 — colour is never the only signal. The dot is decorative; the text
 * label beside it carries the meaning, and `title` covers the icon-only case.
 */
export function StatusDot({
  status,
  label,
  pulse,
  className,
}: {
  status: Status;
  /** Set false only when a visible label already sits next to the dot. */
  label?: string | false;
  pulse?: boolean;
  className?: string;
}) {
  const text = label === false ? null : (label ?? LABEL[status]);
  const animate = pulse ?? (status === "building");

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          TONE[status],
          animate && "animate-pulse",
        )}
        aria-hidden="true"
      />
      {text ? (
        <span className="text-2xs text-muted">{text}</span>
      ) : (
        <span className="sr-only">{LABEL[status]}</span>
      )}
    </span>
  );
}
