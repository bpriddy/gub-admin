import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Nil UUID used as sentinel resourceId for grants that don't target a specific resource
// (staff_all, staff_current). The GUB access service ignores the resourceId for those types.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const StaffGrantSchema = z.discriminatedUnion('scopeType', [
  z.object({
    scopeType: z.enum(['staff_all', 'staff_current']),
    resourceId: z.string().optional(), // ignored — will use nil UUID
  }),
  z.object({
    scopeType: z.literal('staff_office'),
    resourceId: z.string().uuid(),
  }),
  z.object({
    scopeType: z.literal('staff_team'),
    resourceId: z.string().uuid(),
  }),
]).and(
  z.object({
    userId: z.string().uuid(),
    grantedBy: z.string().uuid(),
    role: z.enum(['viewer', 'contributor', 'manager', 'admin']).default('viewer'),
    expiresAt: z.string().nullable().optional(),
  })
);

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = StaffGrantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { userId, scopeType, grantedBy, role, expiresAt } = parsed.data;
  const resourceId: string =
    scopeType === 'staff_all' || scopeType === 'staff_current'
      ? NIL_UUID
      : (parsed.data as { resourceId: string }).resourceId;

  const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

  // Upsert: if an active grant already exists for this user + scope + resource, update it
  const existing = await prisma.accessGrant.findFirst({
    where: { userId, resourceType: scopeType, resourceId, revokedAt: null },
  });

  const grant = existing
    ? await prisma.accessGrant.update({
        where: { id: existing.id },
        data: { role, expiresAt: expiresAtDate },
      })
    : await prisma.accessGrant.create({
        data: { userId, resourceType: scopeType, resourceId, role, grantedBy, expiresAt: expiresAtDate },
      });

  return NextResponse.json({ granted: 1, grant }, { status: 201 });
}
