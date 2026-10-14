import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { z } from 'zod';

const MemberSchema = z.object({ staffId: z.string().uuid() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  const body = await request.json();
  const parsed = MemberSchema.safeParse(body);
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
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  // The body must name exactly one member (a valid staffId); the delete is
  // never run with a missing or malformed filter.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = MemberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.teamMember.deleteMany({
    where: { teamId: params.id, staffId: parsed.data.staffId },
  });
  return new NextResponse(null, { status: 204 });
}
