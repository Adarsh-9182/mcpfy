"use client";

import * as React from "react";
import { CATEGORIES, type SearchQuery } from "@mcpfy/registry";
import { cn } from "@mcpfy/ui";

/**
 * §8 — the search box.
 *
 * A GET form, not a fetch. The query lives in the URL, which means a search is
 * shareable, survives a reload, and works with the back button — none of which
 * are true of state held in a component. The page is a server component that
 * reads searchParams, so this is only responsible for putting them there.
 *
 * Client-side only for the sort/filter controls, which submit on change; the
 * text input submits on enter like any form.
 */
export function RegistrySearch({
  query,
  total,
}: {
  query: SearchQuery;
  total: number;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action="/registry"
      method="get"
      role="search"
      className="flex flex-col gap-2.5"
    >
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={query.text}
          autoComplete="off"
          aria-label="Search the MCP registry"
          placeholder={
            total > 0
              ? `Search ${total} MCP server${total === 1 ? "" : "s"}…`
              : "Search MCP servers…"
          }
          className={cn(
            "h-11 w-full rounded-[var(--radius-lg)] border border-line bg-surface pl-10 pr-3",
            "text-base text-fg placeholder:text-subtle",
            "transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]",
          )}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          name="category"
          defaultValue={query.category ?? ""}
          aria-label="Filter by category"
          onChange={() => formRef.current?.requestSubmit()}
          className="h-8 rounded-[var(--radius-md)] border border-line bg-panel px-2.5 text-2xs text-fg focus:border-accent focus:outline-none"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select
          name="sort"
          defaultValue={query.sort}
          aria-label="Sort results"
          onChange={() => formRef.current?.requestSubmit()}
          className="h-8 rounded-[var(--radius-md)] border border-line bg-panel px-2.5 text-2xs text-fg focus:border-accent focus:outline-none"
        >
          <option value="trending">Trending</option>
          <option value="installs">Most installed</option>
          <option value="recent">Recently published</option>
          <option value="name">Name</option>
        </select>

        <label className="flex h-8 cursor-pointer select-none items-center gap-2 rounded-[var(--radius-md)] border border-line bg-panel px-2.5 text-2xs text-muted has-[:checked]:border-accent-border has-[:checked]:text-accent-text">
          <input
            type="checkbox"
            name="verified"
            value="1"
            defaultChecked={query.verifiedOnly}
            onChange={() => formRef.current?.requestSubmit()}
            className="size-3 accent-[var(--accent)]"
          />
          Verified only
        </label>

        {/* Submits for anyone without JavaScript, and for keyboard users who
            expect a button rather than an implicit enter. */}
        <button
          type="submit"
          className="h-8 rounded-[var(--radius-md)] border border-transparent bg-accent px-3 text-2xs font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Search
        </button>
      </div>
    </form>
  );
}
