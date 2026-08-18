/**
 * A real PostgreSQL for local development, without Docker.
 *
 * `embedded-postgres` ships genuine PostgreSQL binaries and runs them as a
 * child process. That matters more than convenience: PGlite is a single
 * embedded connection, and MCPfy runs background deployments alongside HTTP
 * requests — two writers is the normal case here, not an edge case, and PGlite
 * responds to it by aborting its WASM instance and taking the database with it.
 *
 *   pnpm db:up     start it (idempotent) and apply migrations
 *   pnpm db:down   stop it
 *
 * The cluster lives in .pgdev/ and survives restarts. PGlite is still
 * available via DATABASE_URL=pglite://… for a throwaway single-process run.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { readdir, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

const DATA_DIR = resolve(packageRoot, ".pgdev");
const PORT = Number(process.env.MCPFY_DEV_DB_PORT ?? 5433);
const USER = "mcpfy";
const PASSWORD = "mcpfy";
const DATABASE = "mcpfy";

export const DEV_DATABASE_URL = `postgres://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;

function isListening(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolvePromise(ok);
    };
    socket.setTimeout(800);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

/**
 * Restores the ICU version symlinks the published tarball is missing.
 *
 * The binaries link against `libicudata.68.dylib`, but npm only ships
 * `libicudata.68.2.dylib` — tarballs do not preserve the symlink, so initdb
 * aborts with a dyld error that says nothing about the real cause. Recreating
 * the links is a two-line fix; diagnosing it from the error is not.
 */
async function healNativeLibraries(): Promise<void> {
  let libDir: string;
  try {
    libDir = nativeDir("lib");
  } catch {
    return; // Not installed for this platform; up() will say so.
  }

  let entries: string[];
  try {
    entries = await readdir(libDir);
  } catch {
    return;
  }

  const present = new Set(entries);

  for (const file of entries) {
    if (!file.endsWith(".dylib")) continue;

    // libzstd.1.5.7.dylib is linked against as libzstd.1.dylib and as
    // libzstd.dylib depending on the consumer, so create every shortening
    // rather than guessing which one a given binary asks for.
    let stem = file.slice(0, -".dylib".length);
    while (stem.includes(".")) {
      stem = stem.slice(0, stem.lastIndexOf("."));
      const link = `${stem}.dylib`;
      if (present.has(link)) continue;
      try {
        await symlink(file, resolve(libDir, link));
        present.add(link);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
  }
}

/**
 * Locates the PostgreSQL binaries.
 *
 * The platform package is a transitive dependency of `embedded-postgres`, and
 * under pnpm's strict layout it is not resolvable from here — only from the
 * package that declares it. So resolve that one first and search from its
 * directory.
 */
function nativeDir(kind: "bin" | "lib"): string {
  const require = createRequire(import.meta.url);
  const platformPackage = `@embedded-postgres/${process.platform}-${process.arch}`;

  const roots: string[] = [import.meta.url];
  try {
    roots.push(pathToFileURL(require.resolve("embedded-postgres")).href);
  } catch {
    /* not installed; the error below will say so */
  }

  for (const root of roots) {
    const from = createRequire(root);
    for (const specifier of [platformPackage, `${platformPackage}/package.json`]) {
      let dir: string;
      try {
        dir = dirname(from.resolve(specifier));
      } catch {
        continue;
      }
      // The resolved entry may sit in dist/, so walk up to the package root
      // rather than assuming a fixed depth.
      for (let i = 0; i < 4; i++) {
        const candidate = resolve(dir, "native", kind);
        if (existsSync(candidate)) return candidate;
        dir = dirname(dir);
      }
    }
  }

  throw new Error(
    `No PostgreSQL binaries for ${process.platform}-${process.arch}. ` +
      `Install them with \`pnpm install\`, or set DATABASE_URL to a Postgres ` +
      `you run yourself.`,
  );
}

const binDir = () => nativeDir("bin");

/**
 * Runs a Postgres tool and resolves with its output.
 *
 * `pg_ctl start` is used rather than the library's own start(): it forks a
 * background postmaster that outlives this script, which is the whole point.
 * A server that dies when the command that started it exits is not a
 * development database, it is a very slow way to lose data.
 */
function run(
  tool: string,
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<{ code: number; output: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(resolve(binDir(), tool), args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PGPASSWORD: PASSWORD },
    });
    let output = "";
    child.stdout?.on("data", (c: Buffer) => (output += c.toString()));
    child.stderr?.on("data", (c: Buffer) => (output += c.toString()));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || options.allowFailure) {
        resolvePromise({ code: code ?? 0, output });
      } else {
        reject(new Error(`${tool} exited with ${code}:\n${output.trim()}`));
      }
    });
  });
}

async function up() {
  if (await isListening(PORT)) {
    await writePidHint();
    console.log(`Postgres already running: ${DEV_DATABASE_URL}`);
    return;
  }

  await healNativeLibraries();

  if (!existsSync(resolve(DATA_DIR, "PG_VERSION"))) {
    console.log(`Initialising a PostgreSQL cluster in ${DATA_DIR} …`);
    await mkdir(DATA_DIR, { recursive: true });
    const passwordFile = resolve(DATA_DIR, "..", ".pgpass-init");
    await writeFile(passwordFile, PASSWORD);
    await run("initdb", [
      "-D",
      DATA_DIR,
      "-U",
      USER,
      "--auth=trust",
      `--pwfile=${passwordFile}`,
      "--encoding=UTF8",
    ]);
  }

  console.log(`Starting PostgreSQL on port ${PORT} …`);
  await run("pg_ctl", [
    "-D",
    DATA_DIR,
    "-l",
    resolve(DATA_DIR, "server.log"),
    "-o",
    `-p ${PORT} -k ${DATA_DIR}`,
    "-w",
    "start",
  ]);

  await ensureDatabase();

  await writePidHint();
  console.log(`Ready: ${DEV_DATABASE_URL}`);
}

async function down() {
  if (!(await isListening(PORT))) {
    console.log("Postgres is not running.");
    return;
  }
  await run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "-w", "stop"]);
  console.log("Postgres stopped.");
}

/**
 * Creates the application database if it is missing.
 *
 * The package ships only initdb, pg_ctl and postgres — no createdb — so this
 * goes over the wire against the bootstrap `postgres` database instead.
 */
async function ensureDatabase(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const admin = postgres(
    `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/postgres`,
    { max: 1, onnotice: () => {} },
  );
  try {
    const rows = await admin`
      select 1 from pg_database where datname = ${DATABASE}
    `;
    if (rows.length === 0) {
      // Database names cannot be parameterised; DATABASE is a constant here.
      await admin.unsafe(`create database "${DATABASE}"`);
      console.log(`Created database "${DATABASE}".`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/** Leaves the URL on disk so tooling can find it without duplicating config. */
async function writePidHint() {
  await mkdir(DATA_DIR, { recursive: true });
  const marker = resolve(DATA_DIR, "connection-url");
  const existing = existsSync(marker) ? await readFile(marker, "utf8") : "";
  if (existing.trim() !== DEV_DATABASE_URL) {
    await writeFile(marker, DEV_DATABASE_URL);
  }
}

const command = process.argv[2];
if (command === "up") await up();
else if (command === "down") await down();
else {
  console.error("Usage: dev-db.mts up|down");
  process.exit(1);
}
process.exit(0);
