'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Authorization for this app is enforced at Cloud IAP — see README's
// "Authorization" section. The `isAdmin` and `role` columns on the User
// model are retained in the DB for future use but are no longer editable
// from this form. The list view at /users still renders them as read-only
// badges.
type Props = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    isActive: boolean;
  };
};

export default function UserEditForm({ user }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    isActive: user.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
        {message && <span className="text-xs text-gray-500">{message}</span>}
      </div>
    </div>
  );
}
