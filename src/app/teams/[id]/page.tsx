'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';

interface StaffOption { id: string; fullName: string; email: string; title: string | null; status: string; office: { name: string } | null; }
interface Member { id: string; staffId: string; staff: StaffOption; }
interface Team { id: string; name: string; description: string | null; isActive: boolean; startedAt: string | null; members: Member[]; }

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [team, setTeam] = useState<Team | null>(null);
  const [allStaff, setAllStaff] = useState<StaffOption[]>([]);
  const [addStaffId, setAddStaffId] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editState, setEditState] = useState({ name: '', description: '', isActive: true, startedAt: '' });
  const [saving, setSaving] = useState(false);

  async function loadTeam() {
    const res = await fetch(`/api/teams/${id}`);
    const data: Team = await res.json();
    setTeam(data);
    setEditState({
      name: data.name,
      description: data.description ?? '',
      isActive: data.isActive,
      startedAt: data.startedAt ? data.startedAt.split('T')[0] : '',
    });
  }

  async function loadStaff() {
    const res = await fetch('/api/staff');
    setAllStaff(await res.json());
  }

  useEffect(() => { void loadTeam(); void loadStaff(); }, [id]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/teams/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editState.name,
        description: editState.description || null,
        isActive: editState.isActive,
        startedAt: editState.startedAt || null,
      }),
    });
    setSaving(false);
    setEditMode(false);
    void loadTeam();
  }

  async function handleDelete() {
    if (!confirm(`Delete team "${team?.name}"?`)) return;
    await fetch(`/api/teams/${id}`, { method: 'DELETE' });
    router.push('/teams');
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!addStaffId) return;
    await fetch(`/api/teams/${id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: addStaffId }),
    });
    setAddStaffId('');
    void loadTeam();
  }

  async function handleRemoveMember(staffId: string) {
    await fetch(`/api/teams/${id}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId }),
    });
    void loadTeam();
  }

  if (!team) return <div className="text-sm text-gray-500">Loading…</div>;

  const memberIds = new Set(team.members.map((m) => m.staffId));
  const available = allStaff.filter((s) => !memberIds.has(s.id) && s.status !== 'former');

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <button onClick={() => router.push('/teams')} className="text-sm text-gray-500 hover:text-gray-700">← Teams</button>

        {editMode ? (
          <div className="mt-3 space-y-3">
            <input
              value={editState.name}
              onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
              className="w-full text-xl font-semibold border-b border-gray-300 focus:outline-none pb-1"
            />
            <input
              value={editState.description}
              onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
              placeholder="Description (optional)"
              className="w-full text-sm text-gray-500 border-b border-gray-200 focus:outline-none pb-1"
            />
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
                <h1 className="text-xl font-semibold">{team.name}</h1>
                {team.isActive
                  ? <span className="text-xs text-green-600">active</span>
                  : <span className="text-xs text-gray-400">inactive</span>}
              </div>
              {team.description && <p className="text-sm text-gray-500 mt-0.5">{team.description}</p>}
              {team.startedAt && (
                <p className="text-xs text-gray-400 mt-1">Started {team.startedAt.split('T')[0]}</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditMode(true)} className="text-sm text-gray-600 hover:underline">Edit</button>
              <button onClick={handleDelete} className="text-sm text-red-500 hover:underline">Delete</button>
            </div>
          </div>
        )}
      </div>

      {/* Members */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-medium text-sm text-gray-700">Members ({team.members.length})</h2>
      </div>

      {available.length > 0 && (
        <form onSubmit={handleAddMember} className="flex gap-2 mb-4">
          <select
            value={addStaffId}
            onChange={(e) => setAddStaffId(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5"
          >
            <option value="">Add staff member…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>{s.fullName} {s.office ? `(${s.office.name})` : ''}</option>
            ))}
          </select>
          <button type="submit" disabled={!addStaffId} className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50">
            Add
          </button>
        </form>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Office</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {team.members.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">No members yet.</td></tr>
            )}
            {team.members.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{m.staff.fullName}</td>
                <td className="px-4 py-3 text-gray-500">{m.staff.title ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{m.staff.office?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleRemoveMember(m.staffId)} className="text-xs text-red-500 hover:underline">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
