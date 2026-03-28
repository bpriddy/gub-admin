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

const UpdateUserSchema = z.object({
  role: z.string().optional(),
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayName: z.string().nullable().optional(),
});

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
