import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@mcpfy/ui";
import { categoryLabel } from "@mcpfy/registry";
import { listingBySlug, listingTools } from "@/lib/registry";
import { ConnectPicker } from "./connect";

const nf = new Intl.NumberFormat("en");

/** Stored values are snake_case identifiers; these are what a reader expects. */
const AUTH_LABEL: Record<string, string> = {
  oauth: "OAuth",
  api_key: "an API key",
  bearer: "a bearer token",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await listingBySlug(slug);
  if (!listing) return { title: "Not found" };
  return {
    title: `${listing.name} — MCP Registry`,
    description: listing.summary,
  };
}

export default async function ListingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await listingBySlug(slug);

  // A draft, an unlisted listing and a slug that never existed are all the
  // same 404. Distinguishing them would confirm that a private listing exists.
  if (!listing) notFound();

  const tools = await listingTools(listing.serverId);
  const hosted = Boolean(listing.serverId);
  const endpoint =
    listing.endpointUrl ??
    (hosted ? `https://mcpfy.dev/g/${listing.publisher.slug}/${listing.slug}/mcp` : null);

  return (
    <div className="mx-auto max-w-[860px]">
      <Link
        href="/registry"
        className="text-2xs text-muted transition-colors hover:text-fg"
      >
        ← Registry
      </Link>

      {/* ------------------------------------------------------------- §9 */}
      <header className="mt-5 border-b border-line pb-7">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-medium tracking-tight text-hi">
            {listing.name}
          </h1>
          {listing.verified ? <Badge tone="accent">Verified</Badge> : null}
          {listing.version ? (
            <span className="font-mono text-2xs text-faint">
              v{listing.version}
            </span>
          ) : null}
        </div>

        <p className="mt-2 max-w-xl text-base leading-relaxed text-muted">
          {listing.summary}
        </p>

        <dl className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-2xs text-faint">
          <Stat label="Publisher" value={listing.publisher.name} />
          <Stat label="Category" value={categoryLabel(listing.category)} />
          <Stat label="Installs" value={nf.format(listing.installCount)} />
          <Stat
            label="Updated"
            value={listing.updatedAt.toISOString().slice(0, 10)}
          />
        </dl>
      </header>

      {/* --------------------------------------------------------- connect */}
      <section className="mt-8">
        <h2 className="text-2xs font-medium uppercase tracking-[0.14em] text-faint">
          Connect
        </h2>
        {endpoint ? (
          <div className="mt-3">
            <ConnectPicker
              target={{
                name: listing.slug,
                endpoint,
                authenticated: listing.authKind !== "none",
              }}
            />
          </div>
        ) : (
          <p className="mt-3 rounded-[var(--radius-lg)] border border-line bg-surface px-4 py-3 text-2xs leading-relaxed text-muted">
            This listing points at a repository rather than a running endpoint,
            so there is nothing to connect to yet. Deploy it on MCPfy, or follow
            the instructions in its repository.
          </p>
        )}
      </section>

      {/* ----------------------------------------------------------- tools */}
      <section className="mt-9">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xs font-medium uppercase tracking-[0.14em] text-faint">
            Tools
          </h2>
          {tools.length > 0 ? (
            <span className="font-mono text-2xs text-faint">{tools.length}</span>
          ) : null}
        </div>

        {tools.length > 0 ? (
          <ul className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
            {tools.map((tool) => (
              <li
                key={tool.name}
                className="border-b border-line px-4 py-3 last:border-0"
              >
                <p className="font-mono text-2xs text-accent-text">{tool.name}</p>
                {tool.description ? (
                  <p className="mt-1 text-2xs leading-relaxed text-muted">
                    {tool.description}
                  </p>
                ) : (
                  <p className="mt-1 text-2xs italic text-faint">
                    No description — the model has only the name to go on.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-line bg-surface px-4 py-6 text-2xs leading-relaxed text-muted">
            {hosted
              ? "No tools have been recorded yet. They are captured the first time MCPfy inspects a deployment."
              : "MCPfy does not host this server, so it has not inspected it. The tool list comes from whoever publishes it."}
          </p>
        )}
      </section>

      {/* -------------------------------------------------------- security */}
      <section className="mt-9">
        <h2 className="text-2xs font-medium uppercase tracking-[0.14em] text-faint">
          Security
        </h2>
        <ul className="mt-3 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
          <Fact
            ok={listing.authKind !== "none"}
            label="Authentication"
            detail={
              listing.authKind === "none"
                ? "This server accepts unauthenticated requests."
                : `Requires ${AUTH_LABEL[listing.authKind] ?? listing.authKind}.`
            }
          />
          <Fact
            ok={listing.verified}
            label="Verified publisher"
            detail={
              listing.verified
                ? `MCPfy has confirmed ${listing.publisher.name} controls this listing.`
                : "The publisher has not been verified. Verification confirms identity, not code quality."
            }
          />
          <Fact
            ok={hosted}
            label="Hosted by MCPfy"
            detail={
              hosted
                ? "Traffic runs through the MCPfy gateway, so it is authenticated and logged."
                : "Indexed, not hosted. MCPfy does not run this code and cannot see its traffic."
            }
          />
        </ul>
        <p className="mt-2.5 text-2xs leading-relaxed text-faint">
          These are facts MCPfy can check. None of them are a security audit of
          what the server does with your data once it has it.
        </p>
      </section>

      {/* ------------------------------------------------------------ links */}
      {listing.repositoryUrl || listing.homepageUrl ? (
        <section className="mt-9 border-t border-line pt-5">
          <div className="flex flex-wrap gap-4 text-2xs">
            {listing.repositoryUrl ? (
              <ExternalLink href={listing.repositoryUrl}>Repository</ExternalLink>
            ) : null}
            {listing.homepageUrl ? (
              <ExternalLink href={listing.homepageUrl}>Homepage</ExternalLink>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5 text-fg">{value}</dd>
    </div>
  );
}

function Fact({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <li className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
      <span
        aria-hidden="true"
        className={ok ? "text-success" : "text-subtle"}
      >
        {ok ? "✓" : "—"}
      </span>
      <div>
        <p className="text-2xs font-medium text-fg">
          {label}
          <span className="sr-only">: {ok ? "yes" : "no"}</span>
        </p>
        <p className="mt-0.5 text-2xs leading-relaxed text-muted">{detail}</p>
      </div>
    </li>
  );
}

/**
 * Third-party links carry noopener and nofollow.
 *
 * The URL is user-supplied. noreferrer/noopener stops the target reaching back
 * through window.opener, and nofollow means a published listing cannot be used
 * to launder search ranking onto an arbitrary domain.
 */
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-accent-text hover:underline"
    >
      {children} ↗
    </a>
  );
}
