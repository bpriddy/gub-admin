import { prisma } from '@/lib/prisma';
import NewGrantForm from './NewGrantForm';

export const dynamic = 'force-dynamic';

export default async function NewGrantPage() {
  const [users, accounts, campaigns, offices, teams] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, displayName: true },
    }),
    prisma.account.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.campaign.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.office.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.team.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-2">New Grant</h1>
      <p className="text-sm text-gray-500 mb-6">
        Grant a user access to any resource or capability. For offices and teams you can grant a
        specific record, or a cohort — <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">all</code>{' '}
        (every record) or <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">active</code>{' '}
        (only <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">is_active = true</code>, recommended for
        most staff so short-lived or closed records stay hidden). For staff scopes, use{' '}
        <a href="/grants/staff" className="text-blue-600 hover:underline">the dedicated staff grant form</a>.
        Functional grants like{' '}
        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">func:temporal</code> are for
        cross-cutting capabilities.
      </p>
      <NewGrantForm
        users={users}
        accounts={accounts}
        campaigns={campaigns}
        offices={offices}
        teams={teams}
      />
    </div>
  );
}
