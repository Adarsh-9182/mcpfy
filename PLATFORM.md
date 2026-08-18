# MCPfy Platform

The hosted control plane that sits alongside the open-source SDK: deploy MCP
servers, inspect protocol traffic, replay agent sessions, run evaluations, and
hand a working endpoint to any MCP client.

This document covers what is built, how to run it, and what is deliberately
not built yet. The product specification it is being built against is a
50-section brief; §-references below point at it.

---

## Layout

```
typescript/
  apps/
    web/            Next.js 16 — marketing site, auth, dashboard, /api/v1
  packages/
    db/             Drizzle schema, migrations, tenancy, crypto, state machine
    ui/             Design system: tokens + primitives + product components
    mcpfy/          mcpfy-sdk        (existing, published)
    create-mcpfy-app/                (existing, published)
    mcpfy-pulse/    telemetry        (existing, published)
```

The platform packages are private; the three published packages are unchanged.

---

## Running it

No Docker, no Postgres install, no cloud account.

```bash
cd typescript
pnpm install

cd apps/web
cp .env.example .env.local
# fill in the two secrets it asks for:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

pnpm db:migrate
pnpm dev
```

`http://localhost:3000`

### The database

`DATABASE_URL` selects the driver:

| Value | Driver | Use |
| --- | --- | --- |
| unset or `pglite://<dir>` | [PGlite](https://pglite.dev) — Postgres compiled to WASM, in-process | local development |
| `postgres://…` | postgres-js | anything shared or deployed |

PGlite is real Postgres, so enums, `jsonb`, partial indexes and
`percentile_disc` all behave as they will in production — unlike a SQLite
stand-in, which would quietly drift.

Two adaptations live in `packages/db/src/client.ts` and exist only for the
PGlite path: the instance is cached on `globalThis` (Next evaluates server code
in several module graphs, and two PGlite instances cannot share a data
directory), and its queries are serialised behind a promise chain seeded with
`waitReady` (PGlite is a single embedded connection; overlapping queries abort
the WASM instance). Neither applies to postgres-js.

### Commands

```bash
pnpm dev                # from typescript/ — runs the web app
pnpm typecheck          # db + ui + web
pnpm test               # sdk + db unit tests
pnpm db:generate        # regenerate migrations after a schema change
pnpm db:migrate         # apply them
```

---

## What is built

**Database (§23, §40)** — 32 tables covering users, organizations, projects,
servers, repositories, environments, deployments, build logs, tools, resources,
prompts, sessions, request logs, tool calls, trace spans, evaluations,
marketplace listings, templates, API keys, domains, secrets, webhooks and an
append-only audit log. Every tenant-owned table carries `organization_id`.

**Tenancy (§40)** — `scoped()`, `owned()` and `assertOwned()` in
`packages/db/src/tenancy.ts`. Reads and writes on tenant tables go through
them; a cross-tenant fetch returns the same error as a missing row, so
existence is never leaked. Verified end to end: a second organization gets
`404` on another org's server id and an empty list from the API.

**Authorization (§24)** — four roles (`owner` > `admin` > `developer` >
`viewer`), checked server-side in every server action and route handler. The
role is re-read from the database on each request rather than trusted from the
session cookie, so removing a member takes effect immediately.

**Security (§25)** — AES-256-GCM secret sealing with per-secret IVs; API keys
stored only as SHA-256 hashes with a displayable prefix; HMAC webhook
signatures with replay-window verification; SSRF protection on every
user-supplied endpoint, including hostnames that *resolve* to private or
link-local addresses (the AWS metadata endpoint is rejected); CSRF via Better
Auth origin checks; security headers in `next.config.ts`.

**Deployment state machine (§11)** — the eight states and their legal
transitions in one module, with 9 unit tests pinning the edges that matter
(no skipping the health check, no going backwards, terminal states are dead
ends).

**Design system (§27, §28)** — tokens lifted from the MCPfy Landing design
canvas rather than invented, so the marketing site and product share one
palette. Dark by default, light and system themes, `prefers-reduced-motion`
honoured platform-wide, focus-visible rings never suppressed. 18 components.

**Landing page (§5–§7)** — hero, gateway architecture, interactive deployment
pipeline, and an Inspector demo whose form is generated from real JSON Schema
by the same transformation the product Inspector will use. Both interactive
pieces are labelled as simulations.

**Auth (§24)** — email/password and GitHub OAuth (when configured), sessions in
Postgres, organization creation and onboarding.

**Dashboard (§8, §9)** — shell with sidebar and ⌘K command palette, overview
with real metrics, server list, server creation, server detail with generated
client configuration for Claude Desktop, Cursor, VS Code and the CLI.

**API (§38)** — `GET`/`POST /api/v1/servers` accepting either a session cookie
or a `Bearer` API key, with a consistent `{ error: { code, message } }`
envelope.

**Tests (§34)** — 33 unit tests over the state machine, tenancy guards and
crypto, including that a tampered ciphertext fails its auth tag and that a
replayed webhook outside the tolerance window is rejected.

---

## What is not built

Listed because §48 forbids simulating it. Where the UI would otherwise show a
dead control, it says which phase delivers the feature instead.

- **Deployment engine (§11, §12)** — no build, no runtime, no preview
  environments. GitHub import is disabled in the create-server form with the
  reason shown inline.
- **Gateway** — nothing routes MCP traffic yet, so `request_log`, `tool_call`
  and `mcp_session` are empty and every metric reads `—`. The overview says so
  rather than drawing a chart.
- **Inspector (§13)** — the landing demo is real and interactive; the product
  Inspector that talks to a live server is Phase 3.
- **Analytics, sessions, evaluations, marketplace, templates, CLI, AI builder,
  webhooks delivery, billing** — schema and, where relevant, crypto and state
  machines exist; the services do not.

Sidebar entries for these render disabled with their phase, and the command
palette does not offer commands whose destination does not exist.

---

## Deliberate deviations from the specification

- **§6** prints `npx create-mcpfy@latest`. The published package is
  `create-mcpfy-app`, so the hero uses the command that actually works.
- **§4** lists `/platform`, `/pricing`, `/marketplace`, `/templates`, `/blog`,
  `/changelog`. Only `/docs` and `/open-source` are built, because they can be
  filled with true content today; the others would be empty shells. Navigation
  links only to routes that exist. `/pricing` in particular is a business
  decision, not an engineering one.
- **§9** specifies metric tiles on the server overview. Their destinations
  (`/analytics`, `/logs`) do not exist yet, and a tile that links nowhere is
  the dead UI §48 rules out — so the server page states that no traffic has
  been recorded instead.
