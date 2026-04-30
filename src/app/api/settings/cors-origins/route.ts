import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { validateCorsOrigin } from '@/lib/cors-origin-validation';

/**
 * GET /api/settings/cors-origins
 * List all allow-list entries with the staff name of who added each.
 * Read-only; no actor needed. The IAP gate is the access control.
 */
export async function GET() {
  const rows = await prisma.corsAllowedOrigin.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });

  // Look up Staff names for addedBy in one batched query.
  const addedByIds = Array.from(
    new Set(rows.map((r) => r.addedBy).filter((id): id is string => id !== null)),
  );
  const staff = addedByIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: addedByIds } },
        select: { id: true, fullName: true, email: true },
      })
    : [];
  const staffById = new Map(staff.map((s) => [s.id, s]));

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      addedByStaff: r.addedBy ? staffById.get(r.addedBy) ?? null : null,
    })),
  );
}

/**
 * POST /api/settings/cors-origins
 * Add a new allowed origin. Validation rejects wildcards, malformed URLs,
 * paths/queries, and non-http(s) protocols. Audit log records the actor.
 */
const CreateSchema = z
  .object({
    origin: z.string().min(1),
    label: z.string().max(200).nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const validation = validateCorsOrigin(parsed.data.origin);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'INVALID_ORIGIN', reason: validation.reason },
      { status: 400 },
    );
  }

  // Check for an existing row (active or inactive). Re-adding an existing
  // inactive origin should be an "activate" UX, not a duplicate insert —
  // but we surface it as a 409 here so the UI can guide the operator
  // explicitly rather than silently un-soft-deleting.
  const existing = await prisma.corsAllowedOrigin.findUnique({
    where: { origin: validation.normalized },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: 'ORIGIN_ALREADY_EXISTS',
        existing: { id: existing.id, isActive: existing.isActive },
      },
      { status: 409 },
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.corsAllowedOrigin.create({
      data: {
        origin: validation.normalized,
        label: parsed.data.label ?? null,
        isActive: true,
        addedBy: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'cors_origin_created',
        entityType: 'cors_allowed_origin',
        entityId: row.id,
        actorId,
        after: {
          origin: row.origin,
          label: row.label,
          isActive: row.isActive,
        },
      },
    });
    return row;
  });

  return NextResponse.json(created, { status: 201 });
}
