import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ReviewSchema = z.discriminatedUnion('action', [
  z.object({
    action:           z.literal('approve'),
    reviewedByStaffId: z.string().uuid(),
    reviewNote:       z.string().max(2000).nullable().optional(),
    role:             z.string().default('viewer'),
  }),
  z.object({
    action:           z.literal('deny'),
    reviewedByStaffId: z.string().uuid(),
    reviewNote:       z.string().max(2000).nullable().optional(),
  }),
]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const accessRequest = await prisma.appAccessRequest.findUnique({
    where: { id: params.id },
  });

  if (!accessRequest) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (accessRequest.status !== 'pending') {
    return NextResponse.json({ error: `Request is already ${accessRequest.status}` }, { status: 409 });
  }

  const { action, reviewedByStaffId, reviewNote } = parsed.data;
  const now = new Date();

  if (action === 'deny') {
    const updated = await prisma.appAccessRequest.update({
      where: { id: params.id },
      data: { status: 'denied', reviewedByStaffId, reviewedAt: now, reviewNote: reviewNote ?? null },
    });
    return NextResponse.json(updated);
  }

  // ── Approve: create UserAppPermission + mark request resolved ────────────
  const { role } = parsed.data;

  // Resolve reviewer's userId for the grantedById FK (UserAppPermission.grantedById → User)
  const reviewer = await prisma.staff.findUnique({
    where: { id: reviewedByStaffId },
    select: { userId: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    // Upsert — idempotent if permission already exists
    await tx.userAppPermission.upsert({
      where:  { userId_appId: { userId: accessRequest.userId, appId: accessRequest.appId } },
      create: {
        userId: accessRequest.userId,
        appId: accessRequest.appId,
        role,
        ...(reviewer?.userId ? { grantedById: reviewer.userId } : {}),
      },
      update: { role },
    });

    return tx.appAccessRequest.update({
      where: { id: params.id },
      data:  { status: 'approved', reviewedByStaffId, reviewedAt: now, reviewNote: reviewNote ?? null },
    });
  });

  return NextResponse.json(updated);
}
