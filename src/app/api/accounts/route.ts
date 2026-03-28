import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET() {
  const accounts = await prisma.account.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { campaigns: true } },
    },
  });
  return NextResponse.json(accounts);
}

const CreateAccountSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const account = await prisma.account.create({ data: parsed.data });
  return NextResponse.json(account, { status: 201 });
}
