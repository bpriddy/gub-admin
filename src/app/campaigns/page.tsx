import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: { account: { select: { id: true, name: true } } },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700"
        >
          New Campaign
        </Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Budget</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Live</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ends</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/campaigns/${c.id}`} className="text-blue-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/accounts/${c.account.id}`} className="text-gray-600 hover:underline">
                    {c.account.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{c.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{c.budget ? `$${c.budget}` : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.liveAt ? c.liveAt.toISOString().split('T')[0] : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.endsAt ? c.endsAt.toISOString().split('T')[0] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
