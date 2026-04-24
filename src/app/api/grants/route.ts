import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireActor } from '@/lib/actor';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const activeOnly = searchParams.get('activeOnly') !== 'false';

  const grants = await prisma.accessGrant.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(activeOnly ? { revokedAt: null } : {}),
    },
    orderBy: { grantedAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
    },
  });
  return NextResponse.json(grants);
}

// Note: `grantedBy` is NOT in this schema on purpose. The server resolves
// the acting Staff from the IAP identity (see src/lib/actor.ts). Accepting
// it from the body would let any IAP-authenticated user forge attribution.
const CreateGrantSchema = z.object({
  userId: z.string().uuid(),
  resourceType: z.string().min(1),
  resourceId: z.string().uuid().optional(), // omit for functional grants — nil UUID used
  role: z.string().min(1).default('viewer'),
  expiresAt: z.string().nullable().optional(),
});

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function POST(request: Request) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const body = await request.json();
  const parsed = CreateGrantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { userId, resourceType, role, expiresAt } = parsed.data;
  const resourceId = parsed.data.resourceId ?? NIL_UUID;
  const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

  const existing = await prisma.accessGrant.findFirst({
    where: { userId, resourceType, resourceId, revokedAt: null },
  });

  const grant = await prisma.$transaction(async (tx) => {
    const result = existing
      ? await tx.accessGrant.update({
          where: { id: existing.id },
          data: { role, expiresAt: expiresAtDate },
        })
      : await tx.accessGrant.create({
          data: { userId, resourceType, resourceId, role, grantedBy: actorId, expiresAt: expiresAtDate },
        });

    await tx.auditLog.create({
      data: {
        action: existing ? 'grant_updated' : 'grant_created',
        entityType: 'access_grant',
        entityId: result.id,
        actorId,
        ...(existing ? { before: { role: existing.role, expiresAt: existing.expiresAt } } : {}),
        after: { userId, resourceType, resourceId, role, expiresAt: expiresAtDate },
      },
    });

    return result;
  });

  return NextResponse.json({ granted: 1, grant }, { status: 201 });
}

// Same rule for revoke: `revokedBy` is server-resolved, never body-supplied.
const RevokeSchema = z.object({
  grantId: z.string().uuid(),
});

export async function DELETE(request: Request) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const body = await request.json();
  const parsed = RevokeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { grantId } = parsed.data;

  const existing = await prisma.accessGrant.findFirst({
    where: { id: grantId, revokedAt: null },
  });

  if (!existing) return NextResponse.json({ error: 'Grant not found or already revoked' }, { status: 404 });

  const now = new Date();

  const grant = await prisma.$transaction(async (tx) => {
    const result = await tx.accessGrant.update({
      where: { id: grantId },
      data: { revokedAt: now, revokedBy: actorId },
    });

    await tx.auditLog.create({
      data: {
        action: 'grant_revoked',
        entityType: 'access_grant',
        entityId: grantId,
        actorId,
        before: {
          userId: existing.userId,
          resourceType: existing.resourceType,
          resourceId: existing.resourceId,
          role: existing.role,
          expiresAt: existing.expiresAt,
          grantedAt: existing.grantedAt,
        },
        after: { revokedAt: now, revokedBy: actorId },
      },
    });

    return result;
  });

  return NextResponse.json(grant);
}
