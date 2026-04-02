import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateAppSchema = z.object({
  name:         z.string().min(1).max(128).optional(),
  description:  z.string().max(512).nullable().optional(),
  autoAccess:   z.boolean().optional(),
  dbIdentifier: z.string().max(256).nullable().optional(),
  isActive:     z.boolean().optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const app = await prisma.app.findUnique({
    where: { id: params.id },
    include: { _count: { select: { permissions: true, accessRequests: true } } },
  });
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(app);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateAppSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const app = await prisma.app.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return NextResponse.json(app);
}
