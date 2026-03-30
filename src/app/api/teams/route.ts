import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET() {
  const teams = await prisma.team.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { members: true } } },
  });
  return NextResponse.json(teams);
}

const CreateTeamSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  startedAt: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateTeamSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, description, isActive, startedAt } = parsed.data;
  const team = await prisma.team.create({
    data: { name, description: description ?? null, isActive, ...(startedAt ? { startedAt: new Date(startedAt) } : {}) },
  });
  return NextResponse.json(team, { status: 201 });
}
