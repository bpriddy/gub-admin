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

  const grant = await prisma.accessGrant.update({
    where: { id: grantId },
    data: { revokedAt: new Date(), revokedBy },
  });
  return NextResponse.json(grant);
}
