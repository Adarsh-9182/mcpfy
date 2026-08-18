import { randomUUID } from "node:crypto";
import { text, timestamp } from "drizzle-orm/pg-core";

/**
 * Every table uses text ids rather than serial integers: ids travel through
 * URLs, API responses and MCP client configs, and monotonic integers leak
 * tenant volume to anyone who can see one.
 */
export const primaryId = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Applied to every tenant-owned table. See `assertOrgScope` in ../tenancy.ts. */
export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};
