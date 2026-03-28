import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import CampaignForm from '../CampaignForm';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [campaign, accounts, staff] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: params.id },
      include: { account: { select: { id: true, name: true } } },
    }),
    prisma.account.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.staff.findMany({ where: { status: 'active' }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } }),
  ]);

  if (!campaign) notFound();

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/campaigns" className="text-sm text-gray-500 hover:text-gray-700">← Campaigns</Link>
        <h1 className="text-xl font-semibold mt-2">{campaign.name}</h1>
        <p className="text-sm text-gray-500">
          <Link href={`/accounts/${campaign.account.id}`} className="hover:underline">{campaign.account.name}</Link>
          {' · '}{campaign.id}
        </p>
      </div>

      <CampaignForm campaign={campaign} accounts={accounts} staff={staff} />
    </div>
  );
}
