/**
 * /settings/trusted-apps — manage the consolidated trust registry.
 *
 * Each row is one consuming app. The same row carries both its allowed
 * origins (browser CORS) and its Google OAuth client_ids (token
 * audience). gcp-universal-backend enforces strict same-row pairing at
 * /auth/google/exchange — a fork doesn't inherit the parent app's trust.
 */
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { AddTrustedAppForm } from './add-trusted-app-form';
import { TrustedAppActions } from './trusted-app-actions';

export const dynamic = 'force-dynamic';

function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default async function TrustedAppsPage() {
  const rows = await prisma.trustedApp.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });

  const addedByIds = Array.from(
    new Set(rows.map((r) => r.addedBy).filter((id): id is string => id !== null)),
  );
  const staff = addedByIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: addedByIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const activeCount = rows.filter((r) => r.isActive).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Settings
        </Link>
      </div>

      <div className="mb-2">
        <h1 className="text-xl font-semibold">Trusted apps</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4 max-w-3xl">
        Each row is a consuming app GUB trusts. The same row holds the
        app&apos;s allowed origins (CORS) and its Google OAuth client_ids
        (audiences). When a user signs in via the SDK, GUB requires the
        request&apos;s origin AND the token&apos;s <code className="font-mono text-xs">aud</code>{' '}
        claim to appear on the <strong>same</strong> row — derivatives /
        forks don&apos;t inherit the parent app&apos;s trust.
      </p>
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-6 max-w-3xl">
        <strong>Dev/staging tooling.</strong> This list governs the
        gcp-universal-backend dev deployment. Production trust enforcement
        will land at the edge (planned, not built); see the
        gcp-universal-backend README &quot;Trusted apps registry —
        dev/staging tooling&quot; for the architecture.
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Register a trusted app</h2>
        <AddTrustedAppForm />
      </div>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Apps ({activeCount} active{inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''})
        </h2>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-1/5">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-1/4">Origins</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-1/4">Google client_ids</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[8%]">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-[10%]">Added by</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600 w-[14%]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No trusted apps registered yet. Register one above to get started.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const addedBy = r.addedBy ? staffById.get(r.addedBy) : null;
              return (
                <tr key={r.id} className={r.isActive ? '' : 'bg-gray-50/50'}>
                  <td className="px-4 py-3 font-medium text-gray-900 align-top break-words">
                    {r.name}
                    <div className="text-xs text-gray-400 mt-1">{formatTime(r.createdAt)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {r.origins.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.origins.map((o) => (
                          <li key={o} className="text-xs font-mono text-gray-600 break-all">
                            {o}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {r.googleClientIds.length === 0 ? (
                      <span className="text-xs text-gray-400">—</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {r.googleClientIds.map((id) => (
                          <li key={id} className="text-xs font-mono text-gray-600 break-all">
                            {id}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {r.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-gray-600 text-xs">
                    {addedBy?.fullName ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <TrustedAppActions
                      id={r.id}
                      name={r.name}
                      origins={r.origins}
                      googleClientIds={r.googleClientIds}
                      isActive={r.isActive}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
