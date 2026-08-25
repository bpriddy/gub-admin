'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface AccountBackfillRowProps {
  accountId: string;
  name: string;
  driveFolderId: string | null;
  lastBackfill: { ago: string; abs: string } | null;
  cursor: string; // 'none' or YYYY-MM-DD
  /**
   * Operator-facing button label mode. Derived in the page from the
   * account's driveBootstrapCompletedAt (server-authoritative). Server
   * dispatches the same way in the API — the client's `mode` here is
   * a label hint only, not authorization.
   *
   *   sync     → account is bootstrap-complete; enqueues mode='forward'
   *              (Activity API, proposes for review)
   *   backfill → account still bootstrapping; enqueues mode='bootstrap'
   *              (day-walk, auto-applies)
   */
  mode: 'sync' | 'backfill';
  liveStatus: 'pending' | 'running' | null;
}

const LIVE_BADGES: Record<'pending' | 'running', string> = {
  pending: 'bg-amber-100 text-amber-700',
  running: 'bg-blue-100 text-blue-700',
};

/**
 * Single row in the per-account backfill table. Two interactive bits:
 *
 *   1. Inline drive_folder_id editor — click the cell to switch from
 *      display to <input>. Save on Enter / blur; cancel on Esc. PATCHes
 *      `/api/accounts/:id/drive-folder` and refreshes the page.
 *
 *   2. Backfill button — POSTs `/api/data-sources/google_drive/backfill`
 *      with the account id; the API writes a drive_backfill_request and
 *      returns. The watcher picks it up; auto-refresh on the parent
 *      page surfaces the status transition.
 *
 * The button is disabled when:
 *   - drive_folder_id is null (nothing to backfill)
 *   - there's already a pending or running request for this account
 *     (the parent passes `liveStatus`)
 */
export function AccountBackfillRow({
  accountId,
  name,
  driveFolderId,
  lastBackfill,
  cursor,
  mode,
  liveStatus,
}: AccountBackfillRowProps) {
  const router = useRouter();
  const [folderId, setFolderId] = useState(driveFolderId ?? '');
  const [editing, setEditing] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [triggerState, setTriggerState] = useState<'idle' | 'triggering' | 'triggered' | 'error'>(
    'idle',
  );
  const [triggerError, setTriggerError] = useState<string | null>(null);

  async function saveFolder() {
    const trimmed = folderId.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === driveFolderId) {
      // No change — just close the editor.
      setEditing(false);
      return;
    }
    setSavingFolder(true);
    setFolderError(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/drive-folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveFolderId: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingFolder(false);
    }
  }

  function cancelEdit() {
    setFolderId(driveFolderId ?? '');
    setFolderError(null);
    setEditing(false);
  }

  async function triggerBackfill() {
    setTriggerState('triggering');
    setTriggerError(null);
    try {
      // allRemaining is only meaningful for bootstrap mode (chains
      // continuations until cursor reaches today). Server dispatches
      // the actual mode from the account's bootstrap state — for a
      // bootstrap-complete account the server enqueues mode='forward'
      // and allRemaining is passed through but ignored by runForward
      // (which always drains its Activity window in one pass).
      const res = await fetch('/api/data-sources/google_drive/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          scans: 1,
          allRemaining: mode === 'backfill',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setTriggerState('triggered');
      router.refresh();
      // Reset button label after a beat — but the row's `liveStatus`
      // prop (driven by parent revalidation) is the real source of truth.
      setTimeout(() => setTriggerState('idle'), 3000);
    } catch (err) {
      setTriggerState('error');
      setTriggerError(err instanceof Error ? err.message : 'Trigger failed');
      setTimeout(() => {
        setTriggerState('idle');
        setTriggerError(null);
      }, 5000);
    }
  }

  const backfillDisabled =
    !driveFolderId ||
    triggerState === 'triggering' ||
    liveStatus === 'pending' ||
    liveStatus === 'running';

  return (
    <tr className="hover:bg-gray-50">
      {/* Account name */}
      <td className="px-4 py-3">
        <Link
          href={`/accounts/${accountId}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {name}
        </Link>
        {liveStatus && (
          <span
            className={`ml-2 text-xs px-2 py-0.5 rounded-full ${LIVE_BADGES[liveStatus]}`}
          >
            {liveStatus}
          </span>
        )}
      </td>

      {/* Drive folder ID (inline editable) */}
      <td className="px-4 py-3 text-xs font-mono">
        {editing ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveFolder();
                  if (e.key === 'Escape') cancelEdit();
                }}
                disabled={savingFolder}
                autoFocus
                placeholder="0AOr-kVm…"
                className="text-xs font-mono px-2 py-1 border border-blue-300 rounded w-64 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={saveFolder}
                disabled={savingFolder}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {savingFolder ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={savingFolder}
                className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
            {folderError && <div className="text-xs text-red-600">{folderError}</div>}
          </div>
        ) : driveFolderId ? (
          <button
            onClick={() => setEditing(true)}
            className="text-gray-700 hover:text-blue-600 hover:underline cursor-pointer"
            title="Click to edit"
          >
            {driveFolderId}
          </button>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-amber-700 hover:underline cursor-pointer"
          >
            not linked — click to set
          </button>
        )}
      </td>

      {/* Last backfill */}
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
        {lastBackfill ? (
          <>
            {lastBackfill.ago}
            <span className="text-xs text-gray-400 ml-2">({lastBackfill.abs})</span>
          </>
        ) : (
          <span className="text-gray-400">Never</span>
        )}
      </td>

      {/* Cursor */}
      <td className="px-4 py-3 text-gray-700 font-mono text-xs tabular-nums">
        {cursor === 'none' ? <span className="text-gray-400">none</span> : cursor}
      </td>

      {/* Action */}
      <td className="px-4 py-3 text-right">
        <button
          onClick={triggerBackfill}
          disabled={backfillDisabled}
          className={`text-xs px-3 py-1.5 rounded transition-colors ${
            triggerState === 'triggered'
              ? 'bg-green-100 text-green-700 cursor-default'
              : triggerState === 'error'
                ? 'bg-red-100 text-red-700'
                : triggerState === 'triggering'
                  ? 'bg-amber-100 text-amber-700 cursor-wait'
                  : backfillDisabled
                    ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
          title={
            !driveFolderId
              ? 'Set a Drive folder ID first'
              : liveStatus
                ? `A ${liveStatus} request already exists for this account`
                : mode === 'sync'
                  ? 'Bootstrap complete — enqueues a forward-sync (Activity API from the account cursor to now, proposes for review). Same code path the daily scheduler uses, scoped to this account.'
                  : 'Bootstrap not yet complete — enqueues a day-walk chunk. allRemaining=true, so the engine chains continuations until the cursor reaches today.'
          }
        >
          {triggerState === 'triggering'
            ? 'Queuing…'
            : triggerState === 'triggered'
              ? 'Queued ✓'
              : triggerState === 'error'
                ? 'Failed'
                : mode === 'sync'
                  ? 'Sync'
                  : 'Backfill'}
        </button>
        {triggerError && (
          <div className="text-xs text-red-600 mt-1">{triggerError}</div>
        )}
      </td>
    </tr>
  );
}
