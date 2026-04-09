import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IntervalForm } from './interval-form';

export const dynamic = 'force-dynamic';

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
}

function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default async function DataSourceDetailPage({ params }: { params: { key: string } }) {
  const source = await prisma.dataSource.findUnique({ where: { key: params.key } });
  if (!source) return notFound();

  const runs = await prisma.syncRun.findMany({
    where: { source: params.key },
    orderBy: { startedAt: 'desc' },
    take: 30,
  });

  return (
    <div>
      <div className="mb-6">
        <Link href="/data-sources" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Data Sources
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{source.name}</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                source.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {source.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {source.description && (
            <p className="text-sm text-gray-500 mt-1 max-w-2xl">{source.description}</p>
          )}
        </div>
      </div>

      {/* Config panel */}
      <div className="bg-white border border-gray-200 rounded-lg px-5 py-4 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Sync Configuration</h2>
        <IntervalForm
          sourceKey={source.key}
          currentInterval={source.syncInterval}
          currentCron={source.cronSchedule}
          isActive={source.isActive}
        />
      </div>

      {/* Run history */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Run History ({runs.length})
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Scanned</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Updated</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Unchanged</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Skipped</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Errors</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No sync runs yet
                  </td>
                </tr>
              )}
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/data-sources/${params.key}/runs/${run.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {formatTime(run.startedAt)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        run.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : run.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{run.totalScanned}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.created > 0 ? (
                      <span className="text-green-700 font-medium">+{run.created}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.updated > 0 ? (
                      <span className="text-blue-700 font-medium">{run.updated}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{run.unchanged}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.skipped > 0 ? (
                      <span className="text-amber-600">{run.skipped}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.errored > 0 ? (
                      <span className="text-red-600 font-medium">{run.errored}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                    {formatDuration(run.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
