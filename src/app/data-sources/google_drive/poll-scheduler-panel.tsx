'use client';

/**
 * PollSchedulerPanel — top-of-page status + controls for the
 * drive-poll-<env> Cloud Scheduler job.
 *
 * Replaces the previous (dead) cadence-editor.tsx, which lost its
 * hookup when the Drive page was redesigned around per-account
 * backfill. The scheduler is still the automation driver (fires
 * gub-drive-sync in `poll` mode on a cron); this panel restores UI
 * visibility + control.
 *
 * Four things surfaced/controllable:
 *   1. State (ENABLED / PAUSED / other) — asymmetric visual weight:
 *      paused is a big amber banner; enabled is a small green pill.
 *      Paused matters more than running for operator attention.
 *   2. Cadence (preset dropdown → PATCHes the cron via the existing
 *      /api/.../scheduler POST route).
 *   3. Pause / Resume — flip the scheduler state via the new
 *      /api/.../scheduler/action route.
 *   4. Poll now — one-off on-demand poll; fires the gub-drive-sync
 *      Job directly with mode='poll'. Works even when paused (bypasses
 *      the scheduler) and even before the pause/resume terraform
 *      lands (uses a different IAM path).
 *
 * All actions call router.refresh() on success so the server-rendered
 * page re-reads the live scheduler state.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CADENCE_PRESETS, type CadenceKey } from '@/lib/drive-cadence';
import type { DrivePollJobInfo } from '@/lib/cloud-scheduler';

type PendingAction = 'pause' | 'resume' | 'poll-now' | 'save-cadence' | null;

interface Props {
  /** Live scheduler job info, fetched server-side. Null when the read failed. */
  job: DrivePollJobInfo | null;
  /** Server-side read error message, if the fetch failed. */
  readError: string | null;
  /** The preset key that matches the live cron, or null for custom cron. */
  matchedPreset: CadenceKey | null;
}

/**
 * "Last attempt N ago" — coarse; the scheduler tick cadence is minutes+,
 * so second-level precision is noise.
 */
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

export function PollSchedulerPanel({ job, readError, matchedPreset }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<CadenceKey | ''>(
    matchedPreset ?? '',
  );

  // ── Server-read failure ─────────────────────────────────────────────────
  // The whole panel depends on `job` — without it we can't render state or
  // enable any control. Show the underlying error verbatim; the operator
  // will need to fix the IAM / plumbing before this view is useful.
  if (readError || !job) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4 mb-6">
        <div className="text-sm font-semibold text-red-800 mb-1">
          Couldn&apos;t read the Drive poll scheduler.
        </div>
        <div className="text-xs text-red-700">
          {readError ?? 'No job returned. Check DRIVE_POLL_JOB_NAME / IAM.'}
        </div>
      </div>
    );
  }

  const isPaused = job.state === 'PAUSED';
  const isEnabled = job.state === 'ENABLED';
  const isWeird = !isPaused && !isEnabled; // DISABLED, UPDATE_FAILED, etc.
  const cadenceDirty = selectedPreset !== '' && selectedPreset !== matchedPreset;

  async function callAction(action: 'pause' | 'resume' | 'poll-now') {
    setPending(action);
    setError(null);
    try {
      const res = await fetch('/api/data-sources/google_drive/scheduler/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          detail?: unknown;
        };
        const detail =
          typeof body.detail === 'string'
            ? body.detail
            : typeof body.error === 'string'
              ? body.error
              : `HTTP ${res.status}`;
        setError(`${action}: ${detail}`);
        setPending(null);
        return;
      }
      router.refresh();
      setPending(null);
    } catch (e) {
      setError(`${action}: ${e instanceof Error ? e.message : 'Network error'}`);
      setPending(null);
    }
  }

  async function saveCadence() {
    // cadenceDirty already implies selectedPreset is a real CadenceKey
    // (its computation includes selectedPreset !== ''), so no further
    // narrowing check needed. TS agrees.
    if (!cadenceDirty) return;
    setPending('save-cadence');
    setError(null);
    try {
      const res = await fetch('/api/data-sources/google_drive/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence: selectedPreset }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          detail?: unknown;
        };
        const detail =
          typeof body.detail === 'string'
            ? body.detail
            : typeof body.error === 'string'
              ? body.error
              : `HTTP ${res.status}`;
        setError(`save cadence: ${detail}`);
        setPending(null);
        return;
      }
      router.refresh();
      setPending(null);
    } catch (e) {
      setError(`save cadence: ${e instanceof Error ? e.message : 'Network error'}`);
      setPending(null);
    }
  }

  return (
    <div className="mb-6">
      {/* State surface — asymmetric: paused is a full banner, enabled is a pill. */}
      {isPaused && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-900 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Poller is paused — no new syncs firing on schedule.
            </div>
            <div className="text-xs text-amber-800 mt-1">
              Cron: <code className="text-xs bg-white px-1 rounded">{job.schedule}</code>{' '}
              ({job.timeZone}) · Last attempt: {timeAgo(job.lastAttemptTime)}
            </div>
          </div>
          <button
            onClick={() => callAction('resume')}
            disabled={pending !== null}
            className="text-sm px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {pending === 'resume' ? 'Resuming…' : 'Resume'}
          </button>
        </div>
      )}

      {isWeird && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3 mb-3 text-sm text-red-800">
          <strong>Scheduler in unexpected state:</strong>{' '}
          <code className="text-xs bg-white px-1 rounded">{job.state}</code>. Investigate in
          the Cloud Scheduler console before relying on the automation.
        </div>
      )}

      {/* Cadence + poll-now + (if enabled) pause button — single card. */}
      <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-700">
                Poll scheduler ({job.name.split('/').pop()})
              </span>
              {isEnabled && (
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-600" />
                  ENABLED
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Fires <code className="text-xs bg-gray-100 px-1 rounded">gub-drive-sync</code>{' '}
              with <code className="text-xs bg-gray-100 px-1 rounded">mode=poll</code> on the
              cron below. Last attempt: {timeAgo(job.lastAttemptTime)}.
            </div>
          </div>
          {isEnabled && (
            <button
              onClick={() => callAction('pause')}
              disabled={pending !== null}
              className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending === 'pause' ? 'Pausing…' : 'Pause'}
            </button>
          )}
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Cadence</label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value as CadenceKey | '')}
              disabled={pending !== null}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 disabled:opacity-50"
            >
              {matchedPreset === null && (
                <option value="" disabled>
                  Custom: {job.schedule} {job.timeZone}
                </option>
              )}
              {(Object.keys(CADENCE_PRESETS) as CadenceKey[]).map((k) => (
                <option key={k} value={k}>
                  {CADENCE_PRESETS[k].label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={saveCadence}
            disabled={!cadenceDirty || pending !== null}
            className={`text-sm px-3 py-1.5 rounded text-white ${
              !cadenceDirty || pending !== null
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gray-900 hover:bg-gray-700'
            }`}
          >
            {pending === 'save-cadence' ? 'Saving…' : 'Save cadence'}
          </button>
          <button
            onClick={() => callAction('poll-now')}
            disabled={pending !== null}
            className="text-sm px-3 py-1.5 rounded border border-gray-900 text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fire the gub-drive-sync Job in poll mode once, right now. Works even while paused."
          >
            {pending === 'poll-now' ? 'Firing…' : 'Poll now'}
          </button>
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
