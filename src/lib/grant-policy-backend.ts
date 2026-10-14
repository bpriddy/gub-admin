/**
 * grant-policy-backend.ts — what the grant-policies page needs from the GUB
 * backend: whether it can preview a policy, and the preview itself.
 *
 * The preview is the backend's dry run of the grant-policy sync for ONE
 * policy (GET /integrations/grant-policy/policies/:id/preview): it never
 * writes, works for inactive policies, and reports which grants an apply
 * would create. It is called as gub-admin's runtime service account
 * (fetchGub, src/lib/gub-backend.ts), the same caller identity as the sync
 * triggers.
 *
 * Capability detection, with no flag: the preview route and the
 * `account_tree` policy shape arrive in the same backend release, so a
 * backend that answers the preview route understands `account_tree`. The
 * probe asks the route about an id that is not a UUID: the route validates
 * the id before it reads anything, so a backend that has it answers
 * 400 VALIDATION_ERROR (no database read), while one that does not answers
 * 404 for the unknown route. Any other answer (a rejected caller, an error,
 * no reply) counts as "not available" and is logged.
 */

import { z } from 'zod';
import { fetchGub } from '@/lib/gub-backend';

const PREVIEW_ROUTE = '/integrations/grant-policy/policies';
/** Not a UUID on purpose: see the header. */
const PROBE_ID = 'capability-probe';
const PROBE_TIMEOUT_MS = 5000;
const PREVIEW_TIMEOUT_MS = 20000;

export type BackendAvailability = { available: true } | { available: false; reason: string };

function previewPath(id: string): string {
  return `${PREVIEW_ROUTE}/${encodeURIComponent(id)}/preview`;
}

function logBackend(fields: Record<string, unknown>): void {
  console.warn(JSON.stringify({ msg: 'grant_policy.backend_unavailable', ...fields }));
}

/** Does the backend answer the grant-policy preview route? Never throws. */
export async function grantPolicyBackend(): Promise<BackendAvailability> {
  try {
    const res = await fetchGub(previewPath(PROBE_ID), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
    if (res.status === 400 && body?.code === 'VALIDATION_ERROR') {
      return { available: true };
    }
    if (res.status === 404) {
      return { available: false, reason: 'the backend has no grant-policy preview yet' };
    }
    logBackend({ phase: 'probe', status: res.status });
    return { available: false, reason: `the backend answered the probe with HTTP ${res.status}` };
  } catch (err) {
    logBackend({ phase: 'probe', error: err instanceof Error ? err.message : String(err) });
    return { available: false, reason: 'the backend could not be reached' };
  }
}

/**
 * The result the backend gives each grant (create, kept, role_change, covered).
 * Parsed as a plain string on purpose: a result this page does not know yet
 * must still render (as the backend wrote it, and counted apart) rather than
 * make the whole preview unreadable, which would block activation for exactly
 * the policies whose preview is most worth reading. Display and ordering are
 * in grant-policy.ts.
 */
const GrantStatus = z.string();

/** The part of the backend's preview this page reads (unknown keys are dropped). */
const PreviewSchema = z.object({
  dryRun: z.literal(true),
  policy: z.object({
    id: z.string(),
    teamId: z.string(),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    role: z.string(),
    isActive: z.boolean(),
    ratifiedBy: z.string(),
  }),
  skipped: z.string().nullable(),
  targets: z.array(z.object({ resourceType: z.string(), resourceId: z.string() })),
  counters: z.record(z.string(), z.number()),
  grants: z.array(
    z.object({
      userId: z.string(),
      resourceType: z.string(),
      resourceId: z.string(),
      role: z.string(),
      status: GrantStatus,
      /** The role of the grant the sync already holds; only with `role_change`. */
      heldRole: z.string().optional(),
    }),
  ),
});
export type GrantPolicyPreview = z.infer<typeof PreviewSchema>;

export type PreviewResult =
  { ok: true; preview: GrantPolicyPreview } | { ok: false; code: string; message: string };

/** The backend's dry run for one policy. Never throws; failures come back as `ok: false`. */
export async function fetchGrantPolicyPreview(policyId: string): Promise<PreviewResult> {
  let res: Response;
  try {
    res = await fetchGub(previewPath(policyId), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
    });
  } catch (err) {
    logBackend({
      phase: 'preview',
      policyId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, code: 'BACKEND_UNREACHABLE', message: 'Could not reach the backend.' };
  }

  if (res.status === 404) {
    await res.text().catch(() => '');
    return {
      ok: false,
      code: 'PREVIEW_NOT_AVAILABLE',
      message:
        'The backend returned no preview for this policy: it either has no grant-policy preview yet or does not see this policy.',
    };
  }
  if (res.status === 401 || res.status === 403) {
    await res.text().catch(() => '');
    logBackend({ phase: 'preview', policyId, status: res.status });
    return {
      ok: false,
      code: 'BACKEND_REJECTED_CALLER',
      message: `The backend rejected the admin service's credentials (HTTP ${res.status}).`,
    };
  }
  if (!res.ok) {
    await res.text().catch(() => '');
    logBackend({ phase: 'preview', policyId, status: res.status });
    return {
      ok: false,
      code: 'BACKEND_ERROR',
      message: `The backend answered the preview with HTTP ${res.status}.`,
    };
  }

  const parsed = PreviewSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    logBackend({
      phase: 'preview',
      policyId,
      status: res.status,
      error: 'unexpected response shape',
    });
    return {
      ok: false,
      code: 'BACKEND_BAD_RESPONSE',
      message: 'The backend answered the preview with a response this page does not understand.',
    };
  }
  return { ok: true, preview: parsed.data };
}
