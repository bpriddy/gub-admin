import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateStaffSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  status: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  officeId: z.string().uuid().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const staff = await prisma.staff.findUnique({
    where: { id: params.id },
    include: { office: { select: { id: true, name: true } } },
  });
  if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(staff);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = UpdateStaffSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { startedAt, endedAt, ...rest } = parsed.data;
  const staff = await prisma.staff.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
      ...(endedAt !== undefined ? { endedAt: endedAt ? new Date(endedAt) : null } : {}),
    },
  });
  return NextResponse.json(staff);
}
