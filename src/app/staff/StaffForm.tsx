'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  staff?: {
    id: string;
    fullName: string;
    email: string;
    title: string | null;
    department: string | null;
    status: string;
    startedAt: Date;
    endedAt: Date | null;
    userId: string | null;
  };
};

export default function StaffForm({ staff }: Props) {
  const router = useRouter();
  const isEdit = !!staff;

  const [form, setForm] = useState({
    fullName: staff?.fullName ?? '',
    email: staff?.email ?? '',
    title: staff?.title ?? '',
    department: staff?.department ?? '',
    status: staff?.status ?? 'active',
    startedAt: staff?.startedAt ? staff.startedAt.toISOString().split('T')[0] : '',
    endedAt: staff?.endedAt ? staff.endedAt.toISOString().split('T')[0] : '',
    userId: staff?.userId ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      title: form.title || null,
      department: form.department || null,
      endedAt: form.endedAt || null,
      userId: form.userId || null,
    };

    const res = isEdit
      ? await fetch(`/api/staff/${staff.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    setSaving(false);
    if (res.ok) {
      router.push('/staff');
      router.refresh();
    } else {
      const data = await res.json();
      setError(JSON.stringify(data.error));
    }
  }

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-5">
      {field('Full Name *', 'fullName')}
      {field('Email *', 'email', 'email')}
      {field('Title', 'title')}
      {field('Department', 'department')}

      <div>
        <label className="block text-xs text-gray-500 mb-1">Status</label>
        <select
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        >
          <option value="active">active</option>
          <option value="former">former</option>
        </select>
      </div>

      {field('Started At *', 'startedAt', 'date')}
      {field('Ended At', 'endedAt', 'date')}
      {field('User ID (optional UUID)', 'userId')}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
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
