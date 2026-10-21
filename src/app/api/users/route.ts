import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isAdmin: true,
      isActive: true,
      createdAt: true,
    },
  });
  return NextResponse.json(users);
}

// Writable here: `isActive`, `displayName`, and `isAdmin: false` (demotion).
//
// `role` is intentionally NOT writable. Neither is `isAdmin: true`:
// promotion is not an action of this app. The authorization boundary for
// gub-admin is Cloud IAP (see README's "Authorization" section), so there is
// no in-app way to grant platform admin. Demotion is allowed because removing
// a privilege is safe to do from a break-glass tool, and it is audited below.
//
// `.strict()` plus `z.literal(false)` make that fail-loud: a body containing
// `role`, `isAdmin: true` (or any other unknown key) returns 400 rather than
// silently ignoring the field. If a future caller revives in-app role checks,
// that 400 is the early signal to revisit this design intentionally.
const UpdateUserSchema = z
  .object({
    isActive: z.boolean().optional(),
    displayName: z.string().nullable().optional(),
    isAdmin: z.literal(false).optional(),
  })
  .strict();

export async function PATCH(request: Request) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // Before/after carry only the fields this request named, so the row reads
  // as a diff of what the actor asked to change.
  const changed = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  const user = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({ where: { id }, data: parsed.data });
    for (const key of changed) {
      before[key] = existing[key];
      after[key] = row[key];
    }
    await tx.auditLog.create({
      data: {
        action: 'user_updated',
        entityType: 'user',
        entityId: row.id,
        actorId,
        before: before as Prisma.InputJsonObject,
        after: after as Prisma.InputJsonObject,
      },
    });
    return row;
  });

  return NextResponse.json(user);
}
