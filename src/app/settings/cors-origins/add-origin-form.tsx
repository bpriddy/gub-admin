'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddOriginForm() {
  const router = useRouter();
  const [origin, setOrigin] = useState('');
  const [label, setLabel] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    setError(null);

    try {
      const res = await fetch('/api/settings/cors-origins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: origin.trim(),
          label: label.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          reason?: unknown;
          existing?: { id: string; isActive: boolean };
        };

        // Specific message for ORIGIN_ALREADY_EXISTS — guides operator to
        // either reactivate the existing inactive row or pick a different
        // origin, rather than silently no-op'ing.
        if (body.error === 'ORIGIN_ALREADY_EXISTS' && body.existing) {
          const status = body.existing.isActive ? 'already active' : 'already exists but is inactive — toggle it back on instead of re-adding';
          setError(`This origin is ${status}.`);
        } else if (body.error === 'INVALID_ORIGIN' && typeof body.reason === 'string') {
          setError(body.reason);
        } else {
          setError(`HTTP ${res.status} — ${typeof body.reason === 'string' ? body.reason : 'check console'}`);
        }
        setState('error');
        return;
      }

      setOrigin('');
      setLabel('');
      setState('idle');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Origin <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="https://app.example.com"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            required
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 font-mono"
            disabled={state === 'saving'}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Label <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. work-flows Replit fork — Alice"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            disabled={state === 'saving'}
            maxLength={200}
          />
        </div>
        <button
          type="submit"
          disabled={!origin.trim() || state === 'saving'}
          className={`text-sm px-4 py-1.5 rounded text-white ${
            !origin.trim() || state === 'saving'
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-gray-900 hover:bg-gray-700'
          }`}
        >
          {state === 'saving' ? 'Adding…' : 'Add origin'}
        </button>
      </div>
      {state === 'error' && error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
    </form>
  );
}
