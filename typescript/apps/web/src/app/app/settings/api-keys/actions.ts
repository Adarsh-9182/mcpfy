"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@mcpfy/db/client";
import {
  AuthorizationError,
  generateApiKey,
  owned,
  requireRole,
  scoped,
} from "@mcpfy/db";
import { requireViewer } from "@/lib/session";

export interface CreateKeyState {
  error?: string;
  /**
   * The full key, returned exactly once.
   *
   * Only the hash is stored, so this value cannot be recovered afterwards —
   * not by the user, not by support, not by us. That is the point.
   */
  plaintext?: string;
  name?: string;
}

export async function createApiKeyAction(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  const viewer = await requireViewer("/app/settings/api-keys");

  try {
    // Admin, not developer: a key is a long-lived credential for the whole
    // organization, which is a different weight of decision than deploying.
    requireRole(viewer.tenant, "admin");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { error: "Give the key a name you will recognise later." };
  }

  const key = generateApiKey();

  await db()
    .insert(schema.apiKey)
    .values(
      owned(viewer.tenant, {
        name,
        keyHash: key.keyHash,
        prefix: key.prefix,
        role: "developer" as const,
        createdByUserId: viewer.user.id,
      }),
    );

  await db().insert(schema.auditLog).values({
    organizationId: viewer.tenant.organizationId,
    actorUserId: viewer.user.id,
    action: "api_key.created",
    targetType: "api_key",
    targetId: key.prefix,
    // The prefix identifies which key; the key itself is never logged.
    metadata: { name, prefix: key.prefix },
  });

  revalidatePath("/app/settings/api-keys");
  return { plaintext: key.plaintext, name };
}

export async function revokeApiKeyAction(
  _prev: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const viewer = await requireViewer("/app/settings/api-keys");

  try {
    requireRole(viewer.tenant, "admin");
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    throw e;
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "No key was specified." };

  const updated = await db()
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(scoped(viewer.tenant, schema.apiKey, eq(schema.apiKey.id, id)))
    .returning({ prefix: schema.apiKey.prefix });

  if (updated.length === 0) return { error: "No such key." };

  await db().insert(schema.auditLog).values({
    organizationId: viewer.tenant.organizationId,
    actorUserId: viewer.user.id,
    action: "api_key.revoked",
    targetType: "api_key",
    targetId: id,
    metadata: { prefix: updated[0]!.prefix },
  });

  revalidatePath("/app/settings/api-keys");
  return {};
}
