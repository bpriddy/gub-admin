/**
 * /api/settings/trusted-apps — list + create trusted-app entries.
 *
 * Replaces the previous /api/settings/cors-origins route. Same audit
 * pattern (requireActor + audit_log entries on every write), now operating
 * on the consolidated trusted_apps table. The validation lib enforces
 * Google client_id shape AND origin shape.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { validateTrustedApp } from '@/lib/trusted-app-validation';

export async function GET() {
  const rows = await prisma.trustedApp.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });

  // Look up Staff names for addedBy in one batched query so the table
  // can render "Added by" without an N+1.
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

const CreateSchema = z
  .object({
    name: z.string(),
    origins: z.array(z.string()).default([]),
    googleClientIds: z.array(z.string()).default([]),
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

  const validation = validateTrustedApp(parsed.data);
  if (!validation.ok) {
    return NextResponse.json(
      { error: 'INVALID_TRUSTED_APP', reason: validation.reason },
      { status: 400 },
    );
  }

  // No cross-row uniqueness guard. The backend's pairing check
  // (isAudienceOriginPaired) is an existence query — "is there ANY active
  // row where this origin and this client_id co-exist" — so the same origin
  // or client_id appearing on multiple rows is harmless. Reuse is allowed
  // deliberately: registering a trusted app already requires gub-admin
  // access (IAP, a handful of admins), which is the real trust boundary.
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.trustedApp.create({
      data: {
        name: validation.normalized.name,
        origins: validation.normalized.origins,
        googleClientIds: validation.normalized.googleClientIds,
        isActive: true,
        addedBy: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'trusted_app_created',
        entityType: 'trusted_app',
        entityId: row.id,
        actorId,
        after: {
          name: row.name,
          origins: row.origins,
          googleClientIds: row.googleClientIds,
          isActive: row.isActive,
        },
      },
    });
    return row;
  });

  return NextResponse.json(created, { status: 201 });
}
