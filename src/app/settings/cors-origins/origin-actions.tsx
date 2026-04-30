'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  origin: string;
  label: string | null;
  isActive: boolean;
}

type Busy = 'toggle' | 'delete' | 'save' | null;

export function OriginActions({ id, origin, label, isActive }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label ?? '');

  async function patch(body: object) {
    const res = await fetch(`/api/settings/cors-origins/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: unknown };
      throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
    }
  }

  async function toggleActive() {
    setBusy('toggle');
    setError(null);
    try {
      await patch({ isActive: !isActive });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  async function saveLabel() {
    const trimmed = editLabel.trim();
    setBusy('save');
    setError(null);
    try {
      // Send null when cleared so the column reflects "no label" rather
      // than an empty string.
      await patch({ label: trimmed.length > 0 ? trimmed : null });
      setEditing(false);
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
        throw new Error(
          typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 justify-end min-w-[260px]">
        <input
          type="text"
          value={editLabel}
          onChange={(e) => setEditLabel(e.target.value)}
          maxLength={200}
          disabled={busy !== null}
          placeholder="Label"
          className="text-xs border border-gray-300 rounded px-2 py-1 flex-1 min-w-0"
        />
        <button
          onClick={saveLabel}
          disabled={busy !== null}
          className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {busy === 'save' ? '…' : 'Save'}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setEditLabel(label ?? '');
            setError(null);
          }}
          disabled={busy !== null}
          className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        {error && (
          <span className="text-xs text-red-600 ml-1" title={error}>
            ⚠
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        onClick={() => {
          setEditing(true);
          setError(null);
        }}
        disabled={busy !== null}
        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Edit label
      </button>
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
