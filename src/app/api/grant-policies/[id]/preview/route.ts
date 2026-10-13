/**
 * POST /api/grant-policies/:id/preview — show what the grant sync would do
 * for ONE policy (the backend's dry run; it writes no grants).
 *
 * It is a POST because it records that this staff member was shown a preview
 * of the policy's current state (audit_log `grant_policy_previewed`, with a
 * fingerprint of the state): activation requires that record. See
 * src/lib/grant-policy-gate.ts (checkPreviewGate).
 *
 * Two rules keep that record honest. The backend echoes the policy it
 * previewed, and the record is written only when the echo matches the row
 * this route read (otherwise the preview describes something else). And the
 * record is written LAST, after everything the response needs was built, so a
 * failure on the way cannot leave a record of a preview nobody saw.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import {
  checkPreviewGate,
  describeSkipReason,
  POLICY_AUDIT_ENTITY,
  PREVIEW_AUDIT_ACTION,
  PREVIEW_MAX_AGE_MS,
  policyMismatch,
  policyStateHash,
  type PreviewAuditAfter,
} from '@/lib/grant-policy-gate';
import { emptyGrantResultCounts, grantResultRank, isGrantResult } from '@/lib/grant-policy';
import { fetchGrantPolicyPreview } from '@/lib/grant-policy-backend';
import { lookupResourceNames, resourceName } from '@/lib/grant-policy-labels';
import { z } from 'zod';

/** Rows of the per-member grant list returned to the page; the totals cover all of them. */
const MAX_GRANT_ROWS = 200;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const id = z.guid().safeParse(params.id);
  if (!id.success) return NextResponse.json({ error: 'Invalid policy id' }, { status: 400 });

  const policy = await prisma.grantPolicy.findUnique({ where: { id: id.data } });
  if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await fetchGrantPolicyPreview(policy.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.code, message: result.message }, { status: 502 });
  }
  const { preview } = result;

  // The gate below trusts that this preview is of the row read above.
  const differs = policyMismatch(policy, preview.policy);
  if (differs.length > 0) {
    console.warn(
      JSON.stringify({
        msg: 'grant_policy.preview_mismatch',
        policyId: policy.id,
        fields: differs,
      }),
    );
    return NextResponse.json(
      {
        error: 'PREVIEW_POLICY_MISMATCH',
        message:
          'The backend previewed a different state of this policy than this page has (it may have just been edited, or the two services read different databases). Reload and preview it again.',
      },
      { status: 409 },
    );
  }

  // Display names; the backend's answer carries ids only.
  const grantsShown = [...preview.grants].sort(
    (a, b) => grantResultRank(a.status) - grantResultRank(b.status),
  );
  const shown = grantsShown.slice(0, MAX_GRANT_ROWS);
  const names = await lookupResourceNames([
    { resourceType: policy.resourceType, resourceId: policy.resourceId },
    ...preview.targets,
    ...shown,
  ]);
  const userIds = Array.from(new Set(shown.map((g) => g.userId))).filter(
    (u) => z.guid().safeParse(u).success,
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, displayName: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const statusCounts = emptyGrantResultCounts();
  for (const g of preview.grants) statusCounts[isGrantResult(g.status) ? g.status : 'other']++;

  const body = {
    policy: {
      id: policy.id,
      resourceType: policy.resourceType,
      resourceId: policy.resourceId,
      resourceName: resourceName(names, policy),
      role: policy.role,
      isActive: policy.isActive,
    },
    skipped: preview.skipped,
    skippedText: preview.skipped ? describeSkipReason(preview.skipped) : null,
    counters: preview.counters,
    targets: preview.targets.map((t) => ({ ...t, name: resourceName(names, t) })),
    statusCounts,
    grantsTotal: preview.grants.length,
    grants: shown.map((g) => ({
      userId: g.userId,
      email: userById.get(g.userId)?.email ?? null,
      displayName: userById.get(g.userId)?.displayName ?? null,
      resourceType: g.resourceType,
      resourceId: g.resourceId,
      resourceName: resourceName(names, g),
      role: g.role,
      status: g.status,
      heldRole: g.heldRole ?? null,
    })),
  };

  // Last step before answering: from here on only the gate verdict is left.
  const after: PreviewAuditAfter = {
    stateHash: policyStateHash(policy),
    skipped: preview.skipped,
    targets: preview.targets.length,
    grants: preview.grants.length,
    counters: preview.counters,
    statusCounts,
  };
  const record = await prisma.auditLog.create({
    data: {
      action: PREVIEW_AUDIT_ACTION,
      entityType: POLICY_AUDIT_ENTITY,
      entityId: policy.id,
      actorId,
      after,
    },
    select: { id: true, createdAt: true },
  });
  const gate = checkPreviewGate(
    policy,
    { id: record.id, createdAt: record.createdAt, after },
    new Date(),
  );

  return NextResponse.json({
    ...body,
    previewedAt: record.createdAt,
    validUntil: new Date(record.createdAt.getTime() + PREVIEW_MAX_AGE_MS),
    activatable: gate.ok,
    gateMessage: gate.ok ? null : gate.message,
  });
}
