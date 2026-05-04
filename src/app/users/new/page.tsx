'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewUserPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch('/api/users/stub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        displayName: displayName.trim() || undefined,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setError(typeof data.error === 'string' ? data.error : 'Failed to create user');
      return;
    }

    router.push('/users');
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Add user</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Pre-create a user by email. They can log in with Google OAuth at any time —
          their account will be matched by email and activated on first login.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Per-app access is the consuming app&rsquo;s responsibility, not GUB&rsquo;s.
          Use access grants here for org-data scoping (accounts, campaigns, staff,
          teams, offices); the consuming app handles its own role/permission logic.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Email <span className="text-red-400">*</span></label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Display name <span className="text-gray-300">(optional)</span></label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving} className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded disabled:opacity-50">
            {saving ? 'Creating…' : 'Create user'}
          </button>
          <button type="button" onClick={() => router.back()} className="text-sm text-gray-500 px-3 py-1.5">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
