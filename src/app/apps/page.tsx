'use client';

import { useEffect, useState } from 'react';

interface AppRow {
  id: string;
  appId: string;
  name: string;
  description: string | null;
  autoAccess: boolean;
  dbIdentifier: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { permissions: number; accessRequests: number };
}

const EMPTY_FORM = { appId: '', name: '', description: '', autoAccess: false, dbIdentifier: '' };

export default function AppsPage() {
  const [apps, setApps]           = useState<AppRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<AppRow>>({});

  async function load() {
    const res = await fetch('/api/apps');
    setApps(await res.json());
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        dbIdentifier: form.dbIdentifier.trim() || null,
        description:  form.description.trim()  || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(typeof data.error === 'string' ? data.error : 'Failed to create app');
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    void load();
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await fetch(`/api/apps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editState,
        dbIdentifier: editState.dbIdentifier?.trim() || null,
      }),
    });
    setSaving(false);
    setEditingId(null);
    void load();
  }

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Apps</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Register client applications. <code className="text-xs bg-gray-100 px-1 rounded">autoAccess</code> lets any
            authenticated user in automatically. Gated apps hold users at a request-access screen.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-700"
        >
          + New App
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
          <h2 className="text-sm font-medium">Register new app</h2>
          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">App ID <span className="text-gray-300">(slug, immutable)</span></label>
              <input
                required
                value={form.appId}
                onChange={(e) => setForm((s) => ({ ...s, appId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                placeholder="e.g. budgeting-tool"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Display name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Budgeting Tool"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Description <span className="text-gray-300">(optional)</span></label>
            <input
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              DB identifier <span className="text-gray-300">(optional — isolated-tenant apps only)</span>
            </label>
            <input
              value={form.dbIdentifier}
              onChange={(e) => setForm((s) => ({ ...s, dbIdentifier: e.target.value }))}
              placeholder="Leave blank for standard apps"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 font-mono"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoAccess}
              onChange={(e) => setForm((s) => ({ ...s, autoAccess: e.target.checked }))}
            />
            <span>Auto-access <span className="text-gray-400 text-xs">— any authenticated user gets in on first login</span></span>
          </label>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded disabled:opacity-50">
              {saving ? 'Saving…' : 'Create app'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* App list */}
      <div className="space-y-3">
        {apps.length === 0 && <p className="text-sm text-gray-400">No apps registered yet.</p>}
        {apps.map((app) => (
          <div key={app.id} className="border border-gray-200 rounded-lg bg-white p-4">
            {editingId === app.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Display name</label>
                    <input
                      value={editState.name ?? ''}
                      onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Description</label>
                    <input
                      value={editState.description ?? ''}
                      onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">DB identifier</label>
                  <input
                    value={editState.dbIdentifier ?? ''}
                    onChange={(e) => setEditState((s) => ({ ...s, dbIdentifier: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1 font-mono"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editState.autoAccess ?? false}
                      onChange={(e) => setEditState((s) => ({ ...s, autoAccess: e.target.checked }))}
                    />
                    Auto-access
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editState.isActive ?? true}
                      onChange={(e) => setEditState((s) => ({ ...s, isActive: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(app.id)} disabled={saving} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 px-3 py-1.5">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{app.name}</span>
                    <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{app.appId}</code>
                    {!app.isActive && <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">inactive</span>}
                    {app.autoAccess
                      ? <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">auto-access</span>
                      : <span className="text-xs bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded">gated</span>
                    }
                  </div>
                  {app.description && <p className="text-xs text-gray-500">{app.description}</p>}
                  {app.dbIdentifier && (
                    <p className="text-xs text-gray-400">
                      DB: <code className="font-mono text-indigo-700 bg-indigo-50 px-1 rounded">{app.dbIdentifier}</code>
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {app._count.permissions} user{app._count.permissions !== 1 ? 's' : ''} · {app._count.accessRequests} access request{app._count.accessRequests !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => { setEditingId(app.id); setEditState({ name: app.name, description: app.description ?? '', autoAccess: app.autoAccess, dbIdentifier: app.dbIdentifier ?? '', isActive: app.isActive }); }}
                  className="text-xs text-gray-400 hover:text-gray-700"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
