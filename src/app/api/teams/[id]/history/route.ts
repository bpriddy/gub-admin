import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const changes = await prisma.teamChange.findMany({
    where: { teamId: params.id },
    orderBy: { changedAt: 'desc' },
    include: { changedByStaff: { select: { fullName: true } } },
  });
  return NextResponse.json(changes);
}
