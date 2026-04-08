import { prisma } from '@/lib/prisma';
import AccountForm from '../AccountForm';

export const dynamic = 'force-dynamic';

export default async function NewAccountPage() {
  const accounts = await prisma.account.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold mb-6">New Account</h1>
      <AccountForm accounts={accounts} />
    </div>
  );
}
