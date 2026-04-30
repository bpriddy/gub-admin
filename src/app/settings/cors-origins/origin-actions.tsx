'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  origin: string;
  isActive: boolean;
}

export function OriginActions({ id, origin, isActive }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<'toggle' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setBusy('toggle');
    setError(null);
    try {
      const res = await fetch(`/api/settings/cors-origins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
        setBusy(null);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  async function deleteOrigin() {
    if (
      !confirm(
        `Permanently delete '${origin}' from the allow-list?\n\nThis is logged in the audit log but the row itself is removed. Use "Deactivate" instead if you might want to restore it.`,
      )
    ) {
      return;
    }
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/settings/cors-origins/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
        setBusy(null);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        onClick={toggleActive}
        disabled={busy !== null}
        className={`text-xs px-2 py-1 rounded border ${
          isActive
            ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
            : 'border-green-300 text-green-700 hover:bg-green-50'
        } disabled:opacity-50`}
      >
        {busy === 'toggle' ? '…' : isActive ? 'Deactivate' : 'Activate'}
      </button>
      <button
        onClick={deleteOrigin}
        disabled={busy !== null}
        className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy === 'delete' ? '…' : 'Delete'}
      </button>
      {error && (
        <span className="text-xs text-red-600 ml-2" title={error}>
          ⚠
        </span>
      )}
    </div>
  );
}
