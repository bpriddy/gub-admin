import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { z } from 'zod';

const UpdateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  startedAt: z.string().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: {
          staff: {
            select: {
              id: true,
              fullName: true,
              email: true,
              title: true,
              status: true,
              office: { select: { name: true } },
            },
          },
        },
        orderBy: { staff: { fullName: 'asc' } },
      },
    },
  });
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(team);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  const body = await request.json();
  const parsed = UpdateTeamSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, description, isActive, startedAt } = parsed.data;

  const before = await prisma.team.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (isActive !== undefined) data.isActive = isActive;
  if (startedAt !== undefined) data.startedAt = startedAt ? new Date(startedAt) : null;

  const team = await prisma.team.update({ where: { id: params.id }, data });

  const changeRows: {
    teamId: string;
    property: string;
    valueText?: string | null;
    valueDate?: Date | null;
    changedBy?: string | null;
  }[] = [];

  // Attribute the change to the verified actor. A client-supplied id is never
  // read (see src/lib/actor.ts), so history cannot be attributed to someone else.
  const changedBy = actor.actorId;

  if (name !== undefined && name !== before.name) {
    changeRows.push({ teamId: params.id, property: 'name', valueText: name, changedBy });
  }
  if (description !== undefined && description !== before.description) {
    changeRows.push({
      teamId: params.id,
      property: 'description',
      valueText: description,
      changedBy,
    });
  }
  if (isActive !== undefined && isActive !== before.isActive) {
    changeRows.push({
      teamId: params.id,
      property: 'is_active',
      valueText: String(isActive),
      changedBy,
    });
  }
  if (startedAt !== undefined) {
    const newDate = startedAt ? new Date(startedAt) : null;
    const oldDate = before.startedAt;
    const changed = newDate?.toISOString() !== oldDate?.toISOString();
    if (changed) {
      changeRows.push({ teamId: params.id, property: 'started_at', valueDate: newDate, changedBy });
    }
  }

  if (changeRows.length > 0) {
    await prisma.teamChange.createMany({ data: changeRows });
  }

  return NextResponse.json(team);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  await prisma.team.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
