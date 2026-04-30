/**
 * /api/settings/oauth-clients/[clientId] — edit / toggle / hard-delete.
 *
 * Mirrors /api/settings/cors-origins/[id]:
 *   - PATCH supports `isActive`, `name`, and `redirectUris` updates. The
 *     immutable parts (`clientId`, `clientSecretHash`) cannot be changed
 *     here — to rotate a secret, delete and re-register.
 *   - DELETE is a HARD delete. Cascades remove pending auths + auth codes
 *     for this client (FK relations have onDelete: Cascade in schema).
 *     Operators who want a recoverable removal should use PATCH with
 *     isActive=false instead.
 *   - Both write paths require requireActor() and write to audit_log.
 *
 * Note: the path parameter is named `clientId` (the public string like
 * `gub_<hex>`), not the row's UUID `id`. That keeps URLs friendlier and
 * matches what the UI table renders. We resolve to the UUID before
 * writing audit entries, since AuditLog.entityId is db.Uuid.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { validateClientName, validateRedirectUris } from '@/lib/oauth-client-validation';

const PatchSchema = z
  .object({
    isActive: z.boolean().optional(),
    name: z.string().optional(),
    redirectUris: z.array(z.string()).optional(),
  })
  .strict()
  .refine(
    (d) => d.isActive !== undefined || d.name !== undefined || d.redirectUris !== undefined,
    { message: 'Must update at least one of isActive, name, or redirectUris' },
  );

export async function PATCH(
  request: Request,
  { params }: { params: { clientId: string } },
) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: params.clientId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const updates: { isActive?: boolean; name?: string; redirectUris?: string[] } = {};

  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  if (parsed.data.name !== undefined) {
    const nameResult = validateClientName(parsed.data.name);
    if (!nameResult.ok) {
      return NextResponse.json(
        { error: 'INVALID_NAME', reason: nameResult.reason },
        { status: 400 },
      );
    }
    updates.name = nameResult.normalized;
  }

  if (parsed.data.redirectUris !== undefined) {
    const urisResult = validateRedirectUris(parsed.data.redirectUris);
    if (!urisResult.ok) {
      return NextResponse.json(
        { error: 'INVALID_REDIRECT_URIS', reason: urisResult.reason },
        { status: 400 },
      );
    }
    updates.redirectUris = urisResult.normalized;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.oAuthClient.update({
      where: { clientId: params.clientId },
      data: updates,
      select: {
        id: true,
        clientId: true,
        name: true,
        redirectUris: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'oauth_client_updated',
        entityType: 'oauth_client',
        entityId: row.id,
        actorId,
        before: {
          name: existing.name,
          redirectUris: existing.redirectUris,
          isActive: existing.isActive,
        },
        after: {
          name: row.name,
          redirectUris: row.redirectUris,
          isActive: row.isActive,
        },
      },
    });
    return row;
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { clientId: string } },
) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const existing = await prisma.oAuthClient.findUnique({
    where: { clientId: params.clientId },
    select: {
      id: true,
      clientId: true,
      name: true,
      redirectUris: true,
      isActive: true,
      _count: { select: { authCodes: true, pendingAuths: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    // FK cascade removes oauth_pending_auths + oauth_auth_codes rows.
    await tx.oAuthClient.delete({ where: { clientId: params.clientId } });
    await tx.auditLog.create({
      data: {
        action: 'oauth_client_deleted',
        entityType: 'oauth_client',
        entityId: existing.id,
        actorId,
        before: {
          clientId: existing.clientId,
          name: existing.name,
          redirectUris: existing.redirectUris,
          isActive: existing.isActive,
        },
        metadata: {
          cascade: {
            authCodes: existing._count.authCodes,
            pendingAuths: existing._count.pendingAuths,
          },
        },
      },
    });
  });

  return NextResponse.json({ deleted: 1 });
}
