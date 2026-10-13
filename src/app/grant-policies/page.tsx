/**
 * /grant-policies — rules that give every member of a team a grant on a
 * resource, applied by the backend's grant-policy sync.
 *
 * Flow: create (always inactive) -> preview (the backend's dry run of what
 * the sync would do) -> activate. Activation is refused unless the person
 * activating was shown a preview of the policy's current state; the rule
 * lives in src/lib/grant-policy-gate.ts and is enforced by the activate route,
 * this page only mirrors it to enable the button.
 */
import { prisma } from '@/lib/prisma';
import { ActorNotStaffError, getActorStaffId } from '@/lib/actor';
import { offeredPolicyTypes, type TargetKind } from '@/lib/grant-policy';
import { checkPreviewGate } from '@/lib/grant-policy-gate';
import { loadGateInputs, type GateInput } from '@/lib/grant-policy-previews';
import { grantPolicyBackend } from '@/lib/grant-policy-backend';
import { lookupResourceNames, resourceName } from '@/lib/grant-policy-labels';
import { CreatePolicyForm } from './create-policy-form';
import { PolicyRow, type PolicyRowData } from './policy-row';

export const dynamic = 'force-dynamic';

async function currentActorId(): Promise<string | null> {
  try {
    return await getActorStaffId();
  } catch (err) {
    if (err instanceof ActorNotStaffError) return null;
    throw err;
  }
}

export default async function GrantPoliciesPage() {
  const now = new Date();
  const [actorId, backend, policies, teams, accounts, campaigns, offices] = await Promise.all([
    currentActorId(),
    grantPolicyBackend(),
    prisma.grantPolicy.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: {
        team: { select: { name: true } },
        ratifiedByStaff: { select: { fullName: true } },
      },
    }),
    prisma.team.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.account.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.campaign.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, account: { select: { name: true } } },
    }),
    prisma.office.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  const names = await lookupResourceNames(policies);

  // The gate inputs per inactive policy: the same loader and rule the
  // activate route applies, so the button is enabled exactly when it would pass.
  const gateInputs = actorId
    ? await loadGateInputs(
        policies.filter((p) => !p.isActive).map((p) => p.id),
        actorId,
      )
    : new Map<string, GateInput>();

  const rows: PolicyRowData[] = policies.map((p) => {
    const input = gateInputs.get(p.id);
    const gate = p.isActive
      ? null
      : checkPreviewGate(p, input?.latest ?? null, now, input?.lastStateChange ?? null);
    return {
      id: p.id,
      teamName: p.team.name,
      resourceType: p.resourceType,
      resourceId: p.resourceId,
      resourceLabel: resourceName(names, p),
      role: p.role,
      isActive: p.isActive,
      ratifiedByName: p.ratifiedByStaff.fullName,
      activatable: gate?.ok ?? false,
      gateMessage: gate && !gate.ok ? gate.message : null,
    };
  });

  const options: Record<TargetKind, { id: string; name: string }[]> = {
    account: accounts,
    campaign: campaigns.map((c) => ({ id: c.id, name: `${c.name} (${c.account.name})` })),
    office: offices,
    team: teams,
  };
  const activeCount = policies.filter((p) => p.isActive).length;

  return (
    <div className="max-w-6xl">
      <div className="mb-2">
        <h1 className="text-xl font-semibold">Grant policies</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4 max-w-3xl">
        A grant policy gives every member of a team a grant on a resource. The backend&apos;s grant
        sync turns <strong>active</strong> policies into access grants and keeps them in step with
        team membership; grants issued by hand are never touched. A new policy starts{' '}
        <strong>inactive</strong>: preview what the sync would do, then activate it. Activating
        makes the policy eligible for the next sync run; it does not write grants by itself.
      </p>

      {!backend.available && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4 max-w-3xl">
          <strong>Preview unavailable:</strong> {backend.reason}. Policies can be created but not
          previewed or activated until the backend can preview them, and the account-and-campaigns
          shape is not offered.
        </div>
      )}
      {!actorId && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4 max-w-3xl">
          Your account has no active staff record, so changes made here are refused.
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Create a policy</h2>
        <CreatePolicyForm
          types={offeredPolicyTypes(backend.available)}
          teams={teams}
          options={options}
        />
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-2">
        Policies ({activeCount} active, {policies.length - activeCount} inactive)
      </h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Team</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Resource</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ratified by</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No grant policies yet. Create one above.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <PolicyRow
                key={row.id}
                row={row}
                canWrite={actorId !== null}
                previewAvailable={backend.available}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
