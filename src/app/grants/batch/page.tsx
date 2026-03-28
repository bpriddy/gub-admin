import { prisma } from '@/lib/prisma';
import BatchGrantForm from './BatchGrantForm';

export const dynamic = 'force-dynamic';

export default async function BatchGrantPage() {
  const [users, accounts, staff] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { email: 'asc' },
      select: { id: true, email: true, displayName: true },
    }),
    prisma.account.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.staff.findMany({
      where: { status: 'active' },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-semibold mb-2">Batch Grant Access</h1>
      <p className="text-sm text-gray-500 mb-6">
        Grant a user access to an account and its campaigns in one action.
      </p>
      <BatchGrantForm users={users} accounts={accounts} staff={staff} />
    </div>
  );
}
