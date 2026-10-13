import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { z } from 'zod';

const UpdateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const account = await prisma.account.findUnique({
    where: { id: params.id },
    include: {
      campaigns: { orderBy: { name: 'asc' } },
      changes: { orderBy: { changedAt: 'desc' }, take: 50 },
      parent: { select: { id: true, name: true } },
      children: { select: { id: true, name: true } },
    },
  });
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(account);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  const body = await request.json();
  const parsed = UpdateAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const account = await prisma.account.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(account);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  await prisma.account.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
