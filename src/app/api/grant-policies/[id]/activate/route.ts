/**
 * POST /api/grant-policies/:id/activate — make a policy eligible for the grant
 * sync. It writes no grants itself: the next sync run (the scheduled job, or
 * the sign-in run where enabled) turns the policy into access grants.
 *
 * A separate, explicit action that is refused unless the acting staff member
 * was shown a preview of the policy's CURRENT state in the last
 * PREVIEW_MAX_AGE_MS, with no activation or deactivation since, and that
 * preview said the sync would materialize it (checkPreviewGate in
 * src/lib/grant-policy-gate.ts; the preview is recorded by
 * POST /api/grant-policies/:id/preview).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import {
  ACTIVATED_AUDIT_ACTION,
  checkPreviewGate,
  POLICY_AUDIT_ENTITY,
  policyStateHash,
} from '@/lib/grant-policy-gate';
import { loadGateInputs } from '@/lib/grant-policy-previews';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const id = z.guid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: 'Invalid policy id' }, { status: 400 });

  const policy = await prisma.grantPolicy.findUnique({ where: { id: id.data } });
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (policy.isActive) {
    return NextResponse.json(
      { error: 'ALREADY_ACTIVE', message: 'This policy is already active.' },
      { status: 409 },
    );
  }

  const input = (await loadGateInputs([policy.id], actorId)).get(policy.id);
  const gate = checkPreviewGate(
    policy,
    input?.latest ?? null,
    new Date(),
    input?.lastStateChange ?? null,
  );
  if (!gate.ok) {
    return NextResponse.json({ error: gate.code, message: gate.message }, { status: 409 });
  }

  const activated = await prisma.$transaction(async (tx) => {
    // Flip only the exact state that was previewed: a concurrent edit makes
    // this match nothing, and the policy stays inactive.
    const flipped = await tx.grantPolicy.updateMany({
      where: {
        id: policy.id,
        isActive: false,
        teamId: policy.teamId,
        resourceType: policy.resourceType,
        resourceId: policy.resourceId,
        role: policy.role,
        ratifiedBy: policy.ratifiedBy,
      },
      data: { isActive: true },
    });
    if (flipped.count !== 1) return null;
    await tx.auditLog.create({
      data: {
        action: ACTIVATED_AUDIT_ACTION,
        entityType: POLICY_AUDIT_ENTITY,
        entityId: policy.id,
        actorId,
        before: { isActive: false },
        after: { isActive: true },
        metadata: {
          previewAuditId: gate.previewId,
          previewedAt: gate.previewedAt,
          stateHash: policyStateHash(policy),
        },
      },
    });
    return tx.grantPolicy.findUnique({ where: { id: policy.id } });
  });
  if (!activated) {
    return NextResponse.json(
      {
        error: 'POLICY_CHANGED',
        message: 'The policy changed while it was being activated. Preview it again.',
      },
      { status: 409 },
    );
  }

  return NextResponse.json(activated);
}
