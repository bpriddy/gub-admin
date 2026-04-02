import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

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

const CreateGrantSchema = z.object({
  userId: z.string().uuid(),
  resourceType: z.string().min(1),
  resourceId: z.string().uuid().optional(), // omit for functional grants — nil UUID used
  role: z.string().min(1).default('viewer'),
  grantedBy: z.string().uuid(),
  expiresAt: z.string().nullable().optional(),
});

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateGrantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { userId, resourceType, role, grantedBy, expiresAt } = parsed.data;
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
          data: { userId, resourceType, resourceId, role, grantedBy, expiresAt: expiresAtDate },
        });

    await tx.auditLog.create({
      data: {
        action: existing ? 'grant_updated' : 'grant_created',
        entityType: 'access_grant',
        entityId: result.id,
        actorId: grantedBy,
        ...(existing ? { before: { role: existing.role, expiresAt: existing.expiresAt } } : {}),
        after: { userId, resourceType, resourceId, role, expiresAt: expiresAtDate },
      },
    });

    return result;
  });

  return NextResponse.json({ granted: 1, grant }, { status: 201 });
}

const RevokeSchema = z.object({
  grantId: z.string().uuid(),
  revokedBy: z.string().uuid(),
});

export async function DELETE(request: Request) {
  const body = await request.json();
  const parsed = RevokeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { grantId, revokedBy } = parsed.data;

  const existing = await prisma.accessGrant.findFirst({
    where: { id: grantId, revokedAt: null },
  });

  if (!existing) return NextResponse.json({ error: 'Grant not found or already revoked' }, { status: 404 });

  const now = new Date();

  const grant = await prisma.$transaction(async (tx) => {
    const result = await tx.accessGrant.update({
      where: { id: grantId },
      data: { revokedAt: now, revokedBy },
    });

    await tx.auditLog.create({
      data: {
        action: 'grant_revoked',
        entityType: 'access_grant',
        entityId: grantId,
        actorId: revokedBy,
        before: {
          userId: existing.userId,
          resourceType: existing.resourceType,
          resourceId: existing.resourceId,
          role: existing.role,
          expiresAt: existing.expiresAt,
          grantedAt: existing.grantedAt,
        },
        after: { revokedAt: now, revokedBy },
      },
    });

    return result;
  });

  return NextResponse.json(grant);
}
