'use client';

/**
 * AutoApprovePanel — the dev-only toggle to bypass human review of Drive
 * proposals during long operator absences (e.g. before reviewers are
 * trained). Backs onto the drive-auto-approve-<env> Cloud Scheduler
 * job's paused state, same pause/resume pattern as PollSchedulerPanel.
 *
 * State surface:
 *   PAUSED  → toggle OFF. Gray, plain. Nothing runs.
 *   ENABLED → toggle ON. Green pill. Fires every 15 min against GUB's
 *             /integrations/google-drive/auto-approve-all-pending, which
 *             applies every pending field_change proposal (attributed
 *             to the staff ID in AUTO_APPROVE_AS_STAFF_ID on GUB).
 *
 * Buttons:
 *   Toggle       → pause/resume (backend calls Cloud Scheduler)
 *   Approve now  → one-off fire of the GUB endpoint, no scheduler wait.
 *                  Useful right after enabling, or to prove attribution
 *                  is wired.
 *
 * Scope caveats worth surfacing in the UI (not just backend docs):
 *   - Applies field_change only. new_entity + additional_update wait
 *     for a human. That's fine given the "nuke regularly" iteration
 *     posture — flag if it stops being true.
 *   - Attribution requires AUTO_APPROVE_AS_STAFF_ID set on GUB.
 *     Missing/invalid → 400 with a message; UI surfaces it so the
 *     operator can fix it.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DrivePollJobInfo } from '@/lib/cloud-scheduler';

type Pending = 'pause' | 'resume' | 'approve-now' | null;

interface Props {
  job: DrivePollJobInfo | null;
  readError: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AutoApprovePanel({ job, readError }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string | null>(null);

  if (readError || !job) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4 mb-6">
        <div className="text-sm font-semibold text-red-800 mb-1">
          Couldn&apos;t read the auto-approve scheduler.
        </div>
        <div className="text-xs text-red-700">
          {readError ??
            'No job returned. Terraform apply for drive_auto_approve.tf may not have run yet.'}
        </div>
      </div>
    );
  }

  const isEnabled = job.state === 'ENABLED';
  const isPaused = job.state === 'PAUSED';

  async function callAction(action: 'pause' | 'resume' | 'approve-now') {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(
        '/api/data-sources/google_drive/auto-approve/action',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        detail?: unknown;
        result?: { approved?: number; skipped?: number; failed?: number };
      };
      if (!res.ok) {
        const detail =
          typeof body.detail === 'string'
            ? body.detail
            : typeof body.error === 'string'
              ? body.error
              : JSON.stringify(body.detail ?? body.error ?? `HTTP ${res.status}`);
        setError(`${action}: ${detail}`);
        setPending(null);
        return;
      }
      if (action === 'approve-now' && body.result) {
        const { approved = 0, skipped = 0, failed = 0 } = body.result;
        setLastRunSummary(`Approved ${approved} · skipped ${skipped} · failed ${failed}`);
      }
      router.refresh();
      setPending(null);
    } catch (e) {
      setError(`${action}: ${e instanceof Error ? e.message : 'Network error'}`);
      setPending(null);
    }
  }

  return (
    <div
      className={`rounded-lg border px-5 py-4 mb-6 ${
        isEnabled ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-gray-800">
              Auto-approve pending proposals
            </span>
            {isEnabled && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-600" />
                ON
              </span>
            )}
            {isPaused && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
                OFF
              </span>
            )}
            {!isEnabled && !isPaused && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">
                {job.state}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600">
            Dev-only bypass of human review. When ON, applies pending
            field_change proposals every 15 min. Attributed to
            <code className="text-xs bg-white px-1 rounded mx-1">AUTO_APPROVE_AS_STAFF_ID</code>
            on GUB. Last scheduler run: {timeAgo(job.lastAttemptTime)}.
          </div>
        </div>
        <button
          onClick={() => callAction(isEnabled ? 'pause' : 'resume')}
          disabled={pending !== null}
          className={`text-sm px-4 py-2 rounded text-white ${
            pending !== null
              ? 'bg-gray-300 cursor-not-allowed'
              : isEnabled
                ? 'bg-gray-700 hover:bg-gray-800'
                : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {pending === 'pause'
            ? 'Turning off…'
            : pending === 'resume'
              ? 'Turning on…'
              : isEnabled
                ? 'Turn off'
                : 'Turn on'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => callAction('approve-now')}
          disabled={pending !== null}
          className="text-sm px-3 py-1.5 rounded border border-gray-900 text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Fire the GUB auto-approve endpoint now, without waiting for the next scheduler tick. Works even if the toggle is OFF."
        >
          {pending === 'approve-now' ? 'Approving…' : 'Approve pending now'}
        </button>
        {lastRunSummary && (
          <span className="text-xs text-gray-600">{lastRunSummary}</span>
        )}
      </div>

      {error && (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
