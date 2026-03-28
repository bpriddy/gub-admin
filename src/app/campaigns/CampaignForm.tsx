'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  accounts: { id: string; name: string }[];
  staff: { id: string; fullName: string }[];
  defaultAccountId?: string;
  campaign?: {
    id: string;
    name: string;
    accountId: string;
    status: string;
    budget: { toString(): string } | null;
    assetsUrl: string | null;
    awardedAt: Date | null;
    liveAt: Date | null;
    endsAt: Date | null;
  };
};

const STATUSES = ['pitch', 'awarded', 'live', 'paused', 'ended', 'lost'];

export default function CampaignForm({ accounts, staff, defaultAccountId, campaign }: Props) {
  const router = useRouter();
  const isEdit = !!campaign;

  const [form, setForm] = useState({
    accountId: campaign?.accountId ?? defaultAccountId ?? '',
    name: campaign?.name ?? '',
    status: campaign?.status ?? 'pitch',
    budget: campaign?.budget?.toString() ?? '',
    assetsUrl: campaign?.assetsUrl ?? '',
    awardedAt: campaign?.awardedAt ? campaign.awardedAt.toISOString().split('T')[0] : '',
    liveAt: campaign?.liveAt ? campaign.liveAt.toISOString().split('T')[0] : '',
    endsAt: campaign?.endsAt ? campaign.endsAt.toISOString().split('T')[0] : '',
    createdBy: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      ...form,
      budget: form.budget || null,
      assetsUrl: form.assetsUrl || null,
      awardedAt: form.awardedAt || null,
      liveAt: form.liveAt || null,
      endsAt: form.endsAt || null,
    };

    const res = isEdit
      ? await fetch(`/api/campaigns/${campaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    setSaving(false);
    if (res.ok) {
      router.push('/campaigns');
      router.refresh();
    } else {
      const data = await res.json();
      setError(JSON.stringify(data.error));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-5">
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
        <label className="block text-xs text-gray-500 mb-1">Campaign Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Status</label>
        <select
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Budget</label>
        <input
          type="text"
          placeholder="e.g. 150000.00"
          value={form.budget}
          onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Assets URL</label>
        <input
          type="url"
          value={form.assetsUrl}
          onChange={(e) => setForm((f) => ({ ...f, assetsUrl: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['Awarded', 'awardedAt'], ['Live', 'liveAt'], ['Ends', 'endsAt']] .map(([label, key]) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            <input
              type="date"
              value={form[key as keyof typeof form]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
        ))}
      </div>

      {!isEdit && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Created By (staff ID) *</label>
          <select
            value={form.createdBy}
            onChange={(e) => setForm((f) => ({ ...f, createdBy: e.target.value }))}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            required
          >
            <option value="">— select staff member —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.fullName}</option>
            ))}
          </select>
        </div>
      )}

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
