'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ScopeType = 'staff_all' | 'staff_current' | 'staff_office' | 'staff_team';

type Props = {
  users: { id: string; email: string; displayName: string | null }[];
  staff: { id: string; fullName: string }[];
  offices: { id: string; name: string }[];
  teams: { id: string; name: string }[];
};

const SCOPE_LABELS: Record<ScopeType, string> = {
  staff_all: 'All staff (current and former)',
  staff_current: 'Current staff only (active + on leave)',
  staff_office: 'Staff in a specific office',
  staff_team: 'Staff in a specific team',
};

export default function StaffGrantForm({ users, staff, offices, teams }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    userId: '',
    scopeType: 'staff_current' as ScopeType,
    resourceId: '',
    role: 'viewer' as const,
    grantedBy: '',
    expiresAt: '',
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ granted: number } | null>(null);
  const [error, setError] = useState('');

  const needsResource = form.scopeType === 'staff_office' || form.scopeType === 'staff_team';

  function handleScopeChange(scopeType: ScopeType) {
    setForm((f) => ({ ...f, scopeType, resourceId: '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsResource && !form.resourceId) {
      setError('Please select a resource for this scope type.');
      return;
    }
    setSaving(true);
    setError('');
    setResult(null);

    const res = await fetch('/api/grants/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: form.userId,
        scopeType: form.scopeType,
        resourceId: form.resourceId || undefined,
        role: form.role,
        grantedBy: form.grantedBy,
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
      {/* User */}
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

      {/* Scope type */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Staff scope *</label>
        <div className="space-y-1.5">
          {(Object.entries(SCOPE_LABELS) as [ScopeType, string][]).map(([value, label]) => (
            <label key={value} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="scopeType"
                value={value}
                checked={form.scopeType === value}
                onChange={() => handleScopeChange(value)}
                className="mt-0.5"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Conditional resource picker */}
      {form.scopeType === 'staff_office' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Office *</label>
          {offices.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No offices found — create one first.</p>
          ) : (
            <select
              value={form.resourceId}
              onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              required
            >
              <option value="">— select office —</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {form.scopeType === 'staff_team' && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Team *</label>
          {teams.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No teams found — create one first.</p>
          ) : (
            <select
              value={form.resourceId}
              onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              required
            >
              <option value="">— select team —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Role */}
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

      {/* Granted by */}
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

      {/* Expires at */}
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
          Staff grant created.{' '}
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
          {saving ? 'Granting…' : 'Grant Staff Access'}
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
