/**
 * grant-policy-gate.ts — server-side rules of the grant-policies write routes:
 * the create body, and the preview gate that decides whether a policy may be
 * activated. Pure (no I/O); shapes and resource rules are in grant-policy.ts.
 *
 * A policy is activated only after the acting staff member was shown a preview
 * of its CURRENT state. "Shown" is durable and checkable: the preview route
 * records an audit_log row (action grant_policy_previewed) carrying a
 * fingerprint of the policy state, and the activate route looks it up.
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { POLICY_ROLES } from '@/lib/grant-policy';

// A GUID rather than z.uuid(): ids come from rows that already exist, and
// the existence check below is the real validation.
const Id = z.guid();

/**
 * Body of POST /api/grant-policies. Deliberately absent: `isActive` (a policy
 * is always created inactive) and `ratifiedBy` (the acting staff member, from
 * the verified IAP identity — see src/lib/actor.ts). `.strict()` rejects both
 * instead of silently ignoring them.
 */
export const CreateGrantPolicySchema = z
  .object({
    teamId: Id,
    resourceType: z.string().min(1),
    resourceId: Id.nullable().optional(),
    role: z.enum(POLICY_ROLES),
  })
  .strict();

// ── Preview gate ─────────────────────────────────────────────────────────────

/** How long a recorded preview stays valid for activation. */
export const PREVIEW_MAX_AGE_MS = 30 * 60 * 1000;

/** The audit action recorded when a preview was shown. */
export const PREVIEW_AUDIT_ACTION = 'grant_policy_previewed';
/** The audit actions that change whether a policy is live. */
export const ACTIVATED_AUDIT_ACTION = 'grant_policy_activated';
export const DEACTIVATED_AUDIT_ACTION = 'grant_policy_deactivated';
export const POLICY_AUDIT_ENTITY = 'grant_policy';

export interface PolicyShape {
  id: string;
  teamId: string;
  resourceType: string;
  resourceId: string | null;
  role: string;
  isActive: boolean;
  ratifiedBy: string;
}

/**
 * Fingerprint of the policy state a preview describes: every column that
 * defines what the policy grants and whether it is live. Not `updatedAt`: a
 * row written by SQL carries a microsecond timestamp that a JS Date cannot
 * round-trip.
 */
export function policyStateHash(policy: PolicyShape): string {
  const canonical = JSON.stringify([
    policy.id,
    policy.teamId,
    policy.resourceType,
    policy.resourceId,
    policy.role,
    policy.isActive,
    policy.ratifiedBy,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

/** Why the backend would not materialize a policy (its `skipped` values). */
export const SKIP_REASON_TEXT: Record<string, string> = {
  unknown_resource_type: 'the backend does not know this resource type',
  invalid_role: 'the role is not one an access grant accepts',
  resource_id_required: 'this resource type needs a specific resource',
  resource_id_not_allowed: 'this table-level type takes no resource',
  no_wildcard: 'this resource type has no wildcard form',
  account_not_found: 'the account does not exist',
};

export function describeSkipReason(reason: string): string {
  return SKIP_REASON_TEXT[reason] ?? reason;
}

/**
 * Fields on which the backend's echo of a policy differs from the row this
 * service read, compared case-insensitively on the id fields. Empty = they
 * describe the same policy in the same state.
 */
export function policyMismatch(local: PolicyShape, echoed: PolicyShape): (keyof PolicyShape)[] {
  const same = (a: string | null, b: string | null) =>
    a === null || b === null ? a === b : a.toLowerCase() === b.toLowerCase();
  const out: (keyof PolicyShape)[] = [];
  if (!same(local.id, echoed.id)) out.push('id');
  if (!same(local.teamId, echoed.teamId)) out.push('teamId');
  if (local.resourceType !== echoed.resourceType) out.push('resourceType');
  if (!same(local.resourceId, echoed.resourceId)) out.push('resourceId');
  if (local.role !== echoed.role) out.push('role');
  if (local.isActive !== echoed.isActive) out.push('isActive');
  if (!same(local.ratifiedBy, echoed.ratifiedBy)) out.push('ratifiedBy');
  return out;
}

/** What gets recorded in the audit row of a shown preview (`after`). */
export type PreviewAuditAfter = {
  stateHash: string;
  skipped: string | null;
  targets: number;
  grants: number;
  counters: Record<string, number>;
  statusCounts: Record<string, number>;
};

export interface PreviewRecord {
  id: string;
  createdAt: Date;
  after: unknown;
}

export type PreviewGate =
  | { ok: true; previewId: string; previewedAt: Date }
  | {
      ok: false;
      code: 'PREVIEW_REQUIRED' | 'PREVIEW_STALE' | 'PREVIEW_EXPIRED' | 'PREVIEW_SKIPPED';
      message: string;
    };

function recordedAfter(after: unknown): { stateHash: unknown; skipped: unknown } {
  if (after && typeof after === 'object') {
    const a = after as Record<string, unknown>;
    return { stateHash: a['stateHash'], skipped: a['skipped'] };
  }
  return { stateHash: undefined, skipped: undefined };
}

/**
 * May this policy be activated now? Yes only when the acting staff member was
 * shown a preview of the policy's CURRENT state (same fingerprint), recently,
 * that no activation or deactivation has happened since (a preview describes
 * the world at the moment it was taken, and a policy that went live and was
 * switched off again has the same fingerprint as before), and that preview
 * said the sync would actually materialize it.
 *
 * `latest` is the actor's most recent recorded preview of this policy, or null.
 * `lastStateChange` is when anyone last activated or deactivated it, or null.
 */
export function checkPreviewGate(
  policy: PolicyShape,
  latest: PreviewRecord | null,
  now: Date,
  lastStateChange: Date | null = null,
): PreviewGate {
  if (!latest) {
    return {
      ok: false,
      code: 'PREVIEW_REQUIRED',
      message: 'Preview this policy before activating it.',
    };
  }
  const recorded = recordedAfter(latest.after);
  if (recorded.stateHash !== policyStateHash(policy)) {
    return {
      ok: false,
      code: 'PREVIEW_STALE',
      message: 'The policy changed since it was last previewed. Preview it again.',
    };
  }
  // Not older-than but not-newer-than: a tie fails closed.
  if (lastStateChange && lastStateChange.getTime() >= latest.createdAt.getTime()) {
    return {
      ok: false,
      code: 'PREVIEW_STALE',
      message:
        'The policy was activated or deactivated since it was last previewed. Preview it again.',
    };
  }
  if (now.getTime() - latest.createdAt.getTime() > PREVIEW_MAX_AGE_MS) {
    return {
      ok: false,
      code: 'PREVIEW_EXPIRED',
      message: `The last preview is older than ${PREVIEW_MAX_AGE_MS / 60000} minutes. Preview it again.`,
    };
  }
  if (typeof recorded.skipped === 'string') {
    return {
      ok: false,
      code: 'PREVIEW_SKIPPED',
      message: `The preview shows the sync would skip this policy (${describeSkipReason(
        recorded.skipped,
      )}). Fix the policy before activating it.`,
    };
  }
  return { ok: true, previewId: latest.id, previewedAt: latest.createdAt };
}
