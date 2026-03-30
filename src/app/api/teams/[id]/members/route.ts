import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const AddMemberSchema = z.object({ staffId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // upsert so duplicate adds are idempotent
  const member = await prisma.teamMember.upsert({
    where: { teamId_staffId: { teamId: params.id, staffId: parsed.data.staffId } },
    create: { teamId: params.id, staffId: parsed.data.staffId },
    update: {},
  });
  return NextResponse.json(member, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { staffId } = await request.json() as { staffId: string };
  await prisma.teamMember.delete({
    where: { teamId_staffId: { teamId: params.id, staffId } },
  });
  return new NextResponse(null, { status: 204 });
}
