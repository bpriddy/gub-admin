import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { SyncButton } from './[key]/sync-button';

export const dynamic = 'force-dynamic';

const COMING_SOON_SOURCES = new Set(['workfront', 'google_drive', 'staff_metadata_import']);

const DAYS_OF_WEEK: Record<string, string> = {
  '0': 'Sunday', '1': 'Monday', '2': 'Tuesday', '3': 'Wednesday',
  '4': 'Thursday', '5': 'Friday', '6': 'Saturday',
};

function describeSchedule(interval: string, cron: string | null): string {
  if (interval === 'manual' || !cron) return 'Manual only';

  const parts = cron.split(' ');
  if (parts.length < 5) return interval;

  const minute = parts[0] ?? '0';
  const hourRaw = parts[1] ?? '*';
  const dow = parts[4] ?? '*';

  const m = Number(minute);
  const h = hourRaw === '*' ? null : Number(hourRaw);

  if (interval === 'hourly') {
    return m === 0 ? 'Every hour on the hour' : `Every hour at :${String(m).padStart(2, '0')}`;
  }

  if (h === null) return interval;
  const time = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;

  if (interval === 'daily') return `Daily at ${time}`;
  if (interval === 'weekly') {
    const day = DAYS_OF_WEEK[dow] ?? 'Monday';
    return `${day}s at ${time}`;
  }

  return interval;
}

function timeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function DataSourcesPage() {
  const sources = await prisma.dataSource.findMany({
    orderBy: { name: 'asc' },
  });

  // Get the latest sync run for each source
  const latestRuns = await prisma.syncRun.groupBy({
    by: ['source'],
    _max: { startedAt: true },
  });

  const latestRunMap = new Map<string, Date>();
  for (const r of latestRuns) {
    if (r._max.startedAt) latestRunMap.set(r.source, r._max.startedAt);
  }

  // Get run counts per source
  const runCounts = await prisma.syncRun.groupBy({
    by: ['source'],
    _count: true,
  });
  const countMap = new Map<string, number>();
  for (const r of runCounts) {
    countMap.set(r.source, r._count);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Data Sources</h1>
      </div>

      <div className="grid gap-4">
        {sources.map((source) => {
          const lastRun = source.lastSyncAt ?? latestRunMap.get(source.key) ?? null;
          const runs = countMap.get(source.key) ?? 0;
          const comingSoon = COMING_SOON_SOURCES.has(source.key);

          return (
            <div
              key={source.id}
              className={`bg-white border border-gray-200 rounded-lg px-5 py-4 ${comingSoon ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    {comingSoon ? (
                      <span className="text-base font-medium text-gray-400">
                        {source.name}
                      </span>
                    ) : (
                      <Link
                        href={`/data-sources/${source.key}`}
                        className="text-base font-medium text-gray-900 hover:text-blue-600"
                      >
                        {source.name}
                      </Link>
                    )}
                    {comingSoon ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-500 border border-violet-200">
                        Coming soon
                      </span>
                    ) : (
                      <>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            source.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {source.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {source.lastStatus && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              source.lastStatus === 'success'
                                ? 'bg-green-50 text-green-600'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            Last: {source.lastStatus}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {source.description && (
                    <p className="text-sm text-gray-500 mt-1 max-w-2xl">{source.description}</p>
                  )}
                </div>

                {!comingSoon && (
                  <div className="flex items-center gap-6 text-sm ml-4 shrink-0">
                    <div className="text-right">
                      <div className="text-gray-400 text-xs">Schedule</div>
                      <div className="text-gray-700 font-medium">
                        {describeSchedule(source.syncInterval, source.cronSchedule)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-xs">Last sync</div>
                      <div className="text-gray-700">{timeAgo(lastRun)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-xs">Runs</div>
                      <div className="text-gray-700 tabular-nums">{runs}</div>
                    </div>
                    <SyncButton sourceKey={source.key} compact />
                    <Link
                      href={`/data-sources/${source.key}`}
                      className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700"
                    >
                      View
                    </Link>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sources.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg px-5 py-8 text-center text-gray-400">
            No data sources configured
          </div>
        )}
      </div>
    </div>
  );
}
