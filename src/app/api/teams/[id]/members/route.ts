import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const AddMemberSchema = z.object({ staffId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = AddMemberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // duplicate adds are idempotent; uniqueness is guarded at the DB level by the
  // partial index team_members_linked_unique (team_id, staff_id WHERE staff_id IS NOT NULL),
  // which Prisma cannot express as a compound unique in the schema
  const existing = await prisma.teamMember.findFirst({
    where: { teamId: params.id, staffId: parsed.data.staffId },
  });
  if (existing) return NextResponse.json(existing, { status: 200 });
  const member = await prisma.teamMember.create({
    data: { teamId: params.id, staffId: parsed.data.staffId },
  });
  return NextResponse.json(member, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { staffId } = await request.json() as { staffId: string };
  await prisma.teamMember.deleteMany({
    where: { teamId: params.id, staffId },
  });
  return new NextResponse(null, { status: 204 });
}
