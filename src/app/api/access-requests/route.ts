import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/access-requests
 *
 * Query params:
 *   status   – filter by status: pending | approved | denied | all (default: pending)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status') ?? 'pending';

  const requests = await prisma.accessRequest.findMany({
    where: statusFilter === 'all' ? {} : { status: statusFilter },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
      reviewedByStaff: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json(requests);
}
