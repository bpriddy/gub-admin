'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RequestRowProps {
  id: string;
  status: string;
  accountName: string;
  ago: string;
  scansDone: number;
  scans: number;
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
  accountName,
  ago,
  scansDone,
  scans,
  requestedBy,
  summary,
  hasError,
}: RequestRowProps) {
  const router = useRouter();
  const [cancelState, setCancelState] = useState<'idle' | 'cancelling' | 'error'>('idle');
  const [cancelError, setCancelError] = useState<string | null>(null);

  const truncated = summary.length > 80 ? summary.slice(0, 80) + '…' : summary;

  async function handleCancel() {
    if (!confirm(`Cancel this pending backfill for "${accountName}"?`)) return;
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
      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
        {scansDone}/{scans}
      </td>
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{requestedBy}</td>
      <td
        className={`px-4 py-3 text-xs font-mono whitespace-nowrap ${
          hasError ? 'text-red-700' : 'text-gray-500'
        }`}
        title={summary || ''}
      >
        {truncated || '—'}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {status === 'pending' ? (
          <button
            onClick={handleCancel}
            disabled={cancelState === 'cancelling'}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              cancelState === 'error'
                ? 'bg-red-100 text-red-700'
                : cancelState === 'cancelling'
                  ? 'bg-amber-100 text-amber-700 cursor-wait'
                  : 'text-gray-400 hover:bg-red-50 hover:text-red-700'
            }`}
            title={
              cancelError ??
              'Cancel this pending request (marks it failed; preserves audit row).'
            }
          >
            {cancelState === 'cancelling' ? '…' : cancelState === 'error' ? '✕ fail' : '✕'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}
