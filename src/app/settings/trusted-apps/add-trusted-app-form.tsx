'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const EMPTY_FORM = { name: '', origins: '', googleClientIds: '' };

export function AddTrustedAppForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    setError(null);

    const origins = form.origins
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const googleClientIds = form.googleClientIds
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/settings/trusted-apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          origins,
          googleClientIds,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          reason?: unknown;
          existing?: { id: string; name: string };
          conflict?: { kind: string; value: string };
        };
        if (body.error === 'INVALID_TRUSTED_APP' && typeof body.reason === 'string') {
          setError(body.reason);
        } else if (body.error === 'IDENTIFIER_ALREADY_REGISTERED' && body.existing && body.conflict) {
          setError(
            `'${body.conflict.value}' is already registered on the trusted app "${body.existing.name}". ` +
              'Edit that app to extend it, or use a different identifier.',
          );
        } else {
          setError(
            `HTTP ${res.status} — ${
              typeof body.reason === 'string' ? body.reason : 'check console'
            }`,
          );
        }
        setState('error');
        return;
      }

      setForm(EMPTY_FORM);
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
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="e.g. work-flows Replit fork — Alice"
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          required
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          disabled={state === 'saving'}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Origins <span className="text-gray-400">(one per line)</span>
          </label>
          <textarea
            value={form.origins}
            onChange={(e) => setForm((s) => ({ ...s, origins: e.target.value }))}
            rows={4}
            placeholder="https://app.example.com"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 font-mono"
            disabled={state === 'saving'}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Google client_ids <span className="text-gray-400">(one per line)</span>
          </label>
          <textarea
            value={form.googleClientIds}
            onChange={(e) => setForm((s) => ({ ...s, googleClientIds: e.target.value }))}
            rows={4}
            placeholder="12345-abc.apps.googleusercontent.com"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 font-mono"
            disabled={state === 'saving'}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Provide the values as the implementer registered them — origins as
        <code className="font-mono mx-1">protocol://host[:port]</code>, Google
        client_ids as the
        <code className="font-mono mx-1">…apps.googleusercontent.com</code>{' '}
        string from the OAuth client console. At least one origin or one
        client_id is required.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!form.name.trim() || state === 'saving'}
          className={`text-sm px-4 py-1.5 rounded text-white ${
            !form.name.trim() || state === 'saving'
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-gray-900 hover:bg-gray-700'
          }`}
        >
          {state === 'saving' ? 'Registering…' : 'Register trusted app'}
        </button>
        {state === 'error' && error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
