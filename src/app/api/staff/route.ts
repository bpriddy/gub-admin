import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET() {
  const staff = await prisma.staff.findMany({
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      userId: true,
      officeId: true,
      fullName: true,
      email: true,
      title: true,
      department: true,
      status: true,
      startedAt: true,
      endedAt: true,
      office: { select: { name: true } },
    },
  });
  return NextResponse.json(staff);
}

const CreateStaffSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  status: z.string().default('active'),
  startedAt: z.string(),
  endedAt: z.string().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  officeId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateStaffSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { startedAt, endedAt, ...rest } = parsed.data;
  const staff = await prisma.staff.create({
    data: {
      ...rest,
      startedAt: new Date(startedAt),
      endedAt: endedAt ? new Date(endedAt) : null,
    },
  });
  return NextResponse.json(staff, { status: 201 });
}
