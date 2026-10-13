/**
 * /api/grant-policies — create a grant policy.
 *
 * A policy is ALWAYS created inactive (`is_active=false`, set explicitly: the
 * column defaults to true) and ratified by the acting staff member, resolved
 * from the verified IAP identity (never from the body). It becomes live only
 * through POST /api/grant-policies/:id/activate, which needs a preview of the
 * policy's current state. Same audit pattern as the other admin writes:
 * requireActor + one audit_log row in the same transaction.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { policyTypeSpec, validatePolicyShape } from '@/lib/grant-policy';
import { CreateGrantPolicySchema, POLICY_AUDIT_ENTITY } from '@/lib/grant-policy-gate';
import { grantPolicyBackend } from '@/lib/grant-policy-backend';
import { lookupResourceNames, resourceName } from '@/lib/grant-policy-labels';

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
  const parsed = CreateGrantPolicySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }

  const { teamId, resourceType, role } = parsed.data;
  const resourceId = parsed.data.resourceId ?? null;

  const shapeError = validatePolicyShape({ resourceType, resourceId });
  if (shapeError) {
    return NextResponse.json(
      { error: shapeError.code, message: shapeError.message },
      { status: 400 },
    );
  }
  const spec = policyTypeSpec(resourceType);

  // A shape only newer backends understand is offered only where the backend
  // answers the preview route; enforce it here too, not just in the form.
  if (spec?.needsBackendPreview) {
    const backend = await grantPolicyBackend();
    if (!backend.available) {
      return NextResponse.json(
        {
          error: 'RESOURCE_TYPE_UNAVAILABLE',
          message: `'${resourceType}' policies need the backend's grant-policy preview, which is not available: ${backend.reason}.`,
        },
        { status: 409 },
      );
    }
  }

  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) {
    return NextResponse.json(
      { error: 'TEAM_NOT_FOUND', message: 'No such team.' },
      { status: 400 },
    );
  }
  if (resourceId) {
    const names = await lookupResourceNames([{ resourceType, resourceId }]);
    if (resourceName(names, { resourceType, resourceId }) === null) {
      return NextResponse.json(
        { error: 'RESOURCE_NOT_FOUND', message: 'No such resource.' },
        { status: 400 },
      );
    }
  }

  // One policy per team and target: a second one with another role would only
  // produce a role conflict at every sync. grant_policies has no unique key
  // for this, so the check and the insert run in one transaction under an
  // advisory lock on the (team, type, resource) triple: two concurrent
  // creates (a double submit, a second tab) queue, and the second finds the
  // first. The lock covers this route only; a row written by anything else
  // is still caught by the check, but not serialized against it.
  const created = await prisma.$transaction(async (tx) => {
    const lockKey = `grant_policy:${teamId}:${resourceType}:${resourceId ?? ''}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;
    const existing = await tx.grantPolicy.findFirst({
      where: { teamId, resourceType, resourceId },
      select: { id: true },
    });
    if (existing) return { existingId: existing.id };

    const row = await tx.grantPolicy.create({
      data: {
        teamId,
        resourceType,
        resourceId,
        role,
        isActive: false, // explicit: the column default is true
        ratifiedBy: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'grant_policy_created',
        entityType: POLICY_AUDIT_ENTITY,
        entityId: row.id,
        actorId,
        after: {
          teamId: row.teamId,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          role: row.role,
          isActive: row.isActive,
          ratifiedBy: row.ratifiedBy,
        },
      },
    });
    return { row };
  });
  if ('existingId' in created) {
    return NextResponse.json(
      {
        error: 'POLICY_EXISTS',
        message: 'This team already has a policy on this resource.',
        existingId: created.existingId,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(created.row, { status: 201 });
}
