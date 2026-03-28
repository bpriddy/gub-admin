import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import RevokeButton from './RevokeButton';

export const dynamic = 'force-dynamic';

export default async function GrantsPage({
  searchParams,
}: {
  searchParams: { userId?: string; all?: string };
}) {
  const showAll = searchParams.all === 'true';

  const grants = await prisma.accessGrant.findMany({
    where: {
      ...(searchParams.userId ? { userId: searchParams.userId } : {}),
      ...(showAll ? {} : { revokedAt: null }),
    },
    orderBy: { grantedAt: 'desc' },
    include: {
      user: { select: { id: true, email: true } },
      grantedByStaff: { select: { fullName: true } },
    },
  });

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
            href="/grants/batch"
            className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700"
          >
            Batch Grant
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
                  <span className="text-xs text-gray-400 mr-1">{g.resourceType}</span>
                  <span className="text-xs font-mono text-gray-600">{g.resourceId.split('-')[0]}…</span>
                </td>
                <td className="px-4 py-3 text-gray-700">{g.role}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{g.grantedByStaff.fullName}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {g.grantedAt.toISOString().split('T')[0]}
                </td>
                <td className="px-4 py-3">
                  {g.revokedAt ? (
                    <span className="text-xs text-gray-400">revoked</span>
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
