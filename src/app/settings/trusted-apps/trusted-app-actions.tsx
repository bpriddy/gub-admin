'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  name: string;
  origins: string[];
  googleClientIds: string[];
  isActive: boolean;
}

type Busy = 'toggle' | 'delete' | 'save' | null;

export function TrustedAppActions({
  id,
  name,
  origins,
  googleClientIds,
  isActive,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editOrigins, setEditOrigins] = useState(origins.join('\n'));
  const [editClientIds, setEditClientIds] = useState(googleClientIds.join('\n'));

  async function patch(body: object) {
    const res = await fetch(`/api/settings/trusted-apps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        reason?: unknown;
      };
      if (data.error === 'INVALID_TRUSTED_APP' && typeof data.reason === 'string') {
        throw new Error(data.reason);
      }
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

  async function saveEdits() {
    const newOrigins = editOrigins
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const newClientIds = editClientIds
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setBusy('save');
    setError(null);
    try {
      await patch({
        name: editName.trim(),
        origins: newOrigins,
        googleClientIds: newClientIds,
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(null);
    }
  }

  async function hardDelete() {
    if (
      !confirm(
        `Permanently delete trusted app '${name}'?\n\nThis is logged in the audit log but the row itself is removed. Use "Deactivate" instead if you might want to restore it.`,
      )
    ) {
      return;
    }
    setBusy('delete');
    setError(null);
    try {
      const res = await fetch(`/api/settings/trusted-apps/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof data.error === 'string' ? data.error : `HTTP ${res.status}`);
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
      <div className="space-y-2 min-w-[260px]">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          disabled={busy !== null}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
          placeholder="Name"
        />
        <textarea
          value={editOrigins}
          onChange={(e) => setEditOrigins(e.target.value)}
          rows={3}
          disabled={busy !== null}
          className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1"
          placeholder="Origins, one per line"
        />
        <textarea
          value={editClientIds}
          onChange={(e) => setEditClientIds(e.target.value)}
          rows={3}
          disabled={busy !== null}
          className="w-full text-xs font-mono border border-gray-300 rounded px-2 py-1"
          placeholder="Google client_ids, one per line"
        />
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={saveEdits}
            disabled={busy !== null || !editName.trim()}
            className="text-xs px-2 py-1 rounded bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setEditName(name);
              setEditOrigins(origins.join('\n'));
              setEditClientIds(googleClientIds.join('\n'));
              setError(null);
            }}
            disabled={busy !== null}
            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      <button
        onClick={() => {
          setEditing(true);
          setError(null);
        }}
        disabled={busy !== null}
        className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Edit
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
        onClick={hardDelete}
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
