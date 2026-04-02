import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ReviewSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    reviewedByStaffId: z.string().uuid(),
    reviewNote: z.string().max(2000).nullable().optional(),
    // Optional grant overrides — defaults to the values on the request
    expiresAt: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal('deny'),
    reviewedByStaffId: z.string().uuid(),
    reviewNote: z.string().max(2000).nullable().optional(),
  }),
]);

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const accessRequest = await prisma.accessRequest.findUnique({
    where: { id: params.id },
  });

  if (!accessRequest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (accessRequest.status !== 'pending') {
    return NextResponse.json(
      { error: `Request is already ${accessRequest.status}` },
      { status: 409 },
    );
  }

  const { action, reviewedByStaffId, reviewNote } = parsed.data;
  const now = new Date();

  if (action === 'deny') {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.accessRequest.update({
        where: { id: params.id },
        data: {
          status: 'denied',
          reviewedByStaffId,
          reviewedAt: now,
          reviewNote: reviewNote ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'access_request_denied',
          entityType: 'access_request',
          entityId: params.id,
          actorId: reviewedByStaffId,
          before: {
            userId: accessRequest.userId,
            resourceType: accessRequest.resourceType,
            resourceId: accessRequest.resourceId,
            requestedRole: accessRequest.requestedRole,
            status: 'pending',
          },
          after: {
            status: 'denied',
            reviewNote: reviewNote ?? null,
          },
        },
      });

      return result;
    });

    return NextResponse.json(updated);
  }

  // ── Approve: upsert grant, mark request approved, write audit log ─────────

  const { expiresAt } = parsed.data;
  const resourceId = accessRequest.resourceId ?? NIL_UUID;

  // Upsert pattern — same approach as the existing grants API
  const existingGrant = await prisma.accessGrant.findFirst({
    where: {
      userId: accessRequest.userId,
      resourceType: accessRequest.resourceType,
      resourceId,
      revokedAt: null,
    },
  });

  const updated = await prisma.$transaction(async (tx) => {
    let grantId: string;
    let grantAction: 'grant_created' | 'grant_updated';

    if (existingGrant) {
      const updatedGrant = await tx.accessGrant.update({
        where: { id: existingGrant.id },
        data: {
          role: accessRequest.requestedRole,
          grantedBy: reviewedByStaffId,
          grantedAt: now,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          revokedAt: null,
          revokedBy: null,
        },
      });
      grantId = updatedGrant.id;
      grantAction = 'grant_updated';
    } else {
      const createdGrant = await tx.accessGrant.create({
        data: {
          userId: accessRequest.userId,
          resourceType: accessRequest.resourceType,
          resourceId,
          role: accessRequest.requestedRole,
          grantedBy: reviewedByStaffId,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
      });
      grantId = createdGrant.id;
      grantAction = 'grant_created';
    }

    // Audit the grant itself
    await tx.auditLog.create({
      data: {
        action: grantAction,
        entityType: 'access_grant',
        entityId: grantId,
        actorId: reviewedByStaffId,
        ...(existingGrant ? { before: { role: existingGrant.role, expiresAt: existingGrant.expiresAt } } : {}),
        after: {
          userId: accessRequest.userId,
          resourceType: accessRequest.resourceType,
          resourceId,
          role: accessRequest.requestedRole,
          expiresAt: expiresAt ?? null,
        },
        // Link back to the access request that triggered this grant
        metadata: { sourceRequestId: params.id },
      },
    });

    // Audit the request approval
    await tx.auditLog.create({
      data: {
        action: 'access_request_approved',
        entityType: 'access_request',
        entityId: params.id,
        actorId: reviewedByStaffId,
        before: {
          userId: accessRequest.userId,
          resourceType: accessRequest.resourceType,
          resourceId: accessRequest.resourceId,
          requestedRole: accessRequest.requestedRole,
          status: 'pending',
        },
        after: {
          status: 'approved',
          grantId,
          reviewNote: reviewNote ?? null,
        },
      },
    });

    return tx.accessRequest.update({
      where: { id: params.id },
      data: {
        status: 'approved',
        reviewedByStaffId,
        reviewedAt: now,
        reviewNote: reviewNote ?? null,
        grantId,
      },
    });
  });

  return NextResponse.json(updated);
}
