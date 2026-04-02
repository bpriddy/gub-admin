'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';

interface Office {
  id: string;
  name: string;
  oktaCity: string | null;
  isActive: boolean;
  startedAt: string | null;
}

interface ChangeEntry {
  id: string;
  property: string;
  valueText: string | null;
  valueDate: string | null;
  changedAt: string;
  changedByStaff: { fullName: string } | null;
}

const PROP_LABELS: Record<string, string> = {
  name: 'Name',
  okta_city: 'Okta city',
  is_active: 'Active',
  started_at: 'Date started',
};

function formatValue(property: string, valueText: string | null, valueDate: string | null): string {
  if (property === 'started_at') return valueDate ? valueDate.split('T')[0] : '—';
  if (property === 'is_active') return valueText === 'true' ? 'Yes' : 'No';
  return valueText ?? '—';
}

export default function OfficeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [office, setOffice] = useState<Office | null>(null);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editState, setEditState] = useState({ name: '', oktaCity: '', isActive: true, startedAt: '' });
  const [saving, setSaving] = useState(false);

  async function loadOffice() {
    // Fetch from the offices list and find this one
    const res = await fetch('/api/offices');
    const all: Office[] = await res.json();
    const found = all.find((o) => o.id === id) ?? null;
    setOffice(found);
    if (found) {
      setEditState({
        name: found.name,
        oktaCity: found.oktaCity ?? '',
        isActive: found.isActive,
        startedAt: found.startedAt ? found.startedAt.split('T')[0] : '',
      });
    }
  }

  async function loadHistory() {
    const res = await fetch(`/api/offices/${id}/history`);
    setChanges(await res.json());
  }

  useEffect(() => { void loadOffice(); void loadHistory(); }, [id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/offices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editState.name,
        oktaCity: editState.oktaCity || null,
        isActive: editState.isActive,
        startedAt: editState.startedAt || null,
      }),
    });
    setSaving(false);
    setEditMode(false);
    void loadOffice();
    void loadHistory();
  }

  if (!office) return <div className="text-sm text-gray-500">Loading…</div>;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <button onClick={() => router.push('/offices')} className="text-sm text-gray-500 hover:text-gray-700">← Offices</button>

        {editMode ? (
          <div className="mt-3 space-y-3">
            <input
              value={editState.name}
              onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
              className="w-full text-xl font-semibold border-b border-gray-300 focus:outline-none pb-1"
            />
            <div>
              <label className="block text-xs text-gray-500 mb-1">Okta city</label>
              <input
                value={editState.oktaCity}
                onChange={(e) => setEditState((s) => ({ ...s, oktaCity: e.target.value }))}
                placeholder="e.g. New York"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1 font-mono"
                title="Must match the profile.city value in Okta exactly"
              />
            </div>
            <div className="flex gap-4 items-center">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date Started</label>
                <input
                  type="date"
                  value={editState.startedAt}
                  onChange={(e) => setEditState((s) => ({ ...s, startedAt: e.target.value }))}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-4">
                <input
                  type="checkbox"
                  checked={editState.isActive}
                  onChange={(e) => setEditState((s) => ({ ...s, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditMode(false)} className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{office.name}</h1>
                {office.isActive
                  ? <span className="text-xs text-green-600">active</span>
                  : <span className="text-xs text-gray-400">inactive</span>}
              </div>
              {office.startedAt && (
                <p className="text-xs text-gray-400 mt-1">Started {office.startedAt.split('T')[0]}</p>
              )}
              {office.oktaCity
                ? <p className="text-xs mt-1">Okta city: <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{office.oktaCity}</span></p>
                : <p className="text-xs text-gray-300 mt-1">No Okta city mapped</p>
              }
            </div>
            <button onClick={() => setEditMode(true)} className="text-sm text-gray-600 hover:underline">Edit</button>
          </div>
        )}
      </div>

      {/* Change history */}
      <div>
        <h2 className="font-medium text-sm text-gray-700 mb-3">Change history ({changes.length})</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No changes recorded yet. Edits made from this page will appear here.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Property</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">New value</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Changed</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {changes.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{PROP_LABELS[c.property] ?? c.property}</td>
                    <td className="px-4 py-3 font-medium">{formatValue(c.property, c.valueText, c.valueDate)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(c.changedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{c.changedByStaff?.fullName ?? <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
