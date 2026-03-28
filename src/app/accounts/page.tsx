import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const accounts = await prisma.account.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { campaigns: true } },
      parent: { select: { name: true } },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <Link
          href="/accounts/new"
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700"
        >
          New Account
        </Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Parent</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Campaigns</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/accounts/${a.id}`} className="text-blue-600 hover:underline">
                    {a.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500">{a.parent?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-700">{a._count.campaigns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
