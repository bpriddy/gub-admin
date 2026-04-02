import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET() {
  const offices = await prisma.office.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { staff: true } } },
  });
  return NextResponse.json(offices);
}

const CreateOfficeSchema = z.object({
  name: z.string().min(1),
  oktaCity: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  startedAt: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateOfficeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, oktaCity, isActive, startedAt } = parsed.data;
  const office = await prisma.office.create({
    data: {
      name,
      isActive,
      ...(oktaCity ? { oktaCity } : {}),
      ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
    },
  });
  return NextResponse.json(office, { status: 201 });
}
