'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface NewClientResult {
  id: string;
  clientId: string;
  clientSecret: string;
  name: string;
  redirectUris: string[];
}

const EMPTY_FORM = { name: '', redirectUris: '' };

export function AddClientForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<NewClientResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    setError(null);

    const redirectUris = form.redirectUris
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/settings/oauth-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          redirectUris,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          reason?: unknown;
        };
        if (
          (body.error === 'INVALID_NAME' || body.error === 'INVALID_REDIRECT_URIS') &&
          typeof body.reason === 'string'
        ) {
          setError(body.reason);
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

      const result = (await res.json()) as NewClientResult;
      setCreated(result);
      setForm(EMPTY_FORM);
      setState('idle');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  }

  return (
    <div className="space-y-3">
      {created && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            Client registered — copy your client_secret now. It will not be shown again.
          </p>
          <div className="space-y-1 text-xs font-mono bg-white border border-amber-200 rounded p-3">
            <div>
              <span className="text-gray-500">client_id:</span> {created.clientId}
            </div>
            <div className="break-all">
              <span className="text-gray-500">client_secret:</span> {created.clientSecret}
            </div>
          </div>
          <button
            onClick={() => setCreated(null)}
            className="text-xs text-amber-800 underline hover:text-amber-900"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

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
            placeholder="e.g. work-flows agent — staging"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            required
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            disabled={state === 'saving'}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Redirect URIs <span className="text-red-500">*</span>{' '}
            <span className="text-gray-400">(one per line)</span>
          </label>
          <textarea
            value={form.redirectUris}
            onChange={(e) => setForm((s) => ({ ...s, redirectUris: e.target.value }))}
            rows={3}
            required
            placeholder="https://your-agent.example.com/oauth/callback"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 font-mono"
            disabled={state === 'saving'}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!form.name.trim() || !form.redirectUris.trim() || state === 'saving'}
            className={`text-sm px-4 py-1.5 rounded text-white ${
              !form.name.trim() || !form.redirectUris.trim() || state === 'saving'
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gray-900 hover:bg-gray-700'
            }`}
          >
            {state === 'saving' ? 'Registering…' : 'Register client'}
          </button>
          {state === 'error' && error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
