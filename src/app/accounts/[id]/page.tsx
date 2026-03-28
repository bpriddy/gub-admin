import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import AccountForm from '../AccountForm';

export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const [account, allAccounts] = await Promise.all([
    prisma.account.findUnique({
      where: { id: params.id },
      include: {
        campaigns: { orderBy: { name: 'asc' }, select: { id: true, name: true, status: true } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
      },
    }),
    prisma.account.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  if (!account) notFound();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/accounts" className="text-sm text-gray-500 hover:text-gray-700">← Accounts</Link>
        <h1 className="text-xl font-semibold mt-2">{account.name}</h1>
        <p className="text-sm text-gray-500">{account.id}</p>
      </div>

      <AccountForm account={account} accounts={allAccounts} />

      {account.campaigns.length > 0 && (
        <div className="mt-6 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-xs font-medium text-gray-500 uppercase mb-3">Campaigns</div>
          <div className="space-y-1">
            {account.campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <Link href={`/campaigns/${c.id}`} className="text-blue-600 hover:underline">{c.name}</Link>
                <span className="text-xs text-gray-400">{c.status}</span>
              </div>
            ))}
          </div>
          <Link
            href={`/campaigns/new?accountId=${account.id}`}
            className="mt-3 block text-xs text-blue-600 hover:underline"
          >
            + New campaign
          </Link>
        </div>
      )}

      {account.children.length > 0 && (
        <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-xs font-medium text-gray-500 uppercase mb-3">Sub-accounts</div>
          {account.children.map((c) => (
            <Link key={c.id} href={`/accounts/${c.id}`} className="block text-sm text-blue-600 hover:underline">
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
