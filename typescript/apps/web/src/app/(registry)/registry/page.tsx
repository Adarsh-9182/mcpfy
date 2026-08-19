import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@mcpfy/ui";
import {
  CATEGORIES,
  applyQuery,
  categoryLabel,
  parseQuery,
} from "@mcpfy/registry";
import { categoryCounts, publishedListings } from "@/lib/registry";
import { RegistrySearch } from "./search-form";

export const metadata: Metadata = {
  title: "MCP Registry",
  description:
    "Find MCP servers, see the tools they expose, and connect them to Claude, ChatGPT, Cursor, VS Code or Gemini.",
};

const nf = new Intl.NumberFormat("en");

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };

  const query = parseQuery({
    q: first("q"),
    category: first("category"),
    verified: first("verified"),
    sort: first("sort"),
  });

  const [all, counts] = await Promise.all([publishedListings(), categoryCounts()]);
  const results = applyQuery(all, query);
  const filtered = Boolean(query.text || query.category || query.verifiedOnly);

  return (
    <div>
      {/* ------------------------------------------------------------ §8 */}
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-display text-4xl font-medium tracking-display text-hi sm:text-5xl">
          Discover MCP servers
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-muted">
          Every listing shows the tools it exposes and generates the exact
          configuration for your client. No hunting through READMEs.
        </p>
      </header>

      <div className="mx-auto mt-7 max-w-2xl">
        <RegistrySearch query={query} total={all.length} />
      </div>

      {/* Categories are hidden while a search is active — they are a way in,
          and a way in is noise once you are already somewhere. */}
      {!filtered ? (
        <section className="mt-14">
          <h2 className="text-2xs font-medium uppercase tracking-[0.14em] text-faint">
            Browse by category
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((category) => {
              const n = counts[category.id] ?? 0;
              return (
                <li key={category.id}>
                  <Link
                    href={{ pathname: "/registry", query: { category: category.id } }}
                    className="group flex h-full flex-col rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-panel"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-base font-medium text-hi group-hover:text-accent-text">
                        {category.label}
                      </span>
                      <span className="font-mono text-2xs tabular-nums text-faint">
                        {n}
                      </span>
                    </span>
                    <span className="mt-1 text-2xs leading-relaxed text-muted">
                      {category.blurb}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* --------------------------------------------------------- results */}
      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xs font-medium uppercase tracking-[0.14em] text-faint">
            {query.text
              ? `Results for “${query.text}”`
              : query.category
                ? categoryLabel(query.category)
                : "Trending"}
          </h2>
          {filtered ? (
            <Link
              href="/registry"
              className="text-2xs text-accent-text hover:underline"
            >
              Clear filters
            </Link>
          ) : (
            <p className="text-2xs text-faint">
              Ranked on how much a server is used, how fast that is growing,
              and how recently it was maintained.
            </p>
          )}
        </div>

        {results.length > 0 ? (
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((listing) => (
              <li key={listing.id}>
                <Link
                  href={{ pathname: `/registry/${listing.slug}` }}
                  className="group flex h-full flex-col rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-panel"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-medium text-hi group-hover:text-accent-text">
                      {listing.name}
                    </p>
                    {listing.verified ? (
                      <Badge tone="accent">Verified</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-muted">
                    {listing.summary}
                  </p>
                  <div className="mt-auto flex items-center gap-2.5 pt-4 font-mono text-2xs text-faint">
                    <span>{categoryLabel(listing.category)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{listing.toolCount} tools</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {nf.format(listing.installCount)} installs
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRegistry filtered={filtered} anyPublished={all.length > 0} />
        )}
      </section>
    </div>
  );
}

/**
 * Two genuinely different empty states.
 *
 * "Your search matched nothing" and "the registry has nothing in it yet" want
 * opposite responses from the reader, and collapsing them into one message
 * makes a new registry look broken instead of new.
 */
function EmptyRegistry({
  filtered,
  anyPublished,
}: {
  filtered: boolean;
  anyPublished: boolean;
}) {
  if (filtered && anyPublished) {
    return (
      <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-line bg-surface px-6 py-14 text-center">
        <p className="text-base text-fg">Nothing matched.</p>
        <p className="mx-auto mt-1.5 max-w-sm text-2xs leading-relaxed text-muted">
          Every word in a search has to match, so a shorter query finds more.
        </p>
        <Link
          href="/registry"
          className="mt-4 inline-block text-2xs text-accent-text hover:underline"
        >
          Browse everything instead
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="text-base text-fg">The registry is empty.</p>
      <p className="mx-auto mt-1.5 max-w-md text-2xs leading-relaxed text-muted">
        Nothing has been published yet — including by us. Rather than fill this
        page with servers we do not host and cannot vouch for, it stays empty
        until there is something real to show.
      </p>
      <Link
        href="/app/servers"
        className="mt-4 inline-block text-2xs text-accent-text hover:underline"
      >
        Publish the first one
      </Link>
    </div>
  );
}
