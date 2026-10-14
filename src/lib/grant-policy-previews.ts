/**
 * grant-policy-previews.ts — what the preview gate needs to read from audit_log
 * for a set of policies, so the activate route and the page that enables its
 * button apply the SAME rule (checkPreviewGate in grant-policy-gate.ts).
 */

import { prisma } from '@/lib/prisma';
import {
  ACTIVATED_AUDIT_ACTION,
  DEACTIVATED_AUDIT_ACTION,
  POLICY_AUDIT_ENTITY,
  PREVIEW_AUDIT_ACTION,
  type PreviewRecord,
} from '@/lib/grant-policy-gate';

export interface GateInput {
  /** The acting staff member's most recent recorded preview of the policy. */
  latest: PreviewRecord | null;
  /** When anyone last activated or deactivated the policy. */
  lastStateChange: Date | null;
}

/** Gate inputs for each policy id, for one acting staff member. Every id gets an entry. */
export async function loadGateInputs(
  policyIds: string[],
  actorId: string,
): Promise<Map<string, GateInput>> {
  const inputs = new Map<string, GateInput>(
    policyIds.map((id) => [id, { latest: null, lastStateChange: null }]),
  );
  if (policyIds.length === 0) return inputs;

  const [previews, changes] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        action: PREVIEW_AUDIT_ACTION,
        entityType: POLICY_AUDIT_ENTITY,
        entityId: { in: policyIds },
        actorId,
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['entityId'],
      select: { id: true, entityId: true, createdAt: true, after: true },
    }),
    prisma.auditLog.findMany({
      where: {
        action: { in: [ACTIVATED_AUDIT_ACTION, DEACTIVATED_AUDIT_ACTION] },
        entityType: POLICY_AUDIT_ENTITY,
        entityId: { in: policyIds },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['entityId'],
      select: { entityId: true, createdAt: true },
    }),
  ]);

  for (const p of previews) {
    const input = inputs.get(p.entityId);
    if (input) input.latest = { id: p.id, createdAt: p.createdAt, after: p.after };
  }
  for (const c of changes) {
    const input = inputs.get(c.entityId);
    if (input) input.lastStateChange = c.createdAt;
  }
  return inputs;
}
