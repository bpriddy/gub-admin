/**
 * POST /api/grant-policies/:id/deactivate — take a policy out of the grant
 * sync. The grants it produced are revoked by the next sync run, exactly as
 * for a policy that never existed. No preview is needed: it only narrows access.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { DEACTIVATED_AUDIT_ACTION, POLICY_AUDIT_ENTITY } from '@/lib/grant-policy-gate';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const id = z.guid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: 'Invalid policy id' }, { status: 400 });

  const policy = await prisma.grantPolicy.findUnique({ where: { id: id.data } });
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!policy.isActive) {
    return NextResponse.json(
      { error: 'ALREADY_INACTIVE', message: 'This policy is already inactive.' },
      { status: 409 },
    );
  }

  const deactivated = await prisma.$transaction(async (tx) => {
    const flipped = await tx.grantPolicy.updateMany({
      where: { id: policy.id, isActive: true },
      data: { isActive: false },
    });
    if (flipped.count !== 1) return null;
    await tx.auditLog.create({
      data: {
        action: DEACTIVATED_AUDIT_ACTION,
        entityType: POLICY_AUDIT_ENTITY,
        entityId: policy.id,
        actorId,
        before: { isActive: true },
        after: { isActive: false },
      },
    });
    return tx.grantPolicy.findUnique({ where: { id: policy.id } });
  });
  if (!deactivated) {
    return NextResponse.json(
      { error: 'POLICY_CHANGED', message: 'The policy changed in the meantime. Reload and retry.' },
      { status: 409 },
    );
  }

  return NextResponse.json(deactivated);
}
