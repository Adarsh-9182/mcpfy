import type { Metadata } from "next";
import { desc, isNull } from "drizzle-orm";
import { Badge, EmptyState } from "@mcpfy/ui";
import { db, schema } from "@mcpfy/db/client";
import { hasRole, scoped } from "@mcpfy/db";
import { requireViewer } from "@/lib/session";
import { ApiKeys } from "./api-keys";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const viewer = await requireViewer("/app/settings/api-keys");

  const keys = await db()
    .select({
      id: schema.apiKey.id,
      name: schema.apiKey.name,
      prefix: schema.apiKey.prefix,
      createdAt: schema.apiKey.createdAt,
      lastUsedAt: schema.apiKey.lastUsedAt,
      revokedAt: schema.apiKey.revokedAt,
    })
    .from(schema.apiKey)
    .where(scoped(viewer.tenant, schema.apiKey))
    .orderBy(desc(schema.apiKey.createdAt))
    .limit(50);

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-medium text-hi">API keys</h1>
        <p className="mt-1 max-w-xl text-base leading-relaxed text-muted">
          Keys authenticate MCP clients to your gateway, and the REST API to
          your organization. Only the hash is stored — the key itself is shown
          once, at creation, and cannot be recovered afterwards.
        </p>
      </div>

      {active.length === 0 && keys.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          what="A key is what lets Claude, Cursor or a script reach your servers through the MCPfy gateway."
          why="None have been created for this organization."
          actions={
            <ApiKeys
              keys={[]}
              canManage={hasRole(viewer.tenant, "admin")}
              role={viewer.tenant.role}
              formOnly
            />
          }
        />
      ) : (
        <ApiKeys
          keys={keys.map((k) => ({
            ...k,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            revokedAt: k.revokedAt?.toISOString() ?? null,
          }))}
          canManage={hasRole(viewer.tenant, "admin")}
          role={viewer.tenant.role}
        />
      )}

      {!hasRole(viewer.tenant, "admin") ? (
        <p className="mt-4 flex items-center gap-2 text-2xs text-subtle">
          <Badge tone="warning">read only</Badge>
          Creating and revoking keys requires the admin role.
        </p>
      ) : null}
    </div>
  );
}
