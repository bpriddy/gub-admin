import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateOfficeSchema = z.object({
  name: z.string().min(1).optional(),
  oktaCity: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  startedAt: z.string().nullable().optional(),
  changedByStaffId: z.string().uuid().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = UpdateOfficeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, oktaCity, isActive, startedAt, changedByStaffId } = parsed.data;

  const before = await prisma.office.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (oktaCity !== undefined) data.oktaCity = oktaCity ?? null;
  if (isActive !== undefined) data.isActive = isActive;
  if (startedAt !== undefined) data.startedAt = startedAt ? new Date(startedAt) : null;

  const office = await prisma.office.update({ where: { id: params.id }, data });

  // Write one change-log row per property that actually changed
  const changeRows: {
    officeId: string;
    property: string;
    valueText?: string | null;
    valueDate?: Date | null;
    changedBy?: string | null;
  }[] = [];

  const changedBy = changedByStaffId ?? null;

  if (name !== undefined && name !== before.name) {
    changeRows.push({ officeId: params.id, property: 'name', valueText: name, changedBy });
  }
  if (oktaCity !== undefined && (oktaCity ?? null) !== before.oktaCity) {
    changeRows.push({ officeId: params.id, property: 'okta_city', valueText: oktaCity ?? null, changedBy });
  }
  if (isActive !== undefined && isActive !== before.isActive) {
    changeRows.push({ officeId: params.id, property: 'is_active', valueText: String(isActive), changedBy });
  }
  if (startedAt !== undefined) {
    const newDate = startedAt ? new Date(startedAt) : null;
    const oldDate = before.startedAt;
    const changed = newDate?.toISOString() !== oldDate?.toISOString();
    if (changed) {
      changeRows.push({ officeId: params.id, property: 'started_at', valueDate: newDate, changedBy });
    }
  }

  if (changeRows.length > 0) {
    await prisma.officeChange.createMany({ data: changeRows });
  }

  return NextResponse.json(office);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.office.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
