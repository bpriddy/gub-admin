import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import StatusMarkdownPanel from '@/app/StatusMarkdownPanel';

export const dynamic = 'force-dynamic';

// A campaign piece is a campaign-scoped execution deliverable. It carries its
// own status_markdown, so it gets a detail view mirroring the campaign's —
// nested under the campaign to reflect ownership.
export default async function PieceDetailPage({ params }: { params: { id: string; pieceId: string } }) {
  const piece = await prisma.campaignPiece.findUnique({
    where: { id: params.pieceId },
    include: { campaign: { select: { id: true, name: true, account: { select: { id: true, name: true } } } } },
  });
  // Guard: the piece must belong to the campaign in the URL.
  if (!piece || piece.campaignId !== params.id) notFound();

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href={`/campaigns/${piece.campaign.id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {piece.campaign.name}
        </Link>
        <h1 className="text-xl font-semibold mt-2">{piece.name}</h1>
        <p className="text-sm text-gray-500">
          <Link href={`/accounts/${piece.campaign.account.id}`} className="hover:underline">
            {piece.campaign.account.name}
          </Link>
          {' · piece · '}
          {piece.id}
        </p>
      </div>

      <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6 text-sm">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 gap-x-4">
          <dt className="text-gray-500">Drive folder</dt>
          <dd className="text-gray-800 break-all">
            {piece.driveFolderUrl ? (
              <a href={piece.driveFolderUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {piece.driveFolderPath ?? piece.driveFolderId ?? 'open'}
              </a>
            ) : (
              piece.driveFolderPath ?? piece.driveFolderId ?? '—'
            )}
          </dd>
          <dt className="text-gray-500">Last sync</dt>
          <dd className="text-gray-800">
            {piece.driveLastRunAt ? piece.driveLastRunAt.toISOString().replace('T', ' ').slice(0, 16) : '—'}
          </dd>
        </dl>
      </section>

      <StatusMarkdownPanel markdown={piece.statusMarkdown} sensitiveMarkdown={piece.statusSensitiveMarkdown} />
    </div>
  );
}
