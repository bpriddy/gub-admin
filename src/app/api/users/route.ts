import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

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

// Note: `role` and `isAdmin` are intentionally NOT writable here. The
// authorization boundary for this app is Cloud IAP (see README's
// "Authorization" section). The columns are still read for the list view
// but cannot be set or modified from this surface.
//
// `.strict()` makes that fail-loud: a body containing `role` or `isAdmin`
// (or any other unknown key) returns 400 rather than silently ignoring
// the field. If a future caller revives in-app role checks, that 400 is
// the early signal to revisit this design intentionally.
const UpdateUserSchema = z.object({
  isActive: z.boolean().optional(),
  displayName: z.string().nullable().optional(),
}).strict();

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await request.json();
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const user = await prisma.user.update({ where: { id }, data: parsed.data });
  return NextResponse.json(user);
}
