import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateSchema = z.object({
  syncInterval: z.enum(['hourly', 'daily', 'weekly', 'manual']).optional(),
  cronSchedule: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: { key: string } }) {
  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.dataSource.findUnique({ where: { key: params.key } });
  if (!existing) {
    return NextResponse.json({ error: 'Data source not found' }, { status: 404 });
  }

  const updated = await prisma.dataSource.update({
    where: { key: params.key },
    data: {
      ...(parsed.data.syncInterval !== undefined ? { syncInterval: parsed.data.syncInterval } : {}),
      ...(parsed.data.cronSchedule !== undefined ? { cronSchedule: parsed.data.cronSchedule } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  });

  return NextResponse.json(updated);
}
