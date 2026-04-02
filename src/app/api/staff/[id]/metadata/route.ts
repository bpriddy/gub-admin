import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const CreateSchema = z.object({
  type:       z.string().min(1).max(64),
  label:      z.string().min(1).max(256),
  value:      z.string().max(256).nullable().optional(),
  notes:      z.string().max(4000).nullable().optional(),
  metadata:   z.record(z.string(), z.unknown()).nullable().optional(),
  isFeatured: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const type = new URL(_request.url).searchParams.get('type') ?? undefined;
  const rows = await prisma.staffMetadata.findMany({
    where: { staffId: params.id, ...(type ? { type } : {}) },
    orderBy: [{ type: 'asc' }, { label: 'asc' }],
  });
  return NextResponse.json(rows);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { metadata, ...rest } = parsed.data;

  const row = await prisma.staffMetadata.create({
    data: {
      staffId: params.id,
      ...rest,
      value:      rest.value      ?? null,
      notes:      rest.notes      ?? null,
      isFeatured: rest.isFeatured ?? false,
      ...(metadata != null ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    },
  });

  return NextResponse.json(row, { status: 201 });
}
