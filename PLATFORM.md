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
  services/
    detection/      Which MCP framework, runtime and build commands a repo needs
    deployment/     State machine driver, runtime adapters, health check
    inspector/      MCP client that records every JSON-RPC frame it sends
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

Four adaptations live in `packages/db/src/client.ts`, all for the PGlite path
only and none of them relevant to postgres-js:

- the instance is cached on `globalThis`, because Next evaluates server code in
  several module graphs and two PGlite instances cannot share a data directory;
- queries are serialised behind a promise chain seeded with `waitReady`, because
  PGlite is a single embedded connection and overlapping queries abort the WASM
  instance;
- `next build` gets a throwaway in-memory database, because the build forks a
  pool of workers that would otherwise all open the real one at once — every
  route is dynamic, so nothing real depends on a build-time query;
- a lock file names the moment two processes share the directory anyway. It
  warns rather than refuses, since `next dev` legitimately spans processes; it
  cannot make PGlite multi-process safe, only make the failure legible and
  point at the fix, which is Postgres.

### Commands

```bash
pnpm dev                # from typescript/ — runs the web app
pnpm typecheck          # every workspace package
pnpm test               # sdk + db + detection + deployment unit tests
pnpm db:generate        # regenerate migrations after a schema change
pnpm db:migrate         # apply them

# The end-to-end deployment test really clones, installs and starts a server,
# so it is opt-in:
MCPFY_E2E=1 pnpm --filter @mcpfy/deployment test
```

### Deploying something

Set `MCPFY_ALLOW_LOCAL_RUNTIME=1`, create a server with a repository URL, and
press Deploy. MCPfy clones the repository, runs the detected install and build
commands, starts the server on an allocated port, completes an MCP handshake
against it, and records the tools it advertises.

The local runtime executes repository commands **directly on the host with no
sandbox**. That is correct for development and for self-hosting your own code,
and wrong for anything that builds other people's repositories — which is why
it refuses to start unless that variable is set. The sandbox is a container
adapter behind the same `RuntimeAdapter` interface, and it does not exist yet.

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

**Framework detection (§10)** — a backend service, not logic in a component:
reads a repository through a `SourceTree` interface (GitHub, a checkout, or a
test fixture all satisfy it) and returns the framework, runtime, package
manager and install/build/start commands, each with the evidence that produced
it. The server page shows that evidence, so a developer who disagrees with the
detection can see what it looked at before overriding.

**Deployment engine (§11)** — an orchestrator that owns the state machine,
the logs and the database, and a `RuntimeAdapter` that owns compute. Every
status change goes through `assertTransition`, and the failure path is written
so that it cannot itself throw — a deployment can fail, but it cannot get
stuck mid-flight. `LocalRuntime` is a real adapter: it clones at a commit,
installs, builds, starts a supervised child process on an allocated port, and
registers it so it can be cancelled or superseded.

**Health check and tool discovery (§14, §44)** — a deployment is not live
because a port is open. The check is a real MCP handshake through
`mcpfy-sdk`'s own client — connect, initialize, `tools/list` — which is
exactly what Claude or Cursor will do moments later. Discovery comes free with
it and fills the tool registry, including each tool's JSON Schema.

**Live build logs (§11)** — persisted with a monotonic sequence number and
streamed over SSE. The stream polls by sequence rather than holding a database
listener, so a reconnect resumes exactly where it left off. The viewer stops
auto-scrolling the moment you scroll up.

**Inspector (§13)** — connects to a live server, runs one operation, and
returns the result together with every JSON-RPC frame that produced it,
paired into request/response exchanges with per-exchange timing and byte
counts. The handshake is shown too: it is the part developers never see and
the part that breaks most often behind a proxy or an auth layer.

Two distinctions the interface is built around. Connect time is reported
separately from operation time, so a slow handshake is never mistaken for a
slow tool. And a tool that runs and reports a failure is a *successful call*
with `isToolError` set — collapsing that into a transport error would send a
developer debugging the wrong layer entirely.

Executing is separated from reading in the authorization: a viewer can read
any schema and cannot invoke anything, because `tools/call` runs real code
with real side effects. Every execution is written to the audit log with the
argument *keys* only — the values are already on the developer's screen and do
not also need to be retained.

**Registry (§14)** — tools, resources and prompts, all written by discovery
rather than by hand, with each tool's JSON Schema rendered as a parameter
table. Tools that a later deployment no longer advertises are marked removed
rather than deleted, so historical calls still resolve to a name.

**Tests (§34)** — 80 unit tests plus one opt-in integration test that
scaffolds a real server with `create-mcpfy-app`, commits it, and deploys it
through to a live MCP endpoint with its tools discovered.

---

## What is not built

Listed because §48 forbids simulating it. Where the UI would otherwise show a
dead control, it says which phase delivers the feature instead.

- **Sandboxed runtime** — the only adapter is `LocalRuntime`, which runs
  builds on the host. Multi-tenant hosting needs a container or microVM
  adapter behind the same interface.
- **GitHub App (§10)** — repository *listing* and push-triggered redeploys.
  Building from a repository works today by pasting its URL; what is missing
  is picking one from your account and redeploying on push. The create-server
  form says exactly that instead of offering a button that fails.
- **Preview environments (§12)** — the schema models them and deployments
  target an environment, but nothing creates one per branch yet.
- **Gateway** — nothing routes MCP traffic yet, so `request_log`, `tool_call`
  and `mcp_session` are empty and every metric reads `—`. The overview says so
  rather than drawing a chart. Deployed endpoints are reached directly.
- **Saved requests (§13)** — the `saved_request` table exists; naming and
  replaying a request across sessions does not. History is per page load.
- **Inspector authentication (§13)** — custom headers and a bearer token are
  supported by the API; OAuth against a protected server is not.
- **Rollback (§11)** — `rolled_back` is in the state machine and legal from
  `live`, but no UI or API triggers it yet.
- **Analytics, sessions, evaluations, marketplace, templates, CLI, AI builder,
  webhook delivery, billing** — schema and, where relevant, crypto and state
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
- **§13** asks for saved test cases and OAuth configuration in the Inspector.
  Executing, schema-driven forms, replay from history and the raw protocol
  view are built; persistence and OAuth are not, and the page does not pretend
  otherwise.
- **§10** describes GitHub as the import path. Repository import is
  implemented against plain git first, because that works without a configured
  GitHub App and covers GitLab, Bitbucket and self-hosted remotes as a side
  effect. The GitHub App adds listing and push webhooks on top of it rather
  than replacing it.
