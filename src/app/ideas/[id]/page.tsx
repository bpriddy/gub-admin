import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** Render a change's value_text (one facet per "- " line) as a bulleted list. */
function facetLines(text: string | null): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => l.replace(/^-\s?/, '').trim())
    .filter(Boolean);
}

export default async function IdeaDetailPage({ params }: { params: { id: string } }) {
  const idea = await prisma.idea.findUnique({
    where: { id: params.id },
    include: { changes: { orderBy: { changedAt: 'desc' } } },
  });
  if (!idea) notFound();

  const [account, campaign] = await Promise.all([
    prisma.account.findFirst({ where: { driveFolderId: idea.accountExternalId }, select: { id: true, name: true } }),
    idea.campaignExternalId
      ? prisma.campaign
          .findFirst({ where: { driveFolderId: idea.campaignExternalId }, select: { id: true, name: true } })
          .then(
            (c) =>
              c ??
              // Piece folders resolve to the owning campaign.
              prisma.campaignPiece
                .findFirst({
                  where: { driveFolderId: idea.campaignExternalId! },
                  select: { campaign: { select: { id: true, name: true } } },
                })
                .then((p) => p?.campaign ?? null),
          )
      : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/ideas" className="text-sm text-gray-500 hover:text-gray-700">← Ideas</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-xl font-semibold">{idea.name}</h1>
          {idea.pieceId && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ awarded</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {account ? (
            <Link href={`/accounts/${account.id}`} className="hover:underline">{account.name}</Link>
          ) : (
            <span>{idea.accountExternalId}</span>
          )}
          {campaign && (
            <>
              {' · '}
              <Link href={`/campaigns/${campaign.id}`} className="hover:underline">{campaign.name}</Link>
            </>
          )}
        </p>
      </div>

      {/* Facets = the idea's current description */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Facets <span className="text-gray-400">({idea.facets.length})</span></h2>
        {idea.facets.length > 0 ? (
          <ul className="space-y-1.5">
            {idea.facets.map((f, i) => (
              <li key={i} className="text-sm text-gray-700 flex gap-2">
                <span className="text-gray-300">•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">No facets.</p>
        )}
      </section>

      {/* Metadata */}
      <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6 text-sm">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 gap-x-4">
          <dt className="text-gray-500">Pitched</dt>
          <dd className="text-gray-800">{idea.pitchedAt ? idea.pitchedAt.toISOString().split('T')[0] : '—'}</dd>
          <dt className="text-gray-500">Source file</dt>
          <dd className="text-gray-800 font-mono text-xs break-all">{idea.sourceFileId ?? '—'}</dd>
          <dt className="text-gray-500">Piece id</dt>
          <dd className="text-gray-800 font-mono text-xs break-all">{idea.pieceId ?? '—'}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd className="text-gray-800">{idea.createdAt.toISOString().replace('T', ' ').slice(0, 16)}</dd>
        </dl>
      </section>

      {/* Change history — the evolution across decks (add + supersede) */}
      <section>
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          Change history <span className="text-gray-400">({idea.changes.length})</span>
        </h2>
        <ol className="space-y-3">
          {idea.changes.map((ch, idx) => {
            const isBirth = ch.previousValueText === null;
            const lines = facetLines(ch.valueText);
            return (
              <li key={ch.id} className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">
                    {isBirth ? 'Created' : 'Updated'} · {ch.property}
                  </span>
                  <span className="text-xs text-gray-400">
                    {ch.changedAt.toISOString().replace('T', ' ').slice(0, 16)}
                    {idx === 0 && idea.changes.length > 1 ? ' · latest' : ''}
                  </span>
                </div>
                {lines.length > 0 ? (
                  <ul className="space-y-1">
                    {lines.map((l, i) => (
                      <li key={i} className="text-xs text-gray-600 flex gap-2">
                        <span className="text-gray-300">•</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-400">(no facets)</p>
                )}
              </li>
            );
          })}
          {idea.changes.length === 0 && <li className="text-sm text-gray-400">No recorded changes.</li>}
        </ol>
      </section>
    </div>
  );
}
