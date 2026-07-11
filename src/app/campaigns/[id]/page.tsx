import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import CampaignForm from '../CampaignForm';
import StatusMarkdownPanel from '../../StatusMarkdownPanel';

export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [campaign, accounts, staff] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        account: { select: { id: true, name: true } },
        // Execution deliverables of this campaign (a commercial, a site, a
        // social run). Campaign-scoped children — shown here, under the
        // campaign, not at top level.
        pieces: { orderBy: { name: 'asc' } },
      },
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

      <StatusMarkdownPanel
        markdown={campaign.statusMarkdown}
        sensitiveMarkdown={campaign.statusSensitiveMarkdown}
      />

      <section className="mt-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Pieces <span className="text-gray-400">({campaign.pieces.length})</span>
        </h2>
        {campaign.pieces.length > 0 ? (
          <ul className="space-y-2">
            {campaign.pieces.map((p) => (
              <li
                key={p.id}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <Link
                  href={`/campaigns/${campaign.id}/pieces/${p.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {p.name}
                </Link>
                <span className="text-xs text-gray-400">{p.statusMarkdown ? 'has status' : 'no status'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 bg-white border border-gray-200 rounded-lg px-4 py-6 text-center">
            No pieces yet — execution deliverables (a commercial, a site, a social run) appear here once derived.
          </p>
        )}
      </section>
    </div>
  );
}
