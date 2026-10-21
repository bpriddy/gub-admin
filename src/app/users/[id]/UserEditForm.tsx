'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Authorization for this app is enforced at Cloud IAP — see README's
// "Authorization" section. `role` is not editable from this form, and
// `isAdmin` can only be turned OFF (demote); promotion is not an action of
// this app. The list view at /users still renders both as read-only badges.
type Props = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    isActive: boolean;
    isAdmin: boolean;
  };
};

export default function UserEditForm({ user }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    isActive: user.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function handleDemote() {
    if (!window.confirm(`Remove platform admin from ${user.email}?`)) return;
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/users?id=${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: false }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage('Demoted');
      router.refresh();
    } else {
      setMessage('Error demoting');
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/users?id=${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setMessage('Saved');
      router.refresh();
    } else {
      setMessage('Error saving');
    }
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg space-y-4">
      <div className="text-xs font-medium text-gray-500 uppercase">Edit User</div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          />
          Is Active
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {user.isAdmin && (
          <button
            onClick={handleDemote}
            disabled={saving}
            className="text-sm px-3 py-1.5 border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
          >
            Demote from admin
          </button>
        )}
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    </div>
  );
}
