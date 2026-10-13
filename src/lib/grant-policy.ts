/**
 * grant-policy.ts — the policy shapes the grant-policies page offers and their
 * resource rules. Pure and dependency-free: the page's client components
 * import it, so nothing server-only (crypto, zod) belongs here. The preview
 * gate and the request schema are in grant-policy-gate.ts.
 *
 * A grant policy (`grant_policies`) binds a team to a grant shape; the
 * backend's grant-policy sync turns every ACTIVE policy into access grants
 * for the team's members. The admin page creates policies INACTIVE, shows a
 * preview of what the sync would do (the backend's dry run), and activates a
 * policy only after a preview of its current state was shown.
 *
 * What is mirrored here, and from where:
 *   - the resource types and their resource_id rules mirror the backend
 *     sync's expansion rules (a policy it cannot expand is skipped, never
 *     applied, so a wrong shape here is harmless but pointless);
 *   - the roles mirror access_grants_role_check.
 * The backend's preview stays the authority: it reports `skipped` for any
 * shape it will not materialize.
 */

export const ACCOUNT_TREE = 'account_tree';

/** Roles an access grant accepts (access_grants_role_check). */
export const POLICY_ROLES = ['viewer', 'contributor', 'manager', 'admin'] as const;

/** What a policy's resource_id points at. */
export type TargetKind = 'account' | 'campaign' | 'office' | 'team';

export interface PolicyTypeSpec {
  value: string;
  label: string;
  description: string;
  /** none = resource_id must be empty; optional = empty is a wildcard; required = must be set. */
  resourceId: 'none' | 'optional' | 'required';
  /** The kind of record resource_id points at (null when it takes none). */
  targetKind: TargetKind | null;
  /** Offered only once the backend answers the policy preview (see grant-policy-backend.ts). */
  needsBackendPreview?: boolean;
}

/**
 * The policy shapes the page creates. Types the sync cannot expand to anything
 * (a cohort type without a wildcard, a func:* type) are deliberately absent;
 * rows of any type stay listed, and previewable, if they exist already.
 */
export const POLICY_TYPES: readonly PolicyTypeSpec[] = [
  {
    value: ACCOUNT_TREE,
    label: 'Account and all its campaigns',
    description:
      'One account plus every campaign under it. Re-expanded on every sync, so a campaign created later is covered by the next sync.',
    resourceId: 'required',
    targetKind: 'account',
    needsBackendPreview: true,
  },
  {
    value: 'account',
    label: 'Account',
    description: 'One account, or every account (a wildcard that is re-expanded on every sync).',
    resourceId: 'optional',
    targetKind: 'account',
  },
  {
    value: 'campaign',
    label: 'Campaign',
    description: 'One campaign, or every campaign (a wildcard that is re-expanded on every sync).',
    resourceId: 'optional',
    targetKind: 'campaign',
  },
  {
    value: 'office',
    label: 'Office',
    description: 'One office record.',
    resourceId: 'required',
    targetKind: 'office',
  },
  {
    value: 'team',
    label: 'Team',
    description: 'One team record.',
    resourceId: 'required',
    targetKind: 'team',
  },
  {
    value: 'staff_office',
    label: 'Staff of one office',
    description: 'Staff records of one office.',
    resourceId: 'required',
    targetKind: 'office',
  },
  {
    value: 'staff_team',
    label: 'Staff of one team',
    description: 'Staff records of one team.',
    resourceId: 'required',
    targetKind: 'team',
  },
  {
    value: 'staff_all',
    label: 'All staff',
    description: 'Every staff record (table-level).',
    resourceId: 'none',
    targetKind: null,
  },
  {
    value: 'staff_current',
    label: 'Current staff',
    description: 'Current staff records (table-level).',
    resourceId: 'none',
    targetKind: null,
  },
  {
    value: 'idea_all',
    label: 'All ideas',
    description: 'Every idea (table-level).',
    resourceId: 'none',
    targetKind: null,
  },
];

export function policyTypeSpec(value: string): PolicyTypeSpec | undefined {
  return POLICY_TYPES.find((t) => t.value === value);
}

/** The types the page offers for create, given what the backend supports. */
export function offeredPolicyTypes(backendPreview: boolean): PolicyTypeSpec[] {
  return POLICY_TYPES.filter((t) => backendPreview || !t.needsBackendPreview);
}

/** A shape error for a create body, or null when the shape is acceptable. */
export function validatePolicyShape(input: {
  resourceType: string;
  resourceId?: string | null | undefined;
}): { code: string; message: string } | null {
  const spec = policyTypeSpec(input.resourceType);
  if (!spec) {
    return { code: 'UNKNOWN_RESOURCE_TYPE', message: 'This resource type cannot be created here.' };
  }
  if (spec.resourceId === 'none' && input.resourceId) {
    return {
      code: 'RESOURCE_ID_NOT_ALLOWED',
      message: `A '${spec.value}' policy covers the whole table and takes no resource.`,
    };
  }
  if (spec.resourceId === 'required' && !input.resourceId) {
    return {
      code: 'RESOURCE_ID_REQUIRED',
      message: `A '${spec.value}' policy needs a resource.`,
    };
  }
  return null;
}

// ── Preview results ─────────────────────────────────────────────────────────

/**
 * The per-grant results of the backend's preview, most consequential first
 * (see GrantPolicyPreview in the backend's grant-policy sync): `create` = an
 * apply writes the grant; `role_change` = the sync holds the grant with
 * another role and an apply replaces it; `kept` = already held with this role;
 * `covered` = another grant already gives the access.
 */
export const GRANT_RESULTS = ['create', 'role_change', 'kept', 'covered'] as const;
export type GrantResult = (typeof GRANT_RESULTS)[number];

/** Counts per known result, plus `other` for any the page does not know yet. */
export type GrantResultCounts = Record<GrantResult | 'other', number>;

export function isGrantResult(status: string): status is GrantResult {
  return (GRANT_RESULTS as readonly string[]).includes(status);
}

export function emptyGrantResultCounts(): GrantResultCounts {
  return { create: 0, role_change: 0, kept: 0, covered: 0, other: 0 };
}

/** Sort key: unknown results first (they need a human look), then by consequence. */
export function grantResultRank(status: string): number {
  return isGrantResult(status) ? GRANT_RESULTS.indexOf(status) : -1;
}
