'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Office {
  id: string;
  name: string;
  _count: { staff: number };
}

export default function OfficesPage() {
  const router = useRouter();
  const [offices, setOffices] = useState<Office[]>([]);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
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
      body: JSON.stringify({ name: newName }),
    });
    setSaving(false);
    if (res.ok) { setNewName(''); void load(); }
    else { const d = await res.json(); setError(d.error?.formErrors?.join(', ') ?? 'Error'); }
  }

  async function handleRename(id: string) {
    setSaving(true);
    const res = await fetch(`/api/offices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    setSaving(false);
    if (res.ok) { setEditId(null); void load(); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete office "${name}"? Staff in this office will be unlinked.`)) return;
    await fetch(`/api/offices/${id}`, { method: 'DELETE' });
    void load();
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
        <h1 className="text-xl font-semibold mt-2">Offices</h1>
        <p className="text-sm text-gray-500">Physical locations and regional branches.</p>
      </div>

      {/* Add new */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New office name (e.g. NYC)"
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        />
        <button
          type="submit"
          disabled={saving}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="text-xs text-red-600 mb-4">{error}</p>}

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Staff</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {offices.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-400">No offices yet.</td></tr>
            )}
            {offices.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  {editId === o.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                      autoFocus
                    />
                  ) : (
                    <span className="font-medium">{o.name}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{o._count.staff}</td>
                <td className="px-4 py-3 text-right">
                  {editId === o.id ? (
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => handleRename(o.id)} disabled={saving} className="text-xs text-blue-600 hover:underline">Save</button>
                      <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => { setEditId(o.id); setEditName(o.name); }} className="text-xs text-gray-600 hover:underline">Rename</button>
                      <button onClick={() => handleDelete(o.id, o.name)} className="text-xs text-red-500 hover:underline">Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
