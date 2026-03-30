import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: { staff: { select: { id: true, fullName: true, email: true, title: true, status: true, office: { select: { name: true } } } } },
        orderBy: { staff: { fullName: 'asc' } },
      },
    },
  });
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(team);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = UpdateTeamSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const team = await prisma.team.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(team);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.team.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
