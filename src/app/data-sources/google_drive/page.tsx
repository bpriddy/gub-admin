/**
 * /data-sources/google_drive — Drive backfill control surface.
 *
 * Operator-facing page for the per-account backfill workflow. Replaced
 * the prior polling-architecture page (driveSyncState + Cloud Scheduler
 * cron) when Drive's machine endpoints moved to gub-drive-sync as a
 * standalone Cloud Run Job. The new model is:
 *
 *   - Each account carries its own `drive_folder_id` (the campaign tree's
 *     root) and `drive_backfill_cursor` (the daily-scan walker's progress).
 *   - The "Backfill" button writes a row to drive_backfill_requests; the
 *     gub-drive-sync watcher picks it up and runs the backfill engine.
 *   - This page shows the per-account state inline + recent queue activity.
 *
 * Page contents:
 *   1. Per-account table — name / inline-editable drive_folder_id / last
 *      backfill time / cursor / live status badge / Backfill button.
 *   2. Recent backfill requests — last 10 across all accounts with status
 *      and a one-line log summary.
 *
 * The route segment stays `google_drive` so existing navigation links
 * keep working. This literal segment takes precedence over the dynamic
 * `[key]` segment in Next.js routing.
 */

import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { AutoRefresh } from '../[key]/auto-refresh';
import { AccountBackfillRow } from './account-backfill-row';
import { RequestRow } from './request-row';

export const dynamic = 'force-dynamic';

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

function formatCursorYmd(d: Date | null): string {
  if (!d) return 'none';
  return d.toISOString().slice(0, 10);
}

/**
 * Pick the operator-facing button mode based on cursor age.
 *
 * The underlying operation is identical — both `sync` and `backfill`
 * queue a 1-day scan via `processBackfillQueue`. The label just matches
 * the operator's mental model:
 *
 *   - cursor < 7 days old or = today → "Sync" (we're current; this is
 *     day-to-day refresh)
 *   - cursor null (never scanned) or ≥ 7 days old → "Backfill" (we're
 *     catching up; the gap is the point)
 *
 * One-week threshold is a UX heuristic, not a system constraint — easy
 * to revisit if the operator's mental model shifts.
 */
