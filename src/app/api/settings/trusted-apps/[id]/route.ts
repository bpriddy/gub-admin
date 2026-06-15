/**
 * /api/settings/trusted-apps/[id] — edit / toggle / hard-delete a row.
 *
 * Mirror of the legacy /api/settings/cors-origins/[id], extended for the
 * consolidated schema. PATCH supports updates to name, origins,
 * googleClientIds, and isActive. DELETE is a hard delete (operators who
 * want recoverable removal use isActive=false instead). Both write paths
 * require requireActor() and write to audit_log.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { validateTrustedApp } from '@/lib/trusted-app-validation';

const PatchSchema = z
  .object({
    name: z.string().optional(),
    origins: z.array(z.string()).optional(),
    googleClientIds: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.name !== undefined ||
      d.origins !== undefined ||
      d.googleClientIds !== undefined ||
      d.isActive !== undefined,
    {
      message: 'Must update at least one of name, origins, googleClientIds, or isActive',
    },
  );

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
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

  const existing = await prisma.trustedApp.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // If the patch touches identifier shape, re-run the full validation
  // against the would-be merged row. We compose name/origins/clientIds
  // from the patch + existing values so an operator can edit one field
  // at a time and still get coherent validation feedback.
  const wouldBe = {
    name: parsed.data.name ?? existing.name,
    origins: parsed.data.origins ?? existing.origins,
    googleClientIds: parsed.data.googleClientIds ?? existing.googleClientIds,
  };
  const touchesShape =
    parsed.data.name !== undefined ||
    parsed.data.origins !== undefined ||
    parsed.data.googleClientIds !== undefined;
  let normalizedShape = wouldBe;
  if (touchesShape) {
    const validation = validateTrustedApp(wouldBe);
    if (!validation.ok) {
      return NextResponse.json(
        { error: 'INVALID_TRUSTED_APP', reason: validation.reason },
        { status: 400 },
      );
    }
    normalizedShape = validation.normalized;

    // No cross-row uniqueness guard — reuse of an origin or client_id across
    // rows is allowed. The backend pairs by existence (any active row where
    // origin + client_id co-exist), so duplicates are harmless. See the
    // create route for the full rationale.
  }

  const updates: {
    name?: string;
    origins?: string[];
    googleClientIds?: string[];
    isActive?: boolean;
  } = {};
  if (parsed.data.name !== undefined) updates.name = normalizedShape.name;
  if (parsed.data.origins !== undefined) updates.origins = normalizedShape.origins;
  if (parsed.data.googleClientIds !== undefined) {
    updates.googleClientIds = normalizedShape.googleClientIds;
  }
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.trustedApp.update({
      where: { id: existing.id },
      data: updates,
    });
    await tx.auditLog.create({
      data: {
        action: 'trusted_app_updated',
        entityType: 'trusted_app',
        entityId: row.id,
        actorId,
        before: {
          name: existing.name,
          origins: existing.origins,
          googleClientIds: existing.googleClientIds,
          isActive: existing.isActive,
        },
        after: {
          name: row.name,
          origins: row.origins,
          googleClientIds: row.googleClientIds,
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
  { params }: { params: { id: string } },
) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const existing = await prisma.trustedApp.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.trustedApp.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        action: 'trusted_app_deleted',
        entityType: 'trusted_app',
        entityId: existing.id,
        actorId,
        before: {
          name: existing.name,
          origins: existing.origins,
          googleClientIds: existing.googleClientIds,
          isActive: existing.isActive,
        },
      },
    });
  });

  return NextResponse.json({ deleted: 1 });
}
