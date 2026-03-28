'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: string;
    isAdmin: boolean;
    isActive: boolean;
  };
};

export default function UserEditForm({ user }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    role: user.role,
    isAdmin: user.isAdmin,
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            {['viewer', 'contributor', 'manager', 'admin'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 pt-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isAdmin}
              onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
            />
            Is Admin (superuser)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Is Active
          </label>
        </div>
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
