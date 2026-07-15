'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One row of the restricted-file worklist. Ignore stops the scan from
 * re-probing the file (status='ignored'); fixing sharing in Drive instead
 * resolves the row automatically on the next scan.
 */
export function RestrictedFileRow({
  id,
  fileId,
  name,
  path,
  accountName,
  campaignName,
  firstSeen,
  lastProbed,
}: {
  id: string;
  fileId: string;
  name: string;
  path: string | null;
  accountName: string;
  campaignName: string | null;
  firstSeen: string;
  lastProbed: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ignore() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/data-sources/google_drive/restricted-files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ignore' }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof err?.error === 'string' ? err.error : `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setBusy(false);
    }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <a
          href={`https://drive.google.com/open?id=${fileId}`}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          {name}
        </a>
        {path && <div className="text-xs text-gray-400 truncate max-w-md">{path}</div>}
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{accountName}</td>
      <td className="px-4 py-3 text-gray-600 max-w-[16rem] truncate">{campaignName ?? '—'}</td>
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{firstSeen}</td>
      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{lastProbed}</td>
      <td className="px-4 py-3 text-right">
        {error && <span className="text-xs text-red-600 mr-2">{error}</span>}
        <button
          onClick={ignore}
          disabled={busy}
          className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          {busy ? 'Ignoring…' : 'Ignore'}
        </button>
      </td>
    </tr>
  );
}
