"use client";

import * as React from "react";
import { cn } from "../cn";

/** §8 — the dashboard chrome: a fixed sidebar, a topbar, and a content well. */

export function Shell({
  sidebar,
  topbar,
  children,
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-base text-fg">
      {/* Hidden below lg; the topbar carries navigation on small screens. */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-[var(--bg-raised)] lg:flex">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main className="min-w-0 flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

export function SidebarSection({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 py-2">
      {label ? (
        <p className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wider text-faint">
          {label}
        </p>
      ) : null}
      <ul className="flex flex-col gap-px">{children}</ul>
    </div>
  );
}

export function SidebarLink({
  href,
  active,
  icon,
  count,
  children,
}: {
  href: string;
  active?: boolean;
  icon?: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-base transition-colors",
          active
            ? "bg-panel text-hi"
            : "text-muted hover:bg-panel hover:text-fg",
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="text-subtle">
            {icon}
          </span>
        ) : null}
        <span className="truncate">{children}</span>
        {count !== undefined ? (
          <span className="ml-auto font-mono text-2xs text-faint">{count}</span>
        ) : null}
      </a>
    </li>
  );
}

export function Topbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line",
        "bg-[color-mix(in_oklab,var(--bg-base)_86%,transparent)] px-4 backdrop-blur-md lg:px-6",
        className,
      )}
    >
      {children}
    </header>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-medium text-hi">{title}</h1>
        {description ? (
          <p className="mt-1 text-base text-muted">{description}</p>
        ) : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
