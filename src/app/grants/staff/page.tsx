import { prisma } from '@/lib/prisma';
import StaffGrantForm from './StaffGrantForm';

export const dynamic = 'force-dynamic';

export default async function StaffGrantPage() {
  const [users, offices, teams] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, displayName: true },
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
      <h1 className="text-xl font-semibold mb-2">Grant Staff Access</h1>
      <p className="text-sm text-gray-500 mb-6">
        Give a user permission to read staff records. Choose the scope that matches the access
        needed — grants stack, so a user can hold multiple staff scopes simultaneously.
      </p>
      <StaffGrantForm users={users} offices={offices} teams={teams} />
    </div>
  );
}
