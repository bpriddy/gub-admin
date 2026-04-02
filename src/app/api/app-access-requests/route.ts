import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'pending';
  const appId  = searchParams.get('appId') ?? undefined;

  const requests = await prisma.appAccessRequest.findMany({
    where: {
      ...(status !== 'all' ? { status } : {}),
      ...(appId ? { appId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      user:            { select: { id: true, email: true, displayName: true } },
      app:             { select: { appId: true, name: true } },
      reviewedByStaff: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(requests);
}
