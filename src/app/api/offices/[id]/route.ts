import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateOfficeSchema = z.object({
  name: z.string().min(1).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = UpdateOfficeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const office = await prisma.office.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(office);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  // Unlink staff before deleting (office_id set to null via FK ON DELETE SET NULL)
  await prisma.office.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
