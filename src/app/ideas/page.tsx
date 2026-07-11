import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Ideas are the decoupled institutional-memory tier: they reference account +
// campaign by EXTERNAL id (a Drive folder id), not by FK. So we resolve names
// in code by matching account/campaign driveFolderId → the idea's external ids.
export default async function IdeasPage() {
  const [ideas, accounts, campaigns] = await Promise.all([
    prisma.idea.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { changes: true } } },
    }),
    prisma.account.findMany({ select: { name: true, driveFolderId: true } }),
    prisma.campaign.findMany({ select: { name: true, driveFolderId: true } }),
  ]);

  const accountByFolder = new Map(accounts.filter((a) => a.driveFolderId).map((a) => [a.driveFolderId!, a.name]));
  const campaignByFolder = new Map(campaigns.filter((c) => c.driveFolderId).map((c) => [c.driveFolderId!, c.name]));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Ideas</h1>
        <span className="text-sm text-gray-400">{ideas.length} total</span>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Institutional-memory tier — creative concepts pitched or reviewed, derived from decks. Facets accumulate and
        supersede across decks (see an idea&rsquo;s change history).
      </p>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Idea</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Campaign</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Facets</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Changes</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Awarded</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ideas.map((i) => (
              <tr key={i.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/ideas/${i.id}`} className="text-blue-600 hover:underline">
                    {i.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{accountByFolder.get(i.accountExternalId) ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">
                  {i.campaignExternalId ? campaignByFolder.get(i.campaignExternalId) ?? '(unmapped)' : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">{i.facets.length}</td>
                <td className="px-4 py-3 text-gray-500">{i._count.changes}</td>
                <td className="px-4 py-3">
                  {i.pieceId ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ awarded</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{i.createdAt.toISOString().split('T')[0]}</td>
              </tr>
            ))}
            {ideas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No ideas yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
