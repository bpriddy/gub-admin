'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  accounts: { id: string; name: string }[];
  account?: {
    id: string;
    name: string;
    parentId: string | null;
  };
};

export default function AccountForm({ accounts, account }: Props) {
  const router = useRouter();
  const isEdit = !!account;

  const [form, setForm] = useState({
    name: account?.name ?? '',
    parentId: account?.parentId ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = { name: form.name, parentId: form.parentId || null };

    const res = isEdit
      ? await fetch(`/api/accounts/${account.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    setSaving(false);
    if (res.ok) {
      router.push('/accounts');
      router.refresh();
    } else {
      const data = await res.json();
      setError(JSON.stringify(data.error));
    }
  }

  const otherAccounts = accounts.filter((a) => a.id !== account?.id);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-5">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Account Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Parent Account</label>
        <select
          value={form.parentId}
          onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        >
          <option value="">— none —</option>
          {otherAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

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
