import { prisma } from '@/lib/prisma';
import NewGrantForm from './NewGrantForm';

export const dynamic = 'force-dynamic';

export default async function NewGrantPage() {
  const [users, staff, accounts, campaigns, offices, teams] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, displayName: true },
    }),
    prisma.staff.findMany({
      where: { status: { in: ['active', 'on_leave'] } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
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
        Grant a user access to any resource or capability. Use functional grants (e.g.{' '}
        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">func:temporal</code>) for
        cross-cutting permissions like historical data access.
      </p>
      <NewGrantForm
        users={users}
        staff={staff}
        accounts={accounts}
        campaigns={campaigns}
        offices={offices}
        teams={teams}
      />
    </div>
  );
}
