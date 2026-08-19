/**
 * Development seed for the MCP registry.
 *
 * The registry pages cannot be judged empty, and waiting for real listings to
 * exist before looking at the layout is how a broken grid ships. So this fills
 * the table locally.
 *
 * Two things it refuses to do:
 *
 *  1. Run against anything that is not a local database. Seed data in a
 *     production registry would be listings nobody published, which is a lie
 *     told at scale.
 *  2. Pretend the numbers are real. The repositories and descriptions below
 *     are genuine, well-known, public MCP servers. The install counts are
 *     invented so the ranking model has something to sort, and the script says
 *     so every time it runs.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/schema/index.ts";

const url = process.env.DATABASE_URL ?? "";

function isLocal(connection: string): boolean {
  try {
    const { hostname } = new URL(connection);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

if (!url) {
  console.error("DATABASE_URL is not set. Run `pnpm db:up` first.");
  process.exit(1);
}

if (!isLocal(url)) {
  console.error(
    "Refusing to seed: DATABASE_URL does not point at localhost.\n" +
      "This writes listings nobody published — it is for development only.",
  );
  process.exit(1);
}

const SEED = [
  {
    slug: "github-mcp",
    name: "GitHub",
    summary: "Search repositories, read pull requests, and file issues from an AI client.",
    category: "development",
    repositoryUrl: "https://github.com/github/github-mcp-server",
    // GitHub's own documented remote endpoint, not one we invented.
    endpointUrl: "https://api.githubcopilot.com/mcp/",
    authKind: "oauth",
    verified: 1,
    installCount: 12_400,
    toolCount: 26,
    ageDays: 420,
    updatedDaysAgo: 3,
  },
  {
    slug: "postgres-mcp",
    name: "PostgreSQL",
    summary: "Run read-only queries and inspect schemas across your Postgres databases.",
    category: "data",
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    authKind: "api_key",
    verified: 1,
    installCount: 8_100,
    toolCount: 6,
    ageDays: 500,
    updatedDaysAgo: 21,
  },
  {
    slug: "sentry-mcp",
    name: "Sentry",
    summary: "Pull issues, stack traces and release health into a debugging session.",
    category: "development",
    repositoryUrl: "https://github.com/getsentry/sentry-mcp",
    endpointUrl: "https://mcp.sentry.dev/mcp",
    authKind: "oauth",
    verified: 1,
    installCount: 3_050,
    toolCount: 14,
    ageDays: 200,
    updatedDaysAgo: 6,
  },
  {
    slug: "filesystem-mcp",
    name: "Filesystem",
    summary: "Read and write files inside directories you explicitly allow.",
    category: "productivity",
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    authKind: "none",
    verified: 0,
    installCount: 19_800,
    toolCount: 11,
    ageDays: 560,
    updatedDaysAgo: 240,
  },
  {
    slug: "playwright-mcp",
    name: "Playwright",
    summary: "Drive a real browser: navigate, click, fill forms and read the page.",
    category: "automation",
    repositoryUrl: "https://github.com/microsoft/playwright-mcp",
    authKind: "none",
    verified: 1,
    installCount: 6_700,
    toolCount: 21,
    ageDays: 150,
    updatedDaysAgo: 2,
  },
  {
    slug: "cloudflare-mcp",
    name: "Cloudflare",
    summary: "Manage Workers, DNS records, KV namespaces and R2 buckets.",
    category: "infrastructure",
    repositoryUrl: "https://github.com/cloudflare/mcp-server-cloudflare",
    authKind: "oauth",
    verified: 1,
    installCount: 2_400,
    toolCount: 30,
    ageDays: 240,
    updatedDaysAgo: 11,
  },
  {
    slug: "linear-mcp",
    name: "Linear",
    summary: "Read and update issues, projects and cycles without leaving your editor.",
    category: "productivity",
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    authKind: "oauth",
    verified: 0,
    installCount: 1_150,
    toolCount: 9,
    ageDays: 90,
    updatedDaysAgo: 4,
  },
  {
    slug: "brave-search-mcp",
    name: "Brave Search",
    summary: "Web and local search results as a tool, with no scraping.",
    category: "research",
    repositoryUrl: "https://github.com/modelcontextprotocol/servers",
    authKind: "api_key",
    verified: 0,
    installCount: 5_200,
    toolCount: 3,
    ageDays: 480,
    updatedDaysAgo: 130,
  },
] as const;

const DAY = 86_400_000;
const now = Date.now();

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });

try {
  // Seed listings hang off whichever organization already exists locally, so
  // the publisher name on the page is the developer's own org rather than a
  // second fictional account.
  const [org] = await db.select().from(schema.organization).limit(1);

  if (!org) {
    console.error(
      "No organization exists yet. Sign up in the app first, then re-run this.",
    );
    process.exit(1);
  }

  let inserted = 0;
  for (const item of SEED) {
    const existing = await db
      .select({ id: schema.marketplaceListing.id })
      .from(schema.marketplaceListing)
      .where(eq(schema.marketplaceListing.slug, item.slug))
      .limit(1);

    if (existing[0]) continue;

    await db.insert(schema.marketplaceListing).values({
      organizationId: org.id,
      slug: item.slug,
      name: item.name,
      summary: item.summary,
      category: item.category,
      authKind: item.authKind,
      repositoryUrl: item.repositoryUrl,
      endpointUrl: "endpointUrl" in item ? item.endpointUrl : null,
      status: "published",
      verified: item.verified,
      installCount: item.installCount,
      toolCount: item.toolCount,
      version: "1.0.0",
      publishedAt: new Date(now - item.ageDays * DAY),
      updatedAt: new Date(now - item.updatedDaysAgo * DAY),
    });
    inserted += 1;
  }

  console.log(`Seeded ${inserted} listing(s) under "${org.name}".`);
  console.log(
    "Note: repositories and descriptions are real; install counts are invented\n" +
      "so the ranking model has something to sort. Do not quote them.",
  );
} finally {
  await sql.end();
}
