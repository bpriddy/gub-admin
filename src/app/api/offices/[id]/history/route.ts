import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const changes = await prisma.officeChange.findMany({
    where: { officeId: params.id },
    orderBy: { changedAt: 'desc' },
    include: { changedByStaff: { select: { fullName: true } } },
  });
  return NextResponse.json(changes);
}
