export function Logo({ size = 20 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-[5px] bg-accent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="rounded-[2px] bg-[var(--text-on-accent)]"
        style={{ width: size * 0.35, height: size * 0.35 }}
      />
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="text-[15px] font-semibold tracking-tight text-hi">
        MCPfy
      </span>
    </span>
  );
}
