import {
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema/index";

/**
 * One type for both drivers.
 *
 * The postgres-js and PGlite Drizzle instances expose the same query builder,
 * but their generated types are nominally distinct, and a union of the two
 * loses the call signatures of methods like `.transaction()`. Callers get the
 * postgres-js type — the one that runs in production — and the PGlite
 * instance is asserted into it at the single point below.
 */
export type Database = ReturnType<typeof drizzlePg<typeof schema>>;

/**
 * The instance is stashed on globalThis, not in a module-level variable.
 *
 * Next.js evaluates server code in several module graphs (server components,
 * route handlers, server actions) and reloads them on every edit in dev. A
 * per-module cache therefore yields several clients — which postgres-js
 * merely wastes connections on, but which corrupts PGlite outright, since two
 * instances cannot own the same data directory. One global survives both.
 */
const CACHE_KEY = Symbol.for("mcpfy.db.instance");
type Global = typeof globalThis & { [CACHE_KEY]?: Database };

/**
 * Two drivers, one schema.
 *
 * `postgres://…`  → postgres-js, for anything deployed.
 * `pglite://<dir>` or unset → PGlite, a real Postgres compiled to WASM that
 * runs in-process. This is what makes `pnpm dev` work with no Docker, no
 * installed Postgres and no cloud account, while still exercising genuine
 * Postgres semantics (enums, jsonb, partial indexes) rather than a SQLite
 * approximation that would drift from production.
 */
export function createDatabase(url = process.env.DATABASE_URL): Database {
  if (!url || url.startsWith("pglite://")) {
    const dir = url ? url.slice("pglite://".length) : ".pgdata";
    return drizzlePglite(serialized(openPglite(dir)), {
      schema,
      casing: "snake_case",
    }) as unknown as Database;
  }

  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return drizzlePg(client, { schema, casing: "snake_case" });
}

/**
 * Opens the local database, defending against the two ways PGlite gets
 * corrupted in a Next.js project.
 *
 * 1. `next build` forks a pool of workers, and each one evaluates server
 *    modules. Several processes opening the same data directory destroys it.
 *    Every route here is dynamic, so nothing real depends on build-time
 *    queries — the build gets a throwaway in-memory database instead.
 *
 * 2. Two dev servers, or a dev server and a migration, racing on the same
 *    directory does the same damage. A lock file names that the moment it
 *    happens, instead of a WASM abort ten minutes later that looks like a
 *    database bug.
 *
 * The lock warns rather than refuses: `next dev` legitimately runs the app
 * across several processes, so a hard failure would block ordinary use. It
 * cannot make PGlite multi-process safe — nothing can — it can only make the
 * moment of contention legible, and point at the fix, which is Postgres.
 */
function openPglite(dir: string): PGlite {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return new PGlite();
  }
  acquireLock(dir);
  return new PGlite(dir);
}

function acquireLock(dir: string): void {
  const lockPath = join(dir, "mcpfy.lock");

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

    const holder = Number(readFileSync(lockPath, "utf8").trim());
    if (Number.isFinite(holder) && holder !== process.pid && isAlive(holder)) {
      console.warn(
        `[mcpfy] The local database at ${dir} is also open by process ${holder}. ` +
          `PGlite is single-process: concurrent writers can corrupt it. If the ` +
          `database starts failing with "Aborted()", this is why — set ` +
          `DATABASE_URL to a Postgres instance to run several processes safely.`,
      );
    }

    // Take ownership either way: the holder may simply have crashed.
    writeFileSync(lockPath, String(process.pid));
  }

  const release = () => {
    try {
      if (readFileSync(lockPath, "utf8").trim() === String(process.pid)) {
        unlinkSync(lockPath);
      }
    } catch {
      // Nothing useful to do while the process is exiting.
    }
  };

  process.once("exit", release);
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(143);
  });
}

function isAlive(pid: number): boolean {
  try {
    // Signal 0 checks for existence without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * PGlite is a single embedded connection, not a pool: two overlapping queries
 * abort the WASM instance outright. Real request handlers fan out with
 * Promise.all all the time, so the dev driver is wrapped to run its queries
 * one at a time. This is a property of the local driver only — postgres-js
 * pools and needs no such thing — and it keeps `pnpm dev` working without a
 * database server rather than forcing every page to serialise its reads.
 */
function serialized(pg: PGlite): PGlite {
  const SERIAL = new Set(["query", "exec", "transaction", "sql"]);
  // Seed the chain with initialisation: PGlite aborts if a query arrives
  // before the WASM instance has finished booting, and the very first page
  // load fires several at once.
  let tail: Promise<unknown> = pg.waitReady.catch(() => undefined);

  return new Proxy(pg, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== "function") return value;

      const method = value as (...args: unknown[]) => unknown;
      if (!SERIAL.has(String(prop))) return method.bind(target);

      return (...args: unknown[]) => {
        const run = tail.then(() => method.apply(target, args));
        // Keep the chain alive after a rejection, but let callers see it.
        tail = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      };
    },
  }) as PGlite;
}

/** Process-wide singleton. Everything server-side should use this. */
export function db(): Database {
  const g = globalThis as Global;
  g[CACHE_KEY] ??= createDatabase();
  return g[CACHE_KEY];
}

export { schema };
