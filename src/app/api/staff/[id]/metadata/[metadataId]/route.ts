import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const UpdateSchema = z.object({
  type:       z.string().min(1).max(64).optional(),
  label:      z.string().min(1).max(256).optional(),
  value:      z.string().max(256).nullable().optional(),
  notes:      z.string().max(4000).nullable().optional(),
  metadata:   z.record(z.string(), z.unknown()).nullable().optional(),
  isFeatured: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; metadataId: string } },
) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.staffMetadata.findFirst({
    where: { id: params.metadataId, staffId: params.id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const input = parsed.data;
  const row = await prisma.staffMetadata.update({
    where: { id: params.metadataId },
    data: {
      ...(input.type       !== undefined ? { type: input.type }           : {}),
      ...(input.label      !== undefined ? { label: input.label }         : {}),
      ...(input.value      !== undefined ? { value: input.value ?? null } : {}),
      ...(input.notes      !== undefined ? { notes: input.notes ?? null } : {}),
      ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
      ...(input.metadata !== undefined
        ? { metadata: input.metadata != null ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull }
        : {}),
    },
  });

  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; metadataId: string } },
) {
  const existing = await prisma.staffMetadata.findFirst({
    where: { id: params.metadataId, staffId: params.id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.staffMetadata.delete({ where: { id: params.metadataId } });
  return new NextResponse(null, { status: 204 });
}
