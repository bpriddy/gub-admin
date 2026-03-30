import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import RevokeButton from './RevokeButton';

export const dynamic = 'force-dynamic';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const STAFF_SCOPE_LABELS: Record<string, string> = {
  staff_all: 'All staff',
  staff_current: 'Current staff',
};

const FUNCTIONAL_LABELS: Record<string, string> = {
  'func:temporal': 'Temporal access',
  'func:export': 'Export / bulk download',
  'func:admin_ui': 'Admin UI access',
};

function ResourceCell({
  resourceType,
  resourceId,
  officeNames,
  teamNames,
  accountNames,
  campaignNames,
}: {
  resourceType: string;
  resourceId: string;
  officeNames: Map<string, string>;
  teamNames: Map<string, string>;
  accountNames: Map<string, string>;
  campaignNames: Map<string, string>;
}) {
  // Scope-only staff grants
  if (resourceType in STAFF_SCOPE_LABELS) {
    return (
      <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
        {STAFF_SCOPE_LABELS[resourceType]}
      </span>
    );
  }

  // Functional grants
  if (resourceType in FUNCTIONAL_LABELS) {
    return (
      <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
        {FUNCTIONAL_LABELS[resourceType]}
      </span>
    );
  }
  // Unknown functional (func:*) — still render nicely
  if (resourceType.startsWith('func:')) {
    return (
      <span className="text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
        {resourceType}
      </span>
    );
  }

  if (resourceType === 'staff_office') {
    const name = officeNames.get(resourceId);
    return (
      <span className="text-xs">
        <span className="text-gray-400 mr-1">office</span>
        <span className="text-gray-700">{name ?? resourceId.split('-')[0] + '…'}</span>
      </span>
    );
  }

  if (resourceType === 'staff_team') {
    const name = teamNames.get(resourceId);
    return (
      <span className="text-xs">
        <span className="text-gray-400 mr-1">team</span>
        <span className="text-gray-700">{name ?? resourceId.split('-')[0] + '…'}</span>
      </span>
    );
  }

  if (resourceType === 'account') {
    const name = accountNames.get(resourceId);
    return (
      <span className="text-xs">
        <span className="text-gray-400 mr-1">account</span>
        <span className="text-gray-700">{name ?? resourceId.split('-')[0] + '…'}</span>
      </span>
    );
  }

  if (resourceType === 'campaign') {
    const name = campaignNames.get(resourceId);
    return (
      <span className="text-xs">
        <span className="text-gray-400 mr-1">campaign</span>
        <span className="text-gray-700">{name ?? resourceId.split('-')[0] + '…'}</span>
      </span>
    );
  }

  // Fallback
  return (
    <span className="text-xs">
      <span className="text-gray-400 mr-1">{resourceType}</span>
      <span className="font-mono text-gray-600">{resourceId.split('-')[0]}…</span>
    </span>
  );
}

export default async function GrantsPage({
  searchParams,
}: {
  searchParams: { userId?: string; all?: string };
}) {
  const showAll = searchParams.all === 'true';

  const [grants, offices, teams, accounts, campaigns] = await Promise.all([
    prisma.accessGrant.findMany({
      where: {
        ...(searchParams.userId ? { userId: searchParams.userId } : {}),
        ...(showAll ? {} : { revokedAt: null }),
      },
      orderBy: { grantedAt: 'desc' },
      include: {
        user: { select: { id: true, email: true } },
        grantedByStaff: { select: { fullName: true } },
      },
    }),
    prisma.office.findMany({ select: { id: true, name: true } }),
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.campaign.findMany({ select: { id: true, name: true } }),
  ]);

  const officeNames = new Map(offices.map((o) => [o.id, o.name]));
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const campaignNames = new Map(campaigns.map((c) => [c.id, c.name]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Access Grants</h1>
          {searchParams.userId && (
            <p className="text-sm text-gray-500 mt-1">
              Filtered by user: {searchParams.userId}{' '}
              <Link href="/grants" className="text-blue-600 hover:underline">clear</Link>
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Link
            href={`/grants?${searchParams.userId ? `userId=${searchParams.userId}&` : ''}${showAll ? '' : 'all=true'}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {showAll ? 'Active only' : 'Show all'}
          </Link>
          <Link
            href="/grants/staff"
            className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
          >
            Staff Grant
          </Link>
          <Link
            href="/grants/batch"
            className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
          >
            Batch Grant
          </Link>
          <Link
            href="/grants/new"
            className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700"
          >
            New Grant
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Resource</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Granted By</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Granted</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grants.map((g) => (
              <tr key={g.id} className={`hover:bg-gray-50 ${g.revokedAt ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <Link href={`/users/${g.user.id}`} className="text-blue-600 hover:underline text-xs">
                    {g.user.email}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <ResourceCell
                    resourceType={g.resourceType}
                    resourceId={g.resourceId}
                    officeNames={officeNames}
                    teamNames={teamNames}
                    accountNames={accountNames}
                    campaignNames={campaignNames}
                  />
                </td>
                <td className="px-4 py-3 text-gray-700">{g.role}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{g.grantedByStaff.fullName}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {g.grantedAt.toISOString().split('T')[0]}
                </td>
                <td className="px-4 py-3">
                  {g.revokedAt ? (
                    <span className="text-xs text-gray-400">revoked</span>
                  ) : g.expiresAt && g.expiresAt < new Date() ? (
                    <span className="text-xs text-amber-600">expired</span>
                  ) : (
                    <span className="text-xs text-green-600">active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {!g.revokedAt && <RevokeButton grantId={g.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {grants.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">No grants found</div>
        )}
      </div>
    </div>
  );
}
