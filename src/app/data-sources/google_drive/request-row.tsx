'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RequestRowProps {
  id: string;
  status: string;
  mode: string;
  accountName: string;
  ago: string;
  filesProcessed: number;
  requestedBy: string;
  summary: string;
  hasError: boolean;
}

const STATUS_BADGES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  running: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

/**
 * One row in the "Recent backfill requests" table. Client component so
 * it can host the Cancel ✕ button on pending rows. Cancelling marks the
 * row failed (preserves it in history) and clears the per-account live-
 * request guard so a fresh Backfill can be queued.
 *
 * Only pending rows are cancellable. Running rows are not touched (the
 * Cloud Run Job execution is actively working; cancelling at the DB
 * layer would orphan it). Completed/failed rows are already terminal.
 */
export function RequestRow({
  id,
  status,
  mode,
  accountName,
  ago,
  filesProcessed,
  requestedBy,
  summary,
  hasError,
}: RequestRowProps) {
  const router = useRouter();
  const [cancelState, setCancelState] = useState<'idle' | 'cancelling' | 'error'>('idle');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Summary is CSS-truncated at column width (see <colgroup> in page.tsx);
  // full text shows on hover via the title attr. No JS slice needed —
  // doing it here would lie about hover content.

  async function handleCancel() {
    const isRunning = status === 'running';
    const promptText = isRunning
      ? `This backfill for "${accountName}" is currently RUNNING — a Cloud Run Job ` +
        `may be processing it right now. Force-cancel and mark it failed? ` +
        `(The Job execution itself isn't stopped — but the row's status changes ` +
        `so a new backfill click can be queued.)`
      : `Cancel this pending backfill for "${accountName}"?`;
    if (!confirm(promptText)) return;
    setCancelState('cancelling');
    setCancelError(null);
    try {
      const res = await fetch(`/api/data-sources/google_drive/backfill/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setCancelState('error');
      setCancelError(err instanceof Error ? err.message : 'Cancel failed');
      setTimeout(() => {
        setCancelState('idle');
        setCancelError(null);
      }, 5000);
    }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{ago}</td>
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{accountName}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            STATUS_BADGES[status] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {status}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        <span className="font-mono">{mode}</span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
        {filesProcessed.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{requestedBy}</td>
      <td
        className={`px-4 py-3 text-xs font-mono truncate ${
          hasError ? 'text-red-700' : 'text-gray-500'
        }`}
        title={summary || ''}
      >
        {summary || '—'}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {status === 'pending' || status === 'running' ? (
          <button
            onClick={handleCancel}
            disabled={cancelState === 'cancelling'}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              cancelState === 'error'
                ? 'bg-red-100 text-red-700'
                : cancelState === 'cancelling'
                  ? 'bg-amber-100 text-amber-700 cursor-wait'
                  : status === 'running'
                    ? 'text-amber-500 hover:bg-red-50 hover:text-red-700'
                    : 'text-gray-400 hover:bg-red-50 hover:text-red-700'
            }`}
            title={
              cancelError ??
              (status === 'running'
                ? 'Force-cancel this running request. Marks it failed so a new backfill can be queued; the Cloud Run Job execution itself is not killed (it just becomes orphaned if it was still working).'
                : 'Cancel this pending request (marks it failed; preserves audit row).')
            }
          >
            {cancelState === 'cancelling' ? '…' : cancelState === 'error' ? '✕ fail' : '✕'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
