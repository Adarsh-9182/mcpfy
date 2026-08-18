import { z } from "zod";

/**
 * Fail at boot, not at 3am. Anything the server genuinely cannot run without
 * is required here; anything optional degrades a named feature and says so.
 */
const schema = z.object({
  DATABASE_URL: z.string().default("pglite://.pgdata"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  SECRET_ENCRYPTION_KEY: z
    .string()
    .min(1, "SECRET_ENCRYPTION_KEY is required to store deployment secrets"),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env.local and fill in the blanks.`,
    );
  }
  return parsed.data;
}

export const env = load();

/**
 * §10 — GitHub import is only offered when the app is actually configured for
 * it. The UI reads this instead of rendering a button that cannot work.
 */
export const githubConfigured = Boolean(
  env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET,
);
