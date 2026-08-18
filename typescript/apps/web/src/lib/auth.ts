import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@mcpfy/db/client";
import { env, githubConfigured } from "./env";

/**
 * §24 — authentication.
 *
 * Sessions live in Postgres, not in a signed cookie payload, so revoking one
 * is immediate. Roles are defined once in the database package and reused
 * here, so the org plugin and our authorization checks cannot drift apart.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db(), {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    autoSignIn: true,
  },
  socialProviders: githubConfigured
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID!,
          clientSecret: env.GITHUB_CLIENT_SECRET!,
          // Requested up front so repository import (§10) does not need a
          // second consent round trip later.
          scope: ["read:user", "user:email", "repo"],
        },
      }
    : {},
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    cookiePrefix: "mcpfy",
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      creatorRole: "owner",
      membershipLimit: 100,
    }),
    // Must stay last: it flushes Set-Cookie through the Next.js cookie API.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
