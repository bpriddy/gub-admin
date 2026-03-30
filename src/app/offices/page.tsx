'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Office {
  id: string;
  name: string;
  isActive: boolean;
  startedAt: string | null;
  _count: { staff: number };
}

type EditState = { name: string; isActive: boolean; startedAt: string };

export default function OfficesPage() {
  const router = useRouter();
  const [offices, setOffices] = useState<Office[]>([]);
  const [newForm, setNewForm] = useState({ name: '', startedAt: '', isActive: true });
  const [editId, setEditId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', isActive: true, startedAt: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await fetch('/api/offices');
    setOffices(await res.json());
  }

  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/offices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newForm.name,
        isActive: newForm.isActive,
        startedAt: newForm.startedAt || null,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setNewForm({ name: '', startedAt: '', isActive: true });
      void load();
    } else {
      const d = await res.json();
      setError(d.error?.formErrors?.join(', ') ?? 'Error');
    }
  }

  function startEdit(o: Office) {
    setEditId(o.id);
    setEditState({
      name: o.name,
      isActive: o.isActive,
      startedAt: o.startedAt ? o.startedAt.split('T')[0] : '',
    });
  }

  async function handleSave(id: string) {
    setSaving(true);
    await fetch(`/api/offices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editState.name,
        isActive: editState.isActive,
        startedAt: editState.startedAt || null,
      }),
    });
    setSaving(false);
    setEditId(null);
    void load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete office "${name}"? Staff in this office will be unlinked.`)) return;
    await fetch(`/api/offices/${id}`, { method: 'DELETE' });
    void load();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <h1 className="text-xl font-semibold mt-2">Offices</h1>
        <p className="text-sm text-gray-500">Physical locations and regional branches.</p>
      </div>

      {/* Add new */}
      <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-6 space-y-3">
        <p className="text-xs font-medium text-gray-600">New Office</p>
        <div className="flex gap-2">
          <input
            value={newForm.name}
            onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name (e.g. NYC)"
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
            required
          />
          <input
            type="date"
            value={newForm.startedAt}
            onChange={(e) => setNewForm((f) => ({ ...f, startedAt: e.target.value }))}
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
            title="Date started"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={newForm.isActive}
              onChange={(e) => setNewForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
          <button
            type="submit"
            disabled={saving}
            className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Started</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Staff</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {offices.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">No offices yet.</td></tr>
            )}
            {offices.map((o) => (
              <tr key={o.id} className={`hover:bg-gray-50 ${!o.isActive ? 'opacity-60' : ''}`}>
                {editId === o.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        value={editState.name}
                        onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={editState.startedAt}
                        onChange={(e) => setEditState((s) => ({ ...s, startedAt: e.target.value }))}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editState.isActive}
                          onChange={(e) => setEditState((s) => ({ ...s, isActive: e.target.checked }))}
                        />
                        Active
                      </label>
                    </td>
                    <td className="px-4 py-2 text-gray-400">{o._count.staff}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleSave(o.id)} disabled={saving} className="text-xs text-blue-600 hover:underline">Save</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium">{o.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {o.startedAt ? o.startedAt.split('T')[0] : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {o.isActive
                        ? <span className="text-xs text-green-600">active</span>
                        : <span className="text-xs text-gray-400">inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{o._count.staff}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-3 justify-end">
                        <Link href={`/offices/${o.id}`} className="text-xs text-gray-400 hover:underline">History</Link>
                        <button onClick={() => startEdit(o)} className="text-xs text-gray-600 hover:underline">Edit</button>
                        <button onClick={() => handleDelete(o.id, o.name)} className="text-xs text-red-500 hover:underline">Delete</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