const SYNC_CUTOFF_DAYS = 7;
function backfillMode(cursor: Date | null): 'sync' | 'backfill' {
  if (!cursor) return 'backfill';
  const ageDays = Math.floor((Date.now() - cursor.getTime()) / (24 * 60 * 60 * 1000));
  return ageDays < SYNC_CUTOFF_DAYS ? 'sync' : 'backfill';
}

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default async function DriveBackfillPage() {
  // Pull accounts (ordered alphabetically), live status per account
  // (any pending/running request on that account), and the global recent
  // requests list — all in parallel.
  const [accounts, liveByAccount, recentRequests] = await Promise.all([
    prisma.account.findMany({
      where: { parentId: null }, // top-level accounts only
      select: {
        id: true,
        name: true,
        driveFolderId: true,
        driveLastScannedAt: true,
        driveBackfillCursor: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.driveBackfillRequest.findMany({
      where: { status: { in: ['pending', 'running'] } },
      select: { accountId: true, status: true, requestedAt: true },
      orderBy: { requestedAt: 'desc' },
    }),
    prisma.driveBackfillRequest.findMany({
      take: 10,
      orderBy: { requestedAt: 'desc' },
      include: {
        account: { select: { id: true, name: true } },
        requestedByStaff: { select: { fullName: true, email: true } },
      },
    }),
  ]);

  // Reduce live requests to a per-account status (most recent wins).
  const livePerAccount = new Map<string, 'pending' | 'running'>();
  for (const r of liveByAccount) {
    if (!livePerAccount.has(r.accountId)) {
      livePerAccount.set(r.accountId, r.status as 'pending' | 'running');
    }
  }

  // Trigger-health hint. Pattern A is enqueue-as-trigger — every
  // Backfill click also fires the Job via Cloud Run Admin API in the
  // same request handler. A row that's still `pending` more than 2
  // minutes after `requested_at` (Job cold start ~5s + typical work
  // ~30s; 2min is generous) means the trigger likely failed — IAM
  // misconfig, Job missing, or local dev (no GCP creds). Surface the
  // hint and tell the operator the manual escape hatch.
  const oldestPending = liveByAccount
    .filter((r) => r.status === 'pending')
    .map((r) => r.requestedAt.getTime())
    .reduce<number | null>((min, t) => (min === null || t < min ? t : min), null);
  const triggerLikelyFailed =
    oldestPending !== null && Date.now() - oldestPending > 2 * 60 * 1000;

  // Only poll when there's a live request to watch. Idle state = no
  // refresh, no DB queries. Click flow re-enables polling: the
  // Backfill button does router.refresh() on success, which re-runs
  // this server component, picks up the new pending row, and the next
  // render flips AutoRefresh's enabled prop to true. Polling shuts off
  // again once the row terminates (completed/failed).
  const hasLiveRequests = liveByAccount.length > 0;

  return (
    <div>
      <AutoRefresh intervalMs={5000} enabled={hasLiveRequests} />

      <div className="mb-6">
        <Link href="/data-sources" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Data Sources
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Google Drive — Backfill</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Per-account daily-scan backfill. Each <strong>Backfill</strong> click queues a
            single-day scan from the account&apos;s current cursor and immediately
            triggers the <code className="text-xs bg-gray-100 px-1 rounded mx-1">gub-drive-sync</code>
            Cloud Run Job via the Admin API. The Job claims pending rows, runs them,
            and persists field updates + synthesized status_markdown.
          </p>
        </div>
      </div>

      {triggerLikelyFailed && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3 mb-6 text-sm text-amber-800">
          <strong>Job trigger likely failed.</strong>{' '}
          The oldest <code className="text-xs bg-white px-1 rounded">pending</code> request is
          more than 2 minutes old without going to <code className="text-xs bg-white px-1 rounded">running</code>.
          In prod that usually means IAM (gub-admin SA needs <code className="text-xs bg-white px-1 rounded">roles/run.developer</code>{' '}
          on the Job) or a missing Job. Locally, run{' '}
          <code className="text-xs bg-white px-1 rounded">npm run backfill-pending</code> in
          your gub-drive-sync checkout to drain the queue manually.
        </div>
      )}

      {/* Per-account backfill rows */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Accounts ({accounts.length})
        </h2>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Drive folder ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last backfill</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cursor</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No accounts yet. Create one in the Account management section.
                  </td>
                </tr>
              )}
              {accounts.map((acct) => (
                <AccountBackfillRow
                  key={acct.id}
                  accountId={acct.id}
                  name={acct.name}
                  driveFolderId={acct.driveFolderId}
                  lastBackfill={
                    acct.driveLastScannedAt
                      ? { ago: timeAgo(acct.driveLastScannedAt), abs: formatTime(acct.driveLastScannedAt) }
                      : null
                  }
                  cursor={formatCursorYmd(acct.driveBackfillCursor)}
                  mode={backfillMode(acct.driveBackfillCursor)}
                  liveStatus={livePerAccount.get(acct.id) ?? null}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent backfill requests */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Recent backfill requests ({recentRequests.length})
        </h2>
        {/* overflow-x-auto so the action column (rightmost) doesn't get
            clipped when the Summary column's text is long. Otherwise the
            cancel ✕ button can disappear off-screen entirely. */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Requested</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Scans</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">By</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Summary</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No backfill requests yet. Click a row&apos;s <strong>Backfill</strong> button to queue one.
                  </td>
                </tr>
              )}
              {recentRequests.map((req) => {
                const summaryLine = req.errorMessage
                  ? req.errorMessage
                  : (req.logSummary?.split('\n').filter(Boolean).pop() ?? '');
                return (
                  <RequestRow
                    key={req.id}
                    id={req.id}
                    status={req.status}
                    accountName={req.account.name}
                    ago={timeAgo(req.requestedAt)}
                    scansDone={req.scansDone}
                    scans={req.scans}
                    requestedBy={
                      req.requestedByStaff?.fullName ?? req.requestedByStaff?.email ?? '—'
                    }
                    summary={summaryLine}
                    hasError={!!req.errorMessage}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
