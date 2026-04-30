/**
 * /data-sources/google_drive — Drive sync settings page.
 *
 * Different shape from the generic [key]/page.tsx because Drive has:
 *   - Polling state (drive_sync_state singleton — page token, last poll
 *     outcome) that lives outside the data_sources/sync_runs schema.
 *   - Admin-controlled cadence on the Cloud Scheduler job (Pattern A) —
 *     the page reads the live cron from the Scheduler API rather than a
 *     stored value, so what's displayed reflects what's deployed.
 *   - A "bootstrap_required" state distinct from "errored" or "running",
 *     surfaced in the status panel with the matching recovery action.
 *
 * Note: this literal `google_drive` segment takes precedence over the
 * dynamic `[key]` segment in Next.js routing.
 */

import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { AutoRefresh } from '../[key]/auto-refresh';
import { RunDuration } from '../[key]/run-duration';
import { SyncButton } from '../[key]/sync-button';
import { CadenceEditor } from './cadence-editor';
import { CADENCE_PRESETS, type CadenceKey } from '@/lib/drive-cadence';
import { getDrivePollJob, type DrivePollJobInfo } from '@/lib/cloud-scheduler';

export const dynamic = 'force-dynamic';

const SOURCE_KEY = 'google_drive';

const OUTCOME_BADGES: Record<string, string> = {
  no_changes: 'bg-gray-100 text-gray-600',
  changes_dispatched: 'bg-blue-100 text-blue-700',
  changes_pending_existing_run: 'bg-blue-100 text-blue-700',
  bootstrap_required: 'bg-amber-100 text-amber-700',
  errored: 'bg-red-100 text-red-700',
};

function formatTime(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function timeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface SchedulerLoad {
  job: DrivePollJobInfo | null;
  matchedPreset: CadenceKey | null;
  error: string | null;
}

async function loadScheduler(): Promise<SchedulerLoad> {
  try {
    const job = await getDrivePollJob();
    const matched = (Object.keys(CADENCE_PRESETS) as CadenceKey[]).find(
      (k) => CADENCE_PRESETS[k].schedule === job.schedule,
    );
    return { job, matchedPreset: matched ?? null, error: null };
  } catch (err) {
    return {
      job: null,
      matchedPreset: null,
      error: err instanceof Error ? err.message : 'Unknown Cloud Scheduler error',
    };
  }
}

export default async function DriveSyncDetailPage() {
  // Pull state + scheduler info + run history in parallel — no point
  // waiting sequentially when each is independent.
  const [state, scheduler, runs] = await Promise.all([
    prisma.driveSyncState.findUnique({ where: { id: 1 } }),
    loadScheduler(),
    prisma.syncRun.findMany({
      where: { source: SOURCE_KEY },
      orderBy: { startedAt: 'desc' },
      take: 30,
    }),
  ]);

  const outcome = state?.lastOutcome ?? 'bootstrap_required';
  const isBootstrapRequired =
    outcome === 'bootstrap_required' || state?.pageToken == null;

  return (
    <div>
      <AutoRefresh />

      <div className="mb-6">
        <Link href="/data-sources" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Data Sources
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Google Drive</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              Active
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Incremental polling via Drive&apos;s <code className="text-xs bg-gray-100 px-1 rounded">changes.list</code>{' '}
            API. Cadence is controlled from this page; the &quot;Run sync now&quot; button forces a
            full discover + scan and (re-)bootstraps the page token.
          </p>
        </div>
        <SyncButton sourceKey={SOURCE_KEY} />
      </div>

      {/* Bootstrap-required banner */}
      {isBootstrapRequired && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="text-amber-700 font-medium text-sm">
              Bootstrap required
            </div>
            <div className="text-sm text-amber-800 flex-1">
              No saved Drive page token. The next scheduled poll will return
              503 until a full sync runs and persists a fresh start point.
              Click <strong>Run sync now</strong> above when the IT-side setup
              (DWD grant + bot user shared on Drives) is complete.
            </div>
          </div>
        </div>
      )}

      {/* Two-column status + cadence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Status panel */}
        <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Status</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Last poll outcome</dt>
              <dd>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    OUTCOME_BADGES[outcome] ?? 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {outcome}
                </span>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Last polled</dt>
              <dd className="text-gray-700">
                {timeAgo(state?.lastPolledAt ?? null)}
                {state?.lastPolledAt && (
                  <span className="text-xs text-gray-400 ml-2">
                    ({formatTime(state.lastPolledAt)})
                  </span>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Page token</dt>
              <dd className="text-gray-700 text-xs font-mono">
                {state?.pageToken
                  ? `${state.pageToken.slice(0, 12)}…`
                  : <span className="text-amber-700">not set</span>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Scheduler state</dt>
              <dd className="text-gray-700">
                {scheduler.job ? scheduler.job.state : <span className="text-red-600">unreachable</span>}
              </dd>
            </div>
          </dl>
        </div>

        {/* Cadence panel */}
        <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Cadence</h2>
          {scheduler.error ? (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 space-y-1">
              <div className="font-medium">Cloud Scheduler API error</div>
              <div>{scheduler.error}</div>
              <div className="text-red-600">
                Check that the gub-admin runtime SA has{' '}
                <code className="bg-red-100 px-1 rounded">gubAdminDriveSchedulerEditor</code>{' '}
                granted (terraform/drive_poll.tf).
              </div>
            </div>
          ) : scheduler.job ? (
            <CadenceEditor
              current={scheduler.matchedPreset}
              liveSchedule={scheduler.job.schedule}
              liveTimeZone={scheduler.job.timeZone}
            />
          ) : null}
        </div>
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
                <th className="text-right px-4 py-3 font-medium text-gray-600">Errors</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No sync runs yet
                  </td>
                </tr>
              )}
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/data-sources/${SOURCE_KEY}/runs/${run.id}`}
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
                            : run.status === 'paused'
                              ? 'bg-blue-100 text-blue-700'
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
                  <td className="px-4 py-3 text-right tabular-nums">
                    {run.errored > 0 ? (
                      <span className="text-red-600 font-medium">{run.errored}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    <RunDuration
                      startedAt={run.startedAt.toISOString()}
                      durationMs={run.durationMs}
                      status={run.status}
                    />
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
