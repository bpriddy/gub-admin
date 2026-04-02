'use client';

import { useEffect, useState } from 'react';

interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  isActive: boolean;
  createdAt: string;
  _count?: { authCodes: number };
}

interface NewClientResult extends OAuthClient {
  clientSecret: string;
}

const EMPTY_FORM = { name: '', redirectUris: '' };

export default function OAuthClientsPage() {
  const [clients, setClients]   = useState<OAuthClient[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  // Shown once after creation — secret is never retrievable again
  const [newSecret, setNewSecret] = useState<NewClientResult | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/oauth-clients');
    setClients(await res.json());
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const redirectUris = form.redirectUris
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    const res = await fetch('/api/oauth-clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, redirectUris }),
    });

    setSaving(false);

    if (!res.ok) {
      const d = await res.json();
      setError(typeof d.error === 'string' ? d.error : 'Failed to create client');
      return;
    }

    const created = await res.json() as NewClientResult;
    setNewSecret(created);
    setForm(EMPTY_FORM);
    setShowForm(false);
    void load();
  }

  async function toggleActive(client: OAuthClient) {
    await fetch(`/api/oauth-clients/${client.clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !client.isActive }),
    });
    void load();
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">OAuth Clients</h1>
          <p className="text-sm text-gray-500 mt-1">
            Registered clients for the GUB OAuth broker (headless server-side flow).
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); setNewSecret(null); }}
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700"
        >
          + Register client
        </button>
      </div>

      {/* One-time secret banner */}
      {newSecret && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-yellow-800">
            Client registered — copy your secret now. It will not be shown again.
          </p>
          <div className="space-y-1 text-xs font-mono bg-white border border-yellow-200 rounded p-3">
            <div><span className="text-gray-500">client_id:</span> {newSecret.clientId}</div>
            <div><span className="text-gray-500">client_secret:</span> {newSecret.clientSecret}</div>
          </div>
          <button
            onClick={() => setNewSecret(null)}
            className="text-xs text-yellow-700 underline"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">New OAuth client</h2>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Agentspace MCP"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Redirect URIs <span className="text-gray-400">(one per line)</span>
            </label>
            <textarea
              required
              value={form.redirectUris}
              onChange={(e) => setForm((s) => ({ ...s, redirectUris: e.target.value }))}
              rows={3}
              placeholder="https://your-agent.example.com/oauth/callback"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 font-mono"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Client table */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-gray-400">No OAuth clients registered yet.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Client ID</th>
                <th className="px-4 py-2 text-left">Redirect URIs</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map((client) => (
                <tr key={client.id} className={`bg-white ${!client.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{client.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{client.clientId}</td>
                  <td className="px-4 py-3">
                    <ul className="space-y-0.5">
                      {client.redirectUris.map((uri) => (
                        <li key={uri} className="text-xs font-mono text-gray-500 truncate max-w-xs">{uri}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      client.isActive
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {client.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(client)}
                      className={`text-xs ${
                        client.isActive
                          ? 'text-red-400 hover:text-red-600'
                          : 'text-green-500 hover:text-green-700'
                      }`}
                    >
                      {client.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Discovery doc hint */}
      <div className="text-xs text-gray-400 border-t pt-4">
        <p>
          Discovery document:{' '}
          <code className="font-mono bg-gray-100 px-1 rounded">
            {process.env['NEXT_PUBLIC_GUB_URL'] ?? 'http://localhost:3000'}/.well-known/oauth-authorization-server
          </code>
        </p>
      </div>
    </div>
  );
}
