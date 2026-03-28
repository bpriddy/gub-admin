'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  users: { id: string; email: string; displayName: string | null }[];
  accounts: { id: string; name: string }[];
  staff: { id: string; fullName: string }[];
};

export default function BatchGrantForm({ users, accounts, staff }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    userId: '',
    accountId: '',
    campaignIds: 'all' as 'all' | string[],
    role: 'viewer' as const,
    grantedBy: '',
    expiresAt: '',
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ granted: number } | null>(null);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setResult(null);

    const res = await fetch('/api/grants/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        expiresAt: form.expiresAt || null,
      }),
    });

    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      setResult(data);
    } else {
      const data = await res.json();
      setError(JSON.stringify(data.error));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-5">
      <div>
        <label className="block text-xs text-gray-500 mb-1">User *</label>
        <select
          value={form.userId}
          onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        >
          <option value="">— select user —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName ? `${u.displayName} (${u.email})` : u.email}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Account *</label>
        <select
          value={form.accountId}
          onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        >
          <option value="">— select account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Campaigns</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={form.campaignIds === 'all'}
              onChange={() => setForm((f) => ({ ...f, campaignIds: 'all' }))}
            />
            All campaigns in account
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={form.campaignIds !== 'all'}
              onChange={() => setForm((f) => ({ ...f, campaignIds: [] }))}
            />
            Account only (no campaigns)
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Role</label>
        <select
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof form.role }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        >
          {['viewer', 'contributor', 'manager', 'admin'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Granted By (staff) *</label>
        <select
          value={form.grantedBy}
          onChange={(e) => setForm((f) => ({ ...f, grantedBy: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        >
          <option value="">— select staff member —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Expires At (optional)</label>
        <input
          type="datetime-local"
          value={form.expiresAt}
          onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
          Granted {result.granted} access record{result.granted !== 1 ? 's' : ''}.{' '}
          <button type="button" onClick={() => router.push('/grants')} className="underline">
            View grants
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Granting…' : 'Grant Access'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
