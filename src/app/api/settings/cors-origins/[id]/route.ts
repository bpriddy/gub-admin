import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';

/**
 * PATCH /api/settings/cors-origins/:id
 * Toggle isActive and/or update label. Origin string itself is immutable
 * — to change an origin, delete and re-add. (Editing the origin string
 * would invalidate any audit history that references the old value.)
 */
const PatchSchema = z
  .object({
    isActive: z.boolean().optional(),
    label: z.string().max(200).nullable().optional(),
  })
  .strict()
  .refine((d) => d.isActive !== undefined || d.label !== undefined, {
    message: 'Must update at least one of isActive or label',
  });

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

  const existing = await prisma.corsAllowedOrigin.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const updates: { isActive?: boolean; label?: string | null } = {};
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.corsAllowedOrigin.update({
      where: { id: params.id },
      data: updates,
    });
    await tx.auditLog.create({
      data: {
        action: 'cors_origin_updated',
        entityType: 'cors_allowed_origin',
        entityId: row.id,
        actorId,
        before: {
          isActive: existing.isActive,
          label: existing.label,
        },
        after: {
          isActive: row.isActive,
          label: row.label,
        },
      },
    });
    return row;
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/settings/cors-origins/:id
 * Hard delete. Operator's call when an entry is genuinely no longer
 * needed; for "we want this gone but might restore later," use PATCH
 * with isActive=false instead. Audit log retains a record.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const existing = await prisma.corsAllowedOrigin.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.corsAllowedOrigin.delete({ where: { id: params.id } });
    await tx.auditLog.create({
      data: {
        action: 'cors_origin_deleted',
        entityType: 'cors_allowed_origin',
        entityId: params.id,
        actorId,
        before: {
          origin: existing.origin,
          label: existing.label,
          isActive: existing.isActive,
        },
      },
    });
  });

  return NextResponse.json({ deleted: 1 });
}
