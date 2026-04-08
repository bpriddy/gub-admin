import { prisma } from '@/lib/prisma';
import CampaignForm from '../CampaignForm';

export const dynamic = 'force-dynamic';

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: { accountId?: string };
}) {
  const [accounts, staff] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.staff.findMany({ where: { status: 'active' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
  ]);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold mb-6">New Campaign</h1>
      <CampaignForm accounts={accounts} staff={staff} defaultAccountId={searchParams.accountId} />
    </div>
  );
}
