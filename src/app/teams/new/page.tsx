'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewTeamPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, description: form.description || null }),
    });
    setSaving(false);
    if (res.ok) {
      const team = await res.json();
      router.push(`/teams/${team.id}`);
    } else {
      const d = await res.json();
      setError(JSON.stringify(d.error));
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Teams</button>
        <h1 className="text-xl font-semibold mt-2">New Team</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-5">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Description</label>
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Team'}
          </button>
          <button type="button" onClick={() => router.back()} className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
