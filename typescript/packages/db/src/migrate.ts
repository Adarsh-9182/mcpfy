import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDatabase } from "./client";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../drizzle");

const url = process.env.DATABASE_URL;
const db = createDatabase(url);
const usingPglite = !url || url.startsWith("pglite://");

console.log(
  `Applying migrations to ${usingPglite ? "PGlite" : "Postgres"} from ${migrationsFolder}`,
);

if (usingPglite) {
  await migratePglite(db as never, { migrationsFolder });
} else {
  await migratePg(db as never, { migrationsFolder });
}

console.log("Migrations applied.");
process.exit(0);
